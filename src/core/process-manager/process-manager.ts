import { ChildProcess, fork, ForkOptions } from 'child_process';
import { EventEmitter } from 'events';
import { ProcessRPC } from './process-rpc';

export interface ProcessManagerOptions {
    entryPath: string;
    args?: string[];
    options?: ForkOptions;
    /**
     * Port for node inspector
     */
    inspectPort?: number;
    /**
     * Signal message to wait for from the process to consider it ready.
     * If not provided, resolves immediately after spawn.
     */
    readySignal?: string;
    /**
     * Signal message to send to the process to request graceful shutdown.
     * @default 'process:exit'
     */
    exitSignal?: string;
    /**
     * Timeout in ms for startup
     * @default 30000
     */
    startTimeout?: number;
    /**
     * Process name for logging
     * @default 'Process'
     */
    name?: string;
}

export class ProcessManager<TRpcModules extends Record<string, any>> extends EventEmitter {
    private _process: ChildProcess | undefined;
    private _rpc: ProcessRPC<TRpcModules>;
    private options: ProcessManagerOptions;
    private isStarting: boolean = false;

    constructor(options: ProcessManagerOptions) {
        super();
        this.options = options;
        this._rpc = new ProcessRPC<TRpcModules>();
    }

    public get process(): ChildProcess | undefined {
        return this._process;
    }

    public get rpc(): ProcessRPC<TRpcModules> {
        return this._rpc;
    }

    public get isRunning(): boolean {
        return !!this._process && !this._process.killed && this._process.connected;
    }

    /**
     * Start the process.
     * If already running, returns true immediately.
     */
    public async start(): Promise<boolean> {
        if (this.isRunning) {
            return true;
        }

        if (this.isStarting) {
            // Wait for the current start attempt
            return new Promise((resolve) => {
                const check = () => {
                    if (this.isRunning) resolve(true);
                    else if (!this.isStarting) resolve(false);
                    else setTimeout(check, 100);
                };
                check();
            });
        }

        this.isStarting = true;

        return new Promise<boolean>(async (resolve) => {
            const { entryPath, args = [], options = {}, inspectPort, readySignal, startTimeout = 30000, name = 'Process' } = this.options;

            try {
                // Handle inspect port
                const execArgv = [...(options.execArgv || [])];
                if (inspectPort) {
                    execArgv.push(`--inspect=${inspectPort}`);
                }

                console.log(`[${name}] Starting process: ${entryPath}`);
                
                const child = fork(entryPath, args, {
                    ...options,
                    stdio: options.stdio || ['pipe', 'pipe', 'pipe', 'ipc'],
                    execArgv
                });
                this._process = child;

                let resolved = false;
                const timer = setTimeout(() => {
                    if (!resolved) {
                        console.error(`[${name}] Startup timeout`);
                        this.cleanupProcess();
                        resolved = true;
                        resolve(false);
                    }
                }, startTimeout);

                const onReady = (msg: any) => {
                    if (readySignal && msg === readySignal) {
                        console.log(`[${name}] Process ready.`);
                        cleanupListeners();
                        resolved = true;
                        clearTimeout(timer);
                        
                        if (this._process === child) {
                            this.emit('started', child);
                        }
                        
                        resolve(true);
                    } else if (!readySignal) {
                        // If no ready signal is needed, we shouldn't be in this callback logic for readiness,
                        // but we need to wait for message if readySignal is set.
                        // If readySignal is NOT set, we should resolve immediately after fork?
                        // To keep it simple, if readySignal is not set, we resolve immediately after listener setup.
                    }
                };

                const onError = (err: Error) => {
                   if (!resolved) {
                       console.error(`[${name}] Startup error:`, err);
                       cleanupListeners();
                       this.cleanupProcess();
                       resolved = true;
                       clearTimeout(timer);
                       resolve(false);
                   }
                   this.emit('error', err);
                };

                const onExit = (code: number, signal: string) => {
                    console.log(`[${name}] Exit code: ${code}, signal: ${signal}`);
                    
                    // Check if this is the current process before cleanup
                    const isCurrentProcess = this._process === child;
                    
                    if (!isCurrentProcess) {
                        // If a new process has started, ignore cleanup for the old one
                        return;
                    }

                    // Emit exit event first while we still have valid state
                    this.emit('exit', code, signal);

                    if (!resolved) {
                        cleanupListeners();
                        resolved = true;
                        clearTimeout(timer);
                        resolve(false);
                    }
                    
                    // Clean up state last
                    this._process = undefined;
                    this._rpc.dispose();
                };

                const cleanupListeners = () => {
                    child.off('message', onReady);
                    child.off('error', onError);
                    // We keep exit listener to handle runtime exits
                    // this._process?.off('exit', onExit); 
                };

                child.on('message', onReady);
                child.on('error', onError);
                child.on('exit', onExit);

                // Establish RPC communication immediately, allowing child process to request data during initialization
                this._rpc.attach(child);

                if (!readySignal) {
                    // Resolve immediately if no signal expected
                    resolved = true;
                    clearTimeout(timer);
                    this.emit('started', child);
                    resolve(true);
                }

            } catch (e) {
                console.error(`[${name}] Fork failed:`, e);
                this.cleanupProcess();
                this.isStarting = false;
                resolve(false);
            }
        }).finally(() => {
            this.isStarting = false;
        });
    }

    /**
     * Stop the process.
     */
    public async stop(): Promise<void> {
        if (!this._process) return;
        
        const processToStop = this._process;
        
        return new Promise((resolve) => {
            let forceKillTimer: NodeJS.Timeout | null = null;
            
            // Wait for exit
            const onExit = () => {
                if (forceKillTimer) {
                    clearTimeout(forceKillTimer);
                    forceKillTimer = null;
                }
                // Clean up state after exit
                this.cleanupProcess();
                resolve();
            };
            processToStop.once('exit', onExit);
            
            // Send exit signal if RPC channel is open, process might handle graceful shutdown
            const exitSignal = this.options.exitSignal || "process:exit";
            const sent = processToStop.send?.(exitSignal);
            
            // Force kill if needed after 5 seconds
            forceKillTimer = setTimeout(() => {
                if (processToStop && !processToStop.killed) {
                    console.warn(`[${this.options.name || 'Process'}] Force killing process after timeout`);
                    processToStop.kill('SIGKILL');
                }
            }, 5000);
            
            // If sending failed (channel closed), kill immediately
            if (!sent) {
                processToStop.kill();
            }
        });
    }

    /**
     * Restart the process.
     */
    public async restart(): Promise<boolean> {
        await this.stop();
        return this.start();
    }

    /**
     * Ensures the process is running.
     */
    public async ensureRunning(): Promise<boolean> {
        if (this.isRunning) return true;
        return this.start();
    }

    private cleanupProcess() {
       if (this._process) {
           this._process.removeAllListeners();
           try {
               this._process.kill();
           } catch(e) {}
           this._process = undefined;
       } 
       this._rpc.dispose();
    }
}
