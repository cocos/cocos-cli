import EventEmitter from 'events';
import { newConsole } from '../../../../base/console';
import { IBuildOptionBase, IConsoleType } from '../../../@types';
import { BuildExitCode, IBuildHooksInfo, IBuildResultSuccess } from '../../../@types/protected';
import Utils from '../../../../base/utils';
import i18n from '../../../../base/i18n';

export abstract class BuildTaskBase extends EventEmitter {
    // break 原因
    public breakReason?: string;
    public name: string;
    public progress = 0;
    public error?: Error;
    public abstract hooksInfo: IBuildHooksInfo;
    public abstract options: IBuildOptionBase;
    public abstract hookMap: Record<string, string>;
    public hookWeight = 0.4;
    public id: string;
    public buildExitRes: IBuildResultSuccess = {
        code: BuildExitCode.BUILD_SUCCESS,
        dest: '',
        custom: {},
    };

    constructor(id: string, name: string) {
        super();
        this.name = name;
        this.id = id;
    }

    public break(reason: string) {
        this.breakReason = reason;
        this.error = new Error('task is break by reason: ' + reason + '!');
    }

    onError(error: Error, throwError = true) {
        this.error = error;
        if (throwError) {
            throw error;
        }
    }

    /**
     * 更新进度消息 log
     * @param message 
     * @param increment 
     * @param outputType 
     */
    public updateProcess(message: string, increment = 0, outputType: IConsoleType = 'debug') {
        increment && (this.progress = Utils.Math.clamp01(this.progress + increment));
        this.emit('update', message, this.progress);

        const percentage = Math.round(this.progress * 100);
        const progressMessage = `${message} (${percentage}%)`;
        newConsole[outputType](progressMessage);
    }

    abstract handleHook(func: Function, internal: boolean, ...args: any[]): Promise<void>;
    abstract run(): Promise<boolean>;

    public async runPluginTask(funcName: string, weight?: number) {
        // 预览 settings 不执行任何构建的钩子函数
        if (!Object.keys(this.hookMap).length || this.error || this.options?.preview) {
            return;
        }
        const increment = this.hookWeight / Object.keys(this.hookMap).length;
        for (let i = 0; i < this.hooksInfo.pkgNameOrder.length; i++) {
            if (this.error) {
                this.onError(this.error);
                return;
            }
            const pkgName = this.hooksInfo.pkgNameOrder[i];
            const info = this.hooksInfo.infos[pkgName];
            let hooks: any;
            try {
                const trickTimeLabel = `// ---- build task ${pkgName}：${funcName} ----`;
                newConsole.trackTimeStart(trickTimeLabel);
                hooks = Utils.File.requireFile(info.path);
                if (hooks[funcName]) {
                    // 使用新的 console 方法显示插件任务开始
                    newConsole.pluginTask(pkgName, funcName, 'start');
                    console.debug(trickTimeLabel);
                    await this.handleHook(hooks[funcName], info.internal);
                    const time = newConsole.trackTimeEnd(trickTimeLabel, { output: true });
                    // 使用新的 console 方法显示插件任务完成
                    newConsole.pluginTask(pkgName, funcName, 'complete', `${time}ms`);
                    this.updateProcess(`${pkgName}:${funcName} completed ✓`, increment, 'success');
                }
            } catch (error) {
                const errorMsg = i18n.t('builder.error.run_hooks_failed', {
                    pkgName,
                    funcName,
                });
                // 使用新的 console 方法显示插件任务错误
                newConsole.pluginTask(pkgName, funcName, 'error');
                this.updateProcess(errorMsg, increment, 'error');
                this.updateProcess(String(error), increment, 'error');
                if (hooks && hooks.throwError || info.internal) {
                    this.onError(error as Error);
                }
            }
        }
    }
}