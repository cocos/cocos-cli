import { readJSONSync } from 'fs-extra';
import i18n from '../base/i18n';
import { BuildExitCode, BuildStageProgressCallback, IBuildCommandOption, IBuildResultData, IBuildStageOptions, IBuildTaskOption, IBundleBuildOptions, IPreviewSettingsResult, Platform } from './@types/private';
import { pluginManager } from './manager/plugin';
import { cloneConfigValue, defaultsDeep, formatMSTime } from './share/utils';
import { newConsole } from '../base/console';
import { basename, extname, isAbsolute, join } from 'path';
import assetManager from '../assets/manager/asset';
import { removeDbHeader } from './worker/builder/utils';
import builderConfig from './share/builder-config';
import { BuildConfiguration } from './@types/config-export';
import utils from '../base/utils';
import { middlewareService } from '../../server/middleware/core';
import BuildMiddleware from './build.middleware';
import { BuildGlobalInfo } from './share/global';
import { Engine } from '../engine';
import { getDefaultScenes, getDefaultStartScene } from './share/common-options-validator';
export { clearCache } from './cache';
export type { BuildCacheScope, ClearCacheResult } from './cache';

export async function init(platform?: string[]) {
    await builderConfig.init();
    await pluginManager.init();
    middlewareService.register('Build', BuildMiddleware);
    if (platform?.length) {
        for (const platformName of platform) {
            await pluginManager.register(platformName);
        }
    } else {
        await pluginManager.registerAllPlatform();
    }
}

/**
 * 使用平台注册的 verifyRules 对构建参数做严格校验。
 * 仅供 api 层（CLI/MCP）在调用 build() 前显式调用；Pink 走自己的 UI 校验，不会经过这里。
 * skipCheck 为 true 时跳过。
 *
 * 语义：先把平台 default 合进 options 再校验——用户漏传的字段会用平台默认值兜底通过；
 * 只有用户明确传了非法值、或字段本身默认值就不合法（例如 iOS/Mac 的 packageName 默认空但 required）
 * 时才会失败。任何 rule 失败（除 level='warn' 显式声明的）都硬阻塞，返回 { code: PARAM_ERROR, reason }。
 */
export async function verifyBuildOptions(
    platform: string,
    options?: IBuildCommandOption,
): Promise<{ code: Exclude<BuildExitCode, BuildExitCode.BUILD_SUCCESS>; reason: string } | null> {
    if (options?.skipCheck) {
        return null;
    }
    try {
        // 与 createBuildTask 里 checkOptions 一致：先用平台 default 兜住漏传字段
        const defaultOptions = await pluginManager.getOptionsByPlatform(platform);
        const merged = defaultsDeep(JSON.parse(JSON.stringify(options || {})), defaultOptions);
        merged.platform = platform;
        // taskName 是 common option 里 default='' + verifyRules=['required']，
        // 老流程靠 createBuildTask 里 `options.taskName = options.taskName || platform` 兜底，
        // 而入口校验早于 build()，这里必须复刻同样的归一化，否则 required 规则永远拦。
        merged.taskName = merged.taskName || platform;
        // scenes / startScene 的合法默认值是从 asset-db 现算的（getDefaultScenes / getDefaultStartScene），
        // 不是 commonOptionConfigs 里的静态 '' / []。老流程里 checkOptions 靠 fixedValue 自动回落到这两个函数，
        // 新入口校验对 error 硬阻塞（不消费 fixedValue），因此必须在校验前先按同样逻辑把项目默认场景填进来。
        try {
            if (!merged.startScene) {
                const defaultStartScene = getDefaultStartScene();
                if (defaultStartScene) {
                    merged.startScene = defaultStartScene;
                }
            }
            if (!Array.isArray(merged.scenes) || merged.scenes.length === 0) {
                const defaultScenes = getDefaultScenes();
                if (defaultScenes.length) {
                    merged.scenes = defaultScenes;
                }
            }
        } catch {
            // asset-db 未初始化时忽略（单测/引擎未加载），交给下游的 required-like 规则处理
        }
        // renderPipeline 是项目设置而非平台选项，构建阶段才由 checkProjectSetting 填进 options。
        // 入口校验早于构建，这里按编辑器的做法直接读工程配置补上，否则依赖它的规则（apiLevelRenderPipeline）恒不触发。
        if (!merged.renderPipeline) {
            try {
                const renderPipeline = Engine.getConfig().renderPipeline;
                if (renderPipeline) {
                    merged.renderPipeline = renderPipeline;
                }
            } catch {
                // Engine 未初始化（如单测/未加载引擎）时忽略，不影响其余规则
            }
        }
        const results = await pluginManager.checkBuildOptions(platform, merged as any);
        const errors: string[] = [];
        const warnings: string[] = [];
        for (const key of Object.keys(results)) {
            const r = results[key];
            if (r.valid) {
                continue;
            }
            const line = `  - ${key}: ${r.message || 'invalid'}`;
            if (r.level === 'warn') {
                warnings.push(line);
            } else {
                errors.push(line);
            }
        }
        if (warnings.length) {
            console.warn(`Build option warnings:\n${warnings.join('\n')}`);
        }
        if (errors.length) {
            const reason = `Build option errors:\n${errors.join('\n')}`;
            console.error(reason);
            return { code: BuildExitCode.PARAM_ERROR, reason };
        }
    } catch (e) {
        console.warn('Failed to run build option checks:', e);
    }
    return null;
}

