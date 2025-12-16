import { ChildProcess } from 'child_process';
import path from 'path';
import { EventEmitter } from 'events';
import { SceneProcessEventTag, SceneReadyChannel } from '../common';
import { Rpc } from './rpc';
import { getServerUrl } from '../../../server';
import { listenModuleMessages } from './messages';
import { getAvailablePort } from '../../../server/utils';
import { ProcessManager } from '../../process-manager';

export interface ISceneWorkerEvents {
    'restart': boolean,
}

export class SceneWorker {

    static ExitWorkerEvent = 'scene-process:exit';

    private manager: ProcessManager<any> | null = null;
    
    public get process(): ChildProcess {
        if (!this.manager || !this.manager.process) {
            throw new Error('Scene worker 未初始化或未启动, 请使用 sceneWorker.start');
        }
        return this.manager.process;
    }

    private eventEmitter = new EventEmitter();

    async start(enginePath: string, projectPath: string): Promise<boolean> {
        if (this.manager && this.manager.isRunning) {
            console.warn('重复启动场景进程，请 stop 进程在 start');
            return false;
        }

        const precessPath = path.join(__dirname, '../../../../dist/core/scene/scene-process/main.js');
        const inspectPort = await getAvailablePort(9230);
        console.log('--inspect= ' + inspectPort);

        this.manager = new ProcessManager({
            entryPath: precessPath,
            args: [
                `--enginePath=${enginePath}`,
                `--projectPath=${projectPath}`,
                `--serverURL=${getServerUrl()}`,
            ],
            inspectPort,
            readySignal: SceneReadyChannel,
            name: 'Scene'
        });

        // 注册启动事件，绑定监听器
        this.manager.on('started', (proc: ChildProcess) => {
            this.registerListener(proc);
        });

        this.manager.on('exit', (code, signal) => {
            console.log(`场景进程退出 code:${code}, signal:${signal}`);
            // 不再自动重启，依赖 RPC 请求时的自动启动 (Lazy Start)
        });
        
        // 初始化 RPC
        Rpc.init(this.manager);

        try {
            const success = await this.manager.start();
            
            // 监听主进程模块的事件 (Is this global or per process? It seems global in original code)
            await listenModuleMessages();
            
            return success;
        } catch (error) {
            console.error('场景进程启动失败:', error);
            return false;
        }
    }

    async stop() {
        if (this.manager) {
            await this.manager.stop();
            this.manager = null; // Dispose manager?
        }
        this.clear();
        return true;
    }

    /**
     * 手动重启 (Compatibility)
     */
    public async restart(): Promise<boolean> {
        if (this.manager) {
            return this.manager.restart();
        }
        return false;
    }

    private registerListener(process: ChildProcess) {
        process.on('message', (msg: { type: string, event: string, args: any[] }) => {
            if (msg && msg.type === SceneProcessEventTag) {
                this.emit(msg.event, ...msg.args);
            }
        });

        process.stdout?.on('data', (chunk) => {
            console.log(chunk.toString());
        });

        process.stderr?.on('data', (chunk) => {
            const str = chunk.toString();
            if (str.startsWith('[Scene]')) {
                console.log(chunk.toString());
            } else {
                console.log('[Scene]', chunk.toString());
            }
        });

        process.on('error', (err) => {
            if (err.message.startsWith('[Scene]')) {
                console.error(err);
            } else {
                console.error(`[Scene] `, err);
            }
        });
        
        // 'exit' is handled by manager
    }

    /**
     * 监听指定类型的事件（类型安全版本）
     */
    on<TEvents extends Record<string, any>>(
        event: keyof TEvents,
        listener: TEvents[keyof TEvents] extends void
            ? () => void
            : (payload: TEvents[keyof TEvents]) => void
    ): void;
    on(event: string, listener: (...args: any[]) => void): void;
    on(event: any, listener: any): void {
        this.eventEmitter.on(event as string, listener);
    }

    once(event: string, listener: (...args: any[]) => void): void;
    once(event: any, listener: any): void {
        this.eventEmitter.once(event as string, listener);
    }

    off(event: string, listener: (...args: any[]) => void): void;
    off(event: any, listener: any): void {
        this.eventEmitter.off(event as string, listener);
    }

    emit(event: string, ...args: any[]): void;
    emit(event: any, ...args: any[]): void {
        this.eventEmitter.emit(event, ...args);
    }

    clear(event?: string): void {
        if (event) {
            this.eventEmitter.removeAllListeners(event);
        } else {
            this.eventEmitter.removeAllListeners();
        }
    }
}

export const sceneWorker = new SceneWorker();
