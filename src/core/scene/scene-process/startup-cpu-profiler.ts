import { Session } from 'inspector';
import * as fs from 'fs';

/**
 * Records the scene-process startup CPU profile when an output path is provided.
 */
export class StartupCpuProfiler {
    private session: Session | undefined;
    private readonly outputPath: string;
    private started = false;
    private finished = false;
    private startPromise: Promise<void> = Promise.resolve();

    constructor(envKey: string) {
        this.outputPath = process.env[envKey] ?? '';
    }

    get enabled(): boolean {
        return this.outputPath.endsWith('.cpuprofile');
    }

    async run<T>(task: () => Promise<T>): Promise<T> {
        this.start();
        try {
            return await task();
        } finally {
            try {
                await this.finish();
            } catch (error) {
                console.error('[Scene] Failed to finish CPU profile:', error);
            }
        }
    }

    private start(): void {
        if (!this.enabled || this.started) {
            return;
        }
        this.started = true;
        const session = this.session = new Session();
        session.connect();
        this.startPromise = new Promise<void>((resolve, reject) => {
            session.post('Profiler.enable', (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                session.post('Profiler.start', (startError) => {
                    if (startError) {
                        reject(startError);
                        return;
                    }
                    resolve();
                });
            });
        });
    }

    private async finish(): Promise<void> {
        if (!this.started || this.finished) {
            return;
        }
        this.finished = true;
        const session = this.session;
        if (!session) {
            return;
        }
        try {
            await this.startPromise;
            await new Promise<void>((resolve, reject) => {
                session.post('Profiler.stop', (error, params) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    const profile = (params as { profile?: object } | undefined)?.profile;
                    if (!profile) {
                        reject(new Error('[Scene] Profiler.stop returned no profile'));
                        return;
                    }
                    try {
                        fs.writeFileSync(this.outputPath, JSON.stringify(profile));
                        console.log(`[Scene] CPU profile written to ${this.outputPath}`);
                    } catch (writeError) {
                        console.error('[Scene] Failed to write CPU profile:', writeError);
                    }
                    resolve();
                });
            });
        } finally {
            session.disconnect();
        }
    }
}
