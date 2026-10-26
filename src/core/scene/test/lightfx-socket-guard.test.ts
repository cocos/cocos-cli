import { createServer, request, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import { createLightFXSocketServer } from '../main-process/lightfx/socket-server';

type Headers = Record<string, string>;

const FOREIGN_HOST = 'attacker.example';
const FOREIGN_ORIGIN = 'https://evil.example';

describe('LightFX Socket.IO handshake guard', () => {
    let http: HttpServer;
    let io: any;
    let port: number;

    beforeEach(async () => {
        http = createServer();
        io = createLightFXSocketServer(http);
        await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
        port = (http.address() as AddressInfo).port;
    });

    afterEach(async () => {
        await new Promise<void>((resolve) => io.close(resolve));
        if (http.listening) {
            await new Promise<void>((resolve) => http.close(() => resolve()));
        }
    });

    function pollingHandshake(headers: Headers): Promise<number> {
        return new Promise((resolve, reject) => {
            const req = request({
                host: '127.0.0.1',
                port,
                path: '/socket.io/?EIO=3&transport=polling',
                headers,
            }, (res) => {
                res.resume();
                resolve(res.statusCode ?? 0);
            });
            req.on('error', reject);
            req.end();
        });
    }

    // 与原生 LightFX（socket.io-client-cpp / WebSocket++）一致：直接走 websocket，EIO=4。
    function websocketHandshake(headers: Headers): Promise<'open' | number> {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`, { headers });
            ws.once('open', () => {
                ws.close();
                resolve('open');
            });
            ws.once('unexpected-response', (_req, res) => {
                res.resume();
                resolve(res.statusCode ?? 0);
            });
            ws.once('error', reject);
        });
    }

    const nativeClient = (): Headers => ({ host: `127.0.0.1:${port}` });

    describe('polling', () => {
        it('accepts the native LightFX client (loopback Host, no Origin)', async () => {
            expect(await pollingHandshake(nativeClient())).toBe(200);
        });

        it('rejects a DNS-rebinding Host', async () => {
            expect(await pollingHandshake({ host: `${FOREIGN_HOST}:${port}` })).toBe(403);
        });

        it('rejects a browser Origin', async () => {
            expect(await pollingHandshake({ ...nativeClient(), origin: FOREIGN_ORIGIN })).toBe(403);
        });

        it('rejects a browser Origin even when it is loopback', async () => {
            expect(await pollingHandshake({ ...nativeClient(), origin: `http://127.0.0.1:${port}` })).toBe(403);
        });
    });

    describe('websocket', () => {
        it('accepts the native LightFX client (loopback Host, no Origin)', async () => {
            expect(await websocketHandshake(nativeClient())).toBe('open');
        });

        it('rejects a DNS-rebinding Host', async () => {
            expect(await websocketHandshake({ host: `${FOREIGN_HOST}:${port}` })).toBe(400);
        });

        it('rejects a browser Origin', async () => {
            expect(await websocketHandshake({ ...nativeClient(), origin: FOREIGN_ORIGIN })).toBe(400);
        });

        it('rejects a browser Origin even when it is loopback', async () => {
            expect(await websocketHandshake({ ...nativeClient(), origin: `http://127.0.0.1:${port}` })).toBe(400);
        });
    });
});
