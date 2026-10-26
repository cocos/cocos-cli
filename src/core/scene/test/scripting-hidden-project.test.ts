import express from 'express';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { once } from 'events';

let mockSystemJsHomeDir = '';
jest.mock('../../scripting/programming/FacetInstance', () => ({
    waitForProgrammingFacet: async () => ({ systemJsHomeDir: mockSystemJsHomeDir }),
}));

import { scriptingRoutes } from '../runtime/resources/scripting-routes';

describe('scripting resources in hidden project directories', () => {
    it('serves SystemJS from an isolated .agent project', async () => {
        const root = await mkdtemp(join(tmpdir(), 'cocos-hidden-project-'));
        mockSystemJsHomeDir = join(root, '.agent', 'temp', 'programming', 'preview', 'systemjs');
        await mkdir(mockSystemJsHomeDir, { recursive: true });
        await writeFile(join(mockSystemJsHomeDir, 'system.js'), 'globalThis.System = {};');
        const route = scriptingRoutes.find(item => item.url instanceof RegExp && item.url.source === '^\\/scripting\\/systemjs')!;
        const app = express();
        app.get(route.url, route.handler);
        const server = app.listen(0, '127.0.0.1');
        await once(server, 'listening');
        try {
            const address = server.address();
            if (!address || typeof address === 'string') throw new Error('Missing test server address');
            const response = await fetch(`http://127.0.0.1:${address.port}/scripting/systemjs/system.js`);
            expect(response.status).toBe(200);
            expect(await response.text()).toBe('globalThis.System = {};');
        } finally {
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            await rm(root, { recursive: true, force: true });
        }
    });
});
