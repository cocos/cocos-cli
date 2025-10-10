import { IPluginHookName } from '../../@types/protected';
import { BuildGlobalInfo } from '../../share/builder-config';

// 任务划分管理器，也作为自我调试时的配置
class TaskManager {
    get debug() {
        return this._optionsDebug || BuildGlobalInfo.debugMode;
    }
    public _optionsDebug = false; // 构建参数传入的 debug

    public readonly tasks = {
        dataTasks: [
            'data-task/asset',
            'data-task/script',
        ],
        // 注意先后顺序，不可随意调整，具体参考XXX（TODO）
        buildTasks: [
            // 资源处理，先脚本，后资源，资源包含 Bundle
            'build-task/script',
            'build-task/asset',
        ],
        md5Tasks: [
            // 项目处理
            'postprocess-task/suffix', // TODO 需要允许用户在 md5 注入之前修改内容
        ],
        settingTasks: [
            'setting-task/asset',
            'setting-task/script',
            'setting-task/options',
        ],
        postprocessTasks: [
            'postprocess-task/template',
        ],
    };

    public pluginTasks: Record<IPluginHookName, IPluginHookName> = {
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

    // 定义使用的缓存规则
    public cacheConfig = {
        engine: true,
        settings: false,
        // 'jsb-adapter': true,
    };

    // 任务权重，总和不要超过 1 否则未编译进度已经 100%
    public taskWeight = {
        dataTasks: 0.1,
        buildTasks: 0.1,
        md5Tasks: 0.1,
        settingTasks: 0.05,
        postprocessTasks: 0.05,
        pluginTasks: 0.2,
        bundleTask: 0.3,
    };

    private debugTaskConfig: Record<string, Record<string, boolean>> = {
        dataTasks: {},
        settingTasks: {},
        buildTasks: {},
    };

    // 查询本地存储的 task 配置
    public async init() {
        this.debugTaskConfig.settingTasks['setting-task/cache'] = false;
        this._optionsDebug = false;
    }

    // 获取某一类资源任务
    public getTaskHandle(type: 'dataTasks' | 'settingTasks' | 'buildTasks' | 'md5Tasks' | 'postprocessTasks') {
        if (this.debug) {
            const config = this.debugTaskConfig[type];
            const result: any[] = [];
            this.tasks[type].forEach((name) => {
                if (config[name] === false) {
                    return;
                }
                result.push(require(`./${name}`));
            });
            return result;
        }
        return this.tasks[type].map((name) => require(`./tasks/${name}`));
    }

    public getTaskHandleFromNames(taskNames: string[]) {
        return taskNames.map((name) => require(`./tasks/${name}`));
    }
}

export const taskManager = new TaskManager();
