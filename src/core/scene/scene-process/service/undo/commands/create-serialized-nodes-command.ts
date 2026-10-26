import { Node } from 'cc';
import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult, SerializedNodeData } from '../../../../common';
import { queryRegisteredService, Service } from '../../core';
import type { IEditorSessionService, IEditorSessionSnapshot } from '../../core/editor-session';
import nodeMgr from '../../node/index';
import {
    deserializeNodes,
    disposeSerializedNodes,
    serializeNodes,
    visitSerializedComponentReferences
} from '../../node/serialized-node-data';
import { mountSerializedNodes } from '../../node/serialized-node-mount';
import { prefabUtils } from '../../prefab/utils';
import { createUndoId, failure, success } from './command-utils-shared';

/** 按传入顺序的逆序移除节点 */
function removeNodes(nodes: Node[]): void {
    for (const node of [...nodes].reverse()) {
        nodeMgr.baseRemoveNode(node);
    }
}

/**
 * 撤销或重做通过序列化数据创建的一组节点
 * 所有根节点共用一份快照，以保留它们之间的引用
 */
export class CreateSerializedNodesCommand implements IUndoCommand {
    readonly meta: IUndoCommandMeta = {
        id: createUndoId('node:create-serialized'),
        label: 'Create Nodes from Serialized Data',
        type: 'node:create-serialized',
        scope: { editorType: 'scene' },
        timestamp: Date.now(),
    };

    private readonly data: SerializedNodeData;
    private readonly rootUuids: string[];
    private readonly siblingIndex: number;
    private readonly parentUuid: string;
    private readonly editorSession: IEditorSessionSnapshot;

    constructor(nodes: Node[], parent: Node) {
        // 撤销快照保留完整 Prefab 信息，供 Redo 还原创建后的关联
        this.data = serializeNodes(nodes, true);

        this.rootUuids = nodes.map(node => node.uuid);
        this.parentUuid = parent.uuid;
        this.siblingIndex = nodes[0].getSiblingIndex();
        this.editorSession = queryRegisteredService<IEditorSessionService>('Editor')!.getEditorSession();
    }

    /**
     * 校验命令是否属于当前编辑会话，不匹配时返回 null
     * 重载会替换根节点，因此每次都从编辑器重新获取
     */
    private getEditorRoot(): Node | null {
        const editor = queryRegisteredService<IEditorSessionService>('Editor');
        return editor?.isCurrentEditorSession(this.editorSession) ? Service.Editor.getRootNode() : null;
    }

    async undo(): Promise<IUndoRedoResult> {
        const editorRoot = this.getEditorRoot();
        if (!editorRoot) {
            return failure(this.meta, 'The target editor has changed.');
        }

        // 移除前确认所有节点仍在原父节点下，避免检查到一半时已部分执行撤销
        const nodes = this.rootUuids.map(uuid => EditorExtends.Node.getNode(uuid) as Node | null);
        if (nodes.some(node => !node?.isValid || node.parent?.uuid !== this.parentUuid)) {
            return failure(this.meta, 'A created node or its parent is no longer available.');
        }

        // 只删除本次创建的组件对应的引用记录，避免影响原有节点
        visitSerializedComponentReferences(nodes as Node[], (component, path) => {
            prefabUtils.removeTargetOverride(editorRoot['_prefab'], component, path);
        });

        removeNodes(nodes as Node[]);
        return success(this.meta);
    }

    async redo(): Promise<IUndoRedoResult> {
        let nodes: Node[] = [];
        try {
            const editorRoot = this.getEditorRoot();
            const parent = EditorExtends.Node.getNode(this.parentUuid) as Node | null;

            // 资源加载前后确认编辑会话和根节点未变化
            // 父节点还需有效，并且仍属于该根节点
            const isCurrentTarget = () =>
                editorRoot &&
                this.getEditorRoot() === editorRoot &&
                parent?.isValid &&
                (parent === editorRoot || parent.isChildOf(editorRoot));

            if (!isCurrentTarget()) {
                return failure(this.meta, 'The target parent is no longer available.');
            }

            // Redo 保留快照中的标识，并尝试恢复指向当前场景其他对象的引用
            nodes = await deserializeNodes(this.data, 'resolve', true);

            if (!isCurrentTarget()) {
                throw new Error('The target editor has changed.');
            }

            // 挂载前检查整组节点和组件的标识，避免与场景中的现有对象冲突
            for (const node of nodes) {
                node.walk(child => {
                    const hasIdentityConflict =
                        EditorExtends.Node.getNode(child.uuid) ||
                        child.components.some(component => EditorExtends.Component.getComponent(component.uuid));

                    if (hasIdentityConflict) {
                        throw new Error('Cannot restore nodes: an object identity is already in use.');
                    }
                });
            }

            // 原插入位置超出当前范围时追加到末尾，使用快照中的局部变换还原节点
            mountSerializedNodes({
                nodes,
                parent: parent!,
                editorRoot: editorRoot!,
                siblingIndex: Math.min(this.siblingIndex, parent!.children.length),
                data: this.data,
                keepWorldTransform: false,
                onMounted: () => {},
            });

            return success(this.meta);
        } catch (error) {
            // 挂载流程负责回滚，这里清理尚未挂载或已解除挂载的节点
            disposeSerializedNodes(nodes.filter(node => !node.parent));
            return failure(this.meta, error instanceof Error ? error.message : String(error));
        }
    }
}
