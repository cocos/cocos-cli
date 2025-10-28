import type { IAsset } from '../../assets/@types/protected/asset';

/**
 * 资源事件类型
 */
export interface IAssetEvents {

}

export interface IPublicAssetService extends IAssetService {}

/**
 * 场景相关处理接口
 */
export interface IAssetService {
    /**
     * 资源发生变化时，进行处理
     * @param uuid
     */
    assetChanged(uuid: string): void;

    /**
     * 资源删除时，进行处理
     * @param uuid
     */
    assetDeleted(uuid: string): void;
}
