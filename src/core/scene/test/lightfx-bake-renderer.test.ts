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
});