function getBuilderLogRoot() {
    const projectTempDir = builderConfig.projectTempDir;
    return basename(projectTempDir) === 'builder' ? projectTempDir : join(projectTempDir, 'builder');
}

// Log filename: {platform}-{action}-{timestamp}.log
// e.g. google-play-build-1234567890.log, google-play-make-1234567890.log, google-play-bundle-build-1234567890.log
function normalizeBuildLogDest(logDest: string | undefined, taskName: string, platform?: string) {
    const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_');
    const sanitizedTask = sanitize(taskName);
    const sanitizedPlatform = platform ? sanitize(platform) : undefined;
    const label = platform === taskName ? 'build' : sanitizedTask;
    const parts = sanitizedPlatform ? [sanitizedPlatform, label, `${Date.now()}`] : [sanitizedTask, `${Date.now()}`];
    const fallback = join(getBuilderLogRoot(), 'log', `${parts.join('-')}.log`);
    let resolvedLogDest = logDest ? utils.Path.resolveToRaw(logDest) : fallback;
    if (!isAbsolute(resolvedLogDest)) {
        resolvedLogDest = join(builderConfig.projectRoot, resolvedLogDest);
    }
    return extname(resolvedLogDest).toLowerCase() === '.log' ? resolvedLogDest : `${resolvedLogDest}.log`;
}

function ensureBuildLogSink(options: { logDest?: string; taskName?: string; platform?: string }, fallbackTaskName: string, logDest?: string) {
    const taskName = options.taskName || fallbackTaskName;
    options.taskName = taskName;
    options.logDest = normalizeBuildLogDest(logDest || options.logDest, taskName, options.platform);
    newConsole.record(options.logDest);
    return options.logDest;
}

export async function createBuildTask<P extends Platform>(platform: P, options?: IBuildCommandOption) {
    if (!options) {
        options = await pluginManager.getOptionsByPlatform(platform);
    }
    options.platform = platform;
    options.taskId = options.taskId || String(new Date().getTime());
    options.taskName = options.taskName || platform;
    ensureBuildLogSink(options, platform);

    // 不支持的构建平台不执行构建
    if (!pluginManager.checkPlatform(platform)) {
        throw new Error(`Unsupported platform ${platform} for build command!`);
    }
    // @ts-ignore
    let realOptions: IBuildTaskOption<any> = options;
    if (!options.skipCheck) {
        // 校验插件选项
        // @ts-ignore
        const rightOptions = await pluginManager.checkOptions(options);
        if (!rightOptions) {
            throw new Error(i18n.t('builder.error.check_options_failed'));
        }
        realOptions = rightOptions;
    }

    realOptions.logDest = options.logDest;

    const { BuildTask } = await import('./worker/builder');
    return new BuildTask(options.taskId, realOptions);
}

