import { Asset, assetManager, CCObject, Component, deserialize, editorExtrasTag, js, Node, Prefab, Scene } from 'cc';
import type { SerializedNodeData } from '../../../common/node';
import { sceneUtils } from '../scene/utils';

// 序列化数据中用于标记批外节点和组件引用的字段
const NODE_REFERENCE_KEY = '$nodeReference';

const typedArrayConstructors = new Set([
    'Uint8Array', 'Uint8ClampedArray', 'Int8Array', 'Uint16Array', 'Int16Array',
    'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array',
]);

/** 收集本批需要序列化的节点 */
function collectSerializedNodes(roots: Node[]): Set<Node> {
    const nodes = new Set<Node>();
    const visit = (node: Node) => {
        if (nodes.has(node)) {
            throw new Error('Serialized node hierarchy contains a cycle or a repeated child.');
        }
        if (!node.isValid || (node.objFlags & CCObject.Flags.DontSave)) {
            return;
        }
        nodes.add(node);
        node.children.forEach(visit);
    };
    roots.forEach(visit);
    return nodes;
}

/** 递归查找属性值中的节点和组件引用，遇到引用目标时交给回调处理 */
function visitPropertyReferences(
    value: unknown,
    path: string[],
    visit: (path: string[], target: Node | Component) => void,
    ancestors: Set<object>,
): void {
    if (value instanceof Node || value instanceof Component) {
        visit(path, value);
        return;
    }

    if (
        !value ||
        typeof value !== 'object' ||
        value instanceof Asset ||
        ArrayBuffer.isView(value) ||
        ancestors.has(value)
    ) {
        return;
    }

    // 记录正在检查的对象，防止循环引用导致无限递归
    ancestors.add(value);

    // 优先检查类型声明的可序列化属性，否则检查对象属性或数组元素
    const keys =
        (value.constructor as { __values__?: string[] } | undefined)?.__values__ ??
        Object.keys(value);
    for (const key of keys) {
        visitPropertyReferences((value as Record<string, unknown>)[key], [...path, key], visit, ancestors);
    }

    // 检查完后移出集合，让其他属性也能检查到同一个对象中的引用
    ancestors.delete(value);
}

/**
 * 查找组件属性中引用的节点和组件，将引用及属性路径传给回调
 * 只检查会被保存的属性，不进入被引用的节点、组件或资源内部
 */
export function visitSerializedComponentReferences(
    roots: Node[],
    visit: (component: Component, path: string[], target: Node | Component) => void,
): void {
    for (const node of collectSerializedNodes(roots)) {
        for (const component of node.components) {
            const ancestors = new Set<object>();
            const onReference = (path: string[], target: Node | Component) => visit(component, path, target);

            // 跳过组件自带的 node、Prefab 信息和编辑器扩展数据
            const properties = (component.constructor as { __values__?: string[] }).__values__ ?? [];
            for (const property of properties) {
                if (property !== 'node' && property !== '__prefab' && property !== editorExtrasTag) {
                    visitPropertyReferences(
                        (component as unknown as Record<string, unknown>)[property],
                        [property],
                        onReference,
                        ancestors,
                    );
                }
            }
        }
    }
}

/**
 * 外层 Prefab 根节点未一起复制时，迁移该子树的属性覆盖并调整嵌套关系
 * 只修改用于序列化的元数据副本，避免影响源实例
 */
