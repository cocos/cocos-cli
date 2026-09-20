import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockConfiguration = jest.fn(async () => undefined);
const mockProjectOpen = jest.fn(async () => true);
const mockProjectClose = jest.fn(async () => true);
const mockScriptInit = jest.fn(async () => undefined);
const mockScriptClose = jest.fn(async () => undefined);
const mockAssetsInit = jest.fn(async () => undefined);
const mockAssetsStart = jest.fn(async () => undefined);
const mockAssetsStop = jest.fn(async () => undefined);
const mockServerStart = jest.fn(async () => undefined);
const mockServerStop = jest.fn(async () => undefined);
const mockSceneStart = jest.fn(async () => undefined);
const mockSceneStop = jest.fn(async () => true);
jest.mock('../src/core/base/utils', () => ({ __esModule: true, default: { Path: { register: jest.fn() } } }));
jest.mock('../src/core/base/console', () => ({ newConsole: { init: jest.fn(), record: jest.fn() } }));
jest.mock('../src/global', () => ({ GlobalPaths: { enginePath: 'engine' }, GlobalConfig: {} }));
jest.mock('../src/server', () => ({ startServer: mockServerStart, stopServer: mockServerStop }));
jest.mock('../src/core/configuration', () => ({ configurationManager: { initialize: mockConfiguration } }));
jest.mock('../src/core/project', () => ({ __esModule: true, default: { open: mockProjectOpen, close: mockProjectClose } }));
jest.mock('../src/core/engine', () => ({ initEngine: jest.fn(async () => undefined), Engine: { getConfig: () => ({ includeModules: [] }), getInfo: () => ({ typescript: { path: 'ts' } }) } }));
jest.mock('../src/core/scripting', () => ({ __esModule: true, default: { initialize: mockScriptInit, close: mockScriptClose, projectPath: 'project' } }));
jest.mock('../src/core/scripting/programming/FacetInstance', () => ({ createProgrammingFacet: jest.fn(async () => undefined) }));
jest.mock('../src/core/assets', () => ({ initAssetDB: mockAssetsInit, startAssetDB: mockAssetsStart, stopAssetDB: mockAssetsStop }));
jest.mock('../src/core/builder', () => ({ init: jest.fn(async () => undefined) }));
jest.mock('../src/core/scene', () => ({ startupScene: mockSceneStart }));
jest.mock('../src/core/scene/main-process/scene-worker', () => ({ sceneWorker: { stop: mockSceneStop } }));
jest.mock('../src/core/project-backend/runtime', () => ({ ensureOwnedSceneSession: jest.fn(async () => undefined), closeOwnedSceneSession: jest.fn(async () => undefined) }));
import Launcher from '../src/core/launcher';
import { ProjectBackendLease, discoverProjectBackend } from '../src/core/project-backend/ownership';

describe('Launcher ownership boundary', () => {
    let project: string;
    let launcher: Launcher;
    beforeEach(async () => { jest.clearAllMocks(); project = await mkdtemp(join(tmpdir(), 'cocos-launcher-owner-')); launcher = new Launcher(project); });
    afterEach(async () => { await launcher.close(); await rm(project, { recursive: true, force: true }); });

    it('rejects a duplicate before initializing configuration, scripts, assets or the engine worker', async () => {
        const existing = await ProjectBackendLease.acquire(project);
        try {
            await expect(launcher.startup()).rejects.toMatchObject({ code: 'ALREADY_RUNNING' });
            expect(mockConfiguration).not.toHaveBeenCalled();
            expect(mockAssetsInit).not.toHaveBeenCalled();
            expect(mockScriptInit).not.toHaveBeenCalled();
            expect(mockSceneStart).not.toHaveBeenCalled();
            expect(mockProjectClose).not.toHaveBeenCalled();
        } finally { await existing.release(); }
    });

    it('shares concurrent startup calls and releases only after writer cleanup', async () => {
        await Promise.all([launcher.startup(), launcher.startup()]);
        expect(mockAssetsStart).toHaveBeenCalledTimes(1);
        expect(mockSceneStart).toHaveBeenCalledTimes(1);
        expect((await discoverProjectBackend(project))?.state).toBe('ready');
        mockAssetsStop.mockImplementationOnce(async () => {
            await expect(ProjectBackendLease.acquire(project)).rejects.toMatchObject({ code: 'ALREADY_RUNNING' });
        });
        await launcher.close();
        expect(mockSceneStop).toHaveBeenCalledTimes(1);
        expect(mockScriptClose).toHaveBeenCalledTimes(1);
        expect(await discoverProjectBackend(project)).toBeNull();
        await expect(launcher.startup()).rejects.toThrow('closed');
    });

    it('cleans partial initialization and allows a replacement owner after failure', async () => {
        mockScriptInit.mockRejectedValueOnce(new Error('script startup failed'));
        await expect(launcher.startup()).rejects.toThrow('script startup failed');
        expect(mockScriptClose).toHaveBeenCalledTimes(1);
        expect(mockProjectClose).toHaveBeenCalledTimes(1);
        expect(mockAssetsInit).not.toHaveBeenCalled();
        const next = await ProjectBackendLease.acquire(project);
        await next.release();
    });
});
