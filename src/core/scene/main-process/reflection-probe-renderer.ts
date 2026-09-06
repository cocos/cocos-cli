import type { RemoteSocket } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io/dist/typed-events';
import { SCENE_RENDERER_ROOM, socketService } from '../../../server/socket';

export interface IReflectionProbeCaptureResult {
    sceneUrl: string;
    sceneName: string;
    componentUuid: string;
    probeId: number;
    resolution: number;
    fastBake: boolean;
    captureToken: string;
    faces: string[];
}

export interface IActiveReflectionProbeCaptureResult extends IReflectionProbeCaptureResult {
    rendererId: string;
}

export interface IReflectionProbeApplyRequest {
    sceneUrl: string;
    nodePath: string;
    componentUuid: string;
    cubemapUuid: string;
    captureToken: string;
    saveScene: boolean;
    timeoutMs?: number;
}

interface ICaptureResponse {
    result?: IReflectionProbeCaptureResult;
    error?: string;
}

interface IApplyResponse {
    result?: {
        applied?: boolean;
        saved?: boolean;
    };
    error?: string;
}

interface ICaptureRequest {
    sceneUrl?: string;
    nodePath: string;
    timeoutMs: number;
}

interface IRendererSocketData {
    sceneUrl?: string;
    sceneRendererVisible?: boolean;
}

type Socket = RemoteSocket<DefaultEventsMap, IRendererSocketData>;

function requireRendererSockets(): Promise<Socket[]> {
    const io = socketService.io;
    if (!io) {
        throw new Error('The WebGL scene renderer is unavailable because the HTTP server is not running.');
    }
    return io.in(SCENE_RENDERER_ROOM).fetchSockets() as Promise<Socket[]>;
}

function requireAvailableRenderer(sockets: Socket[]): void {
    if (sockets.length === 0) {
        throw new Error('Reflection Probe Bake requires a WebGL scene renderer. Open /scene-editor/ in a browser and retry.');
    }
}

function selectActiveRenderer(sockets: Socket[]): { socket: Socket; sceneUrl: string } {
    // Pink keeps an empty WebGL renderer preloaded. It is infrastructure, not
    // an open scene, and must never make an otherwise unique scene ambiguous.
    const loaded = sockets.filter((socket) => Boolean(socket.data.sceneUrl));
    const visible = loaded.filter((socket) => socket.data.sceneRendererVisible === true);
    if (visible.length === 1) {
        return { socket: visible[0], sceneUrl: visible[0].data.sceneUrl! };
    }
    if (visible.length > 1) {
        throw new Error(
            'Multiple visible WebGL scene renderers are open. Close the duplicate scene views and retry.',
        );
    }

    if (sockets.some((socket) => socket.data.sceneRendererVisible === true)) {
        throw new Error('The visible WebGL scene renderer has not finished loading a scene. Wait for it and retry.');
    }

    const candidates = loaded.filter((socket) => socket.data.sceneRendererVisible !== false);
    if (candidates.length === 1) {
        return { socket: candidates[0], sceneUrl: candidates[0].data.sceneUrl! };
    }
    if (candidates.length === 0) {
        throw new Error('No loaded WebGL scene renderer is currently visible. Activate the target scene tab and retry.');
    }
    throw new Error(
        'Multiple WebGL scene renderers are open, but none reported which scene is visible. '
        + 'Activate the target scene tab and retry.',
    );
}

function requestCapture(socket: Socket, request: ICaptureRequest): Promise<IReflectionProbeCaptureResult> {
    return new Promise((resolve, reject) => {
        socket.timeout(request.timeoutMs).emit(
            'scene:capture-reflection-probe',
            request,
            (error: Error | null, response?: ICaptureResponse) => {
                if (error) {
                    reject(error);
                } else if (response?.result) {
                    if (request.sceneUrl && response.result.sceneUrl !== request.sceneUrl) {
                        reject(new Error(
                            `The WebGL renderer returned the wrong scene: expected ${request.sceneUrl}, `
                            + `got ${response.result.sceneUrl || 'unknown'}.`,
                        ));
                    } else {
                        resolve(response.result);
                    }
                } else {
                    reject(new Error(response?.error || 'WebGL scene renderer returned no reflection-probe data.'));
                }
            },
        );
    });
}

function requestApply(
    socket: Socket,
    request: IReflectionProbeApplyRequest & { timeoutMs: number },
): Promise<unknown> {
    return new Promise((resolve, reject) => {
        socket.timeout(request.timeoutMs).emit(
            'scene:apply-reflection-probe',
            request,
            (error: Error | null, response?: IApplyResponse) => {
                if (error) {
                    reject(new Error(
                        'The reflection-probe apply acknowledgement timed out; '
                        + `the final WebGL apply state is unknown. (${error.message})`,
                    ));
                } else if (response?.error) {
                    reject(new Error(response.error));
                } else if (response?.result?.applied === true && response.result.saved === request.saveScene) {
                    resolve(response.result);
                } else {
                    reject(new Error('WebGL scene renderer returned an invalid reflection-probe apply acknowledgement.'));
                }
            },
        );
    });
}

function captureError(error: unknown): Error {
    const detail = error instanceof Error ? error.message : String(error);
    return new Error(
        'The selected WebGL scene renderer could not complete the reflection-probe capture. '
        + `Open /scene-editor/ and wait for it to finish loading, then retry. (${detail})`,
    );
}

export const reflectionProbeRenderer = {
    async capture(sceneUrl: string, nodePath: string, timeoutMs: number): Promise<IReflectionProbeCaptureResult> {
        const sockets = await requireRendererSockets();
        requireAvailableRenderer(sockets);

        const matching = sockets.filter((candidate) => candidate.data.sceneUrl === sceneUrl);
        if (matching.length !== 1) {
            throw new Error(
                matching.length === 0
                    ? `No WebGL renderer is displaying the requested scene: ${sceneUrl}.`
                    : `Multiple WebGL renderers are displaying the requested scene: ${sceneUrl}.`,
            );
        }
        try {
            return await requestCapture(matching[0], { sceneUrl, nodePath, timeoutMs });
        } catch (error) {
            throw captureError(error);
        }
    },

    async captureActive(nodePath: string, timeoutMs: number): Promise<IActiveReflectionProbeCaptureResult> {
        const sockets = await requireRendererSockets();
        requireAvailableRenderer(sockets);

        const selection = selectActiveRenderer(sockets);
        try {
            const result = await requestCapture(selection.socket, {
                sceneUrl: selection.sceneUrl,
                nodePath,
                timeoutMs,
            });
            return { ...result, rendererId: selection.socket.id };
        } catch (error) {
            throw captureError(error);
        }
    },

    async apply(
        rendererId: string,
        request: IReflectionProbeApplyRequest,
        timeoutMs: number,
    ): Promise<unknown> {
        const sockets = await requireRendererSockets();
        const socket = sockets.find((candidate) => candidate.id === rendererId);
        if (!socket) {
            throw new Error(
                'The WebGL scene renderer that captured the reflection probe is no longer connected. '
                + 'Keep the scene editor open and retry the bake.',
            );
        }

        try {
            return await requestApply(socket, { ...request, timeoutMs });
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(
                'The WebGL scene renderer that captured the reflection probe could not apply the baked cubemap. '
                + `Keep the scene editor open and retry the bake. (${detail})`,
            );
        }
    },
};
