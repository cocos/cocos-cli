import { fork, ChildProcess } from 'child_process';
import path from 'path';
import { EventEmitter } from 'events';
import { SceneProcessEventTag, SceneReadyChannel } from '../common';
import { Rpc } from './rpc';
import { getServerUrl } from '../../../server';
import { listenModuleMessages } from './messages';

export interface ISceneWorkerEvents {
    'restart': boolean,
}

export class SceneWorker {

    static ExitWorkerEvent = 'scene-process:exit';

    private _process: ChildProcess | null = null;
    public get process(): ChildProcess {
        if (!this._process) {
            throw new Error('Scene worker 未初始化, 请使用 sceneWorker.start');
        }
        return this._process;
    }

    private eventEmitter = new EventEmitter();

    // 重启相关属性
    private maxRestartAttempts = 3; // 最大重启次数
    private currentRestartCount = 0; // 当前重启次数
    private enginePath: string = ''; // 引擎路径
    private projectPath: string = ''; // 项目路径
    private isRestarting = false; // 是否正在重启中
    private isManualStop = false; // 是否手动停止

    async start(enginePath: string, projectPath: string): Promise<boolean> {
        if (this._process) {
            console.warn('重复启动场景进程，请 stop 进程在 start');
            return false;
        }

        // 保存启动参数以便重启时使用
        this.enginePath = enginePath;
        this.projectPath = projectPath;

        return new Promise((resolve) => {
            let isResolved = false;
            let startupTimer: NodeJS.Timeout | null = null;

            const cleanup = () => {
                if (startupTimer) {
                    clearTimeout(startupTimer);
                    startupTimer = null;
                }
            };

            const resolveOnce = (result: boolean) => {
                if (!isResolved) {
                    isResolved = true;
                    cleanup();
                    resolve(result);
                }
            };

            try {
                const args = [
                    `--enginePath=${enginePath}`,
                    `--projectPath=${projectPath}`,
                    `--serverURL=${getServerUrl()}`,
                ];
                const precessPath = path.join(__dirname, '../../../../dist/core/scene/scene-process/main.js');
                const inspectPort = '9230';

                this._process = fork(precessPath, args, {
                    detached: false,
                    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
                    execArgv: [`--inspect=${inspectPort}`],
                });

                // 监听进程启动错误
                const onError = (error: Error) => {
                    console.error('场景进程启动失败:', error);
                    this._process?.off('error', onError);
                    this._process?.off('exit', onEarlyExit);
                    this._process = null;
                    resolveOnce(false);
                };

                // 监听进程早期退出（启动失败）
                const onEarlyExit = (code: number, signal: string | null) => {
                    console.error(`场景进程启动时退出 code:${code}, signal:${signal}`);
                    this._process?.off('error', onError);
                    this._process?.off('exit', onEarlyExit);
                    this._process = null;
                    resolveOnce(false);
                };

                // 监听就绪消息
                const onReady = (msg: any) => {
                    if (msg === SceneReadyChannel) {
                        console.log('Scene process start.');
                        this._process?.off('message', onReady);
                        this._process?.off('error', onError);
                        this._process?.off('exit', onEarlyExit);
                        resolveOnce(true);
                    }
                };

                // 设置启动超时（30秒）
                startupTimer = setTimeout(() => {
                    console.error('场景进程启动超时');
                    this._process?.off('message', onReady);
                    this._process?.off('error', onError);
                    this._process?.off('exit', onEarlyExit);
                    if (this._process) {
                        this._process.kill('SIGTERM');
                        this._process = null;
                    }
                    resolveOnce(false);
                }, 30000);

                // 注册事件监听器
                this._process.on('error', onError);
                this._process.on('exit', onEarlyExit);
                this._process.on('message', onReady);

                // 启动RPC和注册监听器
                Rpc.startup(this._process);
                this.registerListener();

            } catch (error) {
                console.error('创建场景进程失败:', error);
                this._process = null;
                resolveOnce(false);
            }
        });
    }

    async stop() {
        if (!this.process) return true;
        this.isManualStop = true; // 标记为手动停止
        return new Promise<boolean>((resolve) => {
            this.process.once('exit', () => {
                console.log('Scene process stopped.');
                this.clear();
                resolve(true);
            });
            this.process.once('error', () => resolve(false));
            this.process.send(SceneWorker.ExitWorkerEvent);
        });
    }

    /**
     * 判断是否为真正的崩溃（排除手动kill等情况）
     * @private
     */
    private isCrashExit(code: number, signal: string | null): boolean {
        // 如果是手动停止，不算崩溃
        if (this.isManualStop) {
            return false;
        }


        // 其他非零退出码且非手动终止信号的情况，认为是崩溃
        return code !== 0;
    }

