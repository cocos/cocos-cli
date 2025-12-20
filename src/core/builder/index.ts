import { readJSONSync } from 'fs-extra';
import i18n from '../base/i18n';
import { BuildExitCode, IBuildCommandOption, IBuildResultData, IBuildStageOptions, IBuildTaskOption, IBundleBuildOptions, IPreviewSettingsResult, Platform } from './@types/private';
import { pluginManager } from './manager/plugin';
import { formatMSTime } from './share/utils';
import { newConsole } from '../base/console';
import { join } from 'path';
import assetManager from '../assets/manager/asset';
import { removeDbHeader } from './worker/builder/utils';
import builderConfig, { BuildGlobalInfo } from './share/builder-config';
import { BuildConfiguration } from './@types/config-export';
import utils from '../base/utils';

import { middlewareService } from '../../server/middleware/core';
import BuildMiddleware from './build.middleware';

export async function init(platform?: string) {
    await builderConfig.init();
    await pluginManager.init();
    platform && pluginManager.register(platform);
    middlewareService.register('Build', BuildMiddleware);
}

export async function startup() {
    await pluginManager.registerAllPlatform();
}

export async function build<P extends Platform>(platform: P, options?: IBuildCommandOption): Promise<IBuildResultData> {
    if (!options) {
        options = await pluginManager.getOptionsByPlatform(platform);
    }
    options.platform = platform;
    options.taskId = options.taskId || String(new Date().getTime());
    options.taskName = options.taskName || platform;

    // 不支持的构建平台不执行构建
    if (!pluginManager.checkPlatform(platform)) {
        console.error(i18n.t('builder.tips.disable_platform_for_build_command', {
            platform: platform,
        }));
        return { code: BuildExitCode.BUILD_FAILED, reason: `Unsupported platform ${platform} for build command!` };
    }

    // 命令行构建前，补全项目配置数据
    // await checkProjectSettingsBeforeCommand(options);
    // @ts-ignore
    let realOptions: IBuildTaskOption<any> = options;
    if (!options.skipCheck) {
        try {
            // 校验插件选项
            // @ts-ignore
            const rightOptions = await pluginManager.checkOptions(options);
            if (!rightOptions) {
                console.error(i18n.t('builder.error.check_options_failed'));
                return { code: BuildExitCode.PARAM_ERROR, reason: 'Check options failed!' };
            }
            realOptions = rightOptions;
            console.log(JSON.stringify(realOptions, null, 2));
        } catch (error) {
            console.error(error);
            return { code: BuildExitCode.PARAM_ERROR, reason: 'Check options failed! ' + String(error) };
        }
    }

    let buildSuccess = true;
    const startTime = Date.now();

    // 显示构建开始信息
    newConsole.buildStart(platform);
    try {
        const { BuildTask } = await import('./worker/builder');
        const builder = new BuildTask(options.taskId, realOptions);

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
        return { code: BuildExitCode.BUILD_FAILED, reason: 'Build failed! ' + String(error) };
    }
}

export async function buildBundleOnly(bundleOptions: IBundleBuildOptions): Promise<IBuildResultData> {
    const { BundleManager } = await import('./worker/builder/asset-handler/bundle');
    const startTime = Date.now();

    const options = bundleOptions.buildTaskOptions;
    const tasksLabel = bundleOptions.taskName || 'bundle Build';
    const taskStartTime = Date.now();

    try {
        newConsole.stage('BUNDLE', `${tasksLabel} (${options.platform}) starting...`);
        console.debug('Start build task, options:', options);
        newConsole.trackMemoryStart(`builder:build-bundle-total`);

        const builder = await BundleManager.create(options);
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
            return { code: BuildExitCode.BUILD_FAILED, reason:errorMsg };
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
        return { code: BuildExitCode.BUILD_FAILED, reason:errMsg };
    }
}

export async function executeBuildStageTask(taskId: string, stageName: string, options: IBuildStageOptions): Promise<IBuildResultData> {
    if (!options.taskName) {
        options.taskName = stageName + ' build';
    }
    options.dest = utils.Path.resolveToRaw(options.dest);
    let buildOptions;
    if (!options.platform.startsWith('web')) {
        try {
            buildOptions = readBuildTaskOptions(options.dest);
        } catch (error) {
            console.error(error);
            if (!buildOptions) {
                return { code: BuildExitCode.PARAM_ERROR, reason: 'Build options is not exist!' };
            }
        }
    }

    let buildSuccess = true;
    const BuildStageTask = (await import('./worker/builder/stage-task-manager')).BuildStageTask;

    const stageConfig = pluginManager.getBuildStageWithHookTasks(options.platform, stageName);
    if (!stageConfig) {
        console.error(`No Build stage ${stageName}`);
        return { code: BuildExitCode.BUILD_FAILED, reason: `No Build stage ${stageName}!` };
    }

    newConsole.trackMemoryStart(`builder:build-stage-total ${stageName}`);
    const buildStageTask = new BuildStageTask(taskId, {
        hooksInfo: pluginManager.getHooksInfo(options.platform),
        root: options.dest,
        buildTaskOptions: buildOptions!,
        ...stageConfig,
    });
    const stageLabel = stageConfig.name;
    buildSuccess = await buildStageTask.run();
    newConsole.trackMemoryEnd(`builder:build-stage-total ${stageName}`);

    if (!buildStageTask.error) {
        console.log(`[task:${stageLabel}]: success!`);
    } else {
        console.error(`${stageLabel} package ${options.dest} failed!`);
        console.log(`[task:${stageLabel}]: failed!`);
        buildSuccess = false;
    }
    buildStageTask.buildExitRes.dest = utils.Path.resolveToUrl(buildStageTask.buildExitRes.dest, 'project');
    console.log(JSON.stringify(buildStageTask.buildExitRes));
    return buildSuccess ? buildStageTask.buildExitRes : { code: BuildExitCode.BUILD_FAILED, reason: 'Build stage task failed!' };
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