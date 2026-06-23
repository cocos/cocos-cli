import EventEmitter from 'events';
import { newConsole } from '../../../../base/console';
import { IBuildOptionBase, IConsoleType } from '../../../@types';
import { BuildExitCode, IBuildHooksInfo, IBuildResultSuccess } from '../../../@types/protected';
import Utils from '../../../../base/utils';
import i18n from '../../../../base/i18n';

const PROGRESS_HEARTBEAT_INTERVAL = 60 * 1000;
const PROGRESS_HEARTBEAT_MAX_RATIO = 0.9;
const PROGRESS_HEARTBEAT_MAX_STEP = 0.01;
const PROGRESS_HEARTBEAT_MIN_STEP = 0.001;
const PROGRESS_HEARTBEAT_STEP_RATIO = 0.25;
const PROGRESS_HEARTBEAT_MAX_DISPLAY = 0.99;

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
    protected progressHeartbeatEnabled = true;
    public buildExitRes: IBuildResultSuccess = {
        code: BuildExitCode.BUILD_SUCCESS,
        dest: '',
        custom: {},
    };
    private progressHeartbeatTimer?: ReturnType<typeof setTimeout>;
    private lastProgressMessage = '';
    private displayProgress = 0;
    private heartbeatProgressMax = 0;

    constructor(id: string, name: string) {
        super();
        this.name = name;
        this.id = id;
    }

    public break(reason: string) {
        this.breakReason = reason;
        this.error = new Error('task is break by reason: ' + reason + '!');
        this.stopProgressHeartbeat();
    }

    onError(error: Error, throwError = true) {
        this.error = error;
        this.stopProgressHeartbeat();
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
        if (increment) {
            this.progress = Utils.Math.clamp01(this.progress + increment);
            this.displayProgress = Math.max(this.displayProgress, this.progress);
            this.heartbeatProgressMax = this.progress;
        } else {
            this.syncDisplayProgress();
        }
        this.lastProgressMessage = message;
        this.emitProgressUpdate(message, outputType);
        this.scheduleProgressHeartbeat();
    }

    protected startProgressStep(message: string, stepWeight: number, outputType: IConsoleType = 'debug') {
        this.lastProgressMessage = message;
        this.prepareProgressHeartbeat(stepWeight);
        this.emitProgressUpdate(message, outputType);
        this.scheduleProgressHeartbeat();
    }

    protected stopProgressHeartbeat() {
        if (this.progressHeartbeatTimer) {
            clearTimeout(this.progressHeartbeatTimer);
            this.progressHeartbeatTimer = undefined;
        }
    }

    private scheduleProgressHeartbeat() {
        this.stopProgressHeartbeat();
        if (!this.progressHeartbeatEnabled) {
            return;
        }
        if (this.error || this.breakReason) {
            return;
        }
        this.progressHeartbeatTimer = setTimeout(() => {
            this.emitProgressHeartbeat();
        }, PROGRESS_HEARTBEAT_INTERVAL);
        this.progressHeartbeatTimer.unref?.();
    }

    private emitProgressHeartbeat() {
        this.progressHeartbeatTimer = undefined;
        if (this.error || this.breakReason) {
            return;
        }
        const message = this.lastProgressMessage
            ? `Still running: ${this.lastProgressMessage}`
            : `Still running: ${this.name}`;
        this.displayProgress = this.getNextHeartbeatProgress();
        this.emitProgressUpdate(message, 'debug');
        this.scheduleProgressHeartbeat();
    }

    protected prepareProgressHeartbeat(stepWeight: number) {
        this.syncDisplayProgress();
        const safeStepWeight = Math.max(stepWeight || 0, 0);
        this.heartbeatProgressMax = Utils.Math.clamp01(this.progress + safeStepWeight * PROGRESS_HEARTBEAT_MAX_RATIO);
    }

    private syncDisplayProgress() {
        this.displayProgress = Math.max(this.displayProgress, this.progress);
    }

    private emitProgressUpdate(message: string, outputType: IConsoleType) {
        const progress = this.displayProgress;
        this.emit('update', message, progress);

        const percentage = Math.round(progress * 100);
        newConsole[outputType](`${message} (${percentage}%)`);
    }

    private getNextHeartbeatProgress() {
        const maxProgress = Math.min(this.heartbeatProgressMax, PROGRESS_HEARTBEAT_MAX_DISPLAY);
        const restProgress = maxProgress - this.displayProgress;
        if (restProgress <= 0) {
            return this.displayProgress;
        }
        const heartbeatIncrement = Math.max(
            Math.min(restProgress * PROGRESS_HEARTBEAT_STEP_RATIO, PROGRESS_HEARTBEAT_MAX_STEP),
            PROGRESS_HEARTBEAT_MIN_STEP,
        );
        return Math.min(this.displayProgress + heartbeatIncrement, maxProgress);
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
                    this.prepareProgressHeartbeat(increment);
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
