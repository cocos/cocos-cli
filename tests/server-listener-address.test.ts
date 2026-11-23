import { get } from 'http';
import { ServerService } from '../src/server/server';
import { getAvailablePort } from '../src/server/utils';

jest.mock('../src/server/socket', () => ({ socketService: { startup: jest.fn() } }));
jest.mock('../src/server/console-log', () => ({ consoleLogService: {
    startup: jest.fn(),
    injectMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
} }));

function request(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
        // Fail if a default URL relies on DNS instead of its actual bind address.
        const req = get(url, { lookup: (_hostname, _options, callback) => callback(new Error('DNS must not be used'), '') }, response => {
            response.resume();
            response.on('end', () => resolve(response.statusCode!));
        });
        req.once('error', reject);
    });
}

describe('server listener address', () => {
    it('advertises the IPv4 listener directly and remains reachable without localhost DNS', async () => {
        const service = new ServerService();
        try {
            await service.start(await getAvailablePort(0));
            expect(service.url).toBe(`http://127.0.0.1:${service.port}`);
            expect(service.host).toBe('127.0.0.1');
            expect(await request(service.url + '/missing-prefab.json')).toBe(404);
        } finally {
            await service.stop();
        }
    });

    it('retains explicit hosts but resets the default host when restarted without one', async () => {
        const service = new ServerService();
        try {
            await service.start(await getAvailablePort(0), '0.0.0.0');
            expect(service.host).toBe('0.0.0.0');
            await service.stop();
            await service.start(await getAvailablePort(0));
            expect(service.url).toBe(`http://127.0.0.1:${service.port}`);
            expect(await request(service.url)).toBe(404);
        } finally {
            await service.stop();
        }
    });
});
