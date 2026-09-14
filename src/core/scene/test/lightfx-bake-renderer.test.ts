const mockSocketService: { io?: any } = {};
const mockWorkerRequest = jest.fn();

jest.mock('../../../server/socket', () => ({
    SCENE_RENDERER_ROOM: 'scene-renderer',
    socketService: mockSocketService,
}));
jest.mock('../main-process/rpc', () => ({ Rpc: { getInstance: () => ({ request: mockWorkerRequest }) } }));

import { lightFXBakeRenderer } from '../main-process/lightfx-bake-renderer';
import { LightProbeBakeProxy } from '../main-process/proxy/lightfx-bake-proxy';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { transpileModule, ModuleKind } from 'typescript';

interface FakeSocketOptions {
    id: string;
    sceneUrl?: string;
    visible?: boolean;
    result?: unknown;
}

function createSocket(options: FakeSocketOptions) {
    const emit = jest.fn((_event, request, callback) => callback(null, {
        result: options.result ?? { sceneUrl: options.sceneUrl },
        sceneUrl: options.sceneUrl,
    }));
    return {
        id: options.id,
        data: {
            sceneUrl: options.sceneUrl,
            sceneRendererVisible: options.visible,
        },
        timeout: jest.fn(() => ({ emit })),
        emit,
    };
}

function useSockets(sockets: ReturnType<typeof createSocket>[]) {
    mockSocketService.io = {
        in: jest.fn(() => ({ fetchSockets: jest.fn(async () => sockets) })),
    };
}

