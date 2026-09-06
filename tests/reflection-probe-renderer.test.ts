const mockFetchSockets = jest.fn();
const mockIn = jest.fn(() => ({ fetchSockets: mockFetchSockets }));

jest.mock('../src/server/socket', () => ({
    SCENE_RENDERER_ROOM: 'scene-renderer',
    socketService: { io: { in: mockIn } },
}));

import { reflectionProbeRenderer } from '../src/core/scene/main-process/reflection-probe-renderer';

interface IMockRendererOptions {
    id?: string;
    sceneUrl?: string;
    visible?: boolean;
    captureError?: string;
    captureResultSceneUrl?: string;
    applyError?: string;
}

function captureResult(sceneUrl: string) {
    return {
        sceneUrl,
        sceneName: sceneUrl.slice(sceneUrl.lastIndexOf('/') + 1, -'.scene'.length),
        componentUuid: 'Comp.1',
        probeId: 0,
        resolution: 64,
        fastBake: false,
        captureToken: 'capture-token',
        faces: Array(6).fill('pixels'),
    };
}

function rendererSocket(options: IMockRendererOptions = {}) {
    const sceneUrl = options.sceneUrl ?? 'db://assets/Target.scene';
    const socket = {
        id: options.id ?? 'renderer-1',
        data: {
            sceneUrl,
            sceneRendererVisible: options.visible,
        },
        timeout: jest.fn(),
        emit: jest.fn((event, request, reply) => {
            if (event === 'scene:capture-reflection-probe') {
                reply(null, options.captureError
                    ? { error: options.captureError }
                    : { result: captureResult(options.captureResultSceneUrl ?? sceneUrl) });
            } else if (event === 'scene:apply-reflection-probe') {
                reply(null, options.applyError
                    ? { error: options.applyError }
                    : { result: { applied: true, saved: request.saveScene } });
            }
        }),
    };
    socket.timeout.mockReturnValue(socket);
    return socket;
}

