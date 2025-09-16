import { Asset, VirtualAsset } from '@editor/asset-db';
import { glTfReaderManager } from './reader-manager';

import { getDependUUIDList } from '../../utils';
import { AssetHandler } from '../../../@types/protected';

export const GltfSkeletonHandler: AssetHandler = {
    name: 'gltf-skeleton',

    // 引擎内对应的类型
    assetType: 'cc.Skeleton',

    /**
     * 允许这种类型的资源进行实例化
     */
    instantiation: '.skeleton',

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

            const gltfConverter = await glTfReaderManager.getOrCreate(asset.parent as Asset);

            const skeleton = gltfConverter.createSkeleton(asset.userData.gltfIndex as number);

            asset.userData.jointsLength = skeleton.joints.length;

            const serializeJSON = EditorExtends.serialize(skeleton);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default GltfSkeletonHandler;
