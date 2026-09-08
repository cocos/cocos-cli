/** Real scene-worker RPC coverage: the public MCP node summary omits component metadata. */
import { mkdtemp, remove } from 'fs-extra';
import { basename, join } from 'path';
import type { IComponent, INode, ISetPropertyOptions } from '../common';
import type { IProperty } from '../@types/public';
import { NodeType } from '../common';
import { Rpc } from '../main-process/rpc';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { ComponentProxy } from '../main-process/proxy/component-proxy';
import { TestGlobalEnv } from '../../../tests/global-env';

type Particle = { nodePath: string; componentPath: string; uuid: string };

describe('particle Inspector metadata real scene RPC', () => {
    let directory: string;
    let sceneUrl: string;

    beforeAll(async () => {
        const { globalSetup } = await import('../../test/global-setup');
        const server = await import('../../../server');
        const { getAvailablePort } = await import('../../../server/utils');
        const port = await getAvailablePort(19527);
        const startServer = server.startServer;
        // The shared setup otherwise uses localhost:9527. An IPv6 PinK listener
        // can own that URL while the test binds IPv4; pin both address and port.
        const start = jest.spyOn(server, 'startServer').mockImplementationOnce(() => startServer(port, '127.0.0.1'));
        try {
            await globalSetup();
        } finally {
            start.mockRestore();
        }
        directory = await mkdtemp(join(TestGlobalEnv.projectRoot, 'assets/particle-metadata-'));
        const { assetManager } = await import('../../assets');
        await assetManager.refreshAsset(directory);
        const { loadSceneI18n } = await import('../index');
        await loadSceneI18n();
        const asset = await EditorProxy.create({
            type: 'scene', baseName: 'metadata', targetDirectory: `db://assets/${basename(directory)}`,
        });
        if (!asset) { throw new Error('Failed to create particle metadata scene'); }
        sceneUrl = asset.assetUrl;
        await EditorProxy.open({ urlOrUUID: sceneUrl });
    }, 180000);

    afterAll(async () => {
        try {
            if (sceneUrl) { await EditorProxy.close({ save: false }); }
        } finally {
            const { projectManager } = await import('../../project-manager');
            await projectManager.close();
            if (directory) {
                await remove(directory);
                await remove(`${directory}.meta`);
            }
        }
    });

    async function create(name: string, type = 'cc.ParticleSystem'): Promise<Particle> {
        const node = await Rpc.getInstance().request('Node', 'createByType', [{ path: '', name, nodeType: NodeType.EMPTY }]);
        if (!node) { throw new Error(`Failed to create ${name}`); }
        const dump = await Rpc.getInstance().request('Component', 'add', [{ nodePath: name, component: type }]);
        if (!dump) { throw new Error(`Failed to add ${type}`); }
        if (type === 'cc.ParticleSystem') {
            const nodeDump = await Rpc.getInstance().request('Node', 'query', [{ path: name, includeComponents: true }]) as INode;
            const index = nodeDump.__comps__.findIndex(item => item.value.uuid.value === dump.value.uuid.value);
            const initializer = Rpc.getInstance() as unknown as {
                request(service: 'Node', method: 'updatePropertyFromNull', args: [ISetPropertyOptions]): Promise<boolean>;
            };
            // Headless engine modules may be lazy/null; use the Inspector's
            // standard initialization operation rather than patching live objects.
            for (const key of ['shapeModule', 'trailModule', 'limitVelocityOvertimeModule']) {
                if (dump.value[key].value === null) {
                    expect(await initializer.request('Node', 'updatePropertyFromNull', [{
                        nodePath: name, path: `__comps__.${index}.${key}`, dump: dump.value[key], record: false,
                    }])).toBe(true);
                }
            }
        }
        return { nodePath: name, componentPath: `${name}/${type}`, uuid: dump.value.uuid.value };
    }

    async function query(particle: Particle): Promise<IComponent> {
        const rpc = Rpc.getInstance();
        const dump = await rpc.request('Component', 'query', [{ path: particle.componentPath }]);
        if (!dump) { throw new Error(`Missing ${particle.componentPath}`); }
        const node = await rpc.request('Node', 'query', [{ path: particle.nodePath, includeComponents: true }]) as INode;
        const nested = node.__comps__.find(item => item.value.uuid.value === dump.value.uuid.value);
        // Node encoding adds paths; compare metadata and values independently of those paths.
        const withoutPaths = (value: IComponent | undefined) => JSON.parse(JSON.stringify(value,
            (key, item) => key === 'path' ? undefined : item));
        expect(withoutPaths(nested)).toEqual(withoutPaths(dump));
        const publicDump = await ComponentProxy.query({ path: particle.componentPath });
        expect(publicDump?.properties.renderer ?? publicDump?.properties.custom)
            .toEqual(dump.value.renderer ?? dump.value.custom);
        return dump;
    }

    async function set(particle: Particle, path: string, value: IProperty['value']): Promise<void> {
        const dump = await query(particle);
        let field: IProperty = dump;
        for (const key of path.split('.')) {
            field = field.value[key];
        }
        const node = await Rpc.getInstance().request('Node', 'query', [{ path: particle.nodePath, includeComponents: true }]) as INode;
        const index = node.__comps__.findIndex(item => item.value.uuid.value === particle.uuid);
        expect(index).toBeGreaterThanOrEqual(0);
        // Inspector property writes are an internal Scene RPC, omitted from the
        // public API type. Exercise component recording and the Inspector leaf path.
        const componentRpc = Rpc.getInstance() as unknown as {
            request(service: 'Component', method: 'setProperty', args: [ISetPropertyOptions]): Promise<boolean>;
        };
        expect(await componentRpc.request('Component', 'setProperty', [{
            nodePath: particle.nodePath, path: `__comps__.${index}.${path}`, dump: { ...field, value },
        }])).toBe(true);
    }

    async function undo(): Promise<void> {
        expect((await Rpc.getInstance().request('Undo', 'undo', [{}])).success).toBe(true);
    }

    it('round-trips 3D metadata for the actual device mode, including CPU fallback', async () => {
        const particle = await create('Metadata3D');
        const other = await create('MetadataOther3D');
        await set(particle, 'trailModule.widthRatio.constant', 0.37);
        const cpu = await query(particle);
        expect(cpu.value.renderer.value.useGPU.value).toBe(false);
        expect(cpu.value.renderer.value.gpuMaterial.readonly).toBe(true);
        await set(particle, 'renderer.useGPU', true);
        const gpu = await query(particle);
        const useGPU: boolean = gpu.value.renderer.value.useGPU.value;
        // Node's headless gfx device may reject GPU mode. Keep that fallback
        // covered, and allow GPU-capable test runners to require the GPU branch.
        if (process.env.COCOS_REQUIRE_GPU_PARTICLES === '1') {
            expect(useGPU).toBe(true);
        }
        if (!useGPU) {
            console.warn('GPU particle mode unavailable on the scene worker: GPU round-trip requires browser verification.');
        }
        expect([
            gpu.value.trailModule.visible, gpu.value.limitVelocityOvertimeModule.visible,
            gpu.value.renderer.value.cpuMaterial.readonly, gpu.value.renderer.value.gpuMaterial.readonly,
            gpu.value.renderer.value.trailMaterial.readonly,
        ]).toEqual([!useGPU, !useGPU, useGPU, !useGPU, useGPU]);
        expect((await query(other)).value.trailModule.visible).toBe(true);
        if (!useGPU) { await set(particle, 'trailModule.widthRatio.constant', 0.5); }
        await undo();
        expect((await query(particle)).value.trailModule.visible).toBe(true);
        expect((await query(particle)).value.trailModule.value.widthRatio.value.constant.value).toBeCloseTo(0.37);
        expect((await Rpc.getInstance().request('Redo', 'redo', [{}])).success).toBe(true);
        expect((await query(particle)).value.trailModule.visible).toBe(!useGPU);
        if (!useGPU) { await set(particle, 'trailModule.widthRatio.constant', 0.37); }
        await EditorProxy.save({ urlOrUUID: sceneUrl });
        await EditorProxy.close({ save: false });
        await EditorProxy.open({ urlOrUUID: sceneUrl });
        const reloaded = await query(particle);
        expect(reloaded.value.renderer.value.useGPU.value).toBe(useGPU);
        expect(reloaded.value.trailModule.value.widthRatio.value.constant.value).toBeCloseTo(0.37);
        await set(particle, 'renderer.useGPU', false);
        expect((await query(particle)).value.trailModule.visible).toBe(true);
    });

    it('recomputes all five Shape choice lists without cross-instance pollution', async () => {
        const particle = await create('MetadataShape');
        const other = await create('MetadataShapeOther');
        for (const [shapeType, names] of [
            [0, ['Volume', 'Shell', 'Edge']], [1, []], [2, ['Base', 'Shell', 'Volume']],
            [3, ['Volume', 'Shell']], [4, ['Volume', 'Shell']], [0, ['Volume', 'Shell', 'Edge']],
        ] as const) {
            await set(particle, 'shapeModule.shapeType', shapeType);
            const shape = (await query(particle)).value.shapeModule.value;
            expect(shape.shapeType.value).toBe(shapeType);
            expect(shape.emitFrom.enumList.map((entry: { name: string }) => entry.name)).toEqual(names);
            expect(shape.emitFrom.visible).toBe(shapeType !== 1);
            expect((await query(other)).value.shapeModule.value.emitFrom.enumList.map((entry: { name: string }) => entry.name))
                .toEqual(['Base', 'Shell', 'Volume']);
        }
        await undo();
        expect((await query(particle)).value.shapeModule.value.shapeType.value).toBe(4);
        expect((await Rpc.getInstance().request('Redo', 'redo', [{}])).success).toBe(true);
        expect((await query(particle)).value.shapeModule.value.emitFrom.enumList.map((entry: { name: string }) => entry.name))
            .toEqual(['Volume', 'Shell', 'Edge']);
    });

    it('preserves 2D hidden values across Custom / emitter mode changes and reload', async () => {
        const particle = await create('Metadata2D', 'cc.ParticleSystem2D');
        await set(particle, 'custom', true);
        await set(particle, 'speedVar', 23);
        await set(particle, 'startRadiusVar', 31);
        for (const mode of [1, 0, 1]) {
            await set(particle, 'emitterMode', mode);
            const dump = await query(particle);
            expect([dump.value.speed.visible, dump.value.speedVar.visible, dump.value.startRadius.visible, dump.value.startRadiusVar.visible])
                .toEqual([mode === 0, mode === 0, mode === 1, mode === 1]);
        }
        await set(particle, 'custom', false);
        const hidden = await query(particle);
        expect([hidden.value.custom.value, hidden.value.speedVar.visible, hidden.value.startRadiusVar.visible])
            .toEqual([false, false, false]);
        await undo();
        expect((await query(particle)).value.startRadiusVar.visible).toBe(true);
        expect((await Rpc.getInstance().request('Redo', 'redo', [{}])).success).toBe(true);
        expect((await query(particle)).value.startRadiusVar.visible).toBe(false);
        await EditorProxy.save({ urlOrUUID: sceneUrl });
        await EditorProxy.close({ save: false });
        await EditorProxy.open({ urlOrUUID: sceneUrl });
        const reloaded = await query(particle);
        expect([reloaded.value.custom.value, reloaded.value.speedVar.visible, reloaded.value.startRadiusVar.visible])
            .toEqual([false, false, false]);
        await set(particle, 'custom', true);
        const restored = await query(particle);
        expect([restored.value.speedVar.value, restored.value.startRadiusVar.value, restored.value.startRadiusVar.visible])
            .toEqual([23, 31, true]);
    });
});
