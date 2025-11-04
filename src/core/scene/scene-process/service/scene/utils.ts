import cc from 'cc';
import { IComponentIdentifier, INode, } from '../../../common';
import compMgr from '../component/index';
import { encode } from '../prefab/class-serializer';

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
            prefab: encode.serializeInstance(node['_prefab']),
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
     * 序列化场景
     * @private
     */
    serialize(scene: cc.Scene) {
        const asset = new cc.SceneAsset();
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
