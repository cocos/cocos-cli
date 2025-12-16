import { ChildProcess } from 'child_process';
import path from 'path';
import { EventEmitter } from 'events';
import { SceneProcessEventTag, SceneReadyChannel, SceneExitChannel } from '../common';
import { Rpc } from './rpc';
import { getServerUrl } from '../../../server';
import { listenModuleMessages, unlistenModuleMessages } from './messages';
import { getAvailablePort } from '../../../server/utils';
import { ProcessManager } from '../../process-manager';

export interface ISceneWorkerEvents {
    'restart': boolean,
}

export class SceneWorker {

    static ExitWorkerEvent = SceneExitChannel;

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
    
            // Register start event, bind listeners (use once to avoid accumulation on restart)
            this.manager.once('started', (proc: ChildProcess) => {
                this.registerListener(proc);
            });
    
            this.manager.once('exit', (code, signal) => {
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
            // Unregister process-specific listeners first
            this.unregisterProcessListeners();
            
            // Clear event emitter listeners
            this.clear();
            
            // Unlisten module messages to prevent memory leaks
            await unlistenModuleMessages();
            
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

    // Store bound handlers for cleanup
    private processListeners: Map<string, (...args: any[]) => void> = new Map();

    private registerListener(process: ChildProcess) {
        // Clear previous listeners if any
        this.unregisterProcessListeners();

        const messageHandler = (msg: { type: string, event: string, args: any[] }) => {
            if (msg && msg.type === SceneProcessEventTag) {
                this.emit(msg.event, ...msg.args);
            }
        };

        const stdoutHandler = (chunk: Buffer) => {
            console.log(chunk.toString());
        };

        const stderrHandler = (chunk: Buffer) => {
            const str = chunk.toString();
            if (str.startsWith('[Scene]')) {
                console.log(str);
            } else {
                console.log('[Scene]', str);
            }
        };

        const errorHandler = (err: Error) => {
            if (err.message.startsWith('[Scene]')) {
                console.error(err);
            } else {
                console.error(`[Scene] `, err);
            }
        };

        // Register and store handlers
        process.on('message', messageHandler);
        this.processListeners.set('message', messageHandler);

        if (process.stdout) {
            process.stdout.on('data', stdoutHandler);
            this.processListeners.set('stdout:data', stdoutHandler);
        }

        if (process.stderr) {
            process.stderr.on('data', stderrHandler);
            this.processListeners.set('stderr:data', stderrHandler);
        }

        process.on('error', errorHandler);
        this.processListeners.set('error', errorHandler);
        
        // 'exit' is handled by manager
    }

    private unregisterProcessListeners() {
        if (!this.manager?.process) return;
        
        const proc = this.manager.process;
        
        const messageHandler = this.processListeners.get('message');
        if (messageHandler) {
            proc.off('message', messageHandler);
        }

        const stdoutHandler = this.processListeners.get('stdout:data');
        if (stdoutHandler && proc.stdout) {
            proc.stdout.off('data', stdoutHandler);
        }

        const stderrHandler = this.processListeners.get('stderr:data');
        if (stderrHandler && proc.stderr) {
            proc.stderr.off('data', stderrHandler);
        }

        const errorHandler = this.processListeners.get('error');
        if (errorHandler) {
            proc.off('error', errorHandler);
        }

        this.processListeners.clear();
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
