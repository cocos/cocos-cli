import type { RemoteSocket } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io/dist/typed-events';
import { SCENE_RENDERER_ROOM, socketService } from '../../../server/socket';

export interface IReflectionProbeCaptureResult {
    resolution: number;
    faces: string[];
}

interface ICaptureResponse {
    result?: IReflectionProbeCaptureResult;
    error?: string;
}

interface ICaptureRequest {
    sceneUrl: string;
    nodePath: string;
    timeoutMs: number;
}

type Socket = RemoteSocket<DefaultEventsMap, unknown>;

function requestSocket(socket: Socket, request: ICaptureRequest): Promise<IReflectionProbeCaptureResult> {
    return new Promise((resolve, reject) => {
        socket.timeout(request.timeoutMs).emit(
            'scene:capture-reflection-probe',
            request,
            (error: Error | null, response?: ICaptureResponse) => {
                if (error) {
                    reject(error);
                } else if (response?.result) {
                    resolve(response.result);
                } else {
                    reject(new Error(response?.error || 'WebGL scene renderer returned no reflection-probe data.'));
                }
            },
        );
    });
}

export const reflectionProbeRenderer = {
    async capture(sceneUrl: string, nodePath: string, timeoutMs: number): Promise<IReflectionProbeCaptureResult> {
        const io = socketService.io;
        if (!io) {
            throw new Error('The WebGL scene renderer is unavailable because the HTTP server is not running.');
        }
        const sockets = await io.in(SCENE_RENDERER_ROOM).fetchSockets();
        if (sockets.length === 0) {
            throw new Error('Reflection Probe Bake requires a WebGL scene renderer. Open /scene-editor/ in a browser and retry.');
        }

        const socket = sockets.find((candidate) => candidate.data.sceneUrl === sceneUrl) ?? sockets[0];
        try {
            return await requestSocket(socket, { sceneUrl, nodePath, timeoutMs });
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(
                'The selected WebGL scene renderer could not complete the reflection-probe capture. '
                + `Open /scene-editor/ and wait for it to finish loading, then retry. (${detail})`,
            );
        }
    },
};