function prepareCopiedPrefabInstances(nodes: Set<Node>): Map<Prefab._utils.PrefabInstance, Prefab._utils.PrefabInstance> {
    const copies = new Map<Prefab._utils.PrefabInstance, Prefab._utils.PrefabInstance>();
    for (const node of nodes) {
        const instance = node['_prefab']?.instance;
        if (!instance?.prefabRootNode || nodes.has(instance.prefabRootNode)) {
            continue;
        }

        const copy = Object.assign(new Prefab._utils.PrefabInstance(), instance);
        copy.prefabRootNode = undefined;
        copies.set(instance, copy);

        // 用目标路径和属性路径区分覆盖记录
        // 从内向外合并，同一目标属性以最外层实例的覆盖值为准
        const overrideKey = (override: Prefab._utils.PropertyOverrideInfo) =>
            JSON.stringify([override.targetInfo?.localID, override.propertyPath]);
        const overrides = new Map(instance.propertyOverrides.map(override => [overrideKey(override), override]));
        const instancePath: string[] = [];

        for (let child = node; child.parent; child = child.parent) {
            const childInstance = child['_prefab']?.instance;
            if (childInstance) {
                instancePath.unshift(childInstance.fileId);
            }
            const parent = child.parent;
            const parentInstance = parent['_prefab']?.instance;
            if (!parentInstance) {
                continue;
            }

            // 祖先实例也在复制范围内时，保留与它的嵌套关系
            // 外层覆盖记录随祖先实例迁移，不在当前实例重复处理
            if (nodes.has(parent)) {
                copy.prefabRootNode = parent;
                break;
            }

            // 筛选外层实例中属于当前子树的属性覆盖
            for (const override of parentInstance.propertyOverrides) {
                const localID = override.targetInfo?.localID;
                if (!localID || localID.length <= instancePath.length ||
                    !instancePath.every((fileId, index) => localID[index] === fileId)) {
                    continue;
                }

                // 去掉 instancePath 前缀，让 localID 相对当前实例定位
                const migrated = new Prefab._utils.PropertyOverrideInfo();
                migrated.targetInfo = new Prefab._utils.TargetInfo();
                migrated.targetInfo.localID = localID.slice(instancePath.length);
                migrated.propertyPath = override.propertyPath.slice();
                migrated.value = override.value;
                overrides.set(overrideKey(migrated), migrated);
            }
        }
        copy.propertyOverrides = [...overrides.values()];
    }
    return copies;
}

/**
 * 将节点及其子节点序列化，并保留它们之间的引用
 * @param preservePrefab 是否保留完整 Prefab 信息，生成撤销快照时启用
 */
