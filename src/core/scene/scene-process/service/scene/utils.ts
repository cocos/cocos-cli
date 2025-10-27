import cc from 'cc';
import { Rpc } from '../../rpc';
import { IComponentIdentifier, INode, IScene, ISceneIdentifier } from '../../../common';
import compMgr from '../component/index';
import type { IAssetInfo } from '../../../../assets/@types/public';

class SceneUtil {
    /** 默认超时：1分钟 */
    static readonly Timeout = 60 * 1000;

    /**
     * 获取资源 UUID
     * @param urlOrUUIDOrPath
     */
    async queryUUID(urlOrUUIDOrPath?: string): Promise<string | null> {
        if (!urlOrUUIDOrPath) return null;
        try {
            return await Rpc.getInstance().request('assetManager', 'queryUUID', [urlOrUUIDOrPath]);
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    /**
     * 获取场景标识信息
     * @param source
     * @private
     */
    async getSceneIdentifier(source?: string | IAssetInfo): Promise<ISceneIdentifier> {
        const identifier: ISceneIdentifier = {
            assetType: 'unknown',
            assetName: 'unknown',
            assetUuid: 'unknown',
            assetUrl: 'unknown',
        };

        if (!source) return identifier;

        const isString = typeof source === 'string';
        const assetInfo: IAssetInfo | null = isString ? await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [source]) : source;
        if (!assetInfo) {
            console.error('无法请求场景资源');
            return identifier;
        }
        return {
            assetType: assetInfo.type,
            assetName: assetInfo.name,
            assetUuid: assetInfo.uuid,
            assetUrl: assetInfo.url,
        };
    }

    /**
     * 立即运行场景，清除节点与组件缓存
     * @param sceneAsset
     */
    runScene(sceneAsset: cc.SceneAsset): Promise<cc.Scene> {
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

    /**
     * 节点 dump 数据
     * @param node
     * @param generateChildren
     */
    generateNodeInfo(node: cc.Node, generateChildren: boolean): INode {
        const nodeInfo: INode = {
            nodeId: node.uuid,
            path: EditorExtends.Node.getNodePath(node),
            name: node.name,
            properties: {
                active: node.active,
                position: node.position,
                rotation: node.rotation,
                scale: node.scale,
                layer: node.layer,
                // worldPosition: node.worldPosition,
                // worldRotation: node.worldRotation,
                eulerAngles: node.eulerAngles,
                // angle: node.angle,
                // worldScale: node.worldScale,
                // worldMatrix: node.worldMatrix,
                // forward: node.forward,
                // up: node.up,
                // right: node.right,
                mobility: node.mobility,
                // hasChangedFlags: node.hasChangedFlags,
                // activeInHierarchy: node.activeInHierarchy,
            },
            components: node.components
                .map((component: cc.Component) => {
                    return this.generateComponentInfo(component);
                })
        };
        if (generateChildren) {
            node.children.forEach((child) => {
                if (!nodeInfo.children) {
                    nodeInfo.children = [];
                }
                nodeInfo.children.push(this.generateNodeInfo(child, true));
            });
        }
        return nodeInfo;
    }

    /**
     * 请求某个路径的节点树，不传路径为当前场景
     */
    generateSceneInfo(identifier: ISceneIdentifier): IScene | null {
        const scene = cc.director.getScene();
        if (!scene) {
            return null;
        }
        return {
            ...identifier,
            // Properties
            name: scene.name,
            //
            children: scene.children
                .map((node: cc.Node) => {
                    return this.generateNodeInfo(node, true);
                })
                .filter(child => child !== null) as INode[],
            components: scene.components
                .map((component: cc.Component) => {
                    return this.generateComponentInfo(component);
                })
        };
    }

    /**
     * 序列化场景
     * @private
     */
    serialize(scene: cc.Scene) {
        const asset = new cc.SceneAsset();
        asset.scene = scene;
        return EditorExtends.serialize(asset);
    }

    /**
     * 生成场景信息
     * @param identifier 标识
     */
    async generateScene(identifier: ISceneIdentifier | string): Promise<IScene> {
        if (typeof identifier === 'string') {
            identifier = await this.getSceneIdentifier(identifier);
        }
        const scene = this.generateSceneInfo(identifier);
        if (!scene) {
            throw new Error('生成场景信息失败，当前没有场景');
        }
        return scene;
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

export default new SceneUtil();
