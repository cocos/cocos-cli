import { Asset } from '@editor/asset-db';
import fs from 'fs-extra';
import { IBaseNode, IObjectRef, IPrefabInfo } from './defines';
import { walkNode } from './utils';
export async function migratePrefabInstanceRoots(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await fs.readJSON(asset.source));
    migratePrefabInstanceRootsByJson(json);
}

export function migratePrefabInstanceRootsByJson(json: any[]) {
    const rootNode = json[1];
    if (!rootNode) {
        console.warn('can\'t find root node');
        return;
    }
    if (!rootNode._prefab) {
        const newPrefabInfo = {
            __type__: 'cc.PrefabInfo',
            fileId: rootNode._id,
        };

        const idx = json.push(newPrefabInfo) - 1;
        rootNode._prefab = {
            __id__: idx,
        };
    }

    const rootNodePrefabInfo: IPrefabInfo | null = rootNode._prefab ? json[rootNode._prefab.__id__] : null;
    if (rootNode && rootNodePrefabInfo && rootNode._children) {
        const instanceRoot: IObjectRef[] = [];
        // 扫根节点下的子节点中所有的PrefabInstance节点
        rootNode._children.forEach((child: IObjectRef) => {
            walkNode(json, child, (nodeJson, nodeRef) => {
                if (!nodeJson || !nodeJson._prefab) {
                    return;
                }
                const prefabInfo: IPrefabInfo = json[nodeJson._prefab.__id__];
                if (prefabInfo.instance) {
                    instanceRoot.push(nodeRef);
                }
            });

            if (instanceRoot.length > 0) {
                // 添加到根节点的
                rootNodePrefabInfo.nestedPrefabInstanceRoots = instanceRoot;
            } else {
                rootNodePrefabInfo.nestedPrefabInstanceRoots = undefined;
            }
        });
    }
}
