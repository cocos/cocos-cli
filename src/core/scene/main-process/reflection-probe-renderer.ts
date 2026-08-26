import type { RemoteSocket } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io/dist/typed-events';
import { socketService } from '../../../server/socket';

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
        const sockets = await io.fetchSockets();
        if (sockets.length === 0) {
            throw new Error('Reflection Probe Bake requires a WebGL scene renderer. Open /scene-editor/ in a browser and retry.');
        }

        const errors: string[] = [];
        return await new Promise<IReflectionProbeCaptureResult>((resolve, reject) => {
            let pending = sockets.length;
            for (const socket of sockets) {
                requestSocket(socket, { sceneUrl, nodePath, timeoutMs }).then(resolve).catch((error) => {
                    errors.push(error instanceof Error ? error.message : String(error));
                    pending--;
                    if (pending === 0) {
                        reject(new Error(
                            'No connected WebGL scene renderer completed the reflection-probe capture. '
                            + 'Open /scene-editor/ and wait for it to finish loading, then retry.'
                            + (errors.length ? ` (${errors.join('; ')})` : ''),
                        ));
                    }
                });
            }
        });
    },
};
