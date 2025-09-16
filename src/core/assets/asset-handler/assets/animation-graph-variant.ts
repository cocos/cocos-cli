import { Asset } from '@editor/asset-db';
import { js } from 'cc';
import { AnimationGraphVariant } from 'cc/editor/new-gen-anim';
import { readFile } from 'fs-extra';

import { getDependUUIDList } from '../utils';
import { AssetHandler } from '../../@types/protected';

const AnimationGraphVariantHandler: AssetHandler = {
    name: 'animation-graph-variant',
    // 引擎内对应的类型
    assetType: js.getClassName(AnimationGraphVariant),
    createInfo: {
        generateMenuInfo() {
            return [
                {
                    label: 'i18n:ENGINE.assets.newAnimationGraphVariant',
                    fullFileName: 'Animation Graph Varint.animgraphvari',
                    template: `db://internal/default_file_content/${AnimationGraphVariantHandler.name}/default.animgraphvari`,
                    group: 'animation',
                },
            ];
        },
    },
    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.0',
        /**
         * 返回是否导入成功的标记
         * 如果返回 false，则 imported 标记不会变成 true
         * 后续的一系列操作都不会执行
         * @param asset
         */
        async import(asset: Asset) {
            const serializeJSON = await readFile(asset.source, 'utf8');
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default AnimationGraphVariantHandler;
