import { Asset, queryAsset } from '@editor/asset-db';
import { readJSONSync } from 'fs-extra';
import assetQuery from '../../../manager/query';
import utils from '../../../../base/utils';

interface IPrefab {
    __id__: number;
}

interface INode {
    __type__: string;
    _name: string;
    _objFlags: number;
    _parent: INode | null;
    _children: INode[];
    _active: boolean;
    _components: any[];
    _prefab: IPrefab | null;
    _lpos: {
        __type__: string;
        x: number;
        y: number;
        z: number;
    };
    _lrot: {
        __type__: string;
        x: number;
        y: number;
        z: number;
    };
    _lscale: {
        __type__: string;
        x: number;
        y: number;
        z: number;
    };
    _layer: number;
    _euler: {
        __type__: string;
        x: number;
        y: number;
        z: number;
    };
}

// 只有 TargetOverrideInfo 有才要添加 prefab info 到场景或者 prefab 中
const PrefabInfo = {
    __type__: 'cc.PrefabInfo',
    targetOverrides: [],
};
const addPrefabInfo = function (targetOverrides: any[], json: any) {
    const types = ['cc.Scene', 'cc.Prefab'];
    let prefabInfo;
    let sceneOrPrefab;
    let sceneOrPrefabRoot = json[0];
    if (sceneOrPrefabRoot) {
        sceneOrPrefabRoot = sceneOrPrefabRoot.data || sceneOrPrefabRoot.scene;
        if (sceneOrPrefabRoot) {
            sceneOrPrefab = json[sceneOrPrefabRoot.__id__];
            if (!sceneOrPrefab) {
                console.warn(`Can not find root node, root info: ${json[0]}`);
                return;
            }
        }
    }
    const prefabID = sceneOrPrefab._prefab && sceneOrPrefab._prefab.__id__;
    if (!prefabID) {
        prefabInfo = JSON.parse(JSON.stringify(PrefabInfo));
        json.push(prefabInfo);
        sceneOrPrefab._prefab = {
            __id__: json.length - 1,
        };
    } else {
        prefabInfo = json[prefabID];
    }

    prefabInfo.targetOverrides = targetOverrides;
    return prefabInfo;
};

const TargetOverrideInfo = {
    __type__: 'cc.TargetOverrideInfo',
    source: null, // 属性所在组件上在场景中的索引（如果是 prefab Root ID，反之：组件 id）
    sourceInfo: null, // 与 target info 一样 [ 目标节点或者是组件的 local id 树 ]
    propertyPath: [], // [ 属性名，目标名 ] [ 属性名[数组]，数组索引，目标名 ]
    target: null, // 目标所在组件名在场景中所在的索引 prefab root id
    targetInfo: null, // target info 内部结构 [ 目标节点或者是组件的 local id 树 ]
};

const createTargetOverrideInfo = function () {
    return JSON.parse(JSON.stringify(TargetOverrideInfo));
};

const PrefabLink = {
    __type__: 'cc.PrefabLink',
    _name: '',
    _objFlags: 0,
    node: {
        __id__: 2,
    },
    _enabled: true,
    __prefab: null,
    prefab: null,
    _id: 'a6NH7Dj9tMVbatCdgoxYyz',
};

const addPrefabLink = function (json: any, nodeID: number, prefabID: number) {
    // 如果资源丢失了，去不需要添加 PrefabLink
    const prefabInfo = json[prefabID];
    if (!prefabInfo || !prefabInfo.asset) {
        return -1;
    }
    const link = JSON.parse(JSON.stringify(PrefabLink));
    link.node = {
        __id__: nodeID,
    };
    link.prefab = {
        __uuid__: prefabInfo.asset.__uuid__,
    };
    json.push(link);
    return json.length - 1;
};

const PrefabInstance = {
    __type__: 'cc.PrefabInstance',
    fileId: '',
    prefabRootNode: null,
    mountedChildren: [],
    propertyOverrides: [],
    removedComponents: [],
};
const addPrefabInstance = function (id: number, json: any, isPrefab: boolean) {
    const instance = JSON.parse(JSON.stringify(PrefabInstance));
    if (isPrefab) {
        instance.prefabRootNode = {
            __id__: 1,
        };
    }

    instance.fileId = utils.UUID.generate();
    json.push(instance);
    const prefabInfo = json[id];
    prefabInfo.instance = {
        __id__: json.length - 1,
    };
    return instance;
};

const CCPropertyOverrideInfo = {
    // 每个数据对应一条
    __type__: 'CCPropertyOverrideInfo',
    targetInfo: null,
    propertyPath: [], // ['position', 'scale', 'rotation']
    value: null,
};
const createPropertyOverrideInfo = function (key: string, value: any) {
    const overrideInfo = JSON.parse(JSON.stringify(CCPropertyOverrideInfo));
    const propertyPath: string[] = [];
    if (key === '_lpos') {
        propertyPath.push('position');
    } else if (key === '_lrot') {
        propertyPath.push('rotation');
    } else if (key === '_lscale') {
        propertyPath.push('scale');
    } else {
        propertyPath.push(key);
    }
    overrideInfo.propertyPath = propertyPath;
    overrideInfo.value = value;
    return overrideInfo;
};

const TargetInfo = {
    __type__: 'cc.TargetInfo',
    localID: [], // 没嵌套时：节点与组件的 PrefabInfo fileId，嵌套时：PrefabInstance 一层一层最终找到 PrefabInfo fileId
};
const createTargetInfo = function (localID: string[]) {
    const info = JSON.parse(JSON.stringify(TargetInfo));
    info.localID = localID;
    return info;
};

