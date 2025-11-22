'use strict';

import os from 'os';
import Ejs from 'ejs';
import { dirname, join, resolve } from 'path';
import {
    existsSync,
    mkdir,
    moveSync,
    readFile,
    removeSync,
    writeFile,
    symlinkSync,
    copy,
    emptyDirSync,
} from 'fs-extra';
import { getCmakePath } from './native-utils';
import { IBundle, BuilderAssetCache, IBuilder, IBuildStageTask, InternalBuildResult, Platform } from '../../@types/protected';
import { CocosParams } from './pack-tool/base/default';
import i18n from '../../../base/i18n';
import { BuildGlobalInfo } from '../../share/builder-config';
import { Engine } from '../../../engine';
import { relativeUrl } from '../../worker/builder/utils';
import { ITaskOption } from './type';
import nativePackToolMg from './pack-tool/manager';

export const throwError = true;

function fixPath(p: string): string {
    if (os.platform() === 'win32') {
        return p.replace(/\\/g, '/').replace(/\/+/, '/');
    }
    return p;
}


async function genCocosParams(options: ITaskOption, result: InternalBuildResult): Promise<CocosParams<Object>> {
    const name = options.name;
    const engineInfo = options.engineInfo;
    const pkgOptions = options.packages[options.platform];

    const params: CocosParams<Object> = {
        buildDir: dirname(result.paths.dir),
        buildAssetsDir: result.paths.dir,
        projDir: BuildGlobalInfo.projectRoot,
        cmakePath: await getCmakePath(),
        nativeEnginePath: engineInfo.native.path,
        enginePath: engineInfo.typescript.path,
        projectName: name,
        debug: options.debug,
        encrypted: pkgOptions.encrypted,
        xxteaKey: pkgOptions.xxteaKey,
        compressZip: pkgOptions.compressZip,
        // @ts-ignore
        cMakeConfig: {
            APP_NAME: `set(APP_NAME "${name}")`,
            // 路径类的字段需要加 “” 否则当路径存在空格将会报错
            COCOS_X_PATH: `set(COCOS_X_PATH "${fixPath(engineInfo.native.path)}")`,
            USE_JOB_SYSTEM_TASKFLOW: pkgOptions.JobSystem === 'taskFlow',
            USE_JOB_SYSTEM_TBB: pkgOptions.JobSystem === 'tbb',
            ENABLE_FLOAT_OUTPUT: options.macroConfig.ENABLE_FLOAT_OUTPUT,
        },
        platformParams: {},
        platform: options.platform,
        // @ts-ignore TODO 需要和 native pack tool 的参数 init 一起转移到各个平台插件内，Linux 没有构建配置信息
        packageName: (options.packages[options.platform] && options.packages[options.platform].packageName) || '',
    };

    // 调试模式下，加密脚本功能无效
    if (options.debug && params.encrypted) {
        console.warn(i18n.t('builder.platforms.native.encrypt.disable_tips'));
        params.encrypted = false;
    }

    if (engineInfo.native.type === 'custom') {
        params.cMakeConfig.BUILTIN_COCOS_X_PATH = `set(BUILTIN_COCOS_X_PATH "${fixPath(engineInfo.native.builtin)}")`;
    }

    const moduleConfig = Engine.queryModuleConfig().moduleCmakeConfig;
    Object.keys(moduleConfig).forEach((module) => {
        if (moduleConfig[module].native) {
            params.cMakeConfig[moduleConfig[module].native] = `set(${moduleConfig[module].native} ${options.includeModules.includes(module) ? 'ON' : 'OFF'})`;
        }
    });

    if (!existsSync(params.buildDir)) {
        await mkdir(params.buildDir);
    }

    return params;
}

/**
 * 获取适配于指定 Lite 的 browserslist 查询。
 *
 * @param repo Lite 的仓库地址。
 */
async function getBrowserslistQuery(repo: string) {
    const browserslistrcPath = join(repo, '.browserslistrc');
    let browserslistrcSource: string;
    try {
        browserslistrcSource = await readFile(browserslistrcPath, 'utf8');
    } catch (err: any) {
        return;
    }

    const queries = parseBrowserslistQueries(browserslistrcSource);
    if (queries.length === 0) {
        return;
    }


    return queries.join(' or ');

    function parseBrowserslistQueries(source: string) {
        const queries: string[] = [];
        for (const line of source.split('\n')) {
            const iSharp = line.indexOf('#');
            const lineTrimmed = (iSharp < 0 ? line : line.substr(0, iSharp)).trim();
            if (lineTrimmed.length !== 0) {
                queries.push(lineTrimmed);
            }
        }
        return queries;
    }
}

