import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { mkdtemp, outputFile, outputJSON, remove } from 'fs-extra';
import { join } from 'path';
import { tmpdir } from 'os';
const spawn = jest.fn();
jest.mock('child_process', () => ({ spawn: (...args: any[]) => spawn(...args) }));
import { simulatorBuilder } from '../src/core/simulator';

function child() {
    return Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: jest.fn() });
}
it('deduplicates builds, serializes steps for one engine, and recovers after a failure', async () => {
    const children: ReturnType<typeof child>[] = [];
    spawn.mockImplementation(() => { const process = child(); children.push(process); return process; });
    const states: string[] = [];
    const dispose = simulatorBuilder.onDidChangeBuildState(event => states.push(`${event.step}:${event.state}`));
    try {
        const first = simulatorBuilder.buildNative('/engine-test');
        expect(simulatorBuilder.buildNative('/engine-test')).toBe(first);
        const outcome = first.catch(e => e);
        const next = simulatorBuilder.buildRuntime('/engine-test');
        await new Promise(setImmediate);
        expect(children).toHaveLength(1);
        children[0].emit('close', 1);
        expect(await outcome).toBeInstanceOf(Error);
        await new Promise(setImmediate);
        expect(children).toHaveLength(2);
        children[1].emit('close', 0);
        await next;
        expect(states).toEqual(['native:start', 'native:failed', 'runtime:start', 'runtime:success']);
        expect(spawn.mock.calls[0][1][0]).toMatch(/build-simulator\.js$/);
        expect(spawn.mock.calls[1][1][0]).toMatch(/build-simulator-runtime\.js$/);
        expect(simulatorBuilder).not.toHaveProperty('launchPreview');
        expect(simulatorBuilder).not.toHaveProperty('prepareResources');
    } finally { dispose(); }
});

it('discovers artifacts and rejects recorded engine version mismatches', async () => {
    if (!['win32', 'darwin'].includes(process.platform)) return;
    const engine = await mkdtemp(join(tmpdir(), 'simulator-build-manifest-'));
    try {
        await outputJSON(join(engine, 'package.json'), { version: '4.0.0' });
        const manifest = (await simulatorBuilder.getManifest(engine))!;
        expect(manifest).toMatchObject({ formatVersion: 1, platform: process.platform, arch: process.arch, engineVersion: '4.0.0' });
        expect(await simulatorBuilder.isBuilt(engine)).toBe(false);
        await outputFile(join(manifest.artifactRoot, manifest.entry), 'test artifact');
        expect(await simulatorBuilder.getExecutablePath(engine)).toBe(join(manifest.artifactRoot, manifest.entry));
        await outputJSON(join(manifest.artifactRoot, 'simulator-artifact.json'), {
            formatVersion: 1, kind: 'native', platform: process.platform, arch: process.arch, engineVersion: '3.0.0',
        });
        await expect(simulatorBuilder.getManifest(engine)).rejects.toThrow('incompatible');
    } finally { await remove(engine); }
});
