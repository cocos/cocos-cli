import { Asset } from '@editor/asset-db';
import { js, animation } from 'cc';
import { AnimationGraph } from 'cc/editor/new-gen-anim';
import { migrateVariables } from './migrates/animation-graph/3.5.0';
import { Archive, migrationHook } from './utils/migration-utils';
import { readFile } from 'fs-extra';

import { getDependUUIDList } from '../utils';
import { migrateAnimationGraph_3_8_0 } from './migrates/animation-graph/3.8.0';
import { AssetHandler } from '../../@types/protected';

const AnimationGraphHandler: AssetHandler = {
    name: 'animation-graph',
    // 引擎内对应的类型
    assetType: js.getClassName(AnimationGraph),
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
                },
                {
                    label: 'i18n:ENGINE.assets.newAnimationGraphTS',
                    fullFileName: 'AnimationGraphComponent.ts',
                    template: `db://internal/default_file_content/${AnimationGraphHandler.name}/ts-animation-graph`,
                    handler: 'typescript',
                    group: 'animation',
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
        migrationHook,
        migrations: [
            {
                version: '1.0.1',
                migrate: async (asset: Asset) => {
                    const swap: any = asset.getSwapSpace();
                    const archive = new Archive(swap.json);
                    migrateMotionStateSpeed(archive);
                    const archiveResult = archive.get();
                    swap.json = archiveResult;
                },
            },
            {
                version: '1.1.0',
                migrate: async (asset: Asset) => {
                    const swap: any = asset.getSwapSpace();
                    const archive = new Archive(swap.json);
                    migrateVariables(archive);
                    const archiveResult = archive.get();
                    swap.json = archiveResult;
                },
            },
            {
                version: '1.2.0',
                migrate: async (asset: Asset) => {
                    const swap: any = asset.getSwapSpace();
                    const archive = new Archive(swap.json);
                    migrateAnimationGraph_3_8_0(archive);
                    const archiveResult = archive.get();
                    swap.json = archiveResult;
                },
            },
        ],
    },
};

export default AnimationGraphHandler;
/**
 * Version: 3.6.0
 * Detail: `MotionState.prototype.speed: BindableNumber` -> `MotionState.prototype.speed: number`
 */
export function migrateMotionStateSpeed(archive: Archive) {
    archive.visitTypedObject(
        'cc.animation.Motion',
        (motionSerialized: {
            speed: {
                variable?: string;
                value?: number;
            };
        }) => {
            const speedValue = motionSerialized.speed.value;
            if (typeof speedValue === 'number') {
                (motionSerialized as { speed: number }).speed = speedValue;
            }
        },
    );
}
