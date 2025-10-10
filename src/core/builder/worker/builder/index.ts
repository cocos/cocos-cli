'use strict';


import { emptyDirSync, ensureDir, outputFileSync, outputJSONSync } from 'fs-extra';
import { join, relative } from 'path';
import { BuilderAssetCache } from './manager/asset';
import { InternalBuildResult } from './manager/build-result';
import { BuildResult } from './manager/build-result';
import { taskManager } from './task-config';
import { BuildStageTask } from './stage-task-manager';
import { workerManager } from '../worker-pools/sub-process-manager';
import { BundleManager } from './asset-handler/bundle';
import { ResolutionPolicy } from 'cc';
import { BuildTaskBase } from './manager/task-base';
import { defaultsDeep, formatMSTime, getBuildPath } from '../../share/utils';
import { BuildTemplate } from './manager/build-template';
import { newConsole } from '../../../base/console';
import { ITaskResultMap } from '../../@types/builder';
import { IBuilder, IInternalBuildOptions, IBuildHooksInfo, IBuildTask, IPluginHookName, IBuildTaskOption } from '../../@types/protected';
import { assetDBManager } from '../../../assets/manager/asset-db';
import Utils from '../../../base/utils';
import { pluginManager } from '../../manager/plugin';
import i18n from '../../../base/i18n';
import { checkProjectSetting } from '../../share/common-options-validator';

export class BuildTask extends BuildTaskBase implements IBuilder {
    public cache: BuilderAssetCache;

    public result: InternalBuildResult;
    public buildTemplate!: BuildTemplate;

    // 对外部插件提供的构建结果
    public buildResult?: BuildResult;

    public options: IInternalBuildOptions;

    public hooksInfo: IBuildHooksInfo;

    // 数据整理任务
    public dataTasks: IBuildTask[];

    // setting 生成整理任务
    public settingTasks: IBuildTask[];

    public postprocessTasks?: IBuildTask[];

    public buildTasks?: IBuildTask[];

    private md5Tasks?: IBuildTask[];

    private dbPauseNoticeId?: number;

    // 构建主流程任务权重，随着其他阶段性任务的加入可能会有变化
    private mainTaskWeight = 1;

    // 是否为命令行构建
    static isCommandBuild = false;

    private currentStageTask?: BuildStageTask;

    public bundleManager!: BundleManager;

    public hookMap: Record<IPluginHookName, IPluginHookName> = {
        onBeforeBuild: 'onBeforeBuild',
        onBeforeInit: 'onBeforeInit',
        onAfterInit: 'onAfterInit',
        onBeforeBuildAssets: 'onBeforeBuildAssets',
        onAfterBuildAssets: 'onAfterBuildAssets',
        onBeforeCompressSettings: 'onBeforeCompressSettings',
        onAfterCompressSettings: 'onAfterCompressSettings',
        onAfterBuild: 'onAfterBuild',
        onBeforeCopyBuildTemplate: 'onBeforeCopyBuildTemplate',
        onAfterCopyBuildTemplate: 'onAfterCopyBuildTemplate',
        onError: 'onError',
    };

    // 执行整个构建流程的顺序流程
    public pipeline: (string | Function | IBuildTask[])[] = [];

    /**
     * 构建任务的结果缓存，只允许接口访问
     */
    private taskResMap: ITaskResultMap = {};


    constructor(id: string, options: IBuildTaskOption) {
        super(id, 'build');
        this.dataTasks = taskManager.getTaskHandle('dataTasks');
        this.settingTasks = taskManager.getTaskHandle('settingTasks');
        this.hooksInfo = pluginManager.getHooksInfo(options.platform);
        // TODO 补全 options 为 IInternalBuildOptions
        this.options = options as IInternalBuildOptions;

        this.cache = new BuilderAssetCache(this);
        this.result = new InternalBuildResult(this, !!options.preview);

        if (options.preview || options.buildMode === 'bundle') {
            return;
        }
        this.result.addListener('updateProcess', (message: string) => {
            this.updateProcess(message);
        });
        this.buildTasks = taskManager.getTaskHandle('buildTasks');
        this.options.md5Cache && (this.md5Tasks = taskManager.getTaskHandle('md5Tasks'));
        this.postprocessTasks = taskManager.getTaskHandle('postprocessTasks');
        this.buildResult = new BuildResult(this);
        if (this.options.nextStages) {
            // 当存在阶段性任务时，构建主流程的权重降级
            this.mainTaskWeight = 1 / (this.options.nextStages.length + 1);
        }
        this.hookWeight = this.mainTaskWeight * taskManager.taskWeight.pluginTasks;
        this.buildTemplate = new BuildTemplate(this.options.platform, this.options.taskName, pluginManager.getBuildTemplateConfig(this.options.platform));

        // TODO
        // this.pipeline = [
        //     this.hookMap.onBeforeBuild,
        //     this.lockAssetDB,
        //     this.hookMap.onBeforeInit,
        //     this.init,
        //     this.hookMap.onAfterInit,
        //     this.initBundleManager,
        //     this.dataTasks,
        //     this.buildTasks,
        //     this.hookMap.onAfterBuildAssets,
        //     this.md5Tasks,
        //     this.settingTasks,
        //     this.hookMap.onBeforeCompressSettings,
        //     this.postprocessTasks,
        //     this.hookMap.onAfterCompressSettings,
        //     this.hookMap.onAfterBuild,
        // ];
    }