export async function build<P extends Platform>(platform: P, options?: IBuildCommandOption): Promise<IBuildResultData> {
    const startTime = Date.now();
    let buildSuccess = true;
    const restoreLogSink = newConsole.createLogSinkRestorer();

    // 显示构建开始信息
    try {
        const builder = await createBuildTask(platform, options);
        newConsole.buildStart(platform);

        // 监听构建进度
        builder.on('update', (message: string, progress: number) => {
            newConsole.progress(message, Math.round(progress * 100), 100);
        });

        await builder.run();
        buildSuccess = !builder.error;
        const duration = formatMSTime(Date.now() - startTime);
        newConsole.buildComplete(platform, duration, buildSuccess);
        builder.buildExitRes.dest = utils.Path.resolveToUrl(builder.buildExitRes.dest, 'project');
        console.debug(JSON.stringify(builder.buildExitRes));
        return buildSuccess ? builder.buildExitRes : { code: BuildExitCode.BUILD_FAILED, reason: 'Build failed!' };
    } catch (error: any) {
        buildSuccess = false;
        const duration = formatMSTime(Date.now() - startTime);
        newConsole.error(error);
        newConsole.buildComplete(platform, duration, false);
        // 如果错误对象包含 code 属性，使用该错误码（如 500）
        let errorCode = error?.code && typeof error.code === 'number' ? error.code as BuildExitCode : BuildExitCode.BUILD_FAILED;
        if (errorCode === BuildExitCode.BUILD_SUCCESS) {
            errorCode = BuildExitCode.BUILD_FAILED;
        }
        return { code: errorCode as Exclude<BuildExitCode, BuildExitCode.BUILD_SUCCESS>, reason: error?.message || String(error) };
    } finally {
        restoreLogSink();
    }
}

export async function createBundleBuildTask(bundleOptions: IBundleBuildOptions) {
    const { BundleManager } = await import('./worker/builder/asset-handler/bundle');
    const options = bundleOptions.buildTaskOptions;
    return await BundleManager.create(options);
}

export async function buildBundleOnly(bundleOptions: IBundleBuildOptions): Promise<IBuildResultData> {
    const startTime = Date.now();
    const options = bundleOptions.buildTaskOptions;
    const tasksLabel = bundleOptions.taskName || 'bundle-build';
    const taskStartTime = Date.now();
    const restoreLogSink = newConsole.createLogSinkRestorer();

    try {
        bundleOptions.logDest = ensureBuildLogSink({ platform: options.platform }, tasksLabel, bundleOptions.logDest);
        newConsole.stage('BUNDLE', `${tasksLabel} (${options.platform}) starting...`);
        console.debug('Start build task, options:', options);
        newConsole.trackMemoryStart(`builder:build-bundle-total`);

        const builder = await createBundleBuildTask(bundleOptions);
        builder.on('update', (message: string, progress: number) => {
            newConsole.progress(`${options.platform}: ${message}`, Math.round(progress * 100), 100);
        });

        await builder.run();
        newConsole.trackMemoryEnd(`builder:build-bundle-total`);
        const totalDuration = formatMSTime(Date.now() - startTime);
        newConsole.taskComplete('Bundle Build', !!builder.error, totalDuration);
        if (builder.error) {
            const errorMsg = typeof builder.error == 'object' ? (builder.error.stack || builder.error.message) : builder.error;
            newConsole.error(`${tasksLabel} (${options.platform}) failed: ${errorMsg}`);
            return { code: BuildExitCode.BUILD_FAILED, reason: errorMsg };
        } else {
            const duration = formatMSTime(Date.now() - taskStartTime);
            newConsole.success(`${tasksLabel} (${options.platform}) completed in ${duration}`);
            return builder.buildExitRes;
        }
    } catch (error: any) {
        const errMsg = `${tasksLabel} (${options.platform}) error: ${String(error)}`;
        newConsole.error(errMsg);
        const totalDuration = formatMSTime(Date.now() - startTime);
        newConsole.taskComplete('Bundle Build', false, totalDuration);
        return { code: BuildExitCode.BUILD_FAILED, reason: errMsg };
    } finally {
        restoreLogSink();
    }
}

