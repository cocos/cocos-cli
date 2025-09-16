'use strict';

import { Asset, VirtualAsset, queryPath, queryUUID } from '@editor/asset-db';
import { AssetHandler } from '../../../@types/protected';
import { SpriteFrame } from 'cc';

import { getDependUUIDList } from '../../utils';

export const RTSpriteFrameHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'rt-sprite-frame',
    assetType: 'cc.SpriteFrame',

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.0',
        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否导入成功的标记
         * 如果返回 false，则 imported 标记不会变成 true
         * 后续的一系列操作都不会执行
         * @param asset
         */
        async import(asset: Asset) {
            // 如果没有生成 json 文件，则重新生成
            if (!asset.parent) {
                return false;
            }

            const sprite = new SpriteFrame();
            // @ts-ignore
            sprite._texture = EditorExtends.serialize.asAsset(asset.userData.imageUuidOrDatabaseUri, cc.Texture2D);

            sprite.rect.width = sprite.originalSize.width = asset.userData.width || 1;
            sprite.rect.height = sprite.originalSize.height = asset.userData.height || 1;

            const serializeJSON = EditorExtends.serialize(sprite);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default RTSpriteFrameHandler;
