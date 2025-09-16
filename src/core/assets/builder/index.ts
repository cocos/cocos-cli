import { existsSync } from "fs";
import { readJSONSync } from "fs-extra";
import i18n from "../../base/i18n";
import { BuildExitCode, IBuildSceneItem, IBuildStageOptions, IBuildTaskOption, IBundleBuildOptions, IExportBuildOptions, IInternalBuildOptions } from "./@types/private";
import { PLATFORMS } from "./share/platforms-options";
import { pluginManager } from "./manager/plugin";
import { formatMSTime, getBuildPath, getCurrentTime, getTaskLogDest } from "./share/utils";
import { newConsole } from "../../base/console";
import { join } from "path";
import { BuildGlobalInfo } from "./share/global";
import { assetManager } from "../manager";
import { removeDbHeader } from "./worker/builder/utils";
import { BundleManager } from "./worker/builder/asset-handler/bundle";

export interface IBuildCommandOption extends IExportBuildOptions {
    configPath?: string;
    logDest?: string; // 日志输出地址
    migrate?: boolean; // 是否迁移传入的构建参数，默认开启
    stage?: string; // 构建阶段指定，默认为 build 可指定为 make/run 等
    root?: string;
    projectSettingsPath?: string; // 导出的项目设置文件地址
    skipCheck?: boolean; // 跳过参数的检查流程
}

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
    options.taskId = options.taskId || String(new Date().getTime());
    options.logDest = options.logDest || getTaskLogDest(options.platform, options.taskId);
    if (options.stage === 'bundle') {
        return await buildBundleOnly(options as unknown as IBundleBuildOptions);
    }

    // 单独的编译、生成流程
    if (options.stage && (options.stage !== 'build')) {
        return await executeBuildStageTask(options.taskId, options.stage, options as IBuildStageOptions);
    }
    // 不支持的构建平台不执行构建
    if (PLATFORMS.includes(options.platform)) {
        console.error(i18n.t('builder.tips.disablePlatformForBuildCommand', {
            platform: options.platform,
        }));
        return BuildExitCode.BUILD_FAILED;
    }

    // 启动对应的平台模块注册流程
    await pluginManager.init([options.platform])
    // 命令行构建前，补全项目配置数据
    // await checkProjectSettingsBeforeCommand(options);
    let res: undefined | IBuildTaskOption;
    if (!options.skipCheck) {
        try {
            // 校验插件选项
            res = await pluginManager.checkOptions(options);
        } catch (error) {
            console.error(error);
            return BuildExitCode.PARAM_ERROR;
        }
        if (!res) {
            console.error(i18n.t('builder.error.check_options_failed'));
            return BuildExitCode.PARAM_ERROR;
        }
    } else {
        res = options;
    }



    newConsole.record(getTaskLogDest(options.platform, options.taskId));
    let buildSuccess = true;

    try {
        const { BuildTask } = await import('./worker/builder');
        const builder = new BuildTask(options.taskId, res);
        await builder.run();
        buildSuccess = !builder.error;
    } catch (error) {
        buildSuccess = false;
        console.error(error);
    }
    newConsole.stopRecord();

    return BuildExitCode.BUILD_SUCCESS;
}

export async function buildBundleOnly(bundleOptions: IBundleBuildOptions): Promise<BuildExitCode> {

    const optionsList = bundleOptions.optionList;
    const buildTaskId = 'buildBundle';
    const weight = 1 / optionsList.length;
    const startTime = Date.now();
    let success = true;
    for (let i = 0; i < optionsList.length; i++) {
        const options = optionsList[i];
        const tasksLabel = options.taskName || 'bundle Build';
        const startTime = Date.now();
        const logDest = getTaskLogDest(options.platform, buildTaskId);
        try {
            newConsole.record(logDest);
            console.debug(`=================================== ${tasksLabel} Task (${options.platform}) Start ================================`);
            console.debug('Start build task, options:', options);
            newConsole.trackMemoryStart(`builder:build-bundle-total`);
            const builder = new BundleManager(options);
            builder.on('update', (message: string, progress: number) => {
                console.log('build-worker:update-progress', buildTaskId, (progress + i) * weight, 'processing', message);
            });
            await builder.run();
            newConsole.trackMemoryEnd(`builder:build-bundle-total`);
            console.log(`${tasksLabel} (${options.platform}) in {link(${builder.destDir})} success!`);
            success = !builder.error;
            if (builder.error) {
                const errorMsg = typeof builder.error == 'object' ? (builder.error.stack || builder.error.message) : builder.error;
                console.error(getCurrentTime() + ` ${tasksLabel} failed! ` + errorMsg);
                success = false;
            } else {
                console.debug(getCurrentTime() + `Build Bundle success in ${formatMSTime(Date.now() - startTime)}!`);
            }
        } catch (error: any) {
            success = false;
            console.error(error);
        }
        console.debug(`================================ ${tasksLabel} Task (${options.taskName}) Finished in (${formatMSTime(Date.now() - startTime)})ms ================================`);
    }
    console.log(getCurrentTime() + `Build Bundle success in ${formatMSTime(Date.now() - startTime)}!`);
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
        await buildStageTask.run();
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
    return BuildExitCode.BUILD_SUCCESS;

}

function readBuildTaskOptions(root: string): IBuildTaskOption | null {
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