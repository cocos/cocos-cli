import type { RemoteSocket } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io/dist/typed-events';
import { SCENE_RENDERER_ROOM, socketService } from '../../../server/socket';

type LightFXModule = 'LightProbeBake' | 'LightmapBake';
type LightFXMethod = 'bake' | 'clearBake' | 'cancel';

interface RendererSocketData {
    sceneUrl?: string;
    sceneRendererVisible?: boolean;
}

interface LightFXResponse<T> {
    result?: T;
    sceneUrl?: string;
    error?: string;
}

type RendererSocket = RemoteSocket<DefaultEventsMap, RendererSocketData>;

function selectActiveRenderer(sockets: RendererSocket[]): RendererSocket {
    const loaded = sockets.filter((socket) => Boolean(socket.data.sceneUrl));
    const visible = loaded.filter((socket) => socket.data.sceneRendererVisible === true);
    if (visible.length === 1) return visible[0];
    if (visible.length > 1) {
        throw new Error('Multiple visible scene renderers are open. Close the duplicate scene views and retry.');
    }
    if (sockets.some((socket) => socket.data.sceneRendererVisible === true)) {
        throw new Error('The visible scene renderer has not finished loading a scene. Wait for it and retry.');
    }

    const candidates = loaded.filter((socket) => socket.data.sceneRendererVisible !== false);
    if (candidates.length === 1) return candidates[0];
    if (candidates.length === 0) {
        throw new Error('No loaded scene renderer is currently visible. Activate the target scene tab and retry.');
    }
    throw new Error('Multiple scene renderers are open. Activate the target scene tab and retry.');
}

function requestRenderer<T>(
    socket: RendererSocket,
    module: LightFXModule,
    method: LightFXMethod,
    args: unknown[],
    timeoutMs: number,
): Promise<T> {
    const sceneUrl = socket.data.sceneUrl || '';
    return new Promise((resolve, reject) => {
        socket.timeout(timeoutMs).emit(
            'scene:invoke-lightfx',
            { sceneUrl, module, method, args },
            (error: Error | null, response?: LightFXResponse<T>) => {
                if (error) {
                    reject(new Error(`The active scene renderer did not complete the LightFX request. (${error.message})`));
                } else if (response?.error) {
                    reject(new Error(response.error));
                } else if (!response || !Object.prototype.hasOwnProperty.call(response, 'result')) {
                    reject(new Error('The active scene renderer returned an invalid LightFX response.'));
                } else if (method !== 'cancel' && response.sceneUrl !== sceneUrl) {
                    reject(new Error(
                        `The active scene changed during the LightFX request: expected ${sceneUrl}, `
                        + `got ${response.sceneUrl || 'unknown'}.`,
                    ));
                } else {
                    resolve(response.result as T);
                }
            },
        );
    });
}

class LightFXBakeRenderer {
    private activeBakeRendererId: string | null = null;

    async invoke<T>(
        module: LightFXModule,
        method: LightFXMethod,
        args: unknown[],
        timeoutMs: number,
        fallback: () => Promise<T>,
        trackBake = false,
    ): Promise<T> {
        const io = socketService.io;
        if (!io) return fallback();
        const sockets = await io.in(SCENE_RENDERER_ROOM).fetchSockets() as RendererSocket[];
        if (sockets.length === 0) return fallback();

        const renderer = selectActiveRenderer(sockets);
        if (trackBake && this.activeBakeRendererId) {
            throw new Error('A LightFX bake is already in progress in the scene renderer.');
        }
        if (trackBake) this.activeBakeRendererId = renderer.id;
        try {
            return await requestRenderer<T>(renderer, module, method, args, timeoutMs);
        } finally {
            if (trackBake && this.activeBakeRendererId === renderer.id) {
                this.activeBakeRendererId = null;
            }
        }
    }

    async cancel<T>(fallback: () => Promise<T>, timeoutMs = 30_000): Promise<T> {
        const io = socketService.io;
        if (!io) return fallback();
        const sockets = await io.in(SCENE_RENDERER_ROOM).fetchSockets() as RendererSocket[];
        if (sockets.length === 0) return fallback();

        const renderer = this.activeBakeRendererId
            ? sockets.find((socket) => socket.id === this.activeBakeRendererId)
            : selectActiveRenderer(sockets);
        if (!renderer) {
            throw new Error('The scene renderer running the LightFX bake is no longer connected.');
        }
        return requestRenderer<T>(renderer, 'LightProbeBake', 'cancel', [], timeoutMs);
    }
}

export const lightFXBakeRenderer = new LightFXBakeRenderer();
