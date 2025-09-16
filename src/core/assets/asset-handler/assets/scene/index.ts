'use strict';

import { Asset } from '@editor/asset-db';
import { migrations } from './migrates';
import { readJSON, writeFile } from 'fs-extra';
import { extname, basename } from 'path';

import { getDependList, removeNull } from '../../utils';
import { AssetHandler } from '../../../@types/protected';
import { migrationHook } from '../utils/migration-utils';
import utils from '../../../../base/utils';
import { url2path } from '../../../utils';
import assetConfig from '../../../asset-config';
import engine from '../../../../engine';

export const version = '1.1.50';
export const versionCode = 2;

export const SceneHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'scene',

    // 引擎内对应的类型
    assetType: 'cc.SceneAsset',
    open(asset) {
        // TODO: 实现打开场景资产
        return false;
    },
    createInfo: {
        async generateMenuInfo() {
            const template = await queryDefaultTemplateURL();
            const sceneConfig = {
                label: 'i18n:ENGINE.assets.newScene',
                // 此处主要兼容 3.8.2 以及之前的行为
                // 默认场景 -> scene，2d 场景 -> scene-2d，高质量场景 -> scene-quality
                fullFileName: template.endsWith('default.scene') ? 'scene.scene' : basename(template),
                template,
                group: 'scene',
            };
            return [sceneConfig];
        },
    },

    customOperationMap: {
        // queryDefaultTemplateURL: {
        //     operator: queryDefaultTemplateURL,
        // },
        queryDefaultContent: {
            async operator() {
                const templateUrl = await queryDefaultTemplateURL();
                const scene = await readJSON(url2path(templateUrl));
                await changeSceneUuid(scene, utils.UUID.generate(false));
                return scene;
            },
        },
    },

    importer: {
        // 版本号如果变更，则会强制重新导入
        version,
        versionCode,
        migrations,
        migrationHook,
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
            const source = await readJSON(asset.source);
            const name = basename(asset.source, extname(asset.source));
            let dirty = source[0]._name !== name;

            if (dirty) {
                source[0]._name = name;
            }

            try {
                // HACK 过去版本场景 prefab 资源可能会出现节点组件数据为空的情况
                dirty = dirty || removeNull(source, asset.uuid);
            } catch (error) {
                console.debug(error);
            }
            // 场景文件内存了一份 uuid 上它需要与资源本身的保持一致
            dirty = changeSceneUuid(source, asset.uuid) || dirty;
            // 同步到存档文件
            if (dirty) {
                const content = JSON.stringify(source, undefined, 2);
                await writeFile(asset.source, content);
            }

            const serializeJSON = JSON.stringify(source, undefined, 2);
            await asset.saveToLibrary('.json', serializeJSON);
            const dependInfo = getDependList(serializeJSON);
            const sceneIndex = dependInfo.uuids.indexOf(asset.uuid);
            if (sceneIndex !== -1) {
                dependInfo.uuids.splice(sceneIndex, 1);
            }
            asset.setData('depends', dependInfo.uuids);
            asset.setData('dependScripts', dependInfo.dependScriptUuids);

            return true;
        },
    },
};

export default SceneHandler;

function changeSceneUuid(scene: any, uuid: string) {
    // 场景文件内存了一份 uuid 上它需要与资源本身的保持一致
    if (scene[1]._id !== uuid) {
        scene[1]._id = uuid;
        return true;
    }
    return false;
}

async function queryDefaultTemplateURL() {
    const templateDir = 'db://internal/default_file_content/scene';
    let template = `${templateDir}/default.scene`;
    const { includedModules, highQuality } = engine.getConfig();
    if (includedModules && !includedModules.includes('3d')) {
        template = `${templateDir}/scene-2d.scene`;
    } else {
        if (highQuality) {
            template = `${templateDir}/scene-quality.scene`;
        }
    }
    return template;
}