const CompPrefabInfo = {
    __type__: 'cc.CompPrefabInfo',
    fileId: '',
};
const addCompPrefabInfo = function (id: number, json: any) {
    const element = json[id];
    if (element.__type__ !== 'cc.Node' && element.node) {
        const node = json[element.node.__id__];
        if (!node._prefab) {
            return;
        }
        if (element.__prefab) {
            return;
        }
        const compPrefabInfo = JSON.parse(JSON.stringify(CompPrefabInfo));
        compPrefabInfo.fileId = utils.UUID.generate();
        json.push(compPrefabInfo);
        element.__prefab = {
            __id__: json.length - 1,
        };
    }
};

const MountedChildrenInfo = {
    __type__: 'cc.MountedChildrenInfo',
    targetInfo: null,
    nodes: [],
};
const addMountedChildrenInfo = function (prefabInstanceID: number, json: any, localID: string[], nodes: string[]) {
    const mountedChildrenInfo = JSON.parse(JSON.stringify(MountedChildrenInfo));
    mountedChildrenInfo.nodes = nodes;
    const targetInfo = createTargetInfo(localID);
    return {
        prefabInstanceID,
        mountedChildrenInfo,
        targetInfo,
    };
};

// prefab instance 保留关键字
const INSTANCE_RESERVED_KEYWORDS = ['__type__', '_objFlags', '_parent', '_prefab', '_id'];
// 对比基础属性 ['_lpos', '_lrot', '_lscale']
function compareBaseProp(prefabInstanceID: number, target: any, base: any, localID: string[], json: any[]) {
    const propertyOverrides: any[] = [];
    const KEYS = ['_lpos', '_lrot', '_lscale', '_active', '_name', '_layer'];
    for (const key of KEYS) {
        const prop = target[key];
        const baseProp = base[key];
        if (JSON.stringify(prop) !== JSON.stringify(baseProp)) {
            // PropertyOverrideInfo
            const propertyOverrideInfo = createPropertyOverrideInfo(key, prop);
            // TargetInfo
            const targetInfo = createTargetInfo(localID);
            //
            propertyOverrides.push({
                prefabInstanceID: prefabInstanceID,
                propertyOverrideInfo: propertyOverrideInfo,
                targetInfo: targetInfo,
            });
        }
    }
    return propertyOverrides;
}

function compareComponentIDProp(
    propertyPath: string[],
    targetID: number,
    sourceID: number,
    sourceInfo: any,
    json: any,
    disconnectPrefabs: Map<number, number>,
    isNormalNode: boolean,
    emptyProp: any,
) {
    const target = json[targetID];
    if (!target) {
        return null;
    }
    const isComponent = target.__type__ !== 'cc.Node';
    let targetNode;
    let targetNodeID: any;
    if (isComponent) {
        targetNodeID = target.node && target.node.__id__;
        if (!targetNodeID) {
            return null;
        }
        targetNode = json[targetNodeID];
    } else {
        targetNode = target;
        targetNodeID = targetID;
    }
    const targetPrefabID = targetNode && targetNode._prefab && targetNode._prefab.__id__;
    const targetPrefabInfo = targetPrefabID && json[targetPrefabID];
    const targetPrefabRootID = targetPrefabInfo && targetPrefabInfo.root && targetPrefabInfo.root.__id__;
    if (!targetPrefabInfo || !targetPrefabInfo.asset || disconnectPrefabs.has(targetPrefabRootID) || targetPrefabInfo.asset.__id__ === 0) {
        return null;
    }
    const targetPrefabRoot = json[targetPrefabRootID];
    if (!targetPrefabRoot) {
        return null;
    }
    //
    const targetOverrideInfo = createTargetOverrideInfo();
    // 设置 propertyPath [ 属性名，目标名 ] [ 属性名[数组]，数组索引，目标名 ]
    targetOverrideInfo.propertyPath = propertyPath;
    // 设置 targetInfo target info 内部结构 [ 目标节点或者是组件的 local id 树 ]
    let targetFileIds: string[] = [];
    const basePrefab = totalPrefab.get(targetPrefabInfo.asset.__uuid__);
    if (!basePrefab) {
        console.warn(
            `Cannot get Base Prefab by UUID: ${targetPrefabInfo.asset.__uuid__}, PrefabInfo ID: ${targetNodeID} name: ${targetNode._name}.`,
        );
        return null;
    }

    const baseNodID = basePrefab[0] && basePrefab[0].data && basePrefab[0].data.__id__;
    const baseNode = basePrefab && basePrefab[baseNodID];
    let baseTargetNode;
    let baseTargetNodeID;
    if (targetPrefabRootID === targetNodeID) {
        // 说明是自身
        baseTargetNode = baseNode;
        baseTargetNodeID = baseNodID;
    } else {
        // 子节点
        const childrenIdx = targetPrefabRoot._children.findIndex((node: any) => node.__id__ === targetNodeID);
        baseTargetNodeID = baseNode._children[childrenIdx] && baseNode._children[childrenIdx].__id__;
        baseTargetNode = basePrefab[baseTargetNodeID];
    }
    if (isComponent) {
        const idx = targetNode._components.findIndex((comp: any) => comp.__id__ === targetID);
        const baseTargetComponentID = baseTargetNode && baseTargetNode._components[idx] && baseTargetNode._components[idx].__id__;
        const baseTargetComponent = baseTargetComponentID && basePrefab[baseTargetComponentID];
        if (!baseTargetComponent || target.__type__ !== baseTargetComponent.__type__) {
            // todo 暂时处理如果找不到节点就断开，后续要完善
            disconnectPrefabs.set(targetPrefabRootID, targetPrefabID);
            return;
        } else {
            targetFileIds = getLocalID(baseTargetComponentID, basePrefab, isComponent);
        }
    } else {
        // todo 暂时处理如果找不到节点就断开，后续要完善
        if (!baseTargetNode) {
            disconnectPrefabs.set(targetPrefabRootID, targetPrefabID);
            return;
        }
        targetFileIds = getLocalID(baseTargetNodeID, basePrefab, isComponent);
    }
    targetOverrideInfo.source = {
        __id__: sourceID,
    };
    const targetInfo = createTargetInfo(targetFileIds);
    // 设置 target 目标所在组件名在场景中所在的索引 prefab root id
    targetOverrideInfo.target = {
        __id__: targetPrefabInfo.root.__id__,
    };
    return {
        emptyProp: emptyProp,
        targetOverrideInfo: targetOverrideInfo,
        sourceInfo: sourceInfo,
        targetInfo: targetInfo,
    };
}

