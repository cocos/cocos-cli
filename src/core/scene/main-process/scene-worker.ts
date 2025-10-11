import { fork, ChildProcess } from 'child_process';
import path from 'path';
import { EventEmitter } from 'events';
import { IpcPost, SceneReadyChannel } from '../common';
import { IpcServer } from '../ipc/ipc-server';
import { IpcClient } from '../ipc/ipc-client';
import { assetManager } from '../../assets';
import type { SceneServices } from '../types/services';

import { managers } from '../scene-process/service';

export class SceneWorker extends EventEmitter {
    private _process: ChildProcess | null = null;

    private ipcServer: IpcServer<{}> | undefined;
    private _ipc: IpcClient<{}> | undefined;

    private get process(): ChildProcess {
        if (!this._process) {
            throw new Error('Scene worker 未初始化, 请使用 sceneWorker.start');
        }
        return this._process;
    }

    public get ipc() {
        if (!this._ipc) {
            throw new Error('Scene worker 未初始化, 请使用 sceneWorker.start()');
        }
        return this._ipc;
    }

    async start(enginePath: string, projectPath: string): Promise<boolean> {
        return new Promise((resolve) => {
            const args = [`--enginePath=${enginePath}`, `--projectPath=${projectPath}`];
            const precessPath = path.join(__dirname, '../../../../dist/core/scene/scene-process/main.js');
            this._process = fork(precessPath, args, { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
            // 启动接收需要调用当前进程模块的 ipc
            this.ipcServer = new IpcServer(IpcPost.SceneToMain, process, {
                'assetManager': assetManager,
            });
            // 启动与场景模块交互的 ipc
            this._ipc = new IpcClient(IpcPost.MainToScene, this._process, managers);
            this.registerListener();
            const onReady = (msg: any) => {
                if (msg === SceneReadyChannel) {
                    this.process.off('message', onReady);
                    resolve(true);
                }
            }
            this.process.on('message', onReady);
        });
    }

    stop() {
        if (this.process) {
            this.process.kill(0);
            console.log('[Node] Scene process stopped.');
        }
    }

    registerListener() {
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
        });
    }
}

export const sceneWorker = new SceneWorker();

export const Ipc = sceneWorker.ipc;