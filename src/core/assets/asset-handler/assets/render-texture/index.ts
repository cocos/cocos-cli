import { Asset } from '@editor/asset-db';
import { readJSON } from 'fs-extra';
import { applyTextureBaseAssetUserData, getWrapModeString, getFilterString } from '../texture-base';
import { RenderTexture } from 'cc';

import { getDependUUIDList } from '../../utils';
import { AssetHandler } from '../../../@types/protected';
import { RenderTextureAssetUserData, TextureBaseAssetUserData } from '../../../@types/userDatas';

function fillUserdata(asset: Asset, name: string, value: any) {
    if (!(name in asset.userData)) {
        asset.userData[name] = value;
    }
}

export const RenderTextureHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'render-texture',

    // 引擎内对应的类型
    assetType: 'cc.RenderTexture',

    createInfo: {
        generateMenuInfo() {
            return [
                {
                    label: 'i18n:ENGINE.assets.newRenderTexture',
                    fullFileName: 'render-texture.rt',
                    template: `db://internal/default_file_content/${RenderTextureHandler.name}/default.rt`,
                    name: 'default',
                },
            ];
        },
    },

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.2.1',

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
            const json = await readJSON(asset.source);
            // @ts-ignore
            const renderTexture = cc.deserialize(json) as RenderTexture;
            renderTexture.name = asset.basename || '';

            fillUserdata(asset, 'width', renderTexture.width);
            fillUserdata(asset, 'height', renderTexture.height);

            // @ts-ignore renderTexture._anisotropy
            fillUserdata(asset, 'anisotropy', renderTexture._anisotropy);
            // @ts-ignore renderTexture._minFilter
            fillUserdata(asset, 'minfilter', getFilterString(renderTexture._minFilter));
            // @ts-ignore renderTexture._magfilter
            fillUserdata(asset, 'magfilter', getFilterString(renderTexture._magFilter));
            // @ts-ignore renderTexture._mipfilter
            fillUserdata(asset, 'mipfilter', getFilterString(renderTexture._mipFilter));
            // @ts-ignore renderTexture._wrapS
            fillUserdata(asset, 'wrapModeS', getWrapModeString(renderTexture._wrapS));
            // @ts-ignore renderTexture._wrapT
            fillUserdata(asset, 'wrapModeT', getWrapModeString(renderTexture._wrapT));

            const userData = asset.userData as RenderTextureAssetUserData;
            renderTexture.resize(userData.width, userData.height);
            applyTextureBaseAssetUserData(userData, renderTexture);

            const serializeJSON = EditorExtends.serialize(renderTexture);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            const textureSpriteFrameSubAsset = await asset.createSubAsset('spriteFrame', 'rt-sprite-frame', {
                displayName: asset.basename,
            });
            textureSpriteFrameSubAsset.userData.imageUuidOrDatabaseUri = asset.uuid;
            textureSpriteFrameSubAsset.userData.width = asset.userData.width;
            textureSpriteFrameSubAsset.userData.height = asset.userData.height;

            return true;
        },
    },
};

export default RenderTextureHandler;