    public get stage() {
        if (!this.currentStageTask) {
            return 'build';
        }
        return this.currentStageTask.name;
    }

    /**
     * 获取某个任务结果
     * @param name
     */
    public getTaskResult(name: keyof ITaskResultMap) {
        return this.taskResMap[name];
    }

    /**
     * 开始整理构建需要的参数
     */
    public async init() {
        // TODO 所有类似的新流程，都应该走统一的 runBuildTask 处理，否则可能无法中断
        if (this.error) {
            return;
        }
        console.debug('Query all assets info in project');
        await taskManager.init();
        await this.initOptions();

        // 清空所有资源缓存
        cc.assetManager.releaseAll();
        await this.cache.init();
    }

    /**
     * 执行具体的构建任务
     */
    public async run() {
        const { dir } = this.result.paths;
        if (!dir) {
            console.error('No output path can be built.');
            return false;
        }

        if (this.options.buildMode === 'bundle') {
            await this.buildBundleOnly();
            return true;
        }
        await ensureDir(this.result.paths.dir);
        // 允许插件在 onBeforeBuild 内修改 useCache
        await this.runPluginTask(taskManager.pluginTasks.onBeforeBuild);
        if (!this.options.useCache) {
            // 固定清理工程的时机，请勿改动以免造成不必要的插件兼容问题
            emptyDirSync(this.result.paths.dir);
        }
        await this.lockAssetDB();
        await this.runPluginTask(taskManager.pluginTasks.onBeforeInit);
        await this.init();
        await this.runPluginTask(taskManager.pluginTasks.onAfterInit);

        await this.initBundleManager();

        await this.bundleManager.runPluginTask(this.bundleManager.hookMap.onBeforeBundleDataTask);
        // 开始执行预制任务
        await this.runBuildTask(this.dataTasks, taskManager.taskWeight.dataTasks);
        await this.bundleManager.runPluginTask(this.bundleManager.hookMap.onAfterBundleDataTask);

        await this.runPluginTask(taskManager.pluginTasks.onBeforeBuildAssets);
        await this.bundleManager.runPluginTask(this.bundleManager.hookMap.onBeforeBundleBuildTask);
        // 开始执行构建任务
        await this.runBuildTask(this.buildTasks!, taskManager.taskWeight.buildTasks);
        await this.bundleManager.runPluginTask(this.bundleManager.hookMap.onAfterBundleBuildTask);
        await this.runPluginTask(taskManager.pluginTasks.onAfterBuildAssets);

        await this.runBuildTask(this.settingTasks, taskManager.taskWeight.settingTasks);
        await this.runPluginTask(taskManager.pluginTasks.onBeforeCompressSettings);
        await this.runBuildTask(this.postprocessTasks!, taskManager.taskWeight.postprocessTasks);
        await this.runPluginTask(taskManager.pluginTasks.onAfterCompressSettings);
        await this.runPluginTask(taskManager.pluginTasks.onBeforeCopyBuildTemplate);
        // 拷贝自定义模板
        await this.buildTemplate!.copyTo(this.result.paths.output);
        await this.runPluginTask(taskManager.pluginTasks.onAfterCopyBuildTemplate);
        // MD5 处理
        this.md5Tasks && (await this.runBuildTask(this.md5Tasks, taskManager.taskWeight.md5Tasks));
        // 构建进程结束之前
        await this.runPluginTask(taskManager.pluginTasks.onAfterBuild);
        await this.postBuild();
        this.options.nextStages && (await this.handleBuildStageTask(this.options.nextStages));
        return true;
    }

