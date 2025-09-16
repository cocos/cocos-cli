import { Asset, VirtualAsset } from '@editor/asset-db';
import { AssetHandler, ThumbnailInfo } from '../../../@types/protected';
import { defaultIconConfig, handleImageUserData, importWithType, isCapableToFixAlphaTransparencyArtifacts, saveImageAsset } from './utils';
import utils from '../../../../base/utils';

export const SignImageHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'sign-image',

    // 引擎内对应的类型
    assetType: 'cc.ImageAsset',

    iconInfo: {
        default: defaultIconConfig,
        generateThumbnail(asset: Asset) {
            return {
                type: 'image',
                value: asset.library + '.png',
            };
        },
    },

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.1',
        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否导入成功的 boolean
         * 如果返回 false，则下次启动还会重新导入
         * @param asset
         */
        async import(asset: VirtualAsset) {
            if (!asset.parent) {
                return false;
            }
            const parent = asset.parent as Asset;
            const source = utils.Path.resolveToRaw(parent.userData.sign);
            Object.assign(asset.userData, parent.userData);
            delete asset.userData.type;
            delete asset.userData.sign;
            asset.userData.isRGBE = false;

            // 为不同导入类型的图片设置伪影的默认值
            if (asset.userData.fixAlphaTransparencyArtifacts === undefined) {
                asset.userData.fixAlphaTransparencyArtifacts = isCapableToFixAlphaTransparencyArtifacts(
                    asset,
                    parent.userData.type,
                    parent.extname,
                );
            }

            const imageDataBufferOrimagePath = await handleImageUserData(asset, source, '.png');
            await saveImageAsset(asset, imageDataBufferOrimagePath, '.png', 'sign');
            await importWithType(asset, parent.userData.type, 'sign', parent.extname);
            return true;
        },
    },
};
export default SignImageHandler;
