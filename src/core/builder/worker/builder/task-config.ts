import { IBuildTask, IPluginHookName } from '../../@types/protected';

type TaskType = 'dataTasks' | 'settingTasks' | 'buildTasks' | 'md5Tasks' | 'postprocessTasks' | string;

export class TaskManager {

    private static readonly tasks: Record<TaskType, string[]> = {
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

    static readonly pluginTasks: Record<IPluginHookName, IPluginHookName> = {
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

    private static buildTaskMap: Record<TaskType, IBuildTask[]> = {
        dataTasks: [],
        settingTasks: [],
        buildTasks: [],
        md5Tasks: [],
        postprocessTasks: [],
    };

    activeTasks: Set<TaskType> = new Set();

    get taskWeight() {
        return 1 / this.activeTasks.size;
    }

    // 获取某一类资源任务
    public static getBuildTask(type: TaskType) {
        if (!this.buildTaskMap[type]) {
            return this.buildTaskMap[type];
        }
        return this.buildTaskMap[type] = TaskManager.tasks[type].map((name) => require(`./tasks/${name}`));
    }

    public static getTaskHandleFromNames(taskNames: string[]) {
        return taskNames.map((name) => require(`./tasks/${name}`));
    }

    public static getCustomTaskName(name: string) {
        return 'custom-task' + name;
    }

    public activeTask(type: TaskType) {
        this.activeTasks.add(type);
        return TaskManager.getBuildTask(type);
    }

    public activeCustomTask(name: string, taskNames: string[]) {
        const type = TaskManager.getCustomTaskName(name);
        // 自定义任务如果不可以复用缓存
        delete TaskManager.tasks[type];
        this.activeTasks.add(type);
        return TaskManager.buildTaskMap[type] = TaskManager.getTaskHandleFromNames(taskNames);
    }

}
