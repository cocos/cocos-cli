'use strict';

import { dirname, join } from 'path';
import { CCEnvConstants, getCCEnvConstants } from './build-time-constants';
import { buildScriptCommand, buildSystemJsCommand, IBuildScriptFunctionOption, TransformOptions } from './build-script';
import { ensureDir, pathExists, writeFile } from 'fs-extra';
import { workerManager } from '../../../worker-pools/sub-process-manager';
import { buildAssetLibrary } from '../../manager/asset-library';
import * as babel from '@babel/core';
import babelPresetEnv from '@babel/preset-env';
import { StatsQuery } from '@cocos/ccbuild';
import { SharedSettings } from '../../../../../scripting/interface';
import { IPolyFills, IBuildSystemJsOption } from '../../../../@types';
import { ImportMapWithImports, IScriptOptions, IInternalBuildOptions, IInternalBundleBuildOptions, ModulePreservation, IBundle, IAssetInfo, ImportMap, IImportMapOptions } from '../../../../@types/protected';
import { assetDBManager } from '../../../../../assets';
import script from '../../../../../scripting';
import { Engine } from '../../../../../engine';
import { MacroItem } from '../../../../../engine/@types/config';
import { compressUuid } from '../../utils';
import project from '../../../../../project';
import { runStaticCompileCheck } from './static-compile-check';
import { BuildExitCode } from '../../../../@types/protected';
type PlatformType = StatsQuery.ConstantManager.PlatformType;

interface IScriptProjectOption extends SharedSettings {
    ccEnvConstants: CCEnvConstants;
    dbInfos: { dbID: string; target: string }[];
    customMacroList: MacroItem[];
}

interface ImportMapOptions {
    data: ImportMapWithImports;
    format?: 'commonjs' | 'esm';
    output: string;
}

export class ScriptBuilder {

    _scriptOptions!: IScriptOptions;
    _importMapOptions!: ImportMapOptions;

    // 脚本资源包分组（子包/分包）
    public scriptPackages: string[] = [];

    static projectOptions: IScriptProjectOption;

    initTaskOptions(options: IInternalBuildOptions | IInternalBundleBuildOptions) {
        // TODO 此处配置应该在外部整合好
        const transformOptions: TransformOptions = {};
        if (!options.buildScriptParam.polyfills?.asyncFunctions) {
            (transformOptions.excludes ?? (transformOptions.excludes = [])).push('transform-regenerator');
        }
        if (options.buildScriptParam.targets) {
            transformOptions.targets = options.buildScriptParam.targets;
        }

        let modulePreservation: ModulePreservation = 'facade';
        if (options.buildScriptParam.experimentalEraseModules) {
            modulePreservation = 'erase';
        }
        const hotModuleReload = options.buildScriptParam.hotModuleReload ?? false;
        if (hotModuleReload) {
            modulePreservation = 'preserve';
        }

        const scriptOptions: IScriptOptions = {
            modulePreservation,
            debug: options.debug,
            sourceMaps: options.sourceMaps,
            hotModuleReload,
            transform: transformOptions,
            moduleFormat: 'system',
            commonDir: options.buildScriptParam.commonDir || '', // TODO 需要新的参数
            bundleCommonChunk: options.buildScriptParam.bundleCommonChunk ?? false,
        };

        return {
            scriptOptions,
            importMapOptions: {
                format: options.buildScriptParam.importMapFormat,
                data: { imports: {} },
                output: '',
            },
        };
    }

    async initProjectOptions(options: IInternalBuildOptions | IInternalBundleBuildOptions) {
        const { scriptOptions, importMapOptions } = this.initTaskOptions(options);
        this._scriptOptions = scriptOptions;
        this._importMapOptions = importMapOptions;
        const ccEnvConstants = await getCCEnvConstants({
            platform: options.buildScriptParam.platform,
            flags: options.buildScriptParam.flags,
        }, options.engineInfo.typescript.path);
        const sharedSettings = await script.querySharedSettings();
        // TODO 从 db 查询的都要封装在 asset-library 模块内
        const dbInfos = Object.values(assetDBManager.assetDBMap).map((info) => {
            return {
                dbID: info.options.name,
                target: info.options.target,
            };
        });
        const customMacroList = Engine.getConfig().macroCustom;
        ScriptBuilder.projectOptions = {
            customMacroList,
            dbInfos,
            ccEnvConstants,
            ...sharedSettings,
        };
    }

