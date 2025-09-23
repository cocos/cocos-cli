import { Asset, VirtualAsset } from '@editor/asset-db';
import { readFile } from 'fs-extra';
import { transformPluginScript } from './utils/script-compiler';
import { MigrateStep, i18nTranslate, linkToAssetTarget, openCode } from '../utils';
import { AssetHandlerBase } from '../../@types/protected';
import { configurationManager } from '../../../configuration';

interface IScriptModuleUseData {
    isPlugin: false;
}

interface PluginScriptUseData {
    isPlugin: true;

    /**
     * 界面没有开放给用户。默认开启。
     */
    experimentalHideCommonJs?: boolean;

    /**
     * 界面没有开放给用户。默认开启。
     */
    experimentalHideAmd?: boolean;

    /**
     * 仅当 `executionScope` 为 `enclosed` 时有效。指定了要模拟的全局变量。
     * 当为 `undefined` 时将模拟 `self`, `window`, `global`, `globalThis`。
     */
    simulateGlobals?: string[];

    /**
     * 执行作用域。
     * @description
     * 当为 `global` 时，直接在目标环境中执行该脚本。
     * 当为 `enclosed` 时，将整个脚本包裹在 IIFE 函数中执行，这意味着脚本顶部以 `var` 声明的变量不会提升为全局变量。
     */
    executionScope?: 'enclosed' | 'global';

    // ------------ 插件执行时机 ------------
    loadPluginInEditor?: boolean;
    loadPluginInWeb?: boolean;
    loadPluginInMiniGame?: boolean;
    loadPluginInNative?: boolean;
}

type IJavaScriptUserData = IScriptModuleUseData | PluginScriptUseData;
const migrateStep = new MigrateStep();

export const JavascriptHandler: AssetHandlerBase = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'javascript',

    // 引擎内对应的类型
    assetType: 'cc.Script',

    open: openCode,

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '4.0.24',
        migrations: [
            {
                version: '4.0.22',
                migrate(asset: Asset) {
                    type OldUserData = Omit<PluginScriptUseData, 'executionScope'> & {
                        /**
                         * `false` 或者 `undefined` 时表示不模拟；
                         * `true` 时候表示模拟默认的全局变量。
                         */
                        simulateGlobals?: boolean | string[];
                    };
                    const oldUserData = asset.userData as OldUserData;
                    const userData = asset.userData as PluginScriptUseData;
                    if (oldUserData.simulateGlobals === true) {
                        userData.simulateGlobals = undefined;
                    } else if (oldUserData.simulateGlobals === false || oldUserData.simulateGlobals === undefined) {
                        userData.simulateGlobals = [];
                    }
                },
            },
            {
                version: '4.0.23',
                migrate(asset: Asset) {
                    type OldUserData = {
                        importAsPlugin?: boolean;
                    };
                    const userData = asset.userData as OldUserData;
                    if (typeof userData.importAsPlugin !== 'undefined') {
                        delete userData.importAsPlugin;
                    }
                },
            },
            {
                version: '4.0.24',
                async migrate(asset: Asset) {
                    const userData = asset.userData as any;
                    if (!userData.isPlugin || !Array.isArray(userData.dependencies) || !userData.dependencies.length) {
                        return;
                    }
                    await migrateStep.hold();
                    const sortingPlugins: string[] = await configurationManager.getValue('project.script.sortingPlugin') ?? [];
                    if (Array.isArray(sortingPlugins) && sortingPlugins.length && sortingPlugins.includes(asset.uuid)) {
                        const index = sortingPlugins.findIndex((item) => item === asset.uuid);
                        // 当前脚本已经被其他脚本依赖
                        for (const script of userData.dependencies) {
                            const scriptIndex = sortingPlugins.findIndex((item) => item === script);
                            if (scriptIndex === -1) {
                                sortingPlugins.splice(index, 0, script);
                                continue;
                            }
                            if (scriptIndex > index) {
                                // 依赖的脚本在当前资源后，需要前移
                                sortingPlugins.splice(scriptIndex, 1);
                                sortingPlugins.splice(index, 0, script);
                            }
                        }
                    } else {
                        for (const script of userData.dependencies) {
                            if (!sortingPlugins.includes(script)) {
                                sortingPlugins.push(script);
                            }
                        }
                        sortingPlugins.push(asset.uuid);
                    }
                    await configurationManager.updateValue('project.script.sortingPlugin', sortingPlugins);
                    delete asset.userData.dependencies;
                    migrateStep.step();
                },
            },
        ],

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

            const userData = asset.userData as IJavaScriptUserData;
            try {
                if (userData.isPlugin) {
                    return await _importPluginScript(asset);
                } else {
                    return true;
                }
            } catch (error) {
                console.error(
                    i18nTranslate('engine-extends.importers.script.transform_failure', {
                        path: asset.source,
                        reason: error,
                    }),
                    linkToAssetTarget(asset.uuid),
                );
                return false;
            }
        },
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
    } = asset.userData as PluginScriptUseData;

    const defaultUserData: PluginScriptUseData = {
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
