import { fork, ChildProcess } from 'child_process';
import path from 'path';
import { EventEmitter } from 'events';
import { SceneReadyChannel } from '../common';
import { startupRpc } from './rpc';
import { getServerUrl } from '../../../server';
import type { IAsset } from '../../assets/@types/protected/asset';

export class SceneWorker extends EventEmitter {

    static ExitWorkerEvent = 'scene-process:exit';

    private _process: ChildProcess | null = null;
    private get process(): ChildProcess {
        if (!this._process) {
            throw new Error('Scene worker 未初始化, 请使用 sceneWorker.start');
        }
        return this._process;
    }

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
            startupRpc(this._process);
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
                resolve(true);
            });
            this.process.once('error', () => resolve(false));
            this.process.send(SceneWorker.ExitWorkerEvent);
        });
    }

    async registerListener() {
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
}

export const sceneWorker = new SceneWorker();