    async buildBundleScript(bundles: IBundle[]) {
        const scriptBundles: Array<{ id: string, scripts: IAssetInfo[], outFile: string }> = [];
        const uuidCompressMap: Record<string, string> = {};
        bundles.forEach((bundle) => {
            if (!bundle.output) {
                return;
            }
            bundle.config.hasPreloadScript = !this._scriptOptions.hotModuleReload;
            scriptBundles.push({
                id: bundle.name,
                scripts: bundle.scripts.map((uuid) => {
                    uuidCompressMap[uuid] = compressUuid(uuid, false);
                    return buildAssetLibrary.getAssetInfo(uuid);
                }).sort((a, b) => a.name.localeCompare(b.name)),
                outFile: bundle.scriptDest,
            });
        });

        if (!scriptBundles.length) {
            console.debug('[script] no script to build');
            return;
        }

        // 执行静态编译检查
        // 注意：如果在 BuildCommand 中已经执行过，这里会重复执行。
        // 但为了确保脚本编译的安全性，这里强制检查。
        const checkResult = await runStaticCompileCheck(project.path, true);
        if (!checkResult.passed) {
            // 构建失败，抛出错误，错误码为 500
            const errorMessage = checkResult.errorMessage || 'Found assets-related TypeScript errors';
            const error = new Error(errorMessage);
            (error as any).code = BuildExitCode.STATIC_COMPILE_ERROR;
            throw error;
        }
        
        const cceModuleMap = script.queryCCEModuleMap();
        const buildScriptOptions: IBuildScriptFunctionOption & SharedSettings = {
            ...this._scriptOptions,
            ...ScriptBuilder.projectOptions,
            bundles: scriptBundles,
            uuidCompressMap,
            applicationJS: '',
            cceModuleMap,
        };

        // 项目脚本编译目前编译内存占用较大，需要独立进程管理
        await workerManager.registerTask({
            name: 'build-script',
            path: join(__dirname, './build-script'),
            options: {
                cwd: project.path,
            }
        });
        const res = await workerManager.runTask('build-script', 'buildScriptCommand', [buildScriptOptions]);
        if (res) {
            if (res.scriptPackages) {
                this.scriptPackages.push(...res.scriptPackages);
            }
            if (res.importMappings) {
                Object.assign(this._importMapOptions.data.imports, res.importMappings);
            }
        }

        workerManager.kill('build-script');

        console.debug('Copy externalScripts success!');

        return res;
    }

    static async buildPolyfills(options: IPolyFills = {}, dest: string) {
        await workerManager.registerTask({
            name: 'build-script',
            path: join(__dirname, './build-script'),
        });
        return await workerManager.runTask('build-script', 'buildPolyfillsCommand', [options, dest]);
    }

    static async buildSystemJs(options: IBuildSystemJsOption) {
        await workerManager.registerTask({
            name: 'build-script',
            path: join(__dirname, './build-script'),
        });
        return await workerManager.runTask('build-script', 'buildSystemJsCommand', [options]);
    }

    static async outputImportMap(importMap: ImportMap, options: IImportMapOptions) {
        const { content } = await transformImportMap(importMap, options);
        await ensureDir(dirname(options.dest));
        await writeFile(options.dest, content, {
            encoding: 'utf8',
        });
    }
}

async function transformImportMap(importMap: ImportMap, options: IImportMapOptions) {
    const { importMapFormat } = options;
    let extension: string;
    let content = JSON.stringify(importMap, undefined, options.debug ? 2 : 0);
    if (importMapFormat === undefined) {
        extension = '.json';
    } else {
        extension = '.js';
        const code = `export default ${content}`;
        content = (await babel.transformAsync(code, {
            presets: [[
                babelPresetEnv, {
                    modules: importMapFormat === 'esm' ? false : importMapFormat,
                },
            ]],
        }))?.code!;
    }
    return {
        extension,
        content,
    };
}