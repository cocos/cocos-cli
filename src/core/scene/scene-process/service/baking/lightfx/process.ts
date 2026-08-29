import { ChildProcess, spawn } from 'child_process';
import { createServer, Server as HttpServer } from 'http';
import { existsSync } from 'fs';
import { join } from 'path';
import { GlobalPaths } from '../../../../../../global';

// LightFX embeds a Socket.IO 2.x client which cannot connect to the project's
// Socket.IO 4.x server even with Engine.IO 3 compatibility enabled.
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

    async run(options: LightFXProcessOptions): Promise<void> {
        if (this.child || this.io) throw new Error('LightFX process is already running.');
        const executable = join(GlobalPaths.staticDir, 'tools', 'lightmap-tools', process.platform === 'win32' ? 'LightFX.exe' : 'LightFX');
        if (!existsSync(executable)) throw new Error(`LightFX executable was not found: ${executable}`);
        this.settled = false;
        await new Promise<void>((resolve, reject) => {
            let timer: NodeJS.Timeout;
            const finish = async (error?: unknown): Promise<void> => {
                if (this.settled) return;
                this.settled = true;
                clearTimeout(timer);
                options.signal?.removeEventListener('abort', abort);
                await this.close();
                if (error) reject(error instanceof Error ? error : new Error(String(error))); else resolve();
            };
            const fail = (error: unknown): void => { void finish(error); };
            const succeed = (): void => { void finish(); };
            timer = setTimeout(() => fail(new Error('LightFX bake timed out.')), options.timeoutMs);
            const abort = (): void => fail(new Error('LightFX bake was cancelled.'));
            options.signal?.addEventListener('abort', abort, { once: true });
            void (async () => { try {
                this.http = createServer();
                this.io = createLegacySocketServer(this.http, { serveClient: false, transports: ['websocket', 'polling'] });
                this.io.on('connection', (socket: any) => {
                    socket.once('Login', () => socket.emit('Start'));
                    socket.on('Log', (data: unknown) => options.onLog?.(String(data)));
                    socket.on('Progress', (data: unknown) => options.onProgress?.(data));
                    socket.once('Finished', () => { socket.emit('Stop'); succeed(); });
                });
                await new Promise<void>((ready, listenReject) => {
                    this.http!.once('error', listenReject);
                    this.http!.listen(0, '127.0.0.1', () => ready());
                });
                const address = this.http.address();
                if (!address || typeof address === 'string') throw new Error('LightFX server did not allocate a TCP port.');
                this.child = spawn(executable, [`http://127.0.0.1:${address.port}`], { cwd: options.cwd, windowsHide: true });
                this.child.once('error', fail);
                this.child.once('exit', (code, signal) => { if (!this.settled) fail(new Error(`LightFX exited before completion (code=${code}, signal=${signal}).`)); });
            } catch (error) { fail(error); } })();
        });
    }

    async cancel(): Promise<boolean> { const running = Boolean(this.child || this.io); this.settled = true; await this.close(); return running; }
    private async close(): Promise<void> {
        if (this.child) { this.child.kill(); this.child = null; }
        if (this.io) { await new Promise<void>((resolve) => this.io!.close(() => resolve())); this.io = null; }
        if (this.http) { if (this.http.listening) await new Promise<void>((resolve) => this.http!.close(() => resolve())); this.http = null; }
    }
}
