'use strict';

import { AssetHandler } from '../../../@types/protected';
import InstantiationAssetHandler from './asset';

export const AnimationHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'instantiation-animation',

    // 引擎内对应的类型
    assetType: 'cc.AnimationClip',

    importer: {
        // 版本号如果变更，则会强制重新导入
        ...InstantiationAssetHandler.importer,
        version: '1.0.0',
    },
};

export default AnimationHandler;