class ShareData {
    _map: Record<string, any> = {};
    _platform: Platform;
    constructor(platform: Platform) {
        this._platform = platform;
    }
    set<T>(key: string, data: T) {
        this._map[key] = data;
    }
    get<T>(key: string): T {
        return this._map[key];
    }
    clear() {
        this._map = {};
    }
}

class ShareDataInHooks {
    static _map: Map<Platform, ShareData> = new Map();
}

// ******************* 钩子函数入口 ******************
export function onBeforeBuild(options: ITaskOption) {
    // 修改此参数以避免构建时清空原目录
    options.useCache = true;
}

export async function onAfterInit(this: IBuilder, options: ITaskOption, result: InternalBuildResult) {
    // 3.4 在 m1 支持了 physx，这部分代码保留一个版本，3.5 后再移除这部分代码和对应 i18n
    // if (options.platform === 'mac' && options.packages.mac!.supportM1 && options.includeModules.includes('physics-physx')) {
    //     throw new Error(i18n.t('builder.platforms.mac.error.m1_with_physic_x'));
    // }
    if (options.server && !options.server.endsWith('/')) {
        options.server += '/';
    }

    // 初始化 2DX 路径
    const {
        native: { path: nativeRoot },
        typescript: { path: engineRoot },
    } = options.engineInfo;
    // 后续要支持命令行传参的自定义引擎，因而 native pack tool 管理器的初始化不能放在 load 钩子里
    console.debug('Native engine root:' + nativeRoot);
    this.buildExitRes.dest = result.paths.dir;
    const assetsLink = join(result.paths.dir, 'assets');
    result.paths.dir = join(result.paths.dir, 'data');
    const output = result.paths.dir;
    if (options.buildMode === 'normal') {
        // 清空并创建 output 文件夹，后续才能添加软链接
        await emptyDirSync(output);
    }
    // 注入一些改变引擎编译的参数，需要在 result.paths.dir 修改过后
    Object.assign(options.buildEngineParam, {
        output: join(result.paths.dir, 'src/cocos-js'),
    });
    result.paths.engineDir = options.buildEngineParam.output;
    // To support build-plugins before v3.5.0, need link `assets` to `data/`
    try {
        if (!existsSync(assetsLink)) {
            symlinkSync(output, assetsLink, 'junction');
        }
    } catch (e) {
        console.error(`Failed to create symbolic link ${assetsLink}`);
        console.error(e);
    }
    const params = await genCocosParams(options, result);
    options.cocosParams = params;
    options.generateCompileConfig = true;

    // 拷贝 adapter 文件
    for (const name of ['web-adapter', 'engine-adapter']) {
        await copy(
            join(params.enginePath, 'bin/adapter/native', `${name}.${options.debug ? '' : 'min.'}js`),
            join(result.paths.dir, 'jsb-adapter', `${name}.js`),
        );
    }
}

export async function onAfterBundleInit(options: ITaskOption) {
    // Note: 独立 bundle 构建没有 options.engineInfo 需要自行查询
    const {
        native: { path: nativeRoot },
    } = options.engineInfo;

    options.buildScriptParam.hotModuleReload = options.packages[options.platform].hotModuleReload;

    if (options.polyfills) {
        options.polyfills.asyncFunctions = false;
    }

    let targets: string | undefined;

    const browserslistQueries = await getBrowserslistQuery(nativeRoot);
    if (browserslistQueries) {
        targets = browserslistQueries;
    }

    if (targets) {
        options.buildScriptParam.targets = targets;
        if (!options.buildScriptParam.polyfills) {
            options.buildScriptParam.polyfills = {};
        }
        options.buildScriptParam.polyfills.targets = targets;
        if ('asyncFunctions' in options.buildScriptParam.polyfills) {
            delete options.buildScriptParam.polyfills.asyncFunctions;
        }
    }

    options.buildScriptParam.system = { preset: 'commonjs-like' };
}

export async function onAfterBundleDataTask(options: ITaskOption, bundles: IBundle[], cache: BuilderAssetCache) {
    for (const bundle of bundles) {
        bundle.configOutPutName = 'cc.config';
    }
}

/**
 * !! service 插件依赖了此时序内的 create 行为，需要在 onAfterCompressSettings 之前处理好内置模板拷贝
 * onAfterCompressSettings -> onBeforeCopyBuildTemplate 符合构建模板拷贝时序问题
 * @param this
 * @param options
 * @param result
 */