describe('LightFX active scene renderer routing', () => {
    afterEach(() => {
        mockSocketService.io = undefined;
        jest.clearAllMocks();
    });

    it('routes a bake to the visible loaded renderer instead of a hidden preload renderer', async () => {
        const hidden = createSocket({ id: 'hidden', sceneUrl: '', visible: false });
        const visible = createSocket({
            id: 'visible',
            sceneUrl: 'db://assets/LightProbe.scene',
            visible: true,
            result: { sceneUrl: 'db://assets/LightProbe.scene', probeCount: 8 },
        });
        useSockets([hidden, visible]);
        const fallback = jest.fn();

        await expect(lightFXBakeRenderer.invoke(
            'LightProbeBake', 'bake', [{}], 600_000, fallback, true,
        )).resolves.toEqual({ sceneUrl: 'db://assets/LightProbe.scene', probeCount: 8 });

        expect(fallback).not.toHaveBeenCalled();
        expect(hidden.timeout).not.toHaveBeenCalled();
        expect(visible.emit).toHaveBeenCalledWith(
            'scene:invoke-lightfx',
            expect.objectContaining({
                sceneUrl: 'db://assets/LightProbe.scene',
                module: 'LightProbeBake',
                method: 'bake',
            }),
            expect.any(Function),
        );
    });

    it('falls back to the Scene Worker when no WebGL scene renderer is connected', async () => {
        useSockets([]);
        const fallback = jest.fn(async () => ({ probeCount: 4 }));

        await expect(lightFXBakeRenderer.invoke(
            'LightProbeBake', 'bake', [{}], 600_000, fallback, true,
        )).resolves.toEqual({ probeCount: 4 });
        expect(fallback).toHaveBeenCalledTimes(1);
    });

    it.each(['LightProbeBake', 'LightmapBake'] as const)('routes %s capability queries to the actual renderer, with worker fallback only when absent', async module => {
        const result = { version: 1, resultLifecycleVersion: 1, sceneTransactionVersion: 1, ...(module === 'LightmapBake' ? { assetVersion: 1 } : {}), busy: true };
        const visible = createSocket({ id: 'visible', sceneUrl: 'db://assets/Probe.scene', visible: true, result });
        useSockets([visible]);
        const fallback = jest.fn(async () => result);
        await expect(lightFXBakeRenderer.invoke(
            module, 'queryCapabilities', [], 30_000, fallback,
        )).resolves.toEqual(result);
        expect(fallback).not.toHaveBeenCalled();
        expect(visible.emit).toHaveBeenCalledWith('scene:invoke-lightfx', expect.objectContaining({
            module, method: 'queryCapabilities', sceneUrl: 'db://assets/Probe.scene',
        }), expect.any(Function));
        useSockets([]);
        await expect(lightFXBakeRenderer.invoke(
            module, 'queryCapabilities', [], 30_000, fallback,
        )).resolves.toEqual(result);
        expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('routes a lightmap bake-info query to the active renderer', async () => {
        const visible = createSocket({
            id: 'visible',
            sceneUrl: 'db://assets/Lightmap.scene',
            visible: true,
            result: { baked: true, textures: [] },
        });
        useSockets([visible]);

        await expect(lightFXBakeRenderer.invoke(
            'LightmapBake', 'queryBakeInfo', [], 120_000, jest.fn(),
        )).resolves.toEqual({ baked: true, textures: [] });
        expect(visible.emit).toHaveBeenCalledWith(
            'scene:invoke-lightfx',
            expect.objectContaining({ module: 'LightmapBake', method: 'queryBakeInfo' }),
            expect.any(Function),
        );
    });

    it('routes the public settings query without a bake lock and falls back only without a renderer', async () => {
        const result = { giScale: { value: 1, type: 'Number', readonly: false } };
        const visible = createSocket({ id: 'visible', sceneUrl: 'db://assets/Test.scene', visible: true, result });
        useSockets([visible]);
        const pending = createSocket({ id: 'baking', sceneUrl: 'db://assets/Test.scene', visible: true });
        let finishBake!: (_error: null, response: unknown) => void;
        pending.emit.mockImplementation((_event, _request, reply) => { finishBake = reply; });
        useSockets([pending]);
        const bake = lightFXBakeRenderer.invoke('LightProbeBake', 'bake', [{}], 600_000, jest.fn(), true);
        await Promise.resolve();
        try {
            useSockets([visible]);
            await expect(LightProbeBakeProxy.querySettings()).resolves.toEqual(result);
            expect(visible.timeout).toHaveBeenCalledWith(30_000);
            expect(visible.emit).toHaveBeenCalledWith('scene:invoke-lightfx', {
                sceneUrl: 'db://assets/Test.scene', module: 'LightProbeBake', method: 'querySettings', args: [],
            }, expect.any(Function));
            expect(mockWorkerRequest).not.toHaveBeenCalled();
        } finally {
            finishBake(null, { result: {}, sceneUrl: 'db://assets/Test.scene' });
            await bake;
        }
        useSockets([]);
        mockWorkerRequest.mockResolvedValueOnce(result);
        await expect(LightProbeBakeProxy.querySettings()).resolves.toEqual(result);
        expect(mockWorkerRequest).toHaveBeenCalledWith('LightProbeBake', 'querySettings');
    });

    it('does not silently bake in the Scene Worker when the visible renderer has no scene', async () => {
        useSockets([
            createSocket({ id: 'visible', sceneUrl: '', visible: true }),
            createSocket({ id: 'hidden', sceneUrl: 'db://assets/Other.scene', visible: false }),
        ]);
        const fallback = jest.fn();

        await expect(lightFXBakeRenderer.invoke(
            'LightProbeBake', 'bake', [{}], 600_000, fallback, true,
        )).rejects.toThrow('visible scene renderer has not finished loading');
        expect(fallback).not.toHaveBeenCalled();
    });

    it.each(['LightProbeBake', 'LightmapBake'] as const)('preserves the %s module when routing cancellation', async module => {
        const visible = createSocket({ id: 'visible', sceneUrl: 'db://assets/Test.scene', visible: true });
        useSockets([visible]);
        const fallback = jest.fn();
        await lightFXBakeRenderer.cancel(module, fallback);
        expect(visible.emit).toHaveBeenCalledWith('scene:invoke-lightfx', expect.objectContaining({ module, method: 'cancel' }), expect.any(Function));
        expect(fallback).not.toHaveBeenCalled();
        useSockets([]);
        await lightFXBakeRenderer.cancel(module, fallback);
        expect(fallback).toHaveBeenCalledTimes(1);
    });
});

describe('LightFX browser settings request boundary', () => {
    // Execute the actual browser channel registration with only its environment
    // mocked; a proxy-only test would miss queryCurrent() calls in this bridge.
    const source = readFileSync(join(__dirname, '../scene-process/engine-bootstrap.ts'), 'utf8');
    const script = transpileModule(`${source}\nexports.setupForTest = setupBrowserInvokeChannel;`, {
        compilerOptions: { module: ModuleKind.CommonJS },
    }).outputText;

    async function fixture() {
        const handlers = new Map<string, (...args: any[]) => any>();
        let scene: object | null = {};
        let generation = 0;
        const queryCurrent = jest.fn((): unknown => { throw new Error('Settings reads must not dump the scene'); });
        const querySettings = jest.fn(async () => ({ giScale: { value: 1, type: 'Number', readonly: false } }));
        const request = jest.fn(async (): Promise<{ uuid: string; url: string } | null> => ({ uuid: 'scene-uuid', url: 'db://assets/Test.scene' }));
        const editor = {
            queryCurrent,
            getEditorSession: () => ({ uuid: 'scene-uuid', generation }),
            isCurrentEditorSession: (session: { generation: number }) => generation === session.generation,
            getCurrentEditorType: jest.fn(() => 'scene'),
        };
        const queryCapabilities = jest.fn(async () => ({ version: 1 }));
        const service = { Editor: editor, LightProbeBake: { querySettings, queryCapabilities } };
        const modules: Record<string, unknown> = {
            './service/core/decorator': { Service: service },
            './service/core': { ServiceEvents: { on: jest.fn() } },
            './rpc': { Rpc: { getInstance: () => ({ request }) } },
        };
        const sandbox = {
            exports: {} as { setupForTest?: (url: string) => Promise<void> },
            require: (id: string) => modules[id] ?? {},
            io: () => ({ on: (name: string, callback: (...args: any[]) => any) => handlers.set(name, callback), emit: jest.fn() }),
            window: { addEventListener: jest.fn() },
            cc: { director: { getScene: () => scene } },
            Error, // Mock RPC errors and the browser handler share one realm in production.
            console,
        };
        runInNewContext(script, sandbox);
        await sandbox.exports.setupForTest!('http://localhost');
        const invoke = async (overrides: object = {}) => {
            const reply = jest.fn();
            await handlers.get('scene:invoke-lightfx')!({
                module: 'LightProbeBake', method: 'querySettings', args: [], sceneUrl: 'db://assets/Test.scene', ...overrides,
            }, reply);
            return reply.mock.calls[0]?.[0];
        };
        return { invoke, request, queryCurrent, querySettings, queryCapabilities, editor, replaceScene: () => { scene = {}; }, reload: () => { generation++; } };
    }

    it('queries scalar settings using only asset metadata, without a dump before or after', async () => {
        const f = await fixture();
        await expect(f.invoke()).resolves.toEqual({
            result: { giScale: { value: 1, type: 'Number', readonly: false } }, sceneUrl: 'db://assets/Test.scene',
        });
        expect(f.querySettings).toHaveBeenCalledTimes(1);
        expect(f.request).toHaveBeenCalledWith('assetManager', 'queryAssetInfo', ['scene-uuid']);
        expect(f.request).toHaveBeenCalledTimes(1);
        expect(f.queryCurrent).not.toHaveBeenCalled();
    });

    it.each(['missing', 'failed'])('rejects a %s asset lookup without reading settings or dumping', async state => {
        const f = await fixture();
        if (state === 'missing') f.request.mockResolvedValueOnce(null);
        else f.request.mockRejectedValueOnce(new Error('Asset metadata unavailable'));
        await expect(f.invoke()).resolves.toEqual({ error: state === 'missing'
            ? 'The selected scene renderer is not displaying the requested scene: db://assets/Test.scene.'
            : 'Asset metadata unavailable' });
        expect(f.querySettings).not.toHaveBeenCalled();
        expect(f.queryCurrent).not.toHaveBeenCalled();
    });

    it.each(['reload', 'replaceScene'] as const)('rejects a %s during URL lookup before reading settings', async change => {
        const f = await fixture();
        f.request.mockImplementationOnce(async () => { f[change](); return { uuid: 'scene-uuid', url: 'db://assets/Test.scene' }; });
        await expect(f.invoke()).resolves.toEqual({ error: 'The source scene changed during the light-probe settings query.' });
        expect(f.querySettings).not.toHaveBeenCalled();
        expect(f.queryCurrent).not.toHaveBeenCalled();
    });

    it('rejects a replaced scene after the service read', async () => {
        const f = await fixture();
        f.querySettings.mockImplementationOnce(async () => { f.replaceScene(); return { giScale: { value: 1, type: 'Number', readonly: false } }; });
        await expect(f.invoke()).resolves.toHaveProperty('error', 'The source scene changed during the light-probe settings query.');
        expect(f.queryCurrent).not.toHaveBeenCalled();
    });

    it('keeps the new method restricted to LightProbeBake and the requested scene', async () => {
        const f = await fixture();
        await expect(f.invoke({ module: 'LightmapBake' })).resolves.toEqual({ error: 'Invalid LightFX scene request.' });
        await expect(f.invoke({ sceneUrl: 'db://assets/Other.scene' })).resolves.toHaveProperty('error');
        f.editor.getCurrentEditorType.mockReturnValue('prefab');
        await expect(f.invoke()).resolves.toHaveProperty('error', 'Light-probe settings require an open scene.');
        expect(f.querySettings).not.toHaveBeenCalled();
        expect(f.queryCurrent).not.toHaveBeenCalled();
    });

    it('leaves existing capability requests on their original scene URL path', async () => {
        const f = await fixture();
        f.queryCurrent.mockImplementation(() => ({ __identifier__: { assetUrl: 'db://assets/Test.scene' } }));
        await expect(f.invoke({ method: 'queryCapabilities' })).resolves.toEqual({ result: { version: 1 }, sceneUrl: 'db://assets/Test.scene' });
        expect(f.queryCapabilities).toHaveBeenCalledTimes(1);
        expect(f.queryCurrent).toHaveBeenCalledTimes(2);
        expect(f.request).not.toHaveBeenCalled();
        expect(f.querySettings).not.toHaveBeenCalled();
    });
});