    /**
     * 仅构建 Bundle 流程
     */
    public async buildBundleOnly() {
        await this.lockAssetDB();
        // 走构建任务的仅 Bundle 构建模式也需要执行 init 前后钩子，因为此时需要保障包完整
        // 不执行一些选项的修改可能没有同步到
        await this.runPluginTask(taskManager.pluginTasks.onBeforeInit);
        await this.init();
        await this.runPluginTask(taskManager.pluginTasks.onAfterInit);
        this.bundleManager = await BundleManager.create(this.options, this);
        this.bundleManager.options.dest = this.result.paths.assets;
        this.bundleManager.destDir = this.result.paths.assets;
        this.bundleManager.updateProcess = (message, progress: number) => {
            this.updateProcess(message, progress - this.bundleManager.progress);
        };
        await this.bundleManager.run();
        await this.runBuildTask(taskManager.getTaskHandleFromNames([
            'setting-task/cache',
            'setting-task/asset',
            'setting-task/script',
        ]), taskManager.taskWeight.postprocessTasks);
        const bundles = this.bundleManager.bundles.filter((bundle) => bundle.output).sort((a, b) => a.name.localeCompare(b.name));
        if (this.options.md5Cache) {
            for (const bundle of bundles) {
                this.result.settings.assets.bundleVers[bundle.name] = bundle.version;
            }
        }
        // 生成 settings.json
        const content = JSON.stringify(this.result.settings, null, this.options.debug ? 4 : 0);
        outputFileSync(this.result.paths.settings, content, 'utf8');
        await this.unLockAssetDB();
    }

    private async postBuild() {

        this.unLockAssetDB();

        if (this.options.generateCompileConfig) {
            // 保存当前的 options 到实际包内，作为后续编译参数也为将来制作仅构建引擎等等处理做备份
            outputJSONSync(this.result.paths.compileConfig, this.result.compileOptions || this.options);
        }
        // 统计流程放在最后，避免出错时干扰其他流程
        // 追踪构建时长，统计构建错误，发送统计消息
        const totalTime = await newConsole.trackTimeEnd('builder:build-project-total', { output: true });
        console.debug(`build task(${this.options.taskName}) in ${totalTime}!`);
    }

    private async handleBuildStageTask(stages: string[]) {
        const stageWeight = 1 - this.mainTaskWeight;
        for (const taskName of stages) {
            const stageConfig = pluginManager.getBuildStageWithHookTasks(this.options.platform, taskName);
            if (!stageConfig) {
                this.updateProcess(`No stage task: ${taskName} in platform ${this.options.platform}, please check your build options`, stageWeight);
                continue;
            }
            // HACK 目前原生平台钩子函数修改了 result.paths.dir 因而构建路径需要自行重新拼接
            const root = getBuildPath(this.options);
            const buildStageTask = new BuildStageTask(this.id, {
                ...stageConfig,
                hooksInfo: this.hooksInfo,
                root,
                buildTaskOptions: this.options,
            });
            this.currentStageTask = buildStageTask;
            buildStageTask.on('update', (message: string, increment: number) => {
                this.updateProcess(message, increment * stageWeight);
            });
            await buildStageTask.run();
            if (this.error) {
                await this.onError(this.error);
                return;
            } else if (buildStageTask.error) {
                this.error = buildStageTask.error;
                return;
            }
        }
    }

    private async initBundleManager() {
        // TODO 所有类似的新流程，都应该走统一的 runBuildTask 处理，否则可能无法中断
        if (this.error) {
            await this.onError(this.error);
            return;
        }
        this.bundleManager = await BundleManager.create(this.options, this);
        this.bundleManager.options.dest = this.result.paths.assets;
        this.bundleManager.destDir = this.result.paths.assets;
        if (this.options.preview) {
            await this.bundleManager.initOptions();
        } else {
            this.bundleManager.updateProcess = (message: string, progress: number) => {
                this.updateProcess(message, progress - this.bundleManager.progress);
            };
        }
        await this.bundleManager.runPluginTask(this.bundleManager.hookMap.onBeforeBundleInit);
        await this.bundleManager.initBundle();
        await this.bundleManager.runPluginTask(this.bundleManager.hookMap.onAfterBundleInit);

    }

    public break(reason: string) {
        workerManager.killRunningChilds();
        this.unLockAssetDB();
        this.bundleManager && this.bundleManager.break(reason);
        if (this.currentStageTask) {
            // 这里不需要等待，break 触发一下即可，后续有抛异常会被正常捕获
            this.currentStageTask.break(reason);
        }

        this.onError(new Error(`Build task ${this.options.taskName || this.options.outputName} is break!`), false);
    }

    public async lockAssetDB() {
        // TODO 所有类似的新流程，都应该走统一的 runBuildTask 处理，否则可能无法中断
        this.updateProcess('Start lock asset db...');
        await assetDBManager.pause('build');
    }

