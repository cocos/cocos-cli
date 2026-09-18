import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { ensureProjectBackend, startProjectBackend, stopProjectBackend } from '../src/core/project-backend/client';
import { discoverProjectBackend, type ProjectBackendDescriptor } from '../src/core/project-backend/ownership';
import { SceneSessionClient } from '../src/core/scene/session/client';

const integration = process.env.COCOS_TEST_PROJECT_BACKEND === '1' ? describe : describe.skip;
integration('real managed CLI backend lifecycle', () => {
    it('reuses one ready MCP/Scene backend, stops it explicitly and starts a replacement', async () => {
        const project = resolve(__dirname, 'fixtures/projects/asset-operation');
        if (await discoverProjectBackend(project)) throw new Error('Integration fixture already has a live owner; do not run this test against an active project');
        let owner: ProjectBackendDescriptor | undefined;
        try {
            const attempts = await Promise.allSettled([ensureProjectBackend(project), ensureProjectBackend(project)]);
            owner = attempts.find((result): result is PromiseFulfilledResult<ProjectBackendDescriptor> => result.status === 'fulfilled')?.value;
            for (const result of attempts) if (result.status === 'rejected') throw result.reason;
            const results = attempts as PromiseFulfilledResult<ProjectBackendDescriptor>[];
            expect(results[1].value.ownerId).toBe(owner!.ownerId);
            if (!owner) throw new Error('No backend was started');
            expect(owner.pid).not.toBe(process.pid);
            expect(owner.state).toBe('ready');
            expect(owner.mcpUrl).toMatch(/\/mcp$/);
            const snapshot = await new SceneSessionClient(owner.sceneSession!).snapshot();
            expect(snapshot.project).toBe(owner.project);
            await expect(startProjectBackend(project)).rejects.toMatchObject({ code: 'ALREADY_RUNNING' });
            const first = owner;
            await stopProjectBackend(first);
            await expect(readFile(resolve(project, 'temp/.cocos-cli-backend/owner.json'))).rejects.toMatchObject({ code: 'ENOENT' });
            owner = undefined;
            expect(await discoverProjectBackend(project)).toBeNull();
            owner = await ensureProjectBackend(project);
            expect(owner.ownerId).not.toBe(first.ownerId);
            await expect(stopProjectBackend(first)).rejects.toMatchObject({ code: 'OWNER_CHANGED' });
            expect((await new SceneSessionClient(owner.sceneSession!).snapshot()).project).toBe(owner.project);
        } finally {
            // Only stop the owner started by this test, never a separately replaced owner.
            if (owner) {
                try { await stopProjectBackend(owner); }
                catch (error) {
                    const live = await discoverProjectBackend(project);
                    if (live?.ownerId === owner.ownerId && live.pid === owner.pid) process.kill(owner.pid, 'SIGKILL');
                    throw error;
                }
            }
        }
    }, 420000);
});
