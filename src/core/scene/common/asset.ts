import { IServiceEvents } from '../scene-process/service/core';

/**
 * 资源事件类型
 */
export interface IAssetEvents {
    'asset:change': [uuid: string],
    'asset:deleted': [uuid: string],
    'asset-refresh': [uuid: string],
}

export interface IPublicAssetService extends Omit<IAssetService, keyof IServiceEvents> {}

/**
 * 场景相关处理接口
 */
export interface IAssetService extends IServiceEvents {
    /**
     * 资源发生变化时，进行处理
     * @param uuid
     */
    assetChanged(uuid: string): Promise<void>;

    /**
     * 显式刷新已加载的 Scene 资源；等待引用更新完成，加载失败、超时或 Scene 失效时 reject。
     * 没有已加载引用的资源无需刷新，可正常完成。普通资源变更通知仍使用 assetChanged。
     */
    refreshAsset(uuid: string): Promise<void>;

    /**
     * 资源删除时，进行处理
     * @param uuid
     */
    assetDeleted(uuid: string): Promise<void>;
}
