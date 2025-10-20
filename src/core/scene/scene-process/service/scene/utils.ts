import cc from 'cc';
import { Rpc } from '../../rpc';
import { INode, IScene, ISceneIdentifier } from '../../../common';

class SceneUtil {
    /** 默认超时：1分钟 */
    static readonly Timeout = 60 * 1000;

    /**
     * 获取资源 UUID
     * @param urlOrUUIDOrPath
     */
    async queryUUID(urlOrUUIDOrPath?: string): Promise<string | undefined> {
        if (!urlOrUUIDOrPath) return undefined;
        const uuid = await Rpc.request('assetManager', 'queryUUID', [urlOrUUIDOrPath]);
        return uuid ?? urlOrUUIDOrPath;
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
                    try {
                        cc.director.runSceneImmediate(scene, undefined, () => {
                            resolve(cc.director.getScene()!);
                        });
                    } catch (err) {
                        reject(err);
                    }
                });
            }),
            SceneUtil.Timeout,
            '加载场景超时'
        );
    }

    /**
     * 生成组件信息
     */
    generateComponentInfo(component: cc.Component): { uuid: string } {
        return {
            uuid: component.uuid
        };
    }

    /**
     * 获取组件 dump 数据
     * @param component
     */
    getComponentDump(component: cc.Component) {
        return {
            path: '',
            name: component.name,
        };
    };

    /**
     * 节点 dump 数据
     * @param node
     */
    getNodeDump(node: cc.Node): INode | null {
        if (node.objFlags & cc.CCObject.Flags.HideInHierarchy) {
            return null;
        }

        return {
            nodeId: node.uuid,
            path: EditorExtends.Node.getNodePath(node),
            name: node.name,
            properties: {
                active: node.active,
                position: node.position,
                rotation: node.rotation,
                scale: node.scale,
                layer: node.layer,
                worldPosition: node.worldPosition,
                worldRotation: node.worldRotation,
                eulerAngles: node.eulerAngles,
                angle: node.angle,
                worldScale: node.worldScale,
                worldMatrix: node.worldMatrix,
                forward: node.forward,
                up: node.up,
                right: node.right,
                mobility: node.mobility,
                hasChangedFlags: node.hasChangedFlags,
                activeInHierarchy: node.activeInHierarchy,
            },
            children: node.children
                .map((node: cc.Node) => {
                    return this.getNodeDump(node);
                })
                .filter(child => child !== null) as INode[],
            components: node.components
                .map((component: cc.Component)=> {
                    return this.getComponentDump(component);
                })
        };
    }

    /**
     * 请求某个路径的节点树，不传路径为当前场景
     */
    getSceneDump(identifier: ISceneIdentifier): IScene | null {
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
                    return this.getNodeDump(node);
                })
                .filter(child => child !== null) as INode[],
            components: scene.components
                .map((component: cc.Component) => {
                    return this.getComponentDump(component);
                })
        };
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
