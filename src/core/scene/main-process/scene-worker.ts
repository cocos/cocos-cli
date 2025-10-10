import { fork, ChildProcess } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { IIpcRequestOptions, TIpcResponse, TIpcToSceneMessage } from '../common/ipc';
import { SceneReadyChannel } from '../common/const';

export class SceneWorker extends EventEmitter {
    private _running = false;
    private _process: ChildProcess | null = null;
    private ipcReplyMap: Map<string, any> = new Map();

    private sceneProcessReadyResolve: Function | null = null;

    private get process(): ChildProcess {
        if (!this._process) {
            throw new Error('Scene worker 未初始化, 请使用 sceneWorker.start()');
        }
        return this._process;
    }
    async start(enginePath: string, projectPath: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const args = [`--enginePath=${enginePath}`, `--projectPath=${projectPath}`];

            const precessPath = path.join(__dirname, '../../../../dist/core/scene/scene-process/main.js');
            console.log(precessPath);
            this._process = fork(precessPath, args, { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
            this.registerListener();
            this.sceneProcessReadyResolve = resolve;
        });
    }

    stop() {
        if (this.process) {
            this.process.kill();
            console.log('[Node] Scene process stopped.');
        }
    }

    registerListener() {
        console.log('12312312323323123213')
        this.process.on('message', (msg: TIpcResponse) => {
            if (!this._running) {
                if (msg.channel === SceneReadyChannel) {
                    this._running = true;
                    if (this.sceneProcessReadyResolve) {
                        this.sceneProcessReadyResolve(true);
                        this.sceneProcessReadyResolve = null;
                    }
                    return;
                }
                return;
            }

            if (msg.reply && msg.id) {
                const resolver = this.ipcReplyMap.get(msg.id);
                if (resolver) {
                    this.ipcReplyMap.delete(msg.id);
                    resolver(msg.data);
                }
                return;
            }

            this.emit(msg.channel, msg.data);
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
            const str = err.message.toString();
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
            this._running = false;
        })
    }

    send(channel: string, methodName: string, ...args: any[]) {
        this.process.send({
            channel,
            methodName,
            params: [...args]
        } as TIpcToSceneMessage);
    }

    request<T = any>(channel: string, methodName: string, args: any[] = [], options: IIpcRequestOptions = {}): Promise<T> {
        const id: string = randomUUID();
        return new Promise((resolve, reject) => {
            // 设置超时处理
            const timeout = options.timeout || 30000; // 默认30秒超时
            const timeoutId = setTimeout(() => {
                this.ipcReplyMap.delete(id);
                reject(new Error(`Request timeout after ${timeout}ms: ${channel}.${methodName}`));
            }, timeout);

            this.ipcReplyMap.set(id, (data: any) => {
                clearTimeout(timeoutId);
                resolve(data);
            });

            this.process.send({
                id,
                channel,
                methodName,
                params: args,
            } as TIpcToSceneMessage);
        });
    }
}

export const sceneWorker = new SceneWorker();
