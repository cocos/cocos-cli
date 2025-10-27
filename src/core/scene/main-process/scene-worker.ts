import { fork, ChildProcess } from 'child_process';
import path from 'path';
import { EventEmitter } from 'events';
import { SceneProcessEventTag, SceneReadyChannel } from '../common';
import { Rpc } from './rpc';
import { getServerUrl } from '../../../server';
import type { IAsset } from '../../assets/@types/protected/asset';

export class SceneWorker {

    static ExitWorkerEvent = 'scene-process:exit';

    private _process: ChildProcess | null = null;
    private get process(): ChildProcess {
        if (!this._process) {
            throw new Error('Scene worker 未初始化, 请使用 sceneWorker.start');
        }
        return this._process;
    }

    private eventEmitter = new EventEmitter();

    async start(enginePath: string, projectPath: string): Promise<boolean> {
        if (this._process) {
            console.warn('重复启动场景进程，请 stop 进程在 start');
            return false;
        }
        return new Promise((resolve) => {
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
            Rpc.startup(this._process);
            this.registerListener();
            const onReady = (msg: any) => {
                if (msg === SceneReadyChannel) {
                    console.log('Scene process start.');
                    this.process.off('message', onReady);
                    resolve(true);
                }
            };
            this.process.on('message', onReady);
        });
    }

    async stop() {
        if (!this.process) return true;
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
            } else {
                console.log('场景进程退出');
            }
        });

        //
        const { default: scriptManager } = await import('../../scripting');
        const { ScriptProxy } = await import('./proxy/script-proxy');
        scriptManager.on('pack-build-end', (targetName: string) => {
            if (targetName === 'editor') {
                void ScriptProxy.investigatePackerDriver();
            }
        });

        const { assetManager } = await import('../../assets');
        assetManager.on('asset-add', async (asset: IAsset) => {
            switch (asset.meta.importer) {
                case 'typescript':
                case 'javascript':
                    void ScriptProxy.loadScript();
                    break;
            }
        });
        assetManager.on('asset-change', (asset: IAsset) => {
            switch (asset.meta.importer) {
                case 'typescript':
                case 'javascript': {
                    void ScriptProxy.scriptChange();
                    break;
                }
            }
        });

        assetManager.on('asset-delete', (asset: IAsset) => {
            switch (asset.meta.importer) {
                case 'typescript':
                case 'javascript': {
                    void ScriptProxy.removeScript();
                    break;
                }
            }
        });
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
        }
    }
}

export const sceneWorker = new SceneWorker();
