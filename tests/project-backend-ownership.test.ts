import { fork, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { ProjectBackendLease, discoverProjectBackend } from '../src/core/project-backend/ownership';
import { ensureProjectBackend, stopProjectBackend } from '../src/core/project-backend/client';

describe('project backend ownership across processes', () => {
    let project: string;
    const children: ChildProcess[] = [];
    const leases: ProjectBackendLease[] = [];
    let next = 0;
    beforeEach(async () => { project = await mkdtemp(join(tmpdir(), 'cocos-backend-owner-')); });
    afterEach(async () => {
        for (const lease of leases.splice(0)) await lease.release();
        await Promise.all(children.splice(0).map(child => child.exitCode !== null || child.signalCode ? Promise.resolve() : new Promise<void>(resolve => { child.once('exit', () => resolve()); child.kill(); })));
        await rm(project, { recursive: true, force: true });
    });
    function child() {
        const process = fork(resolve(__dirname, 'helpers/project-backend-owner.cjs'), [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
        children.push(process); return process;
    }
    function call(child: ChildProcess, message: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = ++next;
            const timer = setTimeout(() => { child.off('message', receive); reject(new Error('Owner test timed out')); }, 10000);
            const receive = (response: any) => {
                if (response.id !== id) return;
                clearTimeout(timer); child.off('message', receive);
                response.error ? reject(Object.assign(new Error(response.error.message), response.error)) : resolve(response.value);
            };
            child.on('message', receive); child.send({ id, ...message });
        });
    }

    it('elects exactly one owner under concurrent first startup, including the initializing state', async () => {
        const contenders = [child(), child(), child(), child()];
        const results = await Promise.allSettled(contenders.map(process => call(process, { type: 'acquire', project })));
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        for (const result of results) if (result.status === 'rejected') expect(result.reason.code).toBe('ALREADY_RUNNING');
        expect((await discoverProjectBackend(project))?.state).toBe('initializing');
        const index = results.findIndex(result => result.status === 'fulfilled');
        const owner = (results[index] as PromiseFulfilledResult<any>).value;
        await call(contenders[index], { type: 'publish', patch: { state: 'ready', mcpUrl: 'http://127.0.0.1/mcp', sceneSession: { protocol: 1, project, url: 'http://127.0.0.1:1', token: 'test' } } });
        const reused = await ensureProjectBackend(project);
        expect(reused.ownerId).toBe(owner.ownerId);
        expect(reused.pid).toBe(owner.pid);
    });

    it('recovers automatically after an owner crash and rejects old shutdown credentials', async () => {
        const process = child();
        const old = await call(process, { type: 'acquire', project });
        await new Promise<void>(resolve => { process.once('exit', () => resolve()); process.kill(); });
        expect(await discoverProjectBackend(project)).toBeNull();
        const lease = await ProjectBackendLease.acquire(project); leases.push(lease);
        expect(lease.descriptor.ownerId).not.toBe(old.ownerId);
        expect(lease.descriptor.url).toBe(old.url);
        await expect(stopProjectBackend(old)).rejects.toMatchObject({ code: 'OWNER_CHANGED' });
        const response = await fetch(`${old.url}/shutdown`, { method: 'POST', headers: { authorization: `Bearer ${old.token}` } });
        expect(response.status).toBe(401);
    });

    it('canonicalizes aliases and permits different projects', async () => {
        const first = await ProjectBackendLease.acquire(project); leases.push(first);
        await expect(ProjectBackendLease.acquire(join(project, '.'))).rejects.toMatchObject({ code: 'ALREADY_RUNNING' });
        const other = join(project, 'other'); await mkdir(other);
        const second = await ProjectBackendLease.acquire(other); leases.push(second);
        expect(second.descriptor.url).not.toBe(first.descriptor.url);
        if (process.platform === 'win32') {
            const alias = join(project, 'alias');
            await symlink(other, alias, 'junction');
            await expect(ProjectBackendLease.acquire(alias)).rejects.toMatchObject({ code: 'ALREADY_RUNNING' });
        }
    });

    it('never steals a live owner on stale metadata or a short startup timeout', async () => {
        const lease = await ProjectBackendLease.acquire(project); leases.push(lease);
        const ownerFile = join(project, 'temp/.cocos-cli-backend/owner.json');
        const original = await readFile(ownerFile, 'utf8');
        await writeFile(ownerFile, JSON.stringify({ ...JSON.parse(original), pid: 99999999 }));
        await expect(ensureProjectBackend(project, { startupTimeoutMs: 50 })).rejects.toMatchObject({ code: 'STARTUP_TIMEOUT' });
        expect((await discoverProjectBackend(project))?.pid).toBe(process.pid);
        await expect(ProjectBackendLease.acquire(project)).rejects.toMatchObject({ code: 'ALREADY_RUNNING' });
    });

    it('fails closed if an unrelated service takes the rendezvous port', async () => {
        const lease = await ProjectBackendLease.acquire(project);
        const port = Number(new URL(lease.descriptor.url).port);
        await lease.release();
        const unrelated = createServer((_request, response) => { response.end('{}'); });
        await new Promise<void>(resolve => unrelated.listen(port, '127.0.0.1', resolve));
        try { await expect(ProjectBackendLease.acquire(project)).rejects.toMatchObject({ code: 'PORT_CONFLICT' }); }
        finally { await new Promise<void>(resolve => { unrelated.close(() => resolve()); unrelated.closeAllConnections(); }); }
    });

    it('releases only on explicit owner shutdown, and allows a new owner afterward', async () => {
        const lease = await ProjectBackendLease.acquire(project);
        lease.onShutdown(() => lease.release());
        await stopProjectBackend(lease.descriptor);
        expect(await discoverProjectBackend(project)).toBeNull();
        const next = await ProjectBackendLease.acquire(project); leases.push(next);
        expect(next.descriptor.ownerId).not.toBe(lease.descriptor.ownerId);
    });

    it('retains ownership when cleanup fails and keeps credentials out of error serialization', async () => {
        const lease = await ProjectBackendLease.acquire(project); leases.push(lease);
        lease.onShutdown(async () => { throw new Error('writer still running'); });
        await expect(lease.requestShutdown()).rejects.toThrow('writer still running');
        expect((await discoverProjectBackend(project))?.state).toBe('failed');
        try {
            await ProjectBackendLease.acquire(project);
            throw new Error('Expected duplicate rejection');
        } catch (error: any) {
            expect(error.code).toBe('ALREADY_RUNNING');
            expect(error.backend.ownerId).toBe(lease.descriptor.ownerId);
            expect(JSON.stringify(error)).not.toContain(lease.descriptor.token);
        }
    });
});
