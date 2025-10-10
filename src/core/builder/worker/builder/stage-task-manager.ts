import { join } from 'path';
import { readJSONSync, emptyDirSync, existsSync, outputJSON } from 'fs-extra';
import { workerManager } from '../worker-pools/sub-process-manager';
import { BuildTaskBase } from './manager/task-base';
import { newConsole } from '../../../base/console';
import { IBuildTaskOption } from '../../@types';
import { IBuildHooksInfo, IBuildStageTask, IBuildStageItem } from '../../@types/protected';
import { BuildGlobalInfo } from '../../share/builder-config';


export interface IBuildStageConfig extends IBuildStageItem {
    root: string;
    hooksInfo: IBuildHooksInfo;
    buildTaskOptions: IBuildTaskOption;
}

export class BuildStageTask extends BuildTaskBase implements IBuildStageTask {
    // 从构建包缓存文件内获取到的构建选项信息
    options!: IBuildTaskOption;
    buildTaskOptions?: IBuildTaskOption;
    hooksInfo: IBuildHooksInfo;
    private root: string;
    hookMap: Record<string, string>;

    constructor(id: string, config: IBuildStageConfig) {
        super(id, config.name);
        this.hooksInfo = config.hooksInfo;
        this.root = config.root;
        this.buildTaskOptions = config.buildTaskOptions;
        // 首字母转为大写后走前后钩子函数流程
        const name = config.name[0].toUpperCase() + config.name.slice(1, config.name.length);
        this.hookMap = {
            [`onBefore${name}`]: `onBefore${name}`,
            [this.name]: this.name,
            [`onAfter${name}`]: `onAfter${name}`,
        };
    }

    public async run() {
        const trickTimeLabel = `// ---- builder:run-build-stage-${this.name} ----`;
        console.debug(trickTimeLabel);
        // 为了保障构建 + 编译或者单独编译的情况都有统计到，直接加在此处
        newConsole.trackTimeStart(trickTimeLabel);
        this.updateProcess('init options success', 0.1);

        emptyDirSync(join(BuildGlobalInfo.projectTempDir, 'builder', 'compile'));

        try {
            for (const taskName of Object.keys(this.hookMap)) {
                await this.runPluginTask(taskName);
            }
        } catch (error) {
            this.error = error as Error;
        }
        await newConsole.trackTimeEnd(trickTimeLabel, { output: true });
        if (this.error) {
            throw this.error;
        }
        return true;
    }

    public break(reason: string) {
        workerManager.killRunningChilds();
        super.break(reason);
    }

    async handleHook(func: Function, internal: boolean) {
        if (internal) {
            await func.call(this, this.root, this.options);
        } else {
            await func(this.root, this.options);
        }
    }

    async saveOptions() {
        await outputJSON(join(this.root, BuildGlobalInfo.buildOptionsFileName), this.options);
    }
}
