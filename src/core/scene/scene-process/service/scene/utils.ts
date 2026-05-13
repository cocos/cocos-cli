import cc, { Scene } from 'cc';
import {
    IComponentIdentifier,
    IMountedChildrenInfo,
    IMountedComponentsInfo,
    IPrefabDetail,
    IPrefabInfo,
    IPrefabInstance,
    IPropertyOverrideInfo,
    ITargetInfo,
    ITargetOverrideDetail,
    OptimizationPolicy,
} from '../../../common';
import compMgr from '../component/index';
import { prefabUtils } from '../prefab/utils';
import dumpUtil, { translateDumpI18n } from '../dump';
import type { INode } from '../../../common';
import type { IScene } from '../../../common/editor/scene';

class SceneUtil {
    /** 默认超时：1分钟 */
    static readonly Timeout = 60 * 1000;

    /**
     * 立即运行场景，清除节点与组件缓存
     * @param sceneAsset
     */
    runScene(sceneAsset: cc.SceneAsset | cc.Scene): Promise<cc.Scene> {
        // 重要：清空节点与组件的 path 缓存，否则会出现数据重复的问题
        EditorExtends.Node.clear();
        EditorExtends.Component.clear();

        return new Promise<cc.Scene>((resolve, reject) => {
            cc.director.runSceneImmediate(
                sceneAsset,
                () => { /* onLaunched 回调（可选） */ },
                (err: Error | null, instance?: cc.Scene) => {
                    if (err || !instance) {
                        console.error('运行场景失败:', err);
                        reject(err ?? new Error('Unknown scene run error'));
                        return;
                    }
                    resolve(instance);
                }
            );
        });
    }
    /**
     * 从一个序列化后的 JSON 内加载并运行场景
     * @param serializeJSON
     */
    async runSceneImmediateByJson(serializeJSON: Record<string, any>): Promise<cc.Scene> {
        return withTimeout(
            new Promise<cc.Scene>((resolve, reject) => {
                cc.assetManager.loadWithJson(serializeJSON, null, (error: Error | null, scene: cc.SceneAsset) => {
                    if (error) return reject(error);
                    this.runScene(scene).then(resolve).catch(reject);
                });
            }),
            SceneUtil.Timeout,
            '加载场景超时'
        );
    }

    /**
     * 生成组件信息
     */
    generateComponentInfo(component: cc.Component): IComponentIdentifier {
        return compMgr.getComponentIdentifier(component);
    }

    generatePrefabInfo(prefab: cc.Prefab._utils.PrefabInfo | null): IPrefabInfo | null {
        if (!prefab) {
            return null;
        }

        const generateTargetInfo = (info: any): ITargetInfo | null => {
            if (!info) {
                return null;
            }
            return {
                localID: info.localID,
            };
        };

        const generatePropertyOverrideInfo = (info: any): IPropertyOverrideInfo => {
            return {
                targetInfo: generateTargetInfo(info.targetInfo),
                propertyPath: info.propertyPath,
                value: info.value,
            };
        };

        const generateMountedChildrenInfo = (info: any): IMountedChildrenInfo => {
            return {
                targetInfo: generateTargetInfo(info.targetInfo),
                nodes: info.nodes.map((node: cc.Node) => this.generateNodeIdentifier(node))
            };
        };

        const generateMountedComponentsInfo = (info: any): IMountedComponentsInfo => {
            return {
                targetInfo: generateTargetInfo(info.targetInfo),
                components: info.components.map((comp: cc.Component) => this.generateComponentIdentifier(comp)),
            };
        };

        const generatePrefabInstance = (instance: any): IPrefabInstance | undefined => {
            if (!instance) {
                return undefined;
            }
            const result = {
                fileId: instance.fileId,
                prefabRootNode: instance.prefabRootNode ? this.generateNodeIdentifier(instance.prefabRootNode) : undefined,
                mountedChildren: instance.mountedChildren.map(generateMountedChildrenInfo),
                mountedComponents: instance.mountedComponents.map(generateMountedComponentsInfo),
                propertyOverrides: instance.propertyOverrides.map(generatePropertyOverrideInfo),
                removedComponents: instance.removedComponents.map(generateTargetInfo),
            };
            //prefabRootNode is optional field.
            if (!result.prefabRootNode) {
                delete result.prefabRootNode;
            }
            return result;
        };

        const generatePrefabAsset = (asset: any): IPrefabDetail | undefined => {
            if (!asset) {
                return undefined;
            }
            return {
                name: asset.name,
                uuid: asset._uuid,
                data: this.generateNodeIdentifier(asset.data),
                optimizationPolicy: asset.optimizationPolicy as OptimizationPolicy,
                persistent: asset.persistent,
            };
        };

        const generateTargetOverrideInfo = (info: any): ITargetOverrideDetail => {
            return {
                source: info.source ? (info.source.node ? this.generateNodeIdentifier(info.source.node) : this.generateComponentIdentifier(info.source)) : null,
                sourceInfo: generateTargetInfo(info.sourceInfo),
                propertyPath: info.propertyPath,
                target: info.target ? this.generateNodeIdentifier(info.target) : null,
                targetInfo: generateTargetInfo(info.targetInfo),
            };
        };

        const root = prefab.root && this.generateNodeIdentifier(prefab.root);

        const result = {
            asset: generatePrefabAsset(prefab.asset) ?? undefined,
            root: root ?? undefined,
            instance: generatePrefabInstance(prefab.instance) ?? undefined,
            fileId: prefab.fileId,
            targetOverrides: prefab.targetOverrides ? prefab.targetOverrides.map(generateTargetOverrideInfo) : [],
            nestedPrefabInstanceRoots: prefab.nestedPrefabInstanceRoots ? prefab.nestedPrefabInstanceRoots.map((node: cc.Node) => this.generateNodeIdentifier(node)) : [],
        };
        // asset, root, instance is a optional field in SchemaPrefabInfo.
        if (!result.asset) {
            delete result.asset;
        }
        if (!result.root) {
            delete result.root;
        }
        if (!result.instance) {
            delete result.instance;
        }
        return result;
    }