describe('reflection probe WebGL renderer bridge', () => {
    beforeEach(() => jest.clearAllMocks());

    it('selects an explicitly requested scene', async () => {
        const other = rendererSocket({ id: 'other', sceneUrl: 'db://assets/Other.scene' });
        const matching = rendererSocket({ id: 'matching' });
        mockFetchSockets.mockResolvedValue([other, matching]);

        await expect(reflectionProbeRenderer.capture(
            'db://assets/Target.scene',
            'Probe',
            1000,
        )).resolves.toMatchObject({ sceneUrl: 'db://assets/Target.scene' });

        expect(mockIn).toHaveBeenCalledWith('scene-renderer');
        expect(matching.emit).toHaveBeenCalledTimes(1);
        expect(other.emit).not.toHaveBeenCalled();
    });

    it('ignores Pink\'s empty preloaded renderer when one scene is loaded', async () => {
        const scene = rendererSocket({ id: 'scene' });
        const preloader = rendererSocket({ id: 'preloader', sceneUrl: '', visible: false });
        mockFetchSockets.mockResolvedValue([scene, preloader]);

        await expect(reflectionProbeRenderer.captureActive('Probe', 1500)).resolves.toEqual({
            ...captureResult('db://assets/Target.scene'),
            rendererId: 'scene',
        });
        expect(scene.emit).toHaveBeenCalledWith(
            'scene:capture-reflection-probe',
            {
                sceneUrl: 'db://assets/Target.scene',
                nodePath: 'Probe',
                timeoutMs: 1500,
            },
            expect.any(Function),
        );
        expect(preloader.emit).not.toHaveBeenCalled();
    });

    it('does not fall back to a hidden scene while the visible renderer is still loading', async () => {
        const hidden = rendererSocket({ id: 'hidden', visible: false });
        const loading = rendererSocket({ id: 'loading', sceneUrl: '', visible: true });
        mockFetchSockets.mockResolvedValue([hidden, loading]);

        await expect(reflectionProbeRenderer.captureActive('Probe', 1000))
            .rejects.toThrow('visible WebGL scene renderer has not finished loading');
        expect(hidden.emit).not.toHaveBeenCalled();
    });

    it('selects the visible scene when Pink retains multiple loaded editors', async () => {
        const hidden = rendererSocket({
            id: 'hidden',
            sceneUrl: 'db://assets/Hidden.scene',
            visible: false,
        });
        const visible = rendererSocket({ id: 'visible', visible: true });
        mockFetchSockets.mockResolvedValue([hidden, visible]);

        await expect(reflectionProbeRenderer.captureActive('Probe', 1000)).resolves.toMatchObject({
            sceneUrl: 'db://assets/Target.scene',
            rendererId: 'visible',
        });
        expect(visible.emit).toHaveBeenCalledTimes(1);
        expect(hidden.emit).not.toHaveBeenCalled();
    });

    it('fails safely when multiple loaded scenes have not reported visibility', async () => {
        const first = rendererSocket({ id: 'first', sceneUrl: 'db://assets/First.scene' });
        const second = rendererSocket({ id: 'second', sceneUrl: 'db://assets/Second.scene' });
        mockFetchSockets.mockResolvedValue([first, second]);

        await expect(reflectionProbeRenderer.captureActive('Probe', 1000))
            .rejects.toThrow('none reported which scene is visible');
        expect(first.emit).not.toHaveBeenCalled();
        expect(second.emit).not.toHaveBeenCalled();
    });

    it('fails safely when no loaded scene is visible', async () => {
        const first = rendererSocket({ id: 'first', visible: false });
        const second = rendererSocket({
            id: 'second',
            sceneUrl: 'db://assets/Second.scene',
            visible: false,
        });
        mockFetchSockets.mockResolvedValue([first, second]);

        await expect(reflectionProbeRenderer.captureActive('Probe', 1000))
            .rejects.toThrow('No loaded WebGL scene renderer is currently visible');
    });

    it('selects the only renderer that is not explicitly hidden', async () => {
        const candidate = rendererSocket({ id: 'candidate' });
        const hidden = rendererSocket({
            id: 'hidden',
            sceneUrl: 'db://assets/Hidden.scene',
            visible: false,
        });
        mockFetchSockets.mockResolvedValue([hidden, candidate]);

        await expect(reflectionProbeRenderer.captureActive('Probe', 1000)).resolves.toMatchObject({
            rendererId: 'candidate',
        });
        expect(hidden.emit).not.toHaveBeenCalled();
    });

    it('fails safely when duplicate renderers are both visible', async () => {
        const first = rendererSocket({ id: 'first', visible: true });
        const second = rendererSocket({ id: 'second', visible: true });
        mockFetchSockets.mockResolvedValue([first, second]);

        await expect(reflectionProbeRenderer.captureActive('Probe', 1000))
            .rejects.toThrow('Multiple visible WebGL scene renderers');
    });

    it('does not fall back when the selected renderer reports a probe error', async () => {
        const active = rendererSocket({
            id: 'active',
            visible: true,
            captureError: 'Reflection probe is disabled or inactive: Probe',
        });
        const hidden = rendererSocket({
            id: 'hidden',
            sceneUrl: 'db://assets/Hidden.scene',
            visible: false,
        });
        mockFetchSockets.mockResolvedValue([hidden, active]);

        await expect(reflectionProbeRenderer.captureActive('Probe', 1000))
            .rejects.toThrow('Reflection probe is disabled or inactive');
        expect(active.emit).toHaveBeenCalledTimes(1);
        expect(hidden.emit).not.toHaveBeenCalled();
    });

    it('rejects a response from a different scene', async () => {
        const renderer = rendererSocket({
            captureResultSceneUrl: 'db://assets/Other.scene',
        });
        mockFetchSockets.mockResolvedValue([renderer]);

        await expect(reflectionProbeRenderer.captureActive('Probe', 1000))
            .rejects.toThrow('returned the wrong scene');
    });

    it('applies only to the renderer that captured the probe', async () => {
        const other = rendererSocket({ id: 'other' });
        const captured = rendererSocket({ id: 'captured' });
        mockFetchSockets.mockResolvedValue([other, captured]);

        await expect(reflectionProbeRenderer.apply('captured', {
            sceneUrl: 'db://assets/Target.scene',
            nodePath: 'Probe',
            componentUuid: 'Comp.1',
            cubemapUuid: 'cube@b47c0',
            captureToken: 'capture-token',
            saveScene: true,
        }, 2000)).resolves.toEqual({ applied: true, saved: true });

        expect(other.emit).not.toHaveBeenCalled();
        expect(captured.emit).toHaveBeenCalledWith(
            'scene:apply-reflection-probe',
            expect.objectContaining({
                sceneUrl: 'db://assets/Target.scene',
                captureToken: 'capture-token',
                timeoutMs: 2000,
            }),
            expect.any(Function),
        );
    });

    it('does not apply through another renderer after the captured one disconnects', async () => {
        const other = rendererSocket({ id: 'other' });
        mockFetchSockets.mockResolvedValue([other]);

        await expect(reflectionProbeRenderer.apply('disconnected', {
            sceneUrl: 'db://assets/Target.scene',
            nodePath: 'Probe',
            componentUuid: 'Comp.1',
            cubemapUuid: 'cube@b47c0',
            captureToken: 'capture-token',
            saveScene: true,
        }, 1000)).rejects.toThrow('no longer connected');
        expect(other.emit).not.toHaveBeenCalled();
    });

    it('surfaces apply errors from the captured renderer', async () => {
        const captured = rendererSocket({ id: 'captured', applyError: 'scene changed during bake' });
        mockFetchSockets.mockResolvedValue([captured]);

        await expect(reflectionProbeRenderer.apply('captured', {
            sceneUrl: 'db://assets/Target.scene',
            nodePath: 'Probe',
            componentUuid: 'Comp.1',
            cubemapUuid: 'cube@b47c0',
            captureToken: 'capture-token',
            saveScene: false,
        }, 1000)).rejects.toThrow('scene changed during bake');
    });

    it('fails without a registered WebGL renderer', async () => {
        mockFetchSockets.mockResolvedValue([]);
        await expect(reflectionProbeRenderer.captureActive('Probe', 1000))
            .rejects.toThrow('requires a WebGL scene renderer');
    });
});
