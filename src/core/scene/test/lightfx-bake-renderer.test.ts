const mockSocketService: { io?: any } = {};

jest.mock('../../../server/socket', () => ({
    SCENE_RENDERER_ROOM: 'scene-renderer',
    socketService: mockSocketService,
}));

import { lightFXBakeRenderer } from '../main-process/lightfx-bake-renderer';

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