const SKIP_COMPONENT_KEY = ['_name', '_objFlags', 'node', '__prefab', '_id'];
function compareComponentProp(
    prefabInstanceID: number,
    componentInfo: any,
    baseComponentInfo: any,
    json: any[],
    baseJSON: any[],
    targetOverridePropsKeys: any[],
) {
    const overrides: any[] = [];

    const componentID = componentInfo.__id__;
    const component = json[componentID];
    const baseComponentID = baseComponentInfo && baseComponentInfo.__id__;
    const baseComponent = baseJSON[baseComponentID];
    if (!baseComponent) {
        return overrides;
    }

    let fileIds: string[] = [];
    if (component.__prefab) {
        fileIds = getLocalID(baseComponentID, baseJSON, true);
    } else {
        fileIds = getLocalID(componentID, json, true);
    }

    for (const key in component) {
        // 过滤一下不需要对比的关键字
        if (SKIP_COMPONENT_KEY.includes(key)) {
            continue;
        }
        const props = component[key];
        if (props) {
            const overridePropsKey = targetOverridePropsKeys[componentID];
            if (overridePropsKey === key) {
                continue;
            }
        }

        const baseProps = baseComponent[key];

        if (JSON.stringify(props) !== JSON.stringify(baseProps)) {
            // PropertyOverrideInfo
            const propertyOverrideInfo = createPropertyOverrideInfo(key, props);
            // TargetInfo
            const targetInfo = createTargetInfo(fileIds);
            overrides.push({
                prefabInstanceID: prefabInstanceID,
                propertyOverrideInfo: propertyOverrideInfo,
                targetInfo: targetInfo,
            });
        }
    }
    return overrides;
}

// 场景中的 prefab 节点与源 prefab 中的节点进比较是否相同
function isEqual(node: any, baseNode: any, basePrefabJson: any, json: any) {
    // 如果第一个节点是普通节点的话，直接不相同
    if (!node._prefab || !baseNode._prefab) {
        return false;
    }
    const prefabInfo = json[node._prefab.__id__];
    const basePrefabInfo = basePrefabJson[baseNode._prefab.__id__];

    if (!prefabInfo || !basePrefabInfo) {
        return false;
    }

    // 1。对比 prefab 的 asset uuid
    if ('__uuid__' in basePrefabInfo.asset) {
        // 2d 有一个情况 asset 属性存的时候 __id__ 为 0
        if (prefabInfo.asset.__uuid__ !== basePrefabInfo.asset.__uuid__) {
            return false;
        }
    }

    // 2。是否是自动同步 prefab
    const isSync = !!prefabInfo.sync;
    if (isSync) {
        return true;
    }

    // 3。对比节点类型
    if (node.__type__ !== baseNode.__type__) {
        return false;
    }

    // 4。对比子节点
    if ((node._children && !baseNode._children) || (!node._children && baseNode._children) || (!node._children && !baseNode._children)) {
        return false;
    }
    if (node._children.length < baseNode._children.length) {
        return false;
    }
    const children = node._children.map((child: any) => json[child.__id__]);
    const baseChildren = baseNode._children.map((child: any) => basePrefabJson[child.__id__]);
    for (let i = 0; i < children.length; ++i) {
        const baseChildNode = baseChildren[i];
        if (!baseChildNode) {
            continue;
        }
        if (!isEqual(children[i], baseChildren[i], basePrefabJson, json)) {
            return false;
        }
    }
    // 5。对比组件
    if (
        (node._components && !baseNode._components) ||
        (!node._components && baseNode._components) ||
        (!node._components && !baseNode._components)
    ) {
        return false;
    }
    if (node._components.length !== baseNode._components.length) {
        return false;
    }
    const components = node._components.map((child: any) => json[child.__id__]);
    const baseComponents = baseNode._components.map((child: any) => basePrefabJson[child.__id__]);
    for (let i = 0; i < components.length; ++i) {
        const component = components[i];
        const baseComponent = baseComponents[i];
        if (!component || !baseComponent) {
            return false;
        }
        // 特殊处理 SkeletalAnimation
        if (component.__type__ === 'cc.SkeletalAnimation') {
            if (component._sockets.length > 0) {
                return false;
            }
        }
        // 判断组件类型
        if (component.__type__ !== baseComponent.__type__) {
            return false;
        }
    }
    return true;
}

