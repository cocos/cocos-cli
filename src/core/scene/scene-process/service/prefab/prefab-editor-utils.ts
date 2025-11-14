import { Node, Scene, SceneAsset } from 'cc';
import { prefabUtils } from './utils';

type UUIDMap = Map<string, string | UUIDMap>;

class EditorPrefabUtils {
    serialize(node: Node) {
        // 校验数据
        prefabUtils.checkMountedRootData(node, true);
        const { prefab } = prefabUtils.getPrefabForSerialize(node);
        return EditorExtends.serialize(prefab);
    }

    removePrefabInstanceRoots(rootNode: Node | Scene) {
        prefabUtils.removePrefabInstanceRoots(rootNode);
    }

    generateSceneAsset(scene: Scene, rootNode: Node | null) {
        const asset = new SceneAsset();
        prefabUtils.removePrefabInstanceRoots(scene);
        prefabUtils.gatherPrefabInstanceRoots(scene); // 为了 softReload 场景能去创建 PrefabInstance，需要将它们记录在 scene 节点上

        // 软加载时需要更新根节点的 nestedPrefabRoots，否则序列化后会有问题
        if (rootNode) {
            prefabUtils.removePrefabInstanceRoots(rootNode);
            prefabUtils.gatherPrefabInstanceRoots(rootNode);
        }
        asset.scene = scene;

        return asset;
    }

    /**
     * 由于动态加载Prefab会导致节点的uuid发生变化，为了保证编辑过程中节点的uuid不变
     * 节点id也会，所以也需要更新
     * 在softReload之前会存储prefab节点的uuid,以便之后还原
     * @param scene 场景数据
     */
    storePrefabUUID(scene: Scene) {
        const prefabUUIDMap = new Map();
        for (let i = 0; i < scene.children.length; i++) {
            const child = scene.children[i] as unknown as Node;
            this.generatePrefabUUIDMap(child, prefabUUIDMap);
        }

        return prefabUUIDMap;
    }

    generatePrefabUUIDMap(node: Node, uuidMap: UUIDMap) {
        if (!uuidMap) {
            return;
        }

        // @ts-ignore
        const prefabInfo = node['_prefab'];

        let curMap = uuidMap;
        if (prefabInfo) {
            if (prefabInfo.instance) {
                curMap = new Map();
                uuidMap.set(prefabInfo.instance.fileId, curMap);
            }

            curMap.set(prefabInfo.fileId, node.uuid);
            node.components.forEach((comp) => {
                const compPrefab = comp.__prefab;
                if (compPrefab?.fileId) {
                    if (curMap.has(compPrefab.fileId)) {
                        console.warn(`generatePrefabUUIDMap ${compPrefab.fileId} already exist`);
                        return;
                    }
                    curMap.set(compPrefab.fileId, comp.uuid);
                }
            });
        }

        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            this.generatePrefabUUIDMap(child, curMap);
        }
    }

    /**
     * 恢复Prefab的uuid
     * @param scene 场景数据
     * @param prefabUUIDMap
     */
    restorePrefabUUID(scene: Scene, prefabUUIDMap: UUIDMap) {
        for (let i = 0; i < scene.children.length; i++) {
            const child = scene.children[i] as unknown as Node;
            this.applyPrefabUUID(child, prefabUUIDMap);
        }
    }

    applyPrefabUUID(node: Node, uuidMap: UUIDMap | undefined) {
        if (!uuidMap) {
            return;
        }

        const prefabInfo = node['_prefab'];

        let curMap: UUIDMap | undefined = uuidMap;
        if (prefabInfo) {
            if (prefabInfo.instance) {
                curMap = uuidMap.get(prefabInfo.instance.fileId) as Map<string, string>;
            }

            if (curMap) {
                const uuid = (curMap as Map<string, string>).get(prefabInfo.fileId);
                if (!uuid) {
                    console.error(prefabInfo.fileId + ' not found uuid');
                }
                EditorExtends.Node.changeNodeUUID(node.uuid, uuid ?? '');
                node.components.forEach((comp) => {
                    const compPrefab = comp.__prefab;
                    if (compPrefab?.fileId) {
                        const compUUID = (curMap as Map<string, string>).get(compPrefab.fileId);
                        compUUID && EditorExtends.Component.changeUUID(comp.uuid, compUUID);
                    }
                });
            }
        }

        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            this.applyPrefabUUID(child, curMap);
        }
    }

}

export const editorPrefabUtils = new EditorPrefabUtils();
