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
    private isStarting = false;
    
    public get process(): ChildProcess {
        if (!this.manager || !this.manager.process) {
            throw new Error('Scene worker not initialized or started, please use sceneWorker.start');
        }
        return this.manager.process;
    }

    private eventEmitter = new EventEmitter();

    async start(enginePath: string, projectPath: string): Promise<boolean> {
        if (this.manager && this.manager.isRunning) {
            console.warn('Scene process already started, please stop it before starting again');
            return false;
        }
        if (this.isStarting) {
             console.warn('Scene process is starting...');
             return false;
        }
        
        this.isStarting = true;
        try {
            const processPath = path.join(__dirname, '../../../../dist/core/scene/scene-process/main.js');
            const inspectPort = await getAvailablePort(9230);
            console.log('--inspect= ' + inspectPort);
    
            this.manager = new ProcessManager({
                entryPath: processPath,
                args: [
                    `--enginePath=${enginePath}`,
                    `--projectPath=${projectPath}`,
                    `--serverURL=${getServerUrl()}`,
                ],
                inspectPort,
                readySignal: SceneReadyChannel,
                exitSignal: SceneWorker.ExitWorkerEvent,
                name: 'Scene'
            });
    
            // Register start event, bind listeners
            this.manager.on('started', (proc: ChildProcess) => {
                this.registerListener(proc);
            });
    
            this.manager.on('exit', (code, signal) => {
                console.log(`Scene process exited code:${code}, signal:${signal}`);
                // No automatic restart, rely on Lazy Start during RPC requests
            });
            
            // Initialize RPC
            Rpc.init(this.manager);
    
            const success = await this.manager.start();
            
            // Listen to main process module events
            await listenModuleMessages();
            
            return success;
        } catch (error) {
            console.error('Scene process start failed:', error);
            return false;
        } finally {
            this.isStarting = false;
        }
    }

    async stop() {
        const managerToStop = this.manager;
        
        if (managerToStop) {
            // Clear event listeners first to prevent race conditions during shutdown
            this.clear();
            
            // Stop the process
            await managerToStop.stop();
            
            // Dispose RPC to clear references
            Rpc.dispose();
            
            // Set manager to null only after everything is cleaned up
            this.manager = null;
        }
        
        this.isStarting = false; // Reset state
        return true;
    }

    /**
     * Manual restart (Compatibility)
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
     * Listen to specific events (Type safe version)
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