// 检测是否需要还原为普通节点
function isDiff(prefabInfo: any, json: any) {
    if (!prefabInfo.asset) {
        return true;
    }
    // 场景中的 prefab 与源 prefab 进行对比，如果差异过大就还原为普通节点
    const nodeID = prefabInfo.root && prefabInfo.root.__id__;
    const uuid = prefabInfo.asset && prefabInfo.asset.__uuid__;
    // fbx 内部的子 prefab 就直接断开
    // if (uuid && uuid.includes('@')) {
    //     return true;
    // }
    const basePrefab = totalPrefab.get(uuid);
    if (!basePrefab) {
        console.warn(`Cannot get Prefab by UUID: ${uuid}\n PrefabInfo ID: ${nodeID} name: ${json[nodeID]._name} \n`);
        return true;
    }
    const node = json[nodeID];
    const baseNodID = basePrefab[0] && basePrefab[0].data && basePrefab[0].data.__id__;
    const baseNode = baseNodID && basePrefab[baseNodID];
    return !isEqual(node, baseNode, basePrefab, json);
}

function addInstanceFileID(prefabInfo: any, json: any, localID: string[]) {
    if (prefabInfo.instance) {
        const instance = json[prefabInfo.instance.__id__];
        if (instance) {
            localID.push(instance.fileId);
        }
    }
}

function getLocalID(id: number, json: any, isComponent = false) {
    const localID: string[] = [];
    if (isComponent) {
        const component = json[id];
        if (component) {
            const node = component.node && json[component.node.__id__];
            if (node._prefab) {
                const prefabInfo = node._prefab && json[node._prefab.__id__];
                addInstanceFileID(prefabInfo, json, localID);
            }
            const compPrefabID = component.__prefab && component.__prefab.__id__;
            if (compPrefabID) {
                const compPrefabInfo = json[compPrefabID];
                localID.push(compPrefabInfo.fileId);
            }
        }
    } else {
        const node = json[id];
        const prefabInfo = node._prefab && json[node._prefab.__id__];
        if (prefabInfo) {
            addInstanceFileID(prefabInfo, json, localID);
            localID.push(prefabInfo.fileId);
        }
    }
    return localID;
}

function isMountedChild(node: any, baseNode: any, json: any, basePrefab: any) {
    const prefabID = node._prefab && node._prefab.__id__;
    if (prefabID) {
        const prefabInfo = json[prefabID];
        if (prefabInfo.sync) {
            return false;
        }
    }
    return node.__type__ !== baseNode.__type__;
}

function compareChildren(prefabInstanceID: number, node: any, baseNode: any, basePrefab: any, json: any, targetOverridePropsKeys: any[]) {
    let localID: string[] = [];
    let propertyOverrides: any[] = [];
    let mountedNodes: any[] = [];
    if (node._children) {
        for (let i = 0; i < node._children.length; ++i) {
            const children = node._children[i];
            const childID = children && children.__id__;
            const childNode = childID && json[childID];
            if (!childNode) {
                continue;
            }
            const baseChildren = baseNode._children[i];
            // 多余的节点添加到 mounted children
            if (!baseChildren) {
                mountedNodes.push({
                    __id__: childID,
                });
                continue;
            }
            const baseChildID = baseChildren.__id__;
            const baseChildNode = basePrefab[baseChildID];
            // 如果是普通节点或者不是该 prefab 内部的就加入到 mountedChildren
            if (isMountedChild(childNode, baseChildNode, json, basePrefab)) {
                mountedNodes.push({
                    __id__: childID,
                });
                continue;
            }
            // 获取 local id（根据是否是 prefab）
            if (childNode._prefab) {
                // 如果是 prefab 就用源 prefab 的 fileId
                localID = getLocalID(baseChildID, basePrefab);
                const data = compareChildren(prefabInstanceID, childNode, baseChildNode, basePrefab, json, targetOverridePropsKeys);
                if (data) {
                    propertyOverrides = propertyOverrides.concat(data.childPropertyOverrides);
                    mountedNodes = mountedNodes.concat(data.childMountedNodes);
                }
            } else {
                localID = getLocalID(childID, json);
            }
            const overrides = compareBaseProp(prefabInstanceID, childNode, baseChildNode, localID, json);
            propertyOverrides = propertyOverrides.concat(overrides);
        }
    }
    // 对比 _components
    if (node._components) {
        for (let i = 0; i < node._components.length; ++i) {
            const overrides = compareComponentProp(
                prefabInstanceID,
                node._components[i],
                baseNode._components[i],
                json,
                basePrefab,
                targetOverridePropsKeys,
            );
            propertyOverrides = propertyOverrides.concat(overrides);
        }
    }
    return {
        childPropertyOverrides: propertyOverrides,
        childMountedNodes: mountedNodes,
    };
}