export async function createBuildStageTask(taskId: string, stageName: string, options: IBuildStageOptions) {
    return createBuildStageTaskWithBuildOptions(taskId, stageName, options, readBuildOptionsForBuildStage(options));
}

async function createBuildStageTaskWithBuildOptions(taskId: string, stageName: string, options: IBuildStageOptions, buildOptions?: IBuildTaskOption<any>) {
    options.dest = utils.Path.resolveToRaw(options.dest);
    const { BuildStageTask } = await import('./worker/builder/stage-task-manager');
    const stageConfig = pluginManager.getBuildStageWithHookTasks(options.platform, stageName);
    if (!stageConfig) {
        throw new Error(`No Build stage ${stageName}`);
    }

    return new BuildStageTask(taskId, {
        hooksInfo: pluginManager.getHooksInfo(options.platform),
        root: options.dest,
        buildTaskOptions: buildOptions!,
        ...stageConfig,
    });
}

function readBuildOptionsForBuildStage(options: IBuildStageOptions) {
    options.dest = utils.Path.resolveToRaw(options.dest);
    let buildOptions;
    if (!options.platform.startsWith('web')) {
        buildOptions = readBuildTaskOptions(options.dest);
        if (!buildOptions) {
            throw new Error('Build options is not exist!');
        }
        mergeBuildStageRuntimeOptions(buildOptions, options);
    }
    return buildOptions;
}

function mergeBuildStageRuntimeOptions(buildOptions: IBuildTaskOption<any>, options: IBuildStageOptions) {
    buildOptions.platform = options.platform;
    (buildOptions as IBuildTaskOption<any> & { dest?: string }).dest = options.dest;
    if (options.logDest) {
        buildOptions.logDest = options.logDest;
    }

    if (!options.packages) {
        return;
    }
    buildOptions.packages = buildOptions.packages || {};
    for (const [platform, packageOptions] of Object.entries(options.packages)) {
        buildOptions.packages[platform] = {
            ...(buildOptions.packages[platform] || {}),
            ...packageOptions,
        };
    }
}

export async function executeBuildStageTask(taskId: string, stageName: string, options: IBuildStageOptions, onProgress?: BuildStageProgressCallback): Promise<IBuildResultData> {
    if (!options.taskName) {
        options.taskName = stageName;
    }
    const restoreLogSink = newConsole.createLogSinkRestorer();
    ensureBuildLogSink(options, options.taskName, options.logDest);
    let buildStageTask: Awaited<ReturnType<typeof createBuildStageTask>> | undefined;

    try {
        let buildOptions: IBuildTaskOption<any> | undefined;
        if (!options.platform.startsWith('web')) {
            options.dest = utils.Path.resolveToRaw(options.dest);
            buildOptions = readBuildTaskOptions(options.dest);
            if (!buildOptions) {
                throw new Error('Build options is not exist!');
            }
            mergeBuildStageRuntimeOptions(buildOptions, options);
        }
        buildStageTask = await createBuildStageTaskWithBuildOptions(taskId, stageName, options, buildOptions);
        if (onProgress) {
            buildStageTask.on('update', onProgress);
        }
        const stageConfig = pluginManager.getBuildStageWithHookTasks(options.platform, stageName);
        const stageLabel = stageConfig!.name;

        newConsole.trackMemoryStart(`builder:build-stage-total ${stageName}`);
        const buildSuccess = await buildStageTask.run();
        newConsole.trackMemoryEnd(`builder:build-stage-total ${stageName}`);

        if (!buildStageTask.error) {
            console.log(`[task:${stageLabel}]: success!`);
        } else {
            console.error(`${stageLabel} package ${options.dest} failed!`);
            console.log(`[task:${stageLabel}]: failed!`);
        }
        buildStageTask.buildExitRes.dest = utils.Path.resolveToUrl(buildStageTask.buildExitRes.dest, 'project');
        console.log(JSON.stringify(buildStageTask.buildExitRes));
        return buildSuccess ? buildStageTask.buildExitRes : { code: BuildExitCode.BUILD_FAILED, reason: 'Build stage task failed!' };
    } catch (error: any) {
        console.error(error);
        return { code: BuildExitCode.BUILD_FAILED, reason: error?.message || String(error) };
    } finally {
        if (buildStageTask && onProgress) {
            buildStageTask.off('update', onProgress);
        }
        restoreLogSink();
    }
}

