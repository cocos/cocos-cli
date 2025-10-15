'use strict';

import { Asset } from '@editor/asset-db';
import { AnimationClip } from 'cc';
import { readFile } from 'fs-extra';
import { basename } from 'path';
import { serializeForLibrary } from './utils/serialize-library';
import * as cc from 'cc';

import { getDependUUIDList } from '../utils';
import { AssetHandler } from '../../@types/protected';
import { AnimationClipAssetUserData } from '../../@types/userDatas';

const AnimationHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'animation-clip',
    // 引擎内对应的类型
    assetType: 'cc.AnimationClip',
    createInfo: {
        generateMenuInfo() {
            return [
                {
                    label: 'i18n:ENGINE.assets.newAnimation',
                    fullFileName: 'animation.anim',
                    template: `db://internal/default_file_content/${AnimationHandler.name}/default.anim`,
                    group: 'animation',
                    name: 'default',
                },
            ];
        },
    },
    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '2.0.4',
        versionCode: 2,

        /**
         * 如果改名就强制刷新
         * @param asset
         */
        async force(asset: Asset) {
            const userData = asset.userData as AnimationClipAssetUserData;
            return userData.name !== asset.basename;
        },

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
            const userData = asset.userData as AnimationClipAssetUserData;
            try {
                const fileContent = await readFile(asset.source, 'utf8');
                const json = JSON.parse(fileContent);

                const details = cc.deserialize.Details.pool.get()!;
                const clip = cc.deserialize(json, details, undefined) as AnimationClip;
                const nUUIDRefs = details.uuidList!.length;
                for (let i = 0; i < nUUIDRefs; ++i) {
                    const uuid = details.uuidList![i];
                    const uuidObj = details.uuidObjList![i] as any;
                    const uuidProp = details.uuidPropList![i];
                    const uuidType = details.uuidTypeList[i];
                    const Type: new () => cc.Asset = (cc.js.getClassById(uuidType) as any) ?? cc.Asset;
                    const asset = new Type();
                    asset._uuid = uuid + '';
                    uuidObj[uuidProp] = asset;
                }

                clip.name = basename(asset.source, '.anim');
                userData.name = clip.name;

                // Compute hash
                void clip.hash;

                const { extension, data } = serializeForLibrary(clip);

                await asset.saveToLibrary(extension, data as any);

                const depends = getDependUUIDList(fileContent);
                asset.setData('depends', depends);
            } catch (error) {
                console.error(error);
                return false;
            }

            return true;
        },
    },
};

export default AnimationHandler;