function comparePrefab(prefabInfo: any, json: any, inPrefab: boolean, targetOverridePropsKeys: any[]) {
    let mountedChildrenInfo = null;
    let propertyOverrides: any[] = [];
    const nodeID = prefabInfo.root && prefabInfo.root.__id__;
    const rootNode = nodeID && json[nodeID];
    const uuid = prefabInfo.asset.__uuid__;
    const basePrefab = totalPrefab.get(uuid);
    if (!basePrefab) {
        console.warn(`Cannot get Base Prefab by UUID: ${uuid}, PrefabInfo ID: ${nodeID} name: ${rootNode._name}.`);
        return;
    }
    const baseNodID = basePrefab[0] && basePrefab[0].data && basePrefab[0].data.__id__;
    const baseNode = basePrefab[baseNodID];
    if (!baseNode) {
        return;
    }
    const basePrefabInfo = baseNode._prefab && basePrefab[baseNode._prefab.__id__];
    const fileId = basePrefabInfo.fileId;
    // 检测是否有 Prefab Instance，如果没有进行添加
    let rootPrefabInfo = rootNode._prefab && json[rootNode._prefab.__id__];
    // 如果是断开节点就不需要添加 PrefabInstance
    if (rootPrefabInfo && !rootPrefabInfo.instance) {
        addPrefabInstance(rootNode._prefab.__id__, json, inPrefab);
        rootPrefabInfo = json[rootNode._prefab.__id__];
    }
    const prefabInstanceID = rootPrefabInfo && rootPrefabInfo.instance && rootPrefabInfo.instance.__id__;
    const localID: string[] = [fileId];
    // 对比节点基础数据：_lpos ｜ _lrot ｜ _lscale
    const overrides = compareBaseProp(prefabInstanceID, rootNode, baseNode, localID, json);
    propertyOverrides = propertyOverrides.concat(overrides);
    // 对比 children
    const data = compareChildren(prefabInstanceID, rootNode, baseNode, basePrefab, json, targetOverridePropsKeys);
    const { childPropertyOverrides, childMountedNodes } = data;
    propertyOverrides = propertyOverrides.concat(childPropertyOverrides);

    // 设置 mounted Node 到 Prefab Instance，目前只会有一层嵌套，所以只需要添加 file id 就行
    if (childMountedNodes.length > 0) {
        const mountedLocalID = [fileId];
        mountedChildrenInfo = addMountedChildrenInfo(prefabInstanceID, json, mountedLocalID, childMountedNodes);
    }
    return {
        propertyOverrides,
        mountedChildrenInfo,
        childMountedNodes,
    };
}

function updateReplaceIDs(removeIDs: number[], json: any, replaceIDs: any[]) {
    const tempJson = JSON.stringify(json);
    const tempIds = tempJson.match(/(?<="__id__":)([0-9]+)/g) || [];
    const ids: number[] = tempIds.map((idstr) => Number(idstr));

    for (const removeID of removeIDs) {
        for (let i = 0; i < ids.length; ++i) {
            const id = ids[i];
            let data = replaceIDs[i];
            if (!data) {
                data = {
                    baseID: id,
                    newID: id,
                };
                replaceIDs.push(data);
            }
            if (id > removeID) {
                data.newID--;
            }
        }
    }
}

function addRemoveID(id: number, removeIDs: number[]) {
    if (!removeIDs.includes(id)) {
        removeIDs.push(id);
    }
}

function addRemove(id: number, json: any, removeIDs: number[], removeSelf = true) {
    const item = json[id];
    if (item._prefab) {
        addRemoveID(item._prefab.__id__, removeIDs);
        item._prefab = null;
    }
    if (item.__prefab) {
        addRemoveID(item.__prefab.__id__, removeIDs);
        item.__prefab = null;
    }
    if (item.instance) {
        addRemoveID(item.instance.__id__, removeIDs);
        item.instance = null;
    }
    if (removeSelf) {
        addRemoveID(id, removeIDs);
    }
}

function restoreNormalNodes(node: INode, json: any, removeIDs: number[]) {
    const prefabID = node._prefab && node._prefab.__id__;
    // 如果有自动同步节点，该节点就不需要还原
    if (prefabID && json[prefabID].instance) {
        return;
    }
    if (node._children) {
        const children = node._children.map((child: any) => json[child.__id__]);
        for (const node of children) {
            restoreNormalNodes(node, json, removeIDs);
        }
    }
    if (node._components) {
        for (let i = 0; i < node._components.length; ++i) {
            const component = json[node._components[i].__id__];
            if (component && component.__prefab) {
                component.__prefab = null;
            }
        }
    }
    if (prefabID) {
        node._prefab = null;
    }
}

const totalPrefab: Map<string, any> = new Map();
export async function beforeMigratePrefab(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json;
    // 收集所有 prefab 用于对比处理
    if (0 === totalPrefab.size) {
        const prefabs = assetQuery.queryAssetInfos({ ccType: 'cc.Prefab' }, ['uuid', 'file']);
        for (const prefab of prefabs) {
            if (!totalPrefab.has(prefab.uuid) && prefab.file) {
                totalPrefab.set(prefab.uuid, readJSONSync(prefab.file));
            }
        }
    }
    // 预先加入 CompPrefabInfo 与 PrefabInstance
    const inPrefab = json[0] && json[0].__type__ === 'cc.Prefab';
    for (let id = 0; id < json.length; ++id) {
        const element = json[id];
        // 添加 CompPrefabInfo
        addCompPrefabInfo(id, json);
        if (element.__type__ === 'cc.PrefabInfo') {
            if (!element.fileId) {
                element.fileId = utils.UUID.generate();
            }
            if (element.sync) {
                // 添加 PrefabInstance
                addPrefabInstance(id, json, inPrefab);
            }
        }
    }
    // 收集已经导入后的 prefab 用于对比处理
    if (inPrefab) {
        totalPrefab.set(asset.uuid, json);
    }
}

