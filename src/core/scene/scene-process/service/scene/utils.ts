import cc from 'cc';
import { Rpc } from '../../rpc';
import { TSceneTemplateType } from '../../../common';

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