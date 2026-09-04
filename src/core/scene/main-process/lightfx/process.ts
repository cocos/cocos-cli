import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { createServer, type Server as HttpServer } from 'http';
import { join } from 'path';
import { GlobalPaths } from '../../../../global';

// LightFX embeds a Socket.IO 2.x client. Keep the legacy server in the Node host so the browser
// Scene runtime never has to load either Socket.IO or Node's networking/process modules.
const createLegacySocketServer = require('socket.io-v2') as (server: HttpServer, options: object) => any;

export interface LightFXProcessOptions {
    cwd: string;
    timeoutMs: number;
    signal?: AbortSignal;
    onLog?: (message: string) => void;
    onProgress?: (progress: unknown) => void;
}

export class LightFXProcess {
    private child: ChildProcess | null = null;
    private http: HttpServer | null = null;
    private io: any = null;
    private settled = false;
    private closePromise: Promise<void> | null = null;

    public async run(options: LightFXProcessOptions): Promise<void> {
        if (this.child || this.io) {
            throw new Error('LightFX process is already running.');
        }
        if (options.signal?.aborted) {
            throw new Error('LightFX bake was cancelled.');
        }

        const executable = join(
            GlobalPaths.staticDir,
            'tools',
            'lightmap-tools',
            process.platform === 'win32' ? 'LightFX.exe' : 'LightFX',
        );
        if (!existsSync(executable)) {
            throw new Error(`LightFX executable was not found: ${executable}`);
        }

        this.settled = false;
        this.closePromise = null;
        await new Promise<void>((resolve, reject) => {
            let timer: NodeJS.Timeout;
            const finish = async (error?: unknown): Promise<void> => {
                if (this.settled) {
                    return;
                }
                this.settled = true;
                clearTimeout(timer);
                options.signal?.removeEventListener('abort', abort);
                await this.close();
                if (error) {
                    reject(error instanceof Error ? error : new Error(String(error)));
                } else {
                    resolve();
                }
            };
            const fail = (error: unknown): void => { void finish(error); };
            const succeed = (): void => { void finish(); };
            const abort = (): void => fail(new Error('LightFX bake was cancelled.'));

            timer = setTimeout(() => fail(new Error('LightFX bake timed out.')), options.timeoutMs);
            options.signal?.addEventListener('abort', abort, { once: true });

            void (async () => {
                try {
                    this.http = createServer();
                    this.io = createLegacySocketServer(this.http, {
                        serveClient: false,
                        transports: ['websocket', 'polling'],
                    });
                    this.io.on('connection', (socket: any) => {
                        socket.once('Login', () => socket.emit('Start'));
                        socket.on('Log', (data: unknown) => options.onLog?.(String(data)));
                        socket.on('Progress', (data: unknown) => options.onProgress?.(data));
                        socket.once('Finished', () => {
                            socket.emit('Stop');
                            succeed();
                        });
                    });
                    await new Promise<void>((ready, listenReject) => {
                        this.http!.once('error', listenReject);
                        this.http!.listen(0, '127.0.0.1', ready);
                    });
                    const address = this.http.address();
                    if (!address || typeof address === 'string') {
                        throw new Error('LightFX server did not allocate a TCP port.');
                    }
                    this.child = spawn(executable, [`http://127.0.0.1:${address.port}`], {
                        cwd: options.cwd,
                        windowsHide: true,
                    });
                    this.child.once('error', fail);
                    this.child.once('exit', (code, signal) => {
                        if (!this.settled) {
                            fail(new Error(`LightFX exited before completion (code=${code}, signal=${signal}).`));
                        }
                    });
                } catch (error) {
                    fail(error);
                }
            })();
        });
    }

    public async cancel(): Promise<boolean> {
        const running = Boolean(this.child || this.io);
        await this.close();
        return running;
    }

    private close(): Promise<void> {
        if (this.closePromise) {
            return this.closePromise;
        }
        this.closePromise = (async () => {
            if (this.child) {
                this.child.kill();
                this.child = null;
            }
            if (this.io) {
                const io = this.io;
                this.io = null;
                await new Promise<void>((resolve) => io.close(resolve));
            }
            if (this.http) {
                const http = this.http;
                this.http = null;
                if (http.listening) {
                    await new Promise<void>((resolve) => http.close(() => resolve()));
                }
            }
        })();
        return this.closePromise;
    }
}