function readBuildTaskOptions(root: string): IBuildTaskOption<any> {
    const configFile = join(root, BuildGlobalInfo.buildOptionsFileName);
    return readJSONSync(configFile);
}

export async function getPreviewSettings<P extends Platform>(options?: IBuildTaskOption<P>): Promise<IPreviewSettingsResult> {
    const temp = options || (await pluginManager.getOptionsByPlatform('web-desktop'));
    const buildOptions = JSON.parse(JSON.stringify(temp));
    buildOptions.preview = true;
    // TODO 预览 settings 的排队之类的
    const { BuildTask } = await import('./worker/builder/index');
    const buildTask = new BuildTask(buildOptions.taskId || 'v', buildOptions as unknown as IBuildTaskOption<Platform>);
    const previewSettingsStart = Date.now();

    // 拿出 settings 信息
    const settings = await buildTask.getPreviewSettings();

    // 拼接脚本对应文件的 map
    const script2library: { [index: string]: string } = {};
    for (const uuid of buildTask.cache.scriptUuids) {
        const asset = assetManager.queryAsset(uuid);
        if (!asset) {
            console.error('unknown script uuid: ' + uuid);
            continue;
        }
        script2library[removeDbHeader(asset.url).replace(/.ts$/, '.js')] = asset.library + '.js';
    }
    console.log(`Get settings.js in preview: ${Date.now() - previewSettingsStart}ms`);
    // 返回数据
    return {
        settings,
        script2library,
        bundleConfigs: buildTask.bundleManager.bundles.map((x) => x.config),
    };
}

export function queryBuildConfig() {
    return builderConfig.getProject<BuildConfiguration>();
}

export function queryBundleConfig() {
    return pluginManager.queryBundleConfig();
}

export function queryTextureCompressConfig() {
    return pluginManager.queryTextureCompressConfig();
}

export function queryPlatformConfig() {
    return pluginManager.queryPlatformConfig();
}

export function getPlatformBuildSchema(platform: Platform | string) {
    return pluginManager.getPlatformBuildSchema(platform);
}

export function refreshDisplayI18nFields() {
    return pluginManager.refreshDisplayI18nFields();
}

export async function createBuildTemplate(nameOrPlatform: string): Promise<void> {
    return pluginManager.createBuildTemplate(nameOrPlatform);
}

export function checkBuildOption(platform: string, key: string, value: unknown, options: IBuildTaskOption) {
    return pluginManager.checkBuildOption(platform, key, value, options);
}

export function checkBuildOptions(platform: string, options: IBuildTaskOption) {
    return pluginManager.checkBuildOptions(platform, options);
}

export async function queryAssetsInBundle(uuid: string, bundleFilterConfig?: import('./@types').BundleFilterConfig[]) {
    const { buildAssetLibrary } = await import('./worker/builder/manager/asset-library');
    return buildAssetLibrary.queryAssetsInBundle(uuid, bundleFilterConfig);
}

export function getRegisteredPlatforms() {
    return pluginManager.getRegisteredPlatforms();
}

export async function queryDefaultBuildConfigByPlatform(platform: Platform) {
    return cloneConfigValue(await pluginManager.getOptionsByPlatform(platform));
}
