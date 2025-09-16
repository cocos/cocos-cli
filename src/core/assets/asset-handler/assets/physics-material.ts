'use strict';

import { Asset } from '@editor/asset-db';
import { AssetHandler } from '../../@types/protected';

export const PhysicsMaterialHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'physics-material',

    // 引擎内对应的类型
    assetType: 'cc.PhysicsMaterial',
    createInfo: {
        generateMenuInfo() {
            return [
                {
                    label: 'i18n:ENGINE.assets.newPhysicsMaterial',
                    fullFileName: 'physics-material.pmtl',
                    template: 'db://internal/default_file_content/physics-material/default.pmtl',
                    group: 'material',
                },
            ];
        },
    },

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.1',

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
            await asset.copyToLibrary('.json', asset.source);
            return true;
        },
    },
};

export default PhysicsMaterialHandler;