    /**
     * 重启场景进程
     * @private
     */
    private async restart(): Promise<void> {
        if (this.isRestarting) {
            console.log('场景进程正在重启中，跳过重复重启');
            return;
        }

        if (this.currentRestartCount >= this.maxRestartAttempts) {
            console.error(`场景进程重启次数已达上限 (${this.maxRestartAttempts})，停止重启`);
            this.emit<ISceneWorkerEvents>('restart', false);
            return;
        }

        this.isRestarting = true;
        this.currentRestartCount++;

        console.log(`开始重启场景进程 (第 ${this.currentRestartCount}/${this.maxRestartAttempts} 次)`);

        try {
            // 清理当前进程
            this._process = null;

            // 固定重启间隔
            const delay = 2000; // 固定2秒间隔
            console.log(`等待 ${delay}ms 后重启...`);
            await new Promise(resolve => setTimeout(resolve, delay));

            // 重新启动进程
            const success = await this.start(this.enginePath, this.projectPath);

            if (success) {
                console.log('场景进程重启成功');
                // 重启成功后重置重启计数
                this.currentRestartCount = 0;
                this.emit<ISceneWorkerEvents>('restart', true);
            } else {
                console.error(`场景进程重启失败 (第 ${this.currentRestartCount}/${this.maxRestartAttempts} 次)`);

                // 如果达到最大重试次数，发出事件通知
                if (this.currentRestartCount >= this.maxRestartAttempts) {
                    console.error('已达到最大重启次数，场景进程无法恢复');
                    this.emit<ISceneWorkerEvents>('restart', false);
                }
            }
        } catch (error) {
            console.error('场景进程重启过程中发生错误:', error);

            // 发出重启错误事件
            this.emit<ISceneWorkerEvents>('restart', false);

            // 如果达到最大重试次数，停止重启
            if (this.currentRestartCount >= this.maxRestartAttempts) {
                console.error('重启过程中发生错误且已达到最大重试次数，停止重启');
            }
        } finally {
            this.isRestarting = false;
        }
    }

    async registerListener() {

        this.process.on('message', (msg: { type: string, event: string, args: any[] }) => {
            if (msg && msg.type === SceneProcessEventTag) {
                this.emit(msg.event, ...msg.args);
            }
        });

        this.process.stdout?.on('data', (chunk) => {
            console.log(chunk.toString());
        });

        this.process.stderr?.on('data', (chunk) => {
            const str = chunk.toString();
            if (str.startsWith('[Scene]')) {
                console.log(chunk.toString());
            } else {
                console.log('[Scene]', chunk.toString());
            }
        });

        this.process.on('error', (err) => {
            if (err.message.startsWith('[Scene]')) {
                console.error(err);
            } else {
                console.error(`[Scene] `, err);
            }
        });

        this.process.on('exit', (code: number, signal) => {
            if (code !== 0) {
                console.error(`场景进程退出异常 code:${code}, signal:${signal}`);

                // 判断是否为真正的崩溃（排除手动kill的情况）
                const isCrash = this.isCrashExit(code, signal);

                if (isCrash && !this.isManualStop && !this.isRestarting && this.enginePath && this.projectPath) {
                    console.log('检测到场景进程崩溃，准备重启...');
                    this.restart().catch(error => {
                        console.error('重启场景进程失败:', error);
                    });
                } else if (this.isManualStop) {
                    console.log('场景进程手动停止，不进行重启');
                } else if (!isCrash) {
                    console.log('场景进程被外部终止，不进行重启');
                }
            } else {
                console.log('场景进程正常退出');
            }

            // 重置手动停止标志
            this.isManualStop = false;
        });
        // 监听主进程模块的事件
        await listenModuleMessages();
    }

    /**
     * 监听指定类型的事件（类型安全版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    on<TEvents extends Record<string, any>>(
        event: keyof TEvents,
        listener: TEvents[keyof TEvents] extends void
            ? () => void
            : (payload: TEvents[keyof TEvents]) => void
    ): void;
    /**
     * 监听指定类型的事件（通用版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    on(event: string, listener: (...args: any[]) => void): void;
    on(event: any, listener: any): void {
        this.eventEmitter.on(event as string, listener);
    }

    /**
     * 监听指定类型的事件（一次性，类型安全版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    once<TEvents extends Record<string, any>>(
        event: keyof TEvents,
        listener: TEvents[keyof TEvents] extends void
            ? () => void
            : (payload: TEvents[keyof TEvents]) => void
    ): void;
    /**
     * 监听指定类型的事件（一次性，通用版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    once(event: string, listener: (...args: any[]) => void): void;
    once(event: any, listener: any): void {
        this.eventEmitter.once(event as string, listener);
    }

    /**
     * 移除指定类型的事件监听器（类型安全版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    off<TEvents extends Record<string, any>>(
        event: keyof TEvents,
        listener: TEvents[keyof TEvents] extends void
            ? () => void
            : (payload: TEvents[keyof TEvents]) => void
    ): void;
    off(event: string, listener: (...args: any[]) => void): void;
    off(event: any, listener: any): void {
        this.eventEmitter.off(event as string, listener);
    }

    /**
     * 发射指定类型的事件（类型安全版本）
     * @param event 事件名称
     * @param args 事件参数
     */
    emit<TEvents extends Record<string, any>>(
        event: keyof TEvents,
        ...args: TEvents[keyof TEvents] extends void ? [] : [TEvents[keyof TEvents]]
    ): void;
    /**
     * 触发事件（通用版本）
     * @param event 事件名称
     * @param args 事件参数
     */
    emit(event: string, ...args: any[]): void;
    emit(event: any, ...args: any[]): void {
        this.eventEmitter.emit(event, ...args);
    }

    /**
     * 清除事件监听器
     * @param event 事件名称，如果不提供则清除所有
     */
    clear(event?: string): void {
        if (event) {
            this.eventEmitter.removeAllListeners(event);
        } else {
            this.eventEmitter.removeAllListeners();
            // 重置重启相关状态
            this.currentRestartCount = 0;
            this.isRestarting = false;
            this.isManualStop = false;
            this.enginePath = '';
            this.projectPath = '';
            this._process = null;
        }
    }
}

export const sceneWorker = new SceneWorker();