    public unLockAssetDB() {
        assetDBManager.resume();
    }

    /**
     * 获取预览 settings 信息
     */
    public async getPreviewSettings() {
        try {
            await this.init();
            this.result.settings.engine.engineModules = this.options.includeModules;
            this.dataTasks = taskManager.getTaskHandle('dataTasks');
            await this.initBundleManager();
            // 开始执行预制任务
            await this.runBuildTask(this.dataTasks, taskManager.taskWeight.dataTasks);
            await this.runBuildTask(this.settingTasks, taskManager.taskWeight.settingTasks);
            return this.result.settings;
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    private async initOptions() {
        this.options.platformType = pluginManager.platformConfig[this.options.platform].platformType;
        this.options.md5CacheOptions = this.options.md5CacheOptions || {
            excludes: [],
            includes: [],
            replaceOnly: [],
            handleTemplateMd5Link: false,
        };
        await checkProjectSetting(this.options);

        // TODO 支持传参直接传递 resolution
        this.options.resolution = {
            width: this.options.designResolution.width,
            height: this.options.designResolution.height,
            policy: ResolutionPolicy.SHOW_ALL,
        };

        const resolution = this.options.resolution;
        if (this.options.designResolution.fitHeight) {
            if (this.options.designResolution.fitWidth) {
                resolution.policy = ResolutionPolicy.SHOW_ALL;
            } else {
                resolution.policy = ResolutionPolicy.FIXED_HEIGHT;
            }
        } else {
            if (this.options.designResolution.fitWidth) {
                resolution.policy = ResolutionPolicy.FIXED_WIDTH;
            } else {
                resolution.policy = ResolutionPolicy.NO_BORDER;
            }
        }

        // 处理自定义管线的相关逻辑，项目设置交互已处理过的主要是为了场景环境，构建需要再次确认，避免模块有出入
        const CUSTOM_PIPELINE_NAME = this.options.macroConfig.CUSTOM_PIPELINE_NAME;
        if (this.options.customPipeline) {
            const legacyPipelineIndex = this.options.includeModules.findIndex((module: string) => module === 'legacy-pipeline');
            if (legacyPipelineIndex !== -1) {
                this.options.includeModules.splice(legacyPipelineIndex, 1);
            }
            !this.options.includeModules.includes('custom-pipeline') && this.options.includeModules.push('custom-pipeline');
            // 使用了内置管线的情况下, 添加 custom-pipeline-builtin-scripts 模块方能打包对应的脚本
            if (CUSTOM_PIPELINE_NAME === 'Builtin' || !CUSTOM_PIPELINE_NAME) {
                this.options.includeModules.push('custom-pipeline-builtin-scripts');
            }
        } else {
            const customPipelineIndex = this.options.includeModules.findIndex((module: string) => module === 'custom-pipeline');
            if (customPipelineIndex !== -1) {
                this.options.includeModules.splice(customPipelineIndex, 1);
            }
            !this.options.includeModules.includes('legacy-pipeline') && this.options.includeModules.push('legacy-pipeline');
        }
        if (this.options.preview) {
            return;
        }
        this.options.appTemplateData = {
            debugMode: this.options.debug,
            renderMode: false, // !!options.renderMode,
            showFPS: this.options.debug,
            resolution,
            md5Cache: this.options.md5Cache,
            cocosTemplate: '',
        };
        this.options.buildEngineParam = {
            entry: this.options.engineInfo.typescript.path,
            debug: this.options.debug,
            mangleProperties: this.options.mangleProperties,
            inlineEnum: this.options.inlineEnum,
            sourceMaps: this.options.sourceMaps,
            includeModules: this.options.includeModules,
            engineVersion: this.options.engineInfo.version,
            // 参与影响引擎复用规则的参数 key
            md5Map: [],
            engineName: 'cocos-js',
            output: join(this.result.paths.dir, 'cocos-js'),
            platformType: this.options.platformType,
            useCache: this.options.useCacheConfig?.engine === false ? false : true,
            nativeCodeBundleMode: this.options.nativeCodeBundleMode,
            wasmCompressionMode: this.options.wasmCompressionMode,
        };

        this.options.buildScriptParam = {
            experimentalEraseModules: this.options.experimentalEraseModules,
            outputName: 'project',
            flags: {
                DEBUG: !!this.options.debug,
                ...this.options.flags,
            },
            polyfills: this.options.polyfills,
            hotModuleReload: false,
            platform: this.options.platformType,
            commonDir: '',
            bundleCommonChunk: this.options.bundleCommonChunk ?? false,
            targets: this.options.buildScriptTargets,
        };

        if (this.options.polyfills) {
            this.options.polyfills.targets = this.options.buildScriptTargets;
        } else {
            this.options.polyfills = {
                targets: this.options.buildScriptTargets,
            };
        }

        this.options.assetSerializeOptions = {
            'cc.EffectAsset': {
                glsl1: this.options.includeModules.includes('gfx-webgl'),
                glsl3: this.options.includeModules.includes('gfx-webgl2'),
                glsl4: false,
            },
        };

        if (!taskManager.cacheConfig.engine) {
            // @ts-ignore
            this.options.compileEngineForce = true;
        }
    }

    /**
     * 执行某个任务列表
     * @param buildTasks 任务列表数组
     * @param weight 全部任务列表所占权重
     * @param args 需要传递给任务的其他参数
     */
    private async runBuildTask(buildTasks: IBuildTask[], weight: number, ...args: any) {
        weight = this.mainTaskWeight * weight / buildTasks.length;
        // 开始执行预制任务
        for (let i = 0; i < buildTasks.length; i++) {
            if (this.error) {
                this.onError(this.error);
                return;
            }
            const task = buildTasks[i];
            const taskTitle = await transTitle(task.title);
            const trickTimeLabel = `// ---- build task ${taskTitle} ----`;
            newConsole.trackTimeStart(trickTimeLabel);
            this.updateProcess(taskTitle + ' start');
            console.debug(trickTimeLabel);
            newConsole.trackMemoryStart(taskTitle);
            try {
                const result = await task.handle.call(this, this.options, this.result, this.cache, ...args);
                // @ts-ignore
                task.name && result && (this.taskResMap[task.name] = result);
                const time = await newConsole.trackTimeEnd(trickTimeLabel, { output: true });
                this.updateProcess(`run build task ${taskTitle} success in ${formatMSTime(time)}√`, weight, 'log');
            } catch (error: any) {
                newConsole.trackMemoryEnd(taskTitle);
                this.updateProcess(`run build task ${taskTitle} failed!`, weight, 'error');
                await this.onError(error, true);
                return;
            }
            newConsole.trackMemoryEnd(taskTitle);
        }
    }

    async handleHook(func: Function, internal: boolean, ...args: any[]) {
        if (internal) {
            await func.call(this, this.options, this.result, this.cache, ...args);
        } else {
            await func(this.result.rawOptions, this.buildResult, ...args);
        }
    }

    onError(error: Error, throwError = true) {
        this.error = error;
        this.bundleManager && (this.bundleManager.error = error);
        if (throwError) {
            throw error;
        }
    }

    async runErrorHook() {
        try {
            const funcName = 'onError';
            for (const pkgName of this.hooksInfo.pkgNameOrder) {
                const info = this.hooksInfo.infos[pkgName];
                let hooks: any;
                const timeLabel = `${pkgName}:(${funcName})`;
                try {
                    hooks = Utils.File.requireFile(info.path);
                    if (hooks[funcName]) {
                        this.updateProcess(`${timeLabel} start...`);
                        console.debug(`// ---- ${pkgName}:(${funcName}) ----`);
                        newConsole.trackMemoryStart(timeLabel);
                        if (info.internal) {
                            await hooks[funcName].call(this, this.options, this.result, this.cache);
                        } else {
                            // @ts-ignore
                            await hooks[funcName](this.result.rawOptions, this.buildResult);
                        }
                        newConsole.trackMemoryEnd(timeLabel);
                        console.debug(`// ---- ${pkgName}:(${funcName}) success ----`);
                        this.updateProcess(`${pkgName}:(${funcName})`);
                    }
                } catch (error: any) {
                    newConsole.trackMemoryEnd(timeLabel);
                    // @ts-ignore
                    console.error((new BuildError(`Run build plugin ${pkgName}:(${funcName}) failed!`)).stack);
                }
            }
            await this.postBuild();
        } catch (error) {
            console.debug(error);
        }
    }
}

/**
 * 翻译 title
 * @param title 原始 title 或者带有 i18n 开头的 title
 */
function transTitle(title: string): string {
    if (typeof title !== 'string') {
        return '';
    }
    if (title.startsWith('i18n:')) {
        title = title.replace('i18n:', '');
        if (!i18n.t(`${title}`)) {
            console.debug(
                `${i18n.t('builder.warn.no_defined_in_i18n', {
                    name: title,
                })}`,
            );
        }
        return i18n.t(`${title}`) || title;
    }
    return title;
}

class BuildError {
    message: string;
    constructor(msg: string) {
        Error.captureStackTrace(this, BuildError);
        this.message = msg;
    }
}
