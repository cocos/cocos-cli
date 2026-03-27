import { readJSONSync } from 'fs-extra';
import i18n from '../base/i18n';
import { BuildExitCode, IBuildCommandOption, IBuildResultData, IBuildStageOptions, IBuildTaskOption, IBundleBuildOptions, IPreviewSettingsResult, Platform } from './@types/private';
import { pluginManager } from './manager/plugin';
import { formatMSTime } from './share/utils';
import { newConsole } from '../base/console';
import { join } from 'path';
import assetManager from '../assets/manager/asset';
import { removeDbHeader } from './worker/builder/utils';
import builderConfig from './share/builder-config';
import { BuildConfiguration } from './@types/config-export';
import utils from '../base/utils';
import { middlewareService } from '../../server/middleware/core';
import BuildMiddleware from './build.middleware';
import { BuildGlobalInfo } from './share/global';
import { fillIncludeModulesFromProjectConfig } from './share/common-options-validator';

export async function init(platform?: string) {
    await builderConfig.init();
    await pluginManager.init();
    middlewareService.register('Build', BuildMiddleware);
    if (platform) {
        await pluginManager.register(platform);
    } else {
        await pluginManager.registerAllPlatform();
    }
}

export async function createBuildTask<P extends Platform>(platform: P, options?: IBuildCommandOption) {
    if (!options) {
        options = await pluginManager.getOptionsByPlatform(platform);
    }
    options.platform = platform;

    // 不支持的构建平台不执行构建
    if (!pluginManager.checkPlatform(platform)) {
        throw new Error(`Unsupported platform ${platform} for build command!`);
    }
    options.taskId = options.taskId || String(new Date().getTime());
    options.taskName = options.taskName || platform;

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

    // 从项目配置中补充 includeModules
    await fillIncludeModulesFromProjectConfig(realOptions);

    const { BuildTask } = await import('./worker/builder');
    return new BuildTask(options.taskId, realOptions);
}

export async function build<P extends Platform>(platform: P, options?: IBuildCommandOption): Promise<IBuildResultData> {
    const startTime = Date.now();
    let buildSuccess = true;

    // 显示构建开始信息
    newConsole.buildStart(platform);
    try {
        const builder = await createBuildTask(platform, options);

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
    const tasksLabel = bundleOptions.taskName || 'bundle Build';
    const taskStartTime = Date.now();

    try {
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
    }
}

export async function createBuildStageTask(taskId: string, stageName: string, options: IBuildStageOptions) {
    options.dest = utils.Path.resolveToRaw(options.dest);
    let buildOptions;
    if (!options.platform.startsWith('web')) {
        buildOptions = readBuildTaskOptions(options.dest);
        if (!buildOptions) {
            throw new Error('Build options is not exist!');
        }
    }

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

export async function executeBuildStageTask(taskId: string, stageName: string, options: IBuildStageOptions): Promise<IBuildResultData> {
    if (!options.taskName) {
        options.taskName = stageName + ' build';
    }

    try {
        const buildStageTask = await createBuildStageTask(taskId, stageName, options);
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
    }
}

function readBuildTaskOptions(root: string): IBuildTaskOption<any> {
    const configFile = join(root, BuildGlobalInfo.buildOptionsFileName);
    return readJSONSync(configFile);
}

export async function getPreviewSettings<P extends Platform>(options?: IBuildTaskOption<P>): Promise<IPreviewSettingsResult> {
    const buildOptions = options || (await pluginManager.getOptionsByPlatform('web-desktop'));
    buildOptions.preview = true;
    // TODO 预览 settings 的排队之类的
    const { BuildTask } = await import('./worker/builder/index');
    const buildTask = new BuildTask(buildOptions.taskId || 'v', buildOptions as unknown as IBuildTaskOption<Platform>);
    console.time('Get settings.js in preview');

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
    console.timeEnd('Get settings.js in preview');
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

export async function queryDefaultBuildConfigByPlatform(platform: Platform) {
    return await pluginManager.getOptionsByPlatform(platform);
}
