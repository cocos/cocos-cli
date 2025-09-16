'use strict';

import { IBaseNode, IObjectRef } from './defines';
import { queryAsset } from '@editor/asset-db';
import { readJSON, readJSONSync } from 'fs-extra';
import { existsSync } from 'fs';

/**
 * 遍历每一个对象，找到带有 uuid 的 object 并执行 handle
 * @param object
 * @param handle
 */
export function walk(object: any, handle: (obj: object) => void) {
    if (Array.isArray(object)) {
        for (const child of object) {
            walk(child, handle);
        }
    } else if (object && typeof object === 'object') {
        if ('__uuid__' in object) {
            handle(object);
        } else {
            for (const value of Object.values(object)) {
                walk(value, handle);
            }
        }
    }
}

export async function walkAsync(object: any, handle: (obj: object) => void) {
    if (Array.isArray(object)) {
        for (const child of object) {
            await walk(child, handle);
        }
    } else if (object && typeof object === 'object') {
        if ('__uuid__' in object) {
            await handle(object);
        } else {
            for (const value of Object.values(object)) {
                await walk(value, handle);
            }
        }
    }
}

/**
 * 查找一个 json 里面的 component
 * @param json
 * @param nodeIdx
 * @param compRE
 */
export function getComponent(json: any[], nodeIdx: number, compRE: RegExp) {
    if (typeof nodeIdx !== 'number' || nodeIdx < 0) {
        return null;
    }
    const comps = json[nodeIdx]._components;
    for (const compIdx of comps) {
        const comp = json[compIdx.__id__];
        if (compRE.test(comp.__type__)) {
            return comp;
        }
    }
    return null;
}

/**
 * 遍历节点和它的子节点
 * @param json
 * @param nodeIdx
 * @param processFunc
 * @returns
 */
export function walkNode(json: any[], nodeRef: IObjectRef, processFunc: (nodeJson: IBaseNode, nodeRef: IObjectRef) => void) {
    if (!nodeRef || typeof nodeRef.__id__ !== 'number' || nodeRef.__id__ < 0) {
        return;
    }

    const nodeJson = json[nodeRef.__id__];
    processFunc(nodeJson, nodeRef);

    if (nodeJson._children) {
        nodeJson._children.forEach((childObj: IObjectRef) => {
            walkNode(json, childObj, processFunc);
        });
    }
}

/**
 * 遍历节点和它的子节点
 * @param json
 * @param nodeIdx
 * @param processFunc
 * @returns
 */
export async function walkNodeAsync(json: any[], nodeRef: IObjectRef, processFunc: (nodeJson: IBaseNode, nodeRef: IObjectRef) => void) {
    if (!nodeRef || typeof nodeRef.__id__ !== 'number' || nodeRef.__id__ < 0) {
        return;
    }

    const nodeJson = json[nodeRef.__id__];
    await processFunc(nodeJson, nodeRef);

    if (nodeJson._children) {
        for (let index = 0; index < nodeJson._children.length; index++) {
            const childObj = nodeJson._children[index];
            await walkNodeAsync(json, childObj, processFunc);
        }
    }
}

/**
 * 通过__id__获取node的prefab信息
 * @param json
 */
export function getPrefabOfNode(id: number, json: any[]) {
    if (id && json[id]) {
        const node = json[id];
        if (node && node.__type__ === 'cc.Node') {
            const prefabId = node._prefab?.__id__;
            if (prefabId && json[prefabId]) {
                return json[prefabId];
            }
        }
    }
}

export function isNestedPrefab(node: any, json: any[], prefabUuid: string) {
    if (node?._prefab?.__id__ && json[node._prefab.__id__]?.asset?.__uuid__) {
        // 部分prefab子节点存在索引自己的问题，需要过滤掉
        return json[node._prefab.__id__]?.asset?.__uuid__ !== prefabUuid;
    }
    return false;
}

const walkPrefabInstanceChildren = async function(children: any[], json: any[], sceneAsset: any, callback: Function, prefabUuid: string) {
    for (let index = 0; index < children.length; index++) {
        const childRef = children[index];
        await walkNodeAsync(json, childRef, async (childJson, _) => {
            if (isNestedPrefab(childJson, json, prefabUuid)) {
                await walkPrefabInstances(childJson, json, sceneAsset, callback);
            } else {
                callback(childJson);
                if (childJson._components) {
                    childJson._components.forEach((componentRef) => {
                        const component = json[componentRef.__id__];
                        if (component) {
                            callback(component);
                        }
                    });
                }
            }
        });
    }
};

/**
 * 遍历嵌套预制体实例的所有节点和组件
 * @param node 预制体所在节点json
 * @param json 场景jsonscene
 */
export async function walkPrefabInstances(node: any, json: any[], sceneAsset: any, callback: Function) {
    if (!node?._prefab?.__id__) return;
    // 根节点
    callback(node, json);
    const prefab = json[node._prefab.__id__];
    const uuid = prefab?.asset?.__uuid__;
    if (!uuid) return;

    const asset = queryAsset(uuid);
    if (asset && asset.source) {
        let prefabJson: any[] = [];
        let file: string;
        if (asset.source.includes('@')) {
            if (!asset.init) {
                asset._assetDB.taskManager.pause(sceneAsset.task);
                await asset.waitInit();
                asset._assetDB.taskManager.resume(sceneAsset.task);
            }
            file = asset.library + '.json';
        } else {
            file = asset.source;
        }
        if (existsSync(file)) {
            try {
                prefabJson = readJSONSync(file);
            } catch (error) {
                console.warn(error);
            }
        }
        if (!prefabJson[0] || !prefabJson[0]?.data?.__id__) return;

        // 遍历prefabJson的子节点和组件
        const root = prefabJson[prefabJson[0].data.__id__];
        if (root?._children) {
            await walkPrefabInstanceChildren(root._children, prefabJson, sceneAsset, callback, uuid);
        }
        if (root?._components) {
            root._components.forEach((componentRef: any) => {
                const component = prefabJson[componentRef.__id__];
                if (component) {
                    callback(component);
                }
            });
        }
    }
    // 遍历mountedChildrenNComponent
    const instanceID = prefab?.instance?.__id__;
    if (instanceID && json[instanceID]) {
        const instance = json[instanceID];
        if (instance.mountedChildren && instance.mountedChildren.length > 0) {
            const childrenRefs: any[] = [];
            instance.mountedChildren.forEach((infoRef: any) => {
                const info = json[infoRef.__id__];
                if (info && info.nodes) {
                    for (const node of info.nodes) {
                        childrenRefs.push(node);
                    }
                }
            });
            await walkPrefabInstanceChildren(childrenRefs, json, sceneAsset, callback, uuid);
        }
        if (instance.mountedComponents && instance.mountedComponents.length > 0) {
            instance.mountedComponents.forEach((infoRef: any) => {
                const info = json[infoRef.__id__];
                if (info && info.components) {
                    for (const component of info.components) {
                        if (component.__id__ && json[component.__id__]) {
                            callback(json[component.__id__]);
                        }
                    }
                }
            });
        }
    }
}
