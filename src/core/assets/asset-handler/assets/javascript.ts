import { Asset, VirtualAsset } from '@cocos/asset-db';
import { readFile } from 'fs-extra';
import { transformPluginScript } from './utils/script-compiler';
import { openCode } from '../utils';
import { AssetHandlerBase } from '../../@types/protected';
import { JavaScriptAssetUserData, PluginScriptUserData } from '../../@types/userDatas';
import scripting from '../../../scripting';
import { AssetActionEnum } from '@cocos/asset-db/libs/asset';

export const JavascriptHandler: AssetHandlerBase = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'javascript',

    // 引擎内对应的类型
    assetType: 'cc.Script',

    open: openCode,

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '4.0.24',

        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否导入成功的标记
         * 如果返回 false，则 imported 标记不会变成 true
         * 后续的一系列操作都不会执行
         * @param asset
         */
        async import(asset: Asset | VirtualAsset) {
            if (!(asset instanceof Asset)) {
                console.error('Expect non-virtual asset');
                return false;
            }

            const userData = asset.userData as JavaScriptAssetUserData;
            try {
                if (userData.isPlugin) {
                    return await _importPluginScript(asset);
                } else {
                    await scripting.compileScripts([{
                        type: asset.action,
                        uuid: asset.uuid,
                        filePath: asset.source,
                        importer: asset.meta.importer,
                        userData: asset.meta.userData,
                    }]);
                    return true;
                }
            } catch (error) {
                console.error(`Failed to import script ${asset.source}`);
                throw error;
            }
        },
    },

    async destroy(asset: Asset | VirtualAsset) {
        scripting.dispatchAssetChange({
            type: AssetActionEnum.delete,
            uuid: asset.uuid,
            filePath: asset.source,
            importer: asset.meta.importer,
            userData: asset.meta.userData,
        });
    },
};

export default JavascriptHandler;

async function _importPluginScript(asset: Asset) {
    // https://mathiasbynens.be/notes/globalthis
    const code = await readFile(asset.source, 'utf-8');

    // 填写默认的插件导入选项
    const {
        executionScope = 'enclosed',
        experimentalHideCommonJs,
        experimentalHideAmd,
        simulateGlobals,
    } = asset.userData as PluginScriptUserData;

    const defaultUserData: PluginScriptUserData = {
        isPlugin: true,
        loadPluginInEditor: false,
        loadPluginInWeb: true,
        loadPluginInMiniGame: true,
        loadPluginInNative: true,
    };

    asset.assignUserData(defaultUserData, false);

    if (executionScope === 'global') {
        await asset.saveToLibrary('.js', code);
        return true;
    }

    const simulateGlobalNames: string[] = simulateGlobals === undefined ? ['self', 'window', 'global', 'globalThis'] : simulateGlobals;

    const transformed = await transformPluginScript(code, {
        simulateGlobals: simulateGlobalNames,
        hideCommonJs: experimentalHideCommonJs ?? true,
        hideAmd: experimentalHideAmd ?? true,
    });

    await asset.saveToLibrary('.js', transformed.code);
    return true;
}