export function serializeNodes(roots: Node[], preservePrefab = false): SerializedNodeData {
    const nodes = collectSerializedNodes(roots);
    if (!roots.length || roots.some(node => !nodes.has(node) || node instanceof Scene)) {
        throw new Error('Select at least one saved node below the scene root.');
    }

    const rootSet = new Set(roots);
    const references = new Map<Node | Component, SerializedNodeData['externalReferences'][number]>();
    const copiedPrefabInstances = preservePrefab ? null : prepareCopiedPrefabInstances(nodes);

    // 判断所属 Prefab 实例的根节点是否在复制范围内
    // 只有包含实例根节点，才能保留 Prefab 关联，避免单独复制的子节点仍关联原实例
    const keepsPrefab = (node: Node) => {
        const roots = [node['_prefab']?.root, node[editorExtrasTag]?.mountedRoot];
        return roots.some(root => root instanceof Node && !!root['_prefab']?.instance && nodes.has(root));
    };

    const serialized = EditorExtends.serialize({ roots }, {
        reserveContentsForSyncablePrefab: true,
        valueReplacer: (owner: object, key: string | number, value: unknown) => {
            if (value instanceof Prefab._utils.PrefabInstance && copiedPrefabInstances?.has(value)) {
                return copiedPrefabInstances.get(value);
            }

            if (owner instanceof Node) {
                // 清空所选根节点的父引用，避免序列化时带入原父节点及其他节点
                // 子节点保留父引用，用于还原复制范围内的父子关系
                if (key === '_parent' && rootSet.has(owner)) {
                    return null;
                }

                // 单独复制 Prefab 内的节点时，去掉它与原实例的关联
                if (!preservePrefab && key === '_prefab' && !keepsPrefab(owner)) {
                    return null;
                }
            }

            // mountedRoot 指向复制范围外的节点时，清除该引用，避免仍关联原 Prefab 实例
            // 其他编辑器扩展数据继续保留
            if (
                !preservePrefab &&
                (owner instanceof Node || owner instanceof Component) &&
                key === editorExtrasTag &&
                value && typeof value === 'object' &&
                'mountedRoot' in value &&
                value.mountedRoot instanceof Node &&
                !nodes.has(value.mountedRoot)
            ) {
                return { ...value, mountedRoot: undefined };
            }

            // 节点脱离原 Prefab 实例时，也清除组件上的 Prefab 关联
            if (!preservePrefab && owner instanceof Component && key === '__prefab' && !keepsPrefab(owner.node)) {
                return null;
            }

            // 统一取得引用所属的节点，用于判断是否在复制范围内
            const targetNode =
                value instanceof Node ? value :
                value instanceof Component ? value.node :
                null;

            // 引用目标没有一起复制时，先记录其 UUID，创建节点时再决定保留还是清空引用
            if (targetNode && !nodes.has(targetNode)) {
                const target = value as Node | Component;
                let reference = references.get(target);
                if (!reference) {
                    reference = {
                        id: EditorExtends.UuidUtils.generate(),
                        type: target instanceof Node ? 'node' : 'component',
                        uuid: target.uuid,
                    };
                    references.set(target, reference);
                }
                return { [NODE_REFERENCE_KEY]: reference.id };
            }

            return value;
        },
    });

    return {
        version: 1,
        serialized: typeof serialized === 'string' ? serialized : JSON.stringify(serialized),
        rootTransforms: roots.map(node => ({
            position: { x: node.worldPosition.x, y: node.worldPosition.y, z: node.worldPosition.z },
            rotation: { x: node.worldRotation.x, y: node.worldRotation.y, z: node.worldRotation.z, w: node.worldRotation.w },
            scale: { x: node.worldScale.x, y: node.worldScale.y, z: node.worldScale.z },
        })),
        externalReferences: [...references.values()],
    };
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** 校验数据格式，并从对象图中收集资源依赖 */
function parseNodeData(data: SerializedNodeData): { json: JsonValue; assetUuids: Set<string> } {
    if (!data || data.version !== 1 || typeof data.serialized !== 'string' ||
        !Array.isArray(data.rootTransforms) || !data.rootTransforms.length || !Array.isArray(data.externalReferences)) {
        throw new Error('Invalid serialized node data or unsupported version.');
    }

    for (const transform of data.rootTransforms) {
        if (!transform || ![transform.position, transform.rotation, transform.scale].every(value => value &&
            [value.x, value.y, value.z].every(Number.isFinite)) || !Number.isFinite(transform.rotation.w)) {
            throw new Error('Invalid serialized root transform.');
        }
    }

    const referenceIds = new Set<string>();
    for (const reference of data.externalReferences) {
        if (!reference || typeof reference.id !== 'string' || !reference.id || referenceIds.has(reference.id) ||
            typeof reference.uuid !== 'string' || !reference.uuid || !['node', 'component'].includes(reference.type)) {
            throw new Error('Invalid serialized external reference.');
        }
        referenceIds.add(reference.id);
    }

    const json: JsonValue = JSON.parse(data.serialized);
    const assetUuids = new Set<string>();
    const visit = (value: JsonValue): void => {
        if (!value || typeof value !== 'object') {
            return;
        }
        if (!Array.isArray(value)) {
            if ('__id__' in value && (!Array.isArray(json) || typeof value.__id__ !== 'number' ||
                !Number.isInteger(value.__id__) || value.__id__ < 0 || value.__id__ >= json.length)) {
                throw new Error('Invalid serialized object reference.');
            }

            if ('__uuid__' in value) {
                if (typeof value.__uuid__ !== 'string' || !value.__uuid__) {
                    throw new Error('Invalid serialized asset reference.');
                }
                assetUuids.add(value.__uuid__);
            }

            if (NODE_REFERENCE_KEY in value && (typeof value[NODE_REFERENCE_KEY] !== 'string' ||
                !referenceIds.has(value[NODE_REFERENCE_KEY]) || Object.keys(value).length !== 1)) {
                throw new Error('Invalid serialized external reference marker.');
            }

            // TypedArray 使用引擎内建格式，不经过脚本类注册表
            if (value.__type__ === 'TypedArray') {
                if (typeof value.ctor !== 'string' || !typedArrayConstructors.has(value.ctor) ||
                    !Array.isArray(value.array) || value.array.some(item => item !== null && typeof item !== 'number')) {
                    throw new Error('Invalid serialized typed array.');
                }
            } else if ('__type__' in value && (typeof value.__type__ !== 'string' || !js.getClassById(value.__type__))) {
                throw new Error(`Serialized node class is unavailable: ${value.__type__}`);
            }
        }
        Object.values(value).forEach(visit);
    };

    visit(json);
    return { json, assetUuids };
}

/**
 * 从序列化数据还原节点、组件及引用
 * 所需资源会提前加载，返回的节点尚未挂入场景
 * @param externalReferences clear 清空外部引用；resolve 按 UUID 查找当前场景中的有效目标，找不到则清空
 * @param preserveIdentity 是否保留节点、组件的 UUID 和 Prefab 实例标识，Redo 时启用
 */
export async function deserializeNodes(
    data: SerializedNodeData,
    externalReferences: 'clear' | 'resolve',
    preserveIdentity = false
): Promise<Node[]> {
    const { json, assetUuids } = parseNodeData(data);

    // 先准备所需资源，避免还原出节点后才发现资源缺失
    const assets = new Map<string, Asset>();
    await Promise.all([...assetUuids].map(async uuid => {
        const asset = assetManager.assets.get(uuid) ?? await sceneUtils.loadAny(uuid);
        if (!(asset instanceof Asset)) {
            throw new Error(`Asset not found: ${uuid}`);
        }
        assets.set(uuid, asset);
    }));

    // 由引擎还原节点、组件及内部引用，details 记录需要回填的资源引用
    const details = new deserialize.Details();
    let roots: Node[] = [];
    try {
        const graph = deserialize(json, details) as { roots?: Node[] } | null;

        // 先记录已创建的节点，后续校验失败时才能连同组件一起销毁
        const restoredRoots = Array.isArray(graph?.roots) ? graph.roots : [graph?.roots];
        roots = restoredRoots.filter((node): node is Node => node instanceof Node);

        // 根节点需与保存的变换一一对应，且尚未挂载，才能交给后续流程统一插入
        if (
            !graph ||
            !Array.isArray(graph.roots) ||
            graph.roots.length !== data.rootTransforms.length ||
            graph.roots.some(node => !(node instanceof Node) || node instanceof Scene || node.parent)
        ) {
            throw new Error('Invalid serialized node roots.');
        }

        roots = graph.roots;

        // 将已加载的资源填回引擎记录的字段，恢复材质、贴图等资源引用
        details.assignAssetsBy(uuid => {
            const asset = assets.get(uuid);
            if (!asset) {
                throw new Error(`Asset not loaded: ${uuid}`);
            }
            return asset;
        });

        const nodes = collectSerializedNodes(roots);
        const references = new Map(data.externalReferences.map(reference => [reference.id, reference]));
        const visited = new Set<object>();

        // 遍历还原后的对象，将外部引用占位标记替换为实际目标或 null
        const replaceReferences = (value: object): void => {
            // 避免循环遍历，不进入共享资源和无需替换节点引用的二进制数据
            if (visited.has(value) || value instanceof Asset || ArrayBuffer.isView(value)) {
                return;
            }
            visited.add(value);

            // 外部节点和组件应通过占位标记引用，不能作为额外对象混入还原结果
            if (
                (value instanceof Node && !nodes.has(value)) ||
                (value instanceof Component && !nodes.has(value.node))
            ) {
                throw new Error('Serialized graph contains a node outside the selected hierarchy.');
            }

            for (const key of Object.keys(value)) {
                const record = value as Record<string, unknown>;
                const child = record[key];
                if (!child || typeof child !== 'object') {
                    continue;
                }

                if (NODE_REFERENCE_KEY in child && typeof child[NODE_REFERENCE_KEY] === 'string') {
                    const reference = references.get(child[NODE_REFERENCE_KEY]);
                    if (!reference) {
                        throw new Error('Unknown serialized external reference.');
                    }
                    const target: Node | Component | null =
                        externalReferences === 'clear' ? null :
                        reference.type === 'node' ? EditorExtends.Node.getNode(reference.uuid) :
                        EditorExtends.Component.getComponent(reference.uuid);

                    // 仅恢复当前场景中的有效引用，避免连到已销毁或其他场景中的对象
                    const targetNode = target instanceof Node ? target : target?.node;
                    const scene = cc.director.getScene();
                    const isValidTarget =
                        target?.isValid &&
                        scene &&
                        targetNode &&
                        (targetNode === scene || targetNode.isChildOf(scene));

                    record[key] = isValidTarget ? target : null;
                } else {
                    replaceReferences(child);
                }
            }
        };

        replaceReferences(graph);

        // 创建副本时重新生成标识，避免与原对象重复；Redo 时保留快照中的标识
        for (const node of nodes) {
            if (!preserveIdentity) {
                node['_id'] = EditorExtends.UuidUtils.generate();
                for (const component of node.components) {
                    component['_id'] = EditorExtends.UuidUtils.generate();
                }

                const instance = node['_prefab']?.instance;
                if (instance) {
                    let ancestor = node.parent;
                    while (ancestor && !ancestor['_prefab']?.instance) {
                        ancestor = ancestor.parent;
                    }

                    // 保留嵌套实例的 fileId，以维持它在 Prefab 资源中的对应关系
                    // 只为最外层实例生成新的 fileId，用于区分原实例和副本
                    if (!ancestor) {
                        instance.fileId = EditorExtends.UuidUtils.generate(true);
                    }
                }
            }
        }

        // 交由引擎完成批量创建后的初始化，节点仍由调用方负责挂入场景
        roots.forEach(node => node._onBatchCreated(true));
        return roots;
    } catch (error) {
        disposeSerializedNodes(roots);
        throw error;
    } finally {
        details.reset();
    }
}

/** 销毁尚未挂入场景或已回滚的本批节点 */
export function disposeSerializedNodes(roots: Node[]): void {
    for (const node of roots) {
        node.destroy();
    }
}
