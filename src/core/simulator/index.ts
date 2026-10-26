/** Simulator compilation and artifact discovery. Preview sessions belong to the IDE package. */
import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { pathExists, stat, readJSON } from 'fs-extra';
import { join, resolve } from 'path';
import { GlobalPaths } from '../../global';

export interface ISimulatorManifest {
    platform: NodeJS.Platform;
    arch: string;
    bundle: string;
    entry: string;
    engineVersion?: string;
    builtAt?: string;
    runtimePath: string;
    artifactRoot: string;
    formatVersion: 1;
}
export interface ISimulatorBuildState {
    step: 'native' | 'runtime';
    state: 'start' | 'success' | 'failed';
    error?: string;
}
export interface ISimulatorLogEntry {
    source: 'build';
    level: 'log' | 'error';
    message: string;
}

const artifacts: Partial<Record<NodeJS.Platform, { bundle: string; entry: string }>> = {
    darwin: { bundle: 'SimulatorApp-Mac.app', entry: 'SimulatorApp-Mac.app/Contents/MacOS/SimulatorApp-Mac' },
    win32: { bundle: 'SimulatorApp-Win32.exe', entry: 'SimulatorApp-Win32.exe' },
};

function pipeLines(stream: NodeJS.ReadableStream | null, emit: (line: string) => void): () => void {
    let pending = '';
    const flush = () => { if (pending) { emit(pending); pending = ''; } };
    stream?.setEncoding('utf8');
    stream?.on('data', (chunk: string) => {
        const lines = (pending + chunk).split(/\r?\n/);
        pending = lines.pop() ?? '';
        lines.forEach(emit);
        while (pending.length > 65536) { emit(pending.slice(0, 65536)); pending = pending.slice(65536); }
    });
    stream?.once('end', flush);
    return flush;
}

class SimulatorBuilder extends EventEmitter {
    private readonly pending = new Map<string, Promise<void>>();
    private readonly queues = new Map<string, Promise<void>>();
    private readonly children = new Set<ChildProcess>();
    private exitListenerInstalled = false;

    onLog(listener: (entry: ISimulatorLogEntry) => void): () => void {
        this.on('log', listener);
        return () => { this.off('log', listener); };
    }
    onDidChangeBuildState(listener: (state: ISimulatorBuildState) => void): () => void {
        this.on('build-state', listener);
        return () => { this.off('build-state', listener); };
    }
    async getManifest(enginePath = GlobalPaths.enginePath): Promise<ISimulatorManifest | null> {
        const artifact = artifacts[process.platform];
        if (!artifact) return null;
        const engine = resolve(enginePath);
        const executable = join(engine, 'native/simulator/Release', artifact.entry);
        const manifest: ISimulatorManifest = {
            ...artifact, platform: process.platform, arch: process.arch,
            runtimePath: join(engine, 'bin/simulator'),
            artifactRoot: join(engine, 'native/simulator/Release'), formatVersion: 1,
        };
        if (await pathExists(executable)) manifest.builtAt = (await stat(executable)).mtime.toISOString();
        if (await pathExists(join(engine, 'package.json'))) manifest.engineVersion = (await readJSON(join(engine, 'package.json'))).version;
        for (const [directory, kind] of [[manifest.artifactRoot, 'native'], [manifest.runtimePath, 'runtime']]) {
            const file = join(directory, 'simulator-artifact.json');
            if (!await pathExists(file)) continue; // Existing artifacts can be rebuilt to acquire metadata.
            const built = await readJSON(file);
            if (built.formatVersion !== 1 || built.kind !== kind || built.platform !== process.platform
                || built.arch !== process.arch || built.engineVersion !== manifest.engineVersion) {
                throw new Error(`Simulator ${kind} artifact is incompatible with this engine/platform. Rebuild the simulator: ${file}`);
            }
        }
        return manifest;
    }
    async getExecutablePath(enginePath = GlobalPaths.enginePath): Promise<string | null> {
        const manifest = await this.getManifest(enginePath);
        if (!manifest) return null;
        const executable = join(resolve(enginePath), 'native/simulator/Release', manifest.entry);
        return await pathExists(executable) ? executable : null;
    }
    async isBuilt(enginePath?: string): Promise<boolean> { return !!await this.getExecutablePath(enginePath); }
    buildNative(enginePath?: string): Promise<void> { return this.enqueue('native', enginePath); }
    buildRuntime(enginePath?: string): Promise<void> { return this.enqueue('runtime', enginePath); }
    async build(enginePath?: string): Promise<void> {
        await this.buildNative(enginePath);
        await this.buildRuntime(enginePath);
    }
    private enqueue(step: ISimulatorBuildState['step'], enginePath = GlobalPaths.enginePath): Promise<void> {
        const engine = resolve(enginePath);
        const key = `${engine}:${step}`;
        const existing = this.pending.get(key);
        if (existing) return existing;
        const previous = this.queues.get(engine) ?? Promise.resolve();
        const task = previous.catch(() => {}).then(() => this.run(step, engine));
        this.queues.set(engine, task);
        const result = task.finally(() => {
            this.pending.delete(key);
            if (this.queues.get(engine) === task) this.queues.delete(engine);
        });
        this.pending.set(key, result);
        return result;
    }
    private async run(step: ISimulatorBuildState['step'], engine: string): Promise<void> {
        this.emit('build-state', { step, state: 'start' });
        try {
            const script = join(GlobalPaths.workspace, 'workflow', step === 'native' ? 'build-simulator.js' : 'build-simulator-runtime.js');
            await new Promise<void>((resolveBuild, reject) => {
                const child = spawn(process.execPath, [script, `--enginePath=${engine}`], {
                    cwd: GlobalPaths.workspace, stdio: ['ignore', 'pipe', 'pipe'],
                    env: { ...process.env, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
                });
                this.children.add(child);
                if (!this.exitListenerInstalled) {
                    process.once('exit', () => { for (const process of this.children) process.kill(); });
                    this.exitListenerInstalled = true;
                }
                const output = (level: 'log' | 'error') => (message: string) => {
                    this.emit('log', { source: 'build', level, message });
                    console[level](message);
                };
                const out = pipeLines(child.stdout, output('log'));
                const err = pipeLines(child.stderr, output('error'));
                child.once('error', error => { this.children.delete(child); out(); err(); reject(error); });
                child.once('close', code => {
                    this.children.delete(child); out(); err();
                    if (code === 0) resolveBuild();
                    else reject(new Error(`Simulator ${step} build failed with exit code ${code}`));
                });
            });
            this.emit('build-state', { step, state: 'success' });
        } catch (error) {
            this.emit('build-state', { step, state: 'failed', error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
}

export const simulatorBuilder = new SimulatorBuilder();
