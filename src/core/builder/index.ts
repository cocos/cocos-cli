import { existsSync } from "fs";
import { readJSONSync } from "fs-extra";
import i18n from "../base/i18n";
import { BuildExitCode, IBuildCommandOption, IBuildSceneItem, IBuildStageOptions, IBuildTaskOption, IBundleBuildOptions, IExportBuildOptions, IInternalBuildOptions } from "./@types/private";
import { PLATFORMS } from "./share/platforms-options";
import { pluginManager } from "./manager/plugin";
import { formatMSTime, getBuildPath, getCurrentTime, getTaskLogDest } from "./share/utils";
import { newConsole } from "../base/console";
import { join } from "path";
import { assetManager } from "../assets/manager/asset";
import { removeDbHeader } from "./worker/builder/utils";
import builderConfig, { BuildGlobalInfo } from "./share/builder-config";
import engine from "../engine";

export async function build(options: IBuildCommandOption): Promise<BuildExitCode> {
    if (options.configPath) {
        if (!existsSync(options.configPath)) {
            console.error(`${options.configPath} is not exist!`);
            return BuildExitCode.BUILD_FAILED;
        }
        console.debug(`Read config from path ${options.configPath}...`);
        let data = readJSONSync(options.configPath);
        // 功能点：options 传递的值，允许覆盖配置文件内的同属性值
        data = Object.assign(data, options);
        // 避免修改原始 options
        Object.assign(options, data);
        // 移除旧的 key 方便和 configPath 未读取的情况做区分
        delete options.configPath;
    }

    if (!options.platform) {
        console.error('platform is required');
        return BuildExitCode.PARAM_ERROR;
    }
    options.taskId = options.taskId || String(new Date().getTime());
    options.logDest = options.logDest || getTaskLogDest(options.platform, options.taskId);
    options.taskName = options.taskName || options.platform;
    options.engineInfo = options.engineInfo || engine.getInfo();

    if (options.stage === 'bundle') {
        return await buildBundleOnly(options as unknown as IBundleBuildOptions);
    }

    // 单独的编译、生成流程
    if (options.stage && (options.stage !== 'build')) {
        return await executeBuildStageTask(options.taskId, options.stage, options as IBuildStageOptions);
    }
    // 不支持的构建平台不执行构建
    if (!PLATFORMS.includes(options.platform)) {
        console.error(i18n.t('builder.tips.disablePlatformForBuildCommand', {
            platform: options.platform,
        }));
        return BuildExitCode.BUILD_FAILED;
    }

    await builderConfig.init([options.platform]);
    // 启动对应的平台模块注册流程
    await pluginManager.init();
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
                return BuildExitCode.PARAM_ERROR;
            }
            res = rightOptions;
        } catch (error) {
            console.error(error);
            return BuildExitCode.PARAM_ERROR;
        }
    } else {
        // @ts-ignore
        res = options;
    }

    let buildSuccess = true;
    const startTime = Date.now();

    // 显示构建开始信息
    newConsole.buildStart(options.platform);

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
        newConsole.buildComplete(options.platform, duration, buildSuccess);
    } catch (error: any) {
        buildSuccess = false;
        const duration = formatMSTime(Date.now() - startTime);
        newConsole.error(error);
        newConsole.buildComplete(options.platform, duration, false);
    }
    return buildSuccess ? BuildExitCode.BUILD_SUCCESS : BuildExitCode.BUILD_FAILED;
}

export async function buildBundleOnly(bundleOptions: IBundleBuildOptions): Promise<BuildExitCode> {
    const { BundleManager } = await import("./worker/builder/asset-handler/bundle");
    const optionsList = bundleOptions.optionList;
    const buildTaskId = 'buildBundle';
    const weight = 1 / optionsList.length;
    const startTime = Date.now();
    let success = true;

    for (let i = 0; i < optionsList.length; i++) {
        const options = optionsList[i];
        const tasksLabel = options.taskName || 'bundle Build';
        const taskStartTime = Date.now();
        const logDest = getTaskLogDest(options.platform, buildTaskId);

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
    return success ? BuildExitCode.BUILD_SUCCESS : BuildExitCode.BUILD_FAILED;
}

export async function executeBuildStageTask(taskId: string, stageName: string, options: IBuildStageOptions): Promise<BuildExitCode> {
    if (!options.taskName) {
        options.taskName = stageName + ' build';
    }

    const buildOptions = readBuildTaskOptions(options.root);
    if (!buildOptions) {
        return BuildExitCode.PARAM_ERROR;
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
            return BuildExitCode.BUILD_FAILED;
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
    return buildSuccess ? BuildExitCode.BUILD_SUCCESS : BuildExitCode.BUILD_FAILED;
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

export async function getPreviewSettings(buildTaskId: string, options: IInternalBuildOptions) {
    options.preview = true;
    // TODO 预览 settings 的排队之类的
    const { BuildTask } = await import('./worker/builder/index');
    const buildTask = new BuildTask(buildTaskId, options);
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