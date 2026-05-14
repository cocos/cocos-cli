import cc, { Scene } from 'cc';
import compMgr from '../component/index';
import { prefabUtils } from '../prefab/utils';
import dumpUtil, { translateDumpI18n } from '../dump';
import { encodePrefab } from '../dump/encode';
import type { INode, IPrefab } from '../../../common';
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
    generateComponentInfo(component: cc.Component) {
        return this.generateComponentIdentifier(component);
    }

    // hack: 在 IPrefab 上附加 CLI 所需的丰富结构（INodeIdentifier），
    // proxy 层的 convertPrefab 读取这些字段构建 IPrefabInfo
    // __asset__ 和 __nested_roots__ 无法从 IPrefab 字段推导，仍需 hack
    // 同时为 IPrefab 中所有 node/component 引用填充 path/name
    enrichPrefabDump(prefab: any, enginePrefab: any): void {
        if (!prefab || !enginePrefab) return;

        prefab.__asset__ = enginePrefab.asset ? {
            name: enginePrefab.asset.name,
            uuid: enginePrefab.asset._uuid,
            data: this.generateNodeIdentifier(enginePrefab.asset.data),
            optimizationPolicy: enginePrefab.asset.optimizationPolicy,
            persistent: enginePrefab.asset.persistent,
        } : undefined;
        prefab.__nested_roots__ = enginePrefab.nestedPrefabInstanceRoots
            ? enginePrefab.nestedPrefabInstanceRoots.map((node: cc.Node) => this.generateNodeIdentifier(node))
            : [];

        // 为 root 填充 path/name
        if (enginePrefab.root) {
            prefab.__root__ = this.generateNodeIdentifier(enginePrefab.root);
        }

        // 为 targetOverrides 中的 source/target 填充 path/name（通过 UUID 查找）
        if (prefab.targetOverrides) {
            for (const override of prefab.targetOverrides) {
                if (override.source) {
                    const node = EditorExtends.Node.getNode(override.source);
                    if (node) {
                        override.__source__ = this.generateNodeIdentifier(node);
                    }
                }
                if (override.target) {
                    const node = EditorExtends.Node.getNode(override.target);
                    if (node) {
                        override.__target__ = this.generateNodeIdentifier(node);
                    }
                }
            }
        }

        // 为 instance 添加 hack 字段，仅包含需要 path/name 富化的标识符
        if (enginePrefab.instance) {
            const inst = enginePrefab.instance;
            const d = (prefab as any);
            d.__instance__ = {
                prefabRootNode: inst.prefabRootNode ? this.generateNodeIdentifier(inst.prefabRootNode) : undefined,
                mountedChildren: (inst.mountedChildren ?? []).map((mc: any) => ({
                    nodes: (mc.nodes ?? []).map((n: cc.Node) => this.generateNodeIdentifier(n)),
                })),
                mountedComponents: (inst.mountedComponents ?? []).map((mc: any) => ({
                    components: (mc.components ?? []).map((c: cc.Component) => this.generateComponentIdentifier(c)),
                })),
            };
        }
    }

    generateNodeIdentifier(node: cc.Node) {
        return {
            nodeId: node.uuid,
            path: EditorExtends.Node.getNodePath(node),
            name: node.name,
        };
    }

    generateComponentIdentifier(component: cc.Component) {
        return {
            cid: (component as any).__cid__,
            path: compMgr.getPathFromUuid(component.uuid) ?? '',
            uuid: component.uuid,
            name: component.name,
            type: cc.js.getClassName(component.constructor),
            enabled: component.enabled ? true : false,
        };
    }

    generatePrefabDump(node: cc.Node): IPrefab | null {
        const prefab = encodePrefab(node as any);
        if (!prefab) return null;
        this.enrichPrefabDump(prefab, node['_prefab']);
        return prefab;
    }

    async generateNodeDump(node: cc.Node): Promise<INode | IScene> {
        if (node instanceof Scene) {
            const sceneDump = await translateDumpI18n(dumpUtil.dumpNode(node)) as IScene;

            // hack: 以下字段不属于编辑器 dump 结构（IScene），仅用于 proxy 层将复杂的 dump 转换为 CLI 所需的扁平结构
            const d = sceneDump as any;
            d.__path__ = EditorExtends.Node.getNodePath(node);
            d.__prefab__ = encodePrefab(node as any);
            if (d.__prefab__) {
                this.enrichPrefabDump(d.__prefab__, node['_prefab']);
            }
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
        if (dump.__prefab__) {
            this.enrichPrefabDump(dump.__prefab__, node['_prefab']);
        }
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
