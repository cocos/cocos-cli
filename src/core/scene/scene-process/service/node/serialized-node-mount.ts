import { Asset, Component, Node, Quat, Vec3 } from 'cc';
import cloneDeepWith from 'lodash/cloneDeepWith';
import { EventSourceType, NodeEventType, type SerializedNodeData } from '../../../common';
import nodeMgr from './index';
import { disposeSerializedNodes, visitSerializedComponentReferences } from './serialized-node-data';
import { nodeOperation } from '../prefab/node';

/**
 * 备份父节点及祖先的 Prefab 信息，并返回恢复函数
 * 挂载失败时恢复这些信息，避免残留本次创建产生的 Prefab 修改
 */
function captureParentPrefabState(parent: Node): () => void {
    const snapshots = new Map<Node, Node['_prefab']>();
    for (let node: Node | null = parent; node; node = node.parent) {
        // _prefab 为空时也保存快照，回滚时清除本次创建过程中新增的 Prefab 信息
        snapshots.set(node, cloneDeepWith(node['_prefab'], value => {
            // 节点、组件和资源沿用原对象，只复制 Prefab 信息本身
            const isEngineObject =
                value instanceof Node ||
                value instanceof Component ||
                value instanceof Asset;

            return isEngineObject ? value : undefined;
        }));
    }

    return () => {
        for (const [node, prefab] of snapshots) {
            node['_prefab'] = prefab;
        }
    };
}

/** 将快照中的世界位置、旋转和缩放应用到节点 */
function applyWorldTransform(node: Node, transform: SerializedNodeData['rootTransforms'][number]): void {
    node.setWorldPosition(new Vec3(transform.position.x, transform.position.y, transform.position.z));
    node.setWorldRotation(new Quat(
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        transform.rotation.w,
    ));
    node.setWorldScale(new Vec3(transform.scale.x, transform.scale.y, transform.scale.z));
}

/**
 * 解除本次创建的节点的挂载，恢复父级 Prefab 信息并销毁节点
 * 收集解除挂载时的错误，单个节点处理失败后继续清理其他节点
 */
function rollbackSerializedNodes(nodes: Node[], restorePrefabState: () => void): unknown[] {
    const cleanupErrors: unknown[] = [];

    try {
        // 先解除挂载，再正常销毁，避免提前设置 Destroyed 导致组件跳过销毁
        for (const node of [...nodes].reverse()) {
            if (!node.parent) {
                continue;
            }

            try {
                nodeMgr.emit('node:before-remove', node);
                nodeMgr.emit('node:before-change', node.parent);
                node.setParent(null);
                nodeMgr.emit('node:remove', node, { source: EventSourceType.EDITOR });
            } catch (cleanupError) {
                cleanupErrors.push(cleanupError);
            } finally {
                // 移除事件处理失败时，仍尝试解除父子关系，避免节点残留在场景中
                if (node.parent) {
                    try {
                        node.setParent(null);
                    } catch (cleanupError) {
                        cleanupErrors.push(cleanupError);
                    }
                }
            }
        }
    } finally {
        restorePrefabState();
        disposeSerializedNodes(nodes);
    }

    return cleanupErrors;
}

interface MountSerializedNodesOptions {
    nodes: Node[];
    parent: Node;
    /** 场景或 Prefab 的根节点，组件的 Prefab 引用记录保存在这里 */
    editorRoot: Node;
    siblingIndex: number;
    data: SerializedNodeData;
    keepWorldTransform: boolean;
    /** 挂载完成后执行的回调，回调失败也会触发回滚 */
    onMounted: () => void;
}

/**
 * 整批挂载节点，处理重名、插入位置和变换
 * 挂载或提交回调失败时，移除本次创建的节点并恢复父节点及祖先的 Prefab 信息
 */
export function mountSerializedNodes(options: MountSerializedNodesOptions): void {
    const {
        nodes,
        parent,
        editorRoot,
        siblingIndex,
        data,
        keepWorldTransform,
        onMounted
    } = options;
    const restorePrefabState = captureParentPrefabState(parent);

    try {
        nodes.forEach((node, index) => {
            node.name = nodeMgr.generateAvailableName(node.name, parent.uuid);
            nodeMgr.emit('node:before-add', node);
            nodeMgr.emit('node:before-change', parent);

            node.setParent(parent);
            node.setSiblingIndex(siblingIndex + index);

            // 更换父节点后重新设置世界变换，使节点保持复制前在世界空间中的位置、旋转和缩放
            if (keepWorldTransform) {
                applyWorldTransform(node, data.rootTransforms[index]);
            }

            nodeMgr.emit('node:add', node);
        });

        nodeMgr.emit('node:change', parent, { type: NodeEventType.CHILD_CHANGED });

        // 记录组件的哪个属性引用了 Prefab 中的哪个节点或组件
        // 重新加载场景时，通过这些记录（targetOverrides）恢复引用
        visitSerializedComponentReferences(nodes, (component, pathKeys, value) => {
            nodeOperation.checkToAddTargetOverride(component, { pathKeys, value }, editorRoot);
        });

        // 生成撤销快照等后续步骤失败时，也要回滚已经挂载的节点
        onMounted();
    } catch (error) {
        const cleanupErrors = rollbackSerializedNodes(nodes, restorePrefabState);

        // 同时保留创建失败和清理失败的原因，便于定位回滚过程中出现的问题
        if (cleanupErrors.length) {
            throw new AggregateError([error, ...cleanupErrors], 'Serialized node creation failed during rollback.');
        }

        throw error;
    }
}