export async function onAfterCompressSettings(this: IBuilder, options: ITaskOption, result: InternalBuildResult) {
    // const output = result.paths.dir;
    // const args = ['compile', '-p', 'mac', '-m', 'debug', '--compile-script', '0'];
    // await cocos(args, {
    //     cwd: output,
    // });

    // 支持自定义模板 index.ejs
    const buildTemplateDir = join(options.engineInfo.typescript.path, 'templates/native');
    const indexJsTemplateRenderData = {
        polyfillsBundleFile: (result.paths.polyfillsJs && relativeUrl(result.paths.dir, result.paths.polyfillsJs)) || false,
        systemJsBundleFile: relativeUrl(result.paths.dir, result.paths.systemJs!),
        importMapFile: relativeUrl(result.paths.dir, result.paths.importMap),
        applicationJs: './' + relativeUrl(result.paths.dir, result.paths.applicationJS),
    };
    // index.ejs 模板文件单独支持在 native 里，其他自定义模板文件加在具体平台模板目录下
    const indexJsTemplatePath = this.buildTemplate.initUrl('index.ejs') || join(buildTemplateDir, 'index.ejs');
    const indexJsSource: string = ((await Ejs.renderFile(indexJsTemplatePath, indexJsTemplateRenderData)) as string).toString();
    await writeFile(join(result.paths.dir, 'main.js'), indexJsSource, 'utf8');
    options.md5CacheOptions.replaceOnly.push('main.js');

    // 【注意时序】
    // 1. 原生工程模板要尽早生成方便后续其他构建插件（service）做一些原生工程的调整或者 sdk 接入等等
    // 2. create 里还包含了脚本加密，为了给用户预留能在 onAfterBuildAssets 修改脚本的时序，需要在 onAfterBuildAssets 钩子之后再执行
    // 3. 在 create 之前要准备几乎所有的项目工程文件，包括 main.js
    const packTools = await nativePackToolMg.create(options.cocosParams);
    options.packages[options.platform].projectDistPath = packTools.paths.nativePrjDir;
    this.buildExitRes.custom.nativePrjDir = packTools.paths.nativePrjDir;
    // 加密后再更改 remote 目录，否则 remote 目录可能会没有加密到
    const server = options.server || '';
    const remoteDir = resolve(result.paths.dir, '../remote');
    // 目前原生平台构建主流程不会清理 data 目录外的文件夹，需要平台插件自行清理旧数据
    removeSync(remoteDir);
    if (server && existsSync(result.paths.remote)) {
        try {
            // moveSync 默认不会覆盖已存在的同名文件，在移动之前需要确认目标文件夹已被清空
            moveSync(result.paths.remote, remoteDir);
            result.paths.remote = remoteDir;
        } catch (error) {
            // HACK 自动化偶然会遇到这个问题，原因未知，先不影响构建流程，直接报错也可
            console.error(error);
        }
    }
}

/**
 * 生成原生工程以及相关链接等
 * @param options
 * @param result
 */
export async function onAfterBuild(this: IBuilder, options: ITaskOption, result: InternalBuildResult) {
    const tool = await nativePackToolMg.generate(options.cocosParams);
    this.buildExitRes.custom.nativePrjDir = tool.paths.nativePrjDir;

}

export async function onBeforeMake(this: IBuildStageTask, root: string, options: ITaskOption) {
    if (options.cocosParams) {
        return;
    }
    // @ts-ignore
    if (!(options as CocosParams<Object>).cMakeConfig || !this.buildTaskOptions) {
        // 如果当前 options 数据不是 cocos param 的数据，需要让用户重新构建
        throw new Error('Get cache build options form cocos.compile.json failed! Please recompile the build task again.');
    }
    // 自 3.8.4 起，移除 native 平台对 cocos.compile 的 HACK，此兼容代码保留两三个大版本即可
    // 由于要兼容命令行生成的行为，不做迁移，在运行时兼容处理
    this.options = this.buildTaskOptions;
    // @ts-ignore
    this.options.cocosParams = JSON.parse(JSON.stringify(options));
    // 遇到就修改原来的 cocos.compile.json 文件
    await this.saveOptions();
}

/**
 * 编译
 * @param root
 * @param options
 */
export async function make(this: IBuildStageTask, root: string, options: ITaskOption) {
    const tool = await nativePackToolMg.make(options.cocosParams);
    this.buildExitRes.custom.nativePrjDir = tool.paths.nativePrjDir;
    this.buildExitRes.custom.executableFile = await tool.getExecutableFile();
}

/**
 * 运行方法
 * @param root
 * @param options
 */
export async function run(root: string, options: ITaskOption) {
    await nativePackToolMg.run(options.cocosParams);
}
