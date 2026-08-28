import { createHash, randomUUID } from 'crypto';
import { createConnection } from 'net';
import { join } from 'path';
import { tmpdir } from 'os';

import type { ISceneAuthorityRpc } from './pink-scene-authority';

interface IAuthorityRequest {
    id: string;
    module: string;
    method: string;
    args: unknown[];
}

interface IAuthorityResponse {
    id: string;
    result?: unknown;
    error?: string;
}

/** A local, project-scoped endpoint owned by PinK's Hierarchy extension. */
export function getPinkSceneAuthorityEndpoint(projectPath: string): string {
    const key = createHash('sha256').update(projectPath.toLowerCase()).digest('hex').slice(0, 24);
    return process.platform === 'win32'
        ? `\\\\.\\pipe\\cocos-cli-pink-scene-${key}`
        : join(tmpdir(), `cocos-cli-pink-scene-${key}.sock`);
}

/**
 * Creates the utility-process side of the temporary PinK authority bridge.
 * A new connection is deliberately used per request so restarting or changing
 * the active scene in the Hierarchy extension cannot leave stale state here.
 */
export function createPinkSceneAuthorityRpc(projectPath: string): ISceneAuthorityRpc {
    return {
        request: (module, method, args) => requestPinkSceneAuthority(projectPath, module, method, args),
    };
}

function requestPinkSceneAuthority(
    projectPath: string,
    module: string,
    method: string,
    args: unknown[],
    timeoutMs = 5_000,
): Promise<unknown> {
    const endpoint = getPinkSceneAuthorityEndpoint(projectPath);
    const id = randomUUID();

    return new Promise((resolve, reject) => {
        const socket = createConnection(endpoint);
        let buffer = '';
        let settled = false;
        const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            socket.destroy();
            callback();
        };
        const timeout = setTimeout(() => finish(() => reject(new Error(
            `[Cocos CLI] Timed out waiting for the PinK scene authority bridge (${endpoint}).`,
        ))), timeoutMs);

        socket.once('error', (error) => finish(() => reject(new Error(
            `[Cocos CLI] PinK scene authority bridge is unavailable: ${error.message}`,
        ))));
        socket.once('connect', () => {
            const request: IAuthorityRequest = { id, module, method, args };
            socket.write(`${JSON.stringify(request)}\n`);
        });
        socket.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('utf8');
            const lineEnd = buffer.indexOf('\n');
            if (lineEnd < 0) return;
            try {
                const response = JSON.parse(buffer.slice(0, lineEnd)) as IAuthorityResponse;
                if (response.id !== id) return;
                if (response.error) {
                    finish(() => reject(new Error(response.error)));
                } else {
                    finish(() => resolve(response.result));
                }
            } catch (error) {
                finish(() => reject(error));
            }
        });
    });
}