// 递归删除所有子节点
function removeAllChild(nodeID: number, json: any, removeIDs: number[], removeSelf = true, totalMountedNodes?: number[]) {
    const node = json[nodeID];
    for (const child of node._children) {
        const childID = Number(child.__id__);
        if (totalMountedNodes && totalMountedNodes.includes(childID)) {
            continue;
        }
        addRemove(childID, json, removeIDs, removeSelf);
        removeAllChild(childID, json, removeIDs, removeSelf, totalMountedNodes);
    }
    json[nodeID]._children.length = [];
    for (const child of node._components) {
        const childID = Number(child.__id__);
        addRemove(childID, json, removeIDs, removeSelf);
    }
    json[nodeID]._components.legnth = [];
}

// 获取 TargetOverrideInfo
function getTargetOverrideInfoForComponents(
    componentID: number,
    baseComponentID: number,
    componentPropKeys: string[],
    json: any,
    baseJSON: any,
    disconnectPrefabs: Map<number, number>,
    targetOverridePropsKeys: any[],
) {
    const targetOverrides: any[] = [];
    const component = json[componentID];

    const nodeID = component.node && component.node.__id__;
    const node = json[nodeID];

    let sourceID = componentID;
    let sourceInfo = null;
    const isNormalNode = !baseJSON;
    // 设置 source [属性所在组件上在场景中的索引（如果是 prefab Root ID，反之：组件 id）] 与 sourceInfo
    const prefabInfo = node && node._prefab && json[node._prefab.__id__];
    if (prefabInfo && !isNormalNode) {
        const inPrefab = prefabInfo.asset && prefabInfo.asset.__id__ === 0;
        const isDisconnectPrefab = prefabInfo.root && disconnectPrefabs.has(prefabInfo.root.__id__);
        if (!isDisconnectPrefab && !inPrefab) {
            const sourceFileIds: string[] = getLocalID(baseComponentID, baseJSON, true);
            sourceInfo = createTargetInfo(sourceFileIds);
            sourceID = prefabInfo.root.__id__;
        }
    }

    for (const key of componentPropKeys) {
        let targetOverride;
        const props = component[key];
        // 如果是 __id__ 比较是否在内部，如果是就表示相等
        if (props && Array.isArray(props) && props[0] && props[0].__id__) {
            for (let i = 0; i < props.length; ++i) {
                const prop = props[i];
                if (!prop) {
                    continue;
                }
                const propPath: string[] = [key, i.toString()];
                const emptyProp = {
                    componentID: componentID,
                    key: key,
                    idx: i,
                };
                targetOverride = compareComponentIDProp(
                    propPath,
                    prop.__id__,
                    sourceID,
                    sourceInfo,
                    json,
                    disconnectPrefabs,
                    isNormalNode,
                    emptyProp,
                );
                if (targetOverride) {
                    targetOverridePropsKeys[componentID] = emptyProp.key;
                    targetOverrides.push(targetOverride);
                }
            }
        } else if (props && props.__id__) {
            const propPath: string[] = [key];
            const emptyProp = {
                componentID: componentID,
                key: key,
                idx: -1,
            };
            targetOverride = compareComponentIDProp(
                propPath,
                props.__id__,
                sourceID,
                sourceInfo,
                json,
                disconnectPrefabs,
                isNormalNode,
                emptyProp,
            );
            if (targetOverride) {
                targetOverridePropsKeys[componentID] = emptyProp.key;
                targetOverrides.push(targetOverride);
            }
        }
    }
    return targetOverrides;
}

