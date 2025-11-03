import { Asset } from '@cocos/asset-db';
import { js } from 'cc';
import { AnimationGraph } from 'cc/editor/new-gen-anim';
import { readFile } from 'fs-extra';

import { getDependUUIDList } from '../utils';
import { AssetHandler } from '../../@types/protected';

const AnimationGraphHandler: AssetHandler = {
    name: 'animation-graph',
    // 引擎内对应的类型
    assetType: 'cc.AnimationGraph',
    open(asset) {
        // TODO: 实现打开动画图资产
        return false;
    },
    createInfo: {
        generateMenuInfo() {
            return [
                {
                    label: 'i18n:ENGINE.assets.newAnimationGraph',
                    fullFileName: 'Animation Graph.animgraph',
                    template: `db://internal/default_file_content/${AnimationGraphHandler.name}/default.animgraph`,
                    group: 'animation',
                    name: 'default',
                },
                {
                    label: 'i18n:ENGINE.assets.newAnimationGraphTS',
                    fullFileName: 'AnimationGraphComponent.ts',
                    template: `db://internal/default_file_content/${AnimationGraphHandler.name}/ts-animation-graph`,
                    handler: 'typescript',
                    group: 'animation',
                    name: 'ts-animation-graph',
                },
            ];
        },
    },
    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.2.0',
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

export default AnimationGraphHandler;