    generateNodeIdentifier(node: cc.Node) {
        return {
            nodeId: node.uuid,
            path: EditorExtends.Node.getNodePath(node),
            name: node.name,
        };
    }

    generateComponentIdentifier(component: cc.Component) {
        return compMgr.getComponentIdentifier(component);
    }

    async generateNodeDump(node: cc.Node): Promise<INode | IScene> {
        if (node instanceof Scene) {
            const sceneDump = await translateDumpI18n(dumpUtil.dumpNode(node)) as IScene;

            // hack: 以下字段不属于编辑器 dump 结构（IScene），仅用于 proxy 层将复杂的 dump 转换为 CLI 所需的扁平结构
            const d = sceneDump as any;
            d.__path__ = '/';
            d.__position__ = { x: node.position.x, y: node.position.y, z: node.position.z };
            d.__rotation__ = { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z, w: node.rotation.w };
            d.__scale__ = { x: node.scale.x, y: node.scale.y, z: node.scale.z };
            d.__layer__ = node.layer;
            d.__mobility__ = node.mobility;
            d.__prefabInfo__ = this.generatePrefabInfo(node['_prefab']);
            d.__comps__ = [];
            for (const comp of node.components) {
                const compDump = await translateDumpI18n(dumpUtil.dumpComponent(comp as cc.Component)) as any;
                compDump.__component_path__ = compMgr.getPathFromUuid(comp.uuid) ?? '';
                compDump.__compPrefab__ = (comp as any).__prefab || null;
                d.__comps__.push(compDump);
            }
            d.__childNodes__ = [];
            for (const child of node.children) {
                d.__childNodes__.push(await this.generateNodeDump(child) as INode);
            }
            return sceneDump;
        }

        const dump = await translateDumpI18n(dumpUtil.dumpNode(node)) as INode;

        // hack: 以下字段不属于编辑器 dump 结构（INode），仅用于 proxy 层将复杂的 dump 转换为 CLI 所需的扁平结构
        const d = dump as any;
        d.__path__ = EditorExtends.Node.getNodePath(node);
        d.__rotation__ = { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z, w: node.rotation.w };
        d.__prefabInfo__ = this.generatePrefabInfo(node['_prefab']);
        if (dump.__comps__) {
            for (let i = 0; i < dump.__comps__.length && i < node.components.length; i++) {
                const comp = node.components[i];
                (dump.__comps__[i] as any).__component_path__ = compMgr.getPathFromUuid(comp.uuid) ?? '';
                (dump.__comps__[i] as any).__compPrefab__ = (comp as any).__prefab || null;
            }
        }

        d.__childNodes__ = [];
        for (const child of node.children) {
            d.__childNodes__.push(await this.generateNodeDump(child));
        }

        return dump;
    }

    /**
     * 序列化场景
     * @private
     */
    serialize(scene: cc.Scene) {
        const asset = new cc.SceneAsset();
        prefabUtils.gatherPrefabInstanceRoots(scene);
        prefabUtils.removeInvalidPrefabData(scene);
        asset.scene = scene;
        return EditorExtends.serialize(asset);
    }

    /**
     * 根据资源 uuid 加载资源
     * @param uuid
     */
    async loadAny<TAsset extends cc.Asset>(uuid: string): Promise<TAsset> {
        return new Promise<TAsset>((resolve, reject) => {
            cc.assetManager.assets.remove(uuid);
            cc.assetManager.loadAny<TAsset>(uuid, (error: Error | null, asset: TAsset) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(asset);
                }
            });
        });
    }
}

/**
 * 通用超时包装函数
 * @param promise 要执行的 Promise
 * @param timeoutMs 超时时间（毫秒）
 * @param message 超时错误信息
 */
export async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message = 'Operation timed out'
): Promise<T> {
    let timer: NodeJS.Timeout;
    return Promise.race([
        promise,
        new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        }),
    ]).finally(() => clearTimeout(timer));
}

export const sceneUtils = new SceneUtil();
