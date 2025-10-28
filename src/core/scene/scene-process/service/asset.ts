import { BaseService, register } from './core';
import { IAssetService } from '../../common';
import { Asset, assetManager, Constructor } from 'cc';

function removeCache(uuid: string) {
    if (assetManager.assets.has(uuid)) {
        assetManager.releaseAsset(assetManager.assets.get(uuid)!);
    }
}

@register('Asset')
export class AssetService extends BaseService<any> implements IAssetService {

    assetChanged(uuid: string) {
        // 如果是 texture，则 release 掉所依赖的 ImageAsset
        // TODO: 目前这是个 Hack 方式， 在此 issue 讨论：https://github.com/cocos-creator/3d-tasks/issues/4503
        if (uuid.endsWith('@6c48a')) {
            const end = uuid.indexOf('@');
            const imageAssetUuid = uuid.substring(0, end);
            removeCache(imageAssetUuid);
        }
    }

    assetDeleted(uuid: string) {
        const oldAsset = assetManager.assets.get(uuid);
        if (oldAsset) {
            const placeHolder = new (oldAsset.constructor as Constructor<Asset>)();
            placeHolder.initDefault(uuid);
            // assetListener.emit(uuid, placeHolder);
        }
        removeCache(uuid);
    }
}