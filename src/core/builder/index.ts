import { existsSync } from 'fs';
import { readJSONSync } from 'fs-extra';
import i18n from '../base/i18n';
import { BuildExitCode, IBuildCommandOption, IBuildResultData, IBuildStageOptions, IBuildTaskOption, IBundleBuildOptions, IPreviewSettingsResult, Platform } from './@types/private';
import { PLATFORMS } from './share/platforms-options';
import { pluginManager } from './manager/plugin';
import { formatMSTime, getTaskLogDest } from './share/utils';
import { newConsole } from '../base/console';
import { join } from 'path';
import assetManager from '../assets/manager/asset';
import { removeDbHeader } from './worker/builder/utils';
import builderConfig, { BuildGlobalInfo } from './share/builder-config';
import { Engine } from '../engine';
import { BuildConfiguration } from './@types/config-export';
import utils from '../base/utils';

export async function init() {
    await builderConfig.init();
    // TODO 看后续是否需要按需启动
    await pluginManager.prepare(['web-desktop', 'web-mobile']);
}

export async function build<P extends Platform>(platform: P, options?: IBuildCommandOption<P>): Promise<IBuildResultData> {
    if (!options) {
        options = await pluginManager.getOptionsByPlatform(platform);
    }
    options.platform = platform;
    options.taskId = options.taskId || String(new Date().getTime());
    options.logDest = options.logDest || getTaskLogDest(platform, options.taskId);
    options.taskName = options.taskName || platform;
    options.engineInfo = options.engineInfo || Engine.getInfo();

    if (options.stage === 'bundle') {
        return await buildBundleOnly(options as unknown as IBundleBuildOptions);
    }

    // 单独的编译、生成流程
    if (options.stage && (options.stage !== 'build')) {
        return await executeBuildStageTask(options.taskId, options.stage, options as unknown as IBuildStageOptions);
    }
    // 不支持的构建平台不执行构建
    if (!PLATFORMS.includes(platform)) {
        console.error(i18n.t('builder.tips.disable_platform_for_build_command', {
            platform: platform,
        }));
        return { code: BuildExitCode.BUILD_FAILED, reason: `Unsupported platform ${platform} for build command!` };
    }

    // 命令行构建前，补全项目配置数据
    // await checkProjectSettingsBeforeCommand(options);
    let res: IBuildTaskOption<any>;
    if (!options.skipCheck) {
        try {
            // 校验插件选项
            // @ts-ignore
            const rightOptions = await pluginManager.checkOptions(options);
            if (!rightOptions) {
                console.error(i18n.t('builder.error.check_options_failed'));
                return { code: BuildExitCode.PARAM_ERROR, reason: 'Check options failed!' };
            }
            res = rightOptions;
        } catch (error) {
            console.error(error);
            return { code: BuildExitCode.PARAM_ERROR, reason: 'Check options failed! ' + String(error) };
        }
    } else {
        // @ts-ignore
        res = options;
    }

    let buildSuccess = true;
    const startTime = Date.now();

    // 显示构建开始信息
    newConsole.buildStart(platform);
    try {
        const { BuildTask } = await import('./worker/builder');
        const builder = new BuildTask(options.taskId, res);

        // 监听构建进度
        builder.on('update', (message: string, progress: number) => {
            newConsole.progress(message, Math.round(progress * 100), 100);
        });

        await builder.run();
        buildSuccess = !builder.error;
        const duration = formatMSTime(Date.now() - startTime);
        newConsole.buildComplete(platform, duration, buildSuccess);
        const dest = utils.Path.resolveToUrl(builder.result.paths.dir, 'project');
        return buildSuccess ? { code: BuildExitCode.BUILD_SUCCESS, dest } : { code: BuildExitCode.BUILD_FAILED, reason: 'Build failed!' };
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
    const optionsList = bundleOptions.optionList;
    const buildTaskId = 'buildBundle';
    const weight = 1 / optionsList.length;
    const startTime = Date.now();
    let success = true;

    for (let i = 0; i < optionsList.length; i++) {
        const options = optionsList[i];
        const tasksLabel = options.taskName || 'bundle Build';
        const taskStartTime = Date.now();
        const _logDest = getTaskLogDest(options.platform, buildTaskId);

        try {
            newConsole.stage('BUNDLE', `${tasksLabel} (${options.platform}) starting...`);
            console.debug('Start build task, options:', options);
            newConsole.trackMemoryStart(`builder:build-bundle-total`);

            const builder = await BundleManager.create(options);
            builder.on('update', (message: string, progress: number) => {
                const totalProgress = (progress + i) * weight;
                newConsole.progress(`${options.platform}: ${message}`, Math.round(totalProgress * 100), 100);
            });

            await builder.run();
            newConsole.trackMemoryEnd(`builder:build-bundle-total`);

            success = !builder.error;
            if (builder.error) {
                const errorMsg = typeof builder.error == 'object' ? (builder.error.stack || builder.error.message) : builder.error;
                newConsole.error(`${tasksLabel} (${options.platform}) failed: ${errorMsg}`);
                success = false;
            } else {
                const duration = formatMSTime(Date.now() - taskStartTime);
                newConsole.success(`${tasksLabel} (${options.platform}) completed in ${duration}`);
            }
        } catch (error: any) {
            success = false;
            newConsole.error(`${tasksLabel} (${options.platform}) error: ${String(error)}`);
        }
        console.debug(`================================ ${tasksLabel} Task (${options.taskName}) Finished in (${formatMSTime(Date.now() - taskStartTime)})ms ================================`);
    }
    const totalDuration = formatMSTime(Date.now() - startTime);
    newConsole.taskComplete('Bundle Build', success, totalDuration);
    return success ? { code: BuildExitCode.BUILD_SUCCESS, dest: bundleOptions.dest } : { code: BuildExitCode.BUILD_FAILED, reason: 'Bundle build failed!' };
}

export async function executeBuildStageTask(taskId: string, stageName: string, options: IBuildStageOptions): Promise<IBuildResultData> {
    if (!options.taskName) {
        options.taskName = stageName + ' build';
    }

    const buildOptions = readBuildTaskOptions(options.root);
    if (!buildOptions) {
        return { code: BuildExitCode.PARAM_ERROR, reason: 'Build options is not exist!' };
    }

    const stages = options.nextStages ? [stageName, ...options.nextStages] : [stageName];
    let stageWeight = 1 / stages.length;
    const stageConfigs = stages.map((name) => {
        return pluginManager.getBuildStageWithHookTasks(options.platform, name);
    });
    let buildSuccess = true;
    const BuildStageTask = (await import('./worker/builder/stage-task-manager')).BuildStageTask;

    for (let index = 0; index < stageConfigs.length; index++) {
        const stageConfig = stageConfigs[index];
        stageWeight = stageWeight * (index + 1);
        if (!stageConfig) {
            console.error(`No Build stage ${stageName}`);
            return { code: BuildExitCode.BUILD_FAILED, reason: `No Build stage ${stageName}!` };
        }

        newConsole.trackMemoryStart(`builder:build-stage-total ${stageName}`);
        const buildStageTask = new BuildStageTask(taskId, {
            hooksInfo: pluginManager.getHooksInfo(options.platform),
            root: options.root,
            buildTaskOptions: buildOptions,
            ...stageConfig,
        });
        let stageLabel = stageConfig.name;
        buildSuccess = await buildStageTask.run();
        newConsole.trackMemoryEnd(`builder:build-stage-total ${stageName}`);

        if (!buildStageTask.error) {
            if (stageWeight === 1) {
                stageLabel = stages.join(' -> ');
            }
            console.log(`[task:${stageLabel}]: success!`);
        } else {
            console.error(`${stageLabel} package ${options.root} failed!`);
            console.log(`[task:${stageLabel}]: failed!`);
            buildSuccess = false;
            break;
        }
    }
    return buildSuccess ? { code: BuildExitCode.BUILD_SUCCESS, dest: options.root } : { code: BuildExitCode.BUILD_FAILED, reason: 'Build stage task failed!' };
}

function readBuildTaskOptions(root: string): IBuildTaskOption<any> | null {
    const configFile = join(root, BuildGlobalInfo.buildOptionsFileName);
    try {
        if (existsSync(configFile)) {
            return readJSONSync(configFile);
        }
    } catch (error) {
        console.error(error);
        console.error(`Get cache build options form ${configFile} failed! Please build project first.`);
    }
    return null;
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

export async function run(dest: string) {
    // const path = utils.Path.resolveToRaw(dest);
    // TODO 目前仅支持 web 平台，先这样用
    const { run } = await import('./platforms/web-desktop/hooks');
    return await run(dest);
}