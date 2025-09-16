import { Asset, AssetHandler, VirtualAsset } from '../../@types/protected';
import { getDependUUIDList } from '../utils';
import { IFaceSwapSpace } from './erp-texture-cube';
import { defaultIconConfig } from './image/utils';

export const TextureCubeFaceHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'texture-cube-face',
    // 引擎内对应的类型
    assetType: 'cc.ImageAsset',
    iconInfo: {
        default: defaultIconConfig,
        generateThumbnail(asset: Asset) {
            const parentAsset = asset.parent!.parent as Asset;
            if (parentAsset.invalid) {
                return defaultIconConfig;
            }
            const extname = parentAsset.meta.files.find((extName) => extName !== '.json') || '.png';
            return {
                type: 'image',
                value: asset.library + extname,
            };
        },
    },

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
        async import(asset: VirtualAsset) {
            if (!asset.parent) {
                return false;
            }

            const swapSpace = asset.parent.getSwapSpace<IFaceSwapSpace>();
            if (!swapSpace) {
                return false;
            }

            const dataKey = asset._name;

            if (!(dataKey in swapSpace)) {
                return false;
            }
            const extName = (asset.parent.parent as Asset).meta.files.find((extName) => extName !== '.json') || '.png';
            const data = swapSpace[dataKey];
            await asset.saveToLibrary(extName, data);

            const image = new cc.ImageAsset();
            image._setRawAsset(extName);

            const serializeJSON = EditorExtends.serialize(image);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default TextureCubeFaceHandler;
