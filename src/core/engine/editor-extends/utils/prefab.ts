import { Component, editorExtrasTag, js, Node, Prefab } from 'cc';
import utils from '../../../base/utils';
const CompPrefabInfo = Prefab._utils.CompPrefabInfo;
const PrefabInfo = Prefab._utils.PrefabInfo;
const PrefabInstance = Prefab._utils.PrefabInstance;
interface IAddPrefabInfoOption {
    nodeFileIdGenerator?: (node: Node) => string; // 用于生成节点Prefab的FileId的方法
    compFileIdGenerator?: (comp: Component, index: number) => string; // 用于生成component的FileId的方法
}

const DontClearIDComponentNames = ['TerrainRenderable'];

/**
 * 递归循环所有的子节点，执行 handle 方法
 * @param {*} node
 * @param {*} handle
 */
export function walkNode(node: Node, handle: (node: Node, isChild: boolean) => boolean|void, isChild = false) {
    const skipChildren = handle(node, !!isChild);
    if (skipChildren) {
        return;
    }

    const children = node.children;
    for (let i = children.length - 1; i >= 0; --i) {
        walkNode(children[i], handle, true);
    }
}

// 遍历节点下的所有可序列化字段(不含子节点)
// 只会遍历非空的 object 类型
export function visitObjTypeReferences(node: Node, visitor: any) {
    const parseFireClass = (obj: any, klass?: any) => {
        klass = klass || obj.constructor;
        const props = klass.__values__;
        for (let p = 0; p < props.length; p++) {
            const key = props[p];
            const value = obj[key];
            if (value && typeof value === 'object') {
                if (Array.isArray(value)) {
                    for (let i = 0; i < value.length; i++) {
                        if (cc.isValid(value)) {
                            visitor(value, '' + i, value[i]);
                        }
                    }
                } else if (cc.isValid(value)) {
                    visitor(obj, key, value);
                }
            }
        }
    };

    for (let c = 0; c < node.components.length; ++c) {
        const component = node.components[c];
        parseFireClass(component);
    }
}

function initNodePrefabInfo(node: Node, rootNode: Node|undefined, asset: Prefab) {
    // @ts-ignore private member access
    if (!node._prefab) {
        // @ts-ignore private member access
        node._prefab = new PrefabInfo();
    }

    // @ts-ignore private member access
    const prefabInfo = node._prefab;
    if (!prefabInfo) {
        return null;
    }
    prefabInfo.root = rootNode;
    prefabInfo.asset = asset;

    return prefabInfo;
}

function isPrefabRoot(node: Node) {
    // @ts-ignore
    return !!(node._prefab && node._prefab.instance);
}

export function addPrefabInfo(targetNode: Node, rootNode: Node, asset: Prefab, opts: IAddPrefabInfoOption = {}) {
    if (!rootNode) {
        console.error('addPrefabInfo without a rootNode');
        return;
    }

    walkNode(targetNode, (node, isChild) => {
        if (!node) {
            return;
        }

        // 私有节点不需要添加 prefabInfo 数据
        if (node.objFlags & cc.Object.Flags.HideInHierarchy) {
            return;
        }

        const isNestedPrefab = isChild && isPrefabRoot(node);
        // @ts-ignore
        let prefabInfo = node._prefab;
        if (prefabInfo) {
            if (!isNestedPrefab) {
                prefabInfo.asset = asset;
                prefabInfo.root = rootNode;
            }

            // @ts-ignore
            const rootPrefabInfo = rootNode._prefab;
            if (rootPrefabInfo && prefabInfo.instance) {
                prefabInfo.instance.prefabRootNode = rootNode;
            }
        } else {
            prefabInfo = initNodePrefabInfo(node, rootNode, asset);
        }

        if (!prefabInfo) {
            return;
        }

        if (opts.nodeFileIdGenerator) {
            prefabInfo.fileId = opts.nodeFileIdGenerator(node);
        } else {
            prefabInfo.fileId = prefabInfo.fileId ? prefabInfo.fileId : node.uuid;
        }

        // 组件也添加 __prefab fileId 属性，以便复用
        if (node.components && node.components.length) {
            for (let i = 0; i < node.components.length; i++) {
                const comp = node.components[i];
                if (!comp.__prefab) {
                    comp.__prefab = new CompPrefabInfo();
                }

                if (!comp.__prefab) {
                    continue;
                }

                if (opts.compFileIdGenerator) {
                    comp.__prefab.fileId = opts.compFileIdGenerator(comp, i);
                } else {
                    comp.__prefab.fileId = comp.__prefab.fileId ? comp.__prefab.fileId : comp.uuid;
                }
            }
        }

        if (isNestedPrefab) {
            return true;
        }
    });
}

// 清理后需要返回的数据，用于还原
export function checkAndStripNode(node: Node, quiet: boolean | undefined = undefined) {
    const clearedReference: Record<string, any> = {};
    walkNode(node, function(item: Node) {
        if (item.objFlags & cc.Object.Flags.HideInHierarchy) {
            // 私有Node不参与序列化

            // 友情备注：编辑器小窗预览等用到的节点
            // hack 处理PrivatePreview的节点，后面大版本删除它
            // @ts-ignore
            if (item.isPrivatePreview) {
                return;
            }

            // 目前RichText的PrivateNode会被序列化，所以这里需要处理剃除id的逻辑
            // TerrainRenderable清掉会导致销毁报错
            // @ts-ignore
            item._id = '';
            for (let c = 0; c < item.components.length; ++c) {
                const component = item.components[c];
                if (DontClearIDComponentNames.includes(js.getClassName(component))) {
                    continue;
                }
                component._id = '';
            }
            return;
        }

        // strip other node or components references
        visitObjTypeReferences(item, function(obj: any, key: any, val: any) {
            let shouldStrip = false;

            if (val instanceof cc.Component.EventHandler) {
                val = val.target;
            } else if (val instanceof cc.Component) {
                val = val.node;
            }

            if (val && val instanceof cc.Node && !val.isChildOf(node)) {
                shouldStrip = true;
            }

            if (shouldStrip) {
                if (obj[key] instanceof cc.Component.EventHandler) {
                    obj[key] = new cc.Component.EventHandler();
                } else {
                    // @ts-ignore
                    if (item._prefab?.fileId && obj.__prefab?.fileId) {
                        // @ts-ignore
                        clearedReference[item._prefab.fileId] = {
                            path: key,
                            component: obj.__prefab.fileId,
                            value: obj[key],
                        };
                    }
                    obj[key] = null;
                }

                if (!quiet) {
                    console.warn(
                        'Reference "%s" of "%s" to external scene object "%s" can not be saved in prefab asset.',
                        key,
                        obj.name || node.name,
                        val.name,
                    );
                }
            }
        });

        // 清空 prefab 中的 uuid，这些 uuid 不会被用到，不应该保存到 prefab 资源中，以免每次保存资源都发生改变。
        // @ts-ignore
        item._id = '';
        for (let c = 0; c < item.components.length; ++c) {
            const component = item.components[c];
            component._id = '';
        }
    });
    return clearedReference;
}

export function addPrefabInstance(node: Node) {
    // @ts-ignore
    const prefabInfo = node._prefab;
    if (prefabInfo && !prefabInfo.instance) {
        const prefabInstance = new PrefabInstance();
        prefabInstance.fileId = utils.UUID.generate();
        prefabInfo.instance = prefabInstance;
    }
}