export async function migratePrefab(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json;

    // 等待依赖的 Prefab 资源处理完成
    const uuids: string[] = [];
    for (const item of swap.json) {
        if (item.__type__ !== 'cc.PrefabInfo' || !item.asset || !item.asset.__uuid__ || item.asset.__uuid__ === asset.uuid) {
            continue;
        }
        const uuid = item.asset.__uuid__;
        if (!uuids.includes(uuid)) {
            uuids.push(uuid);
            const dependAsset = queryAsset(uuid);
            if (dependAsset) {
                if (!dependAsset._init) {
                    asset._assetDB.taskManager.pause(asset.task);
                    await dependAsset.waitInit();
                    asset._assetDB.taskManager.resume(asset.task);
                }
                try {
                    const json = readJSONSync(dependAsset.library + '.json');
                    if (!totalPrefab.has(uuid)) {
                        totalPrefab.set(uuid, json);
                    }
                } catch (e) {
                    console.error(e);
                }
            } else {
                console.warn(`depends aseet uuid: ${uuid} missing in the scene: ${asset.basename}`);
            }
        }
    }

    const inPrefab = json[0] && json[0].__type__ === 'cc.Prefab';
    const sceneOrPrefab = inPrefab ? 'prefab' : 'scene';
    // 获取所有 prefab 的节点 id
    const prefabIDList: Map<number, number[]> = new Map();
    // 用于处理移除 id
    const removeIDs: number[] = [];
    // 用于处理更新 id
    const replaceIDs: any[] = [];
    // 获取所有组件
    const components: any[] = [];
    // 存储需要变成普通节点的 prefab id 列表
    const disconnectPrefabs: Map<number, number> = new Map();
    // 存储 MountedNodes 避免删除节点
    let totalMountedNodes: any[] = [];
    let totalMountedChildrenInfos: any[] = [];
    // 存储 PropertyOverrides
    let totalPropertyOverrides: any[] = [];
    // 存储 TargetOverrideInfo
    let totalTargetOverrideInfos: any[] = [];
    // 存储 TargetOverridePropsKeys
    const targetOverridePropsKeys: any[] = [];

    // 搜集所有 Prefab Info
    for (let id = 0; id < json.length; ++id) {
        const element = json[id];
        if (element.__type__ === 'cc.Node' && element._prefab) {
            const prefabID = element._prefab.__id__;
            const prefabInfo = json[prefabID];
            // 如果 prefab asset 资源丢失，就直接断开
            if (!prefabInfo || !prefabInfo.root || !prefabInfo.asset) {
                if (!disconnectPrefabs.get(id)) {
                    disconnectPrefabs.set(id, prefabID);
                }
                console.warn(`Prefab asset missing, name: ${element._name} in the ${sceneOrPrefab} : ${asset.basename}.`);
                continue;
            }
            let ids = prefabIDList.get(prefabInfo.root.__id__);
            if (ids) {
                ids.push(prefabID);
            } else {
                ids = [prefabID];
            }
            prefabIDList.set(prefabInfo.root.__id__, ids);
        }
    }

    // 检测 prefab 是否有差异
    prefabIDList.forEach((ids: number[], rootID: number, map: Map<number, number[]>) => {
        const rootNode = json[rootID];
        if (!rootNode) {
            console.warn(`The prefab is bad. id: ${rootID}`);
            return;
        }
        const prefabID = rootNode._prefab && rootNode._prefab.__id__;
        const prefabInfo = json[prefabID];
        // 是否开启检测有差异
        let openDiff = true;
        if (inPrefab) {
            // prefab 内部只需要比对有 PrefabInstance 节点
            openDiff = !!prefabInfo.instance && !prefabInfo.sync;
        }
        if (openDiff) {
            // 有差异，需要变成普通节点
            if (isDiff(prefabInfo, json)) {
                if (!disconnectPrefabs.get(rootID)) {
                    disconnectPrefabs.set(rootID, prefabID);
                    return;
                }
            }
        }
    });

    // 检测是否需要添加 TargetOverrideInfos
    for (const element of json) {
        if (element.__type__ === 'cc.Node') {
            if (element._components) {
                const components = element._components
                    .map((componentInfo: any, index: number) => {
                        const component = json[componentInfo.__id__];
                        const propKeys: string[] = [];
                        for (const key in component) {
                            const props = component[key];
                            if (SKIP_COMPONENT_KEY.includes(key) || !props) {
                                continue;
                            }
                            const __id__ = Array.isArray(props) ? props[0] && props[0].__id__ : props && props.__id__;
                            if (__id__) {
                                propKeys.push(key);
                            }
                        }
                        if (propKeys.length > 0) {
                            return {
                                index: index,
                                __id__: componentInfo.__id__,
                                keys: propKeys,
                            };
                        }
                    })
                    .filter(Boolean);

                if (components.length === 0) {
                    continue;
                }

                let baseJSON;
                const prefabID = element._prefab && element._prefab.__id__;
                if (element._prefab) {
                    const prefabInfo = json[prefabID];
                    const uuid = prefabInfo && prefabInfo.asset && prefabInfo.asset.__uuid__;
                    const id = prefabInfo.asset && prefabInfo.asset.__id__;
                    if (id === 0) {
                        baseJSON = json;
                    } else {
                        if (uuid) {
                            baseJSON = totalPrefab.get(uuid);
                            if (!baseJSON) {
                                console.warn(
                                    `Cannot get Prefab by UUID: ${uuid}, the node name: ${element._name} in the ${sceneOrPrefab} : ${asset.basename}`,
                                );
                            }
                        }
                    }
                }
                const baseNode = baseJSON && baseJSON[1];
                for (const componentInfo of components) {
                    const i = componentInfo.index;
                    const componentID = componentInfo.__id__;
                    const componentPropKeys = componentInfo.keys;
                    const baseComponentID = baseNode && baseNode._components[i] && baseNode._components[i].__id__;
                    const targetOverrides = getTargetOverrideInfoForComponents(
                        componentID,
                        baseComponentID,
                        componentPropKeys,
                        json,
                        baseJSON,
                        disconnectPrefabs,
                        targetOverridePropsKeys,
                    );
                    totalTargetOverrideInfos = totalTargetOverrideInfos.concat(targetOverrides);
                }
            }
        }
    }

    // 对 prefab 进行对比处理
    prefabIDList.forEach((ids: number[], rootID: number, map: Map<number, number[]>) => {
        const rootNode = json[rootID];
        if (!rootNode) {
            return;
        }
        const prefabID = rootNode._prefab.__id__;
        const prefabInfo = json[prefabID];
        // 是否开启检测属性对比
        let openCompare = true;
        // 是否开启检测有差异
        let openDiff = true;
        if (inPrefab) {
            // prefab 内部只需要比对有 PrefabInstance 节点
            openDiff = !!prefabInfo.instance && !prefabInfo.sync;
            openCompare = !!prefabInfo.instance;
        }
        if (openDiff) {
            // 有差异，需要变成普通节点
            if (disconnectPrefabs.has(rootID)) {
                return;
            }
        }
        if (openCompare) {
            try {
                // 添加 PrefabLink | CCPropertyOverrideInfo | TargetInfo | MountedChildrenInfo
                const data = comparePrefab(prefabInfo, json, inPrefab, targetOverridePropsKeys);
                if (data) {
                    const { propertyOverrides, mountedChildrenInfo, childMountedNodes } = data;
                    if (mountedChildrenInfo) {
                        totalMountedChildrenInfos = totalMountedChildrenInfos.concat(mountedChildrenInfo);
                        totalMountedNodes = totalMountedNodes.concat(childMountedNodes);
                    }
                    totalPropertyOverrides = totalPropertyOverrides.concat(propertyOverrides);
                }
            } catch (e) {
                if (prefabID && !disconnectPrefabs.has(rootID)) {
                    disconnectPrefabs.set(rootID, prefabID);
                }
                console.error(e);
            }
        }
    });

    prefabIDList.forEach((ids: number[], rootID: number, map: Map<number, number[]>) => {
        if (disconnectPrefabs.has(rootID)) {
            return;
        }
        const rootNode = json[rootID];
        const rootPrefabInfo = rootNode._prefab && rootNode._prefab.__id__;
        if (rootPrefabInfo && rootPrefabInfo.instance) {
            removeAllChild(rootID, json, removeIDs, true, totalMountedNodes);
        }
        // 对自动同步节点，进行修剪节点字段，删除多余的数据
        for (const id of ids) {
            const prefabInfo = json[id];
            if (prefabInfo.instance) {
                // removeAllChild(rootID, json, removeIDs, true, totalMountedNodes);
                for (const key in rootNode) {
                    if (INSTANCE_RESERVED_KEYWORDS.includes(key)) {
                        continue;
                    }
                    delete rootNode[key];
                }
            }
            delete prefabInfo.sync;
            delete prefabInfo._synced;
        }
    });

    // prefabInstanceID, propertyOverrideInfo, targetInfo
    for (const element of totalPropertyOverrides) {
        json.push(element.targetInfo);
        const targetInfoID = json.length - 1;
        element.propertyOverrideInfo.targetInfo = {
            __id__: targetInfoID,
        };
        json.push(element.propertyOverrideInfo);
        const propertyOverridesID = json.length - 1;
        const prefabInstance = json[element.prefabInstanceID];
        prefabInstance.propertyOverrides.push({
            __id__: propertyOverridesID,
        });
    }
    // instanceID, mountedChildrenInfo, targetInfo
    for (const element of totalMountedChildrenInfos) {
        json.push(element.targetInfo);
        const targetInfoID = json.length - 1;
        element.mountedChildrenInfo.targetInfo = {
            __id__: targetInfoID,
        };
        json.push(element.mountedChildrenInfo);
        const mountedChildrenInfoID = json.length - 1;
        const prefabInstance = json[element.prefabInstanceID];
        prefabInstance.mountedChildren.push({
            __id__: mountedChildrenInfoID,
        });
    }
    // targetOverrideInfo, sourceInfo, targetInfo
    if (totalTargetOverrideInfos.length > 0) {
        const targetOverrideIDs: any[] = [];
        for (const element of totalTargetOverrideInfos) {
            const componentID = element.emptyProp && element.emptyProp.componentID;
            if (componentID) {
                const comp = json[componentID];
                const nodeID = comp && comp.node && comp.node.__id__;
                const node = json[nodeID];
                const prefabID = node._prefab && node._prefab.__id__;
                const prefabInfo = json[prefabID];
                const rootID = prefabInfo && prefabInfo.root && prefabInfo.root.__id__;
                if (rootID && disconnectPrefabs.has(rootID)) {
                    continue;
                }
            }
            if (element.sourceInfo) {
                json.push(element.sourceInfo);
                const sourceInfoID = json.length - 1;
                element.targetOverrideInfo.sourceInfo = {
                    __id__: sourceInfoID,
                };
            }
            if (element.targetInfo) {
                json.push(element.targetInfo);
                const targetInfoID = json.length - 1;
                const targetOverrideInfoID = json.length - 1;
                element.targetOverrideInfo.targetInfo = {
                    __id__: targetInfoID,
                };
            }
            json.push(element.targetOverrideInfo);
            const targetOverrideID = json.length - 1;
            targetOverrideIDs.push({
                __id__: targetOverrideID,
            });
            const emptyProp = element.emptyProp;
            if (emptyProp) {
                const component = json[emptyProp.componentID];
                let prop = component[emptyProp.key];
                if (Array.isArray(prop)) {
                    prop[emptyProp.idx] = null;
                } else {
                    prop = null;
                }
                component[emptyProp.key] = prop;
            }
        }
        addPrefabInfo(targetOverrideIDs, json);
    }

    // 如果 Mounted Nodes 内部如果不是实例的 prefab 就移除 prefab info
    for (const element of totalMountedNodes) {
        const nodeID = element.__id__;
        const node = json[nodeID];
        const prefabInfo = json[node._prefab.__id__];
        if (prefabInfo.instance) {
            continue;
        }

        const rootID = prefabInfo.root && prefabInfo.root.__id__;
        if (rootID && disconnectPrefabs.has(rootID)) {
            continue;
        }

        // 如果原本是 prefab 的子节点，但是源 prefab 内部没有就不应该删除，直接断开
        const removeSelf = !prefabInfo;
        addRemove(nodeID, json, removeIDs, removeSelf);
        removeAllChild(nodeID, json, removeIDs, removeSelf);
        node._prefab = null;
    }
    // 差异过大的节点变成为普通节点
    disconnectPrefabs.forEach((prefabID: number, rootID: number, map: Map<number, number>) => {
        const node = json[rootID];
        // 如果有自动同步节点，该节点就不需要还原
        if (json[prefabID].instance) {
            return;
        }
        restoreNormalNodes(node, json, removeIDs);
        const id = addPrefabLink(json, rootID, prefabID);
        if (id !== -1) {
            node._components.push({
                __id__: id,
            });
        }
    });
    swap.json = json;
}
