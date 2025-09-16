'use strict';

import { AssetHandler } from '../../../@types/protected';
import InstantiationAssetHandler from './asset';

export const SkeletonHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'instantiation-skeleton',

    // 引擎内对应的类型
    assetType: 'cc.Skeleton',

    importer: {
        ...InstantiationAssetHandler.importer,
        // 版本号如果变更，则会强制重新导入
        version: '1.0.0',
    },
};

export default SkeletonHandler;
