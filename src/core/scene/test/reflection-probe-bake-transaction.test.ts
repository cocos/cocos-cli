import {
    ensureDir,
    mkdtemp,
    outputFile,
    pathExists,
    readFile,
    remove,
} from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';

const mockRpcRequest = jest.fn();
const mockGetScene = jest.fn();
const mockHostAssetManager = {
    queryPath: jest.fn(),
    refreshAssetOnly: jest.fn(),
    queryAssetInfo: jest.fn(),
};

jest.mock('../../assets', () => ({ assetManager: mockHostAssetManager }));

jest.mock('cc', () => ({
    assert: (condition: unknown, message: string) => {
        if (!condition) {
            throw new Error(message);
        }
    },
    assetManager: {
        assets: {
            has: jest.fn(() => false),
            remove: jest.fn(),
        },
        loadAny: jest.fn(),
    },
    director: { getScene: mockGetScene },
    Director: { EVENT_END_FRAME: 'director-end-frame' },
    gfx: {
        API: { UNKNOWN: 0 },
        deviceManager: {
            gfxDevice: { gfxAPI: 0 },
        },
    },
    ReflectionProbe: class ReflectionProbe {},
    renderer: {
        scene: {
            ProbeType: { CUBE: 0 },
        },
    },
    TextureCube: class TextureCube {},
}));

jest.mock('cc/editor/reflection-probe', () => ({
    ReflectionProbeManager: {
        probeManager: {
            updateBakedCubemap: jest.fn(),
            updatePreviewSphere: jest.fn(),
        },
    },
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: {
        getInstance: () => ({ request: mockRpcRequest }),
    },
}));

jest.mock('../scene-process/service/preview/asset-reload', () => ({
    removePreviewAssetCache: jest.fn(),
}));

import { register } from '../scene-process/service/core';
import { ReflectionProbeService } from '../scene-process/service/reflection-probe';
import { isReflectionProbeTextureCubeImported } from '../scene-process/service/reflection-probe-import-state';
import { ReflectionProbeBakeHost } from '../main-process/reflection-probe-bake-host';

const FACE_NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
const IMPORTED_FACE_NAMES = ['right', 'left', 'top', 'bottom', 'front', 'back'];
const SCENE_NAME = 'ReflectionProbeTest';
const OUTPUT_NAME = 'reflectionProbe_0.png';
const OUTPUT_URL = `db://assets/${SCENE_NAME}/${OUTPUT_NAME}`;
const CAPTURE_RESULT = {
    sceneUrl: `db://assets/${SCENE_NAME}.scene`,
    sceneName: SCENE_NAME,
    componentUuid: 'Comp.1',
    probeId: 0,
    resolution: 1,
    fastBake: true,
    captureToken: 'capture-token',
    faces: Array(6).fill('pixels'),
    rendererId: 'renderer-1',
};

function importedMeta(mipBakeMode = 2) {
    return {
        imported: true,
        subMetas: {
            b47c0: {
                imported: true,
                userData: { mipBakeMode },
                subMetas: Object.fromEntries(IMPORTED_FACE_NAMES.map((name, index) => [String(index), {
                    imported: true,
                    name,
                    uuid: `cube@b47c0@${index}`,
                }])),
            },
        },
    };
}

describe('reflection probe TextureCube import state', () => {
    it('requires the root, TextureCube and all six faces to finish importing', () => {
        const rootPending = importedMeta();
        rootPending.imported = false;
        expect(isReflectionProbeTextureCubeImported(rootPending, 2)).toBe(false);

        const cubePending = importedMeta();
        cubePending.subMetas.b47c0.imported = false;
        expect(isReflectionProbeTextureCubeImported(cubePending, 2)).toBe(false);

        const facePending = importedMeta();
        facePending.subMetas.b47c0.subMetas['0'].imported = false;
        expect(isReflectionProbeTextureCubeImported(facePending, 2)).toBe(false);

        const missingFace = importedMeta();
        delete missingFace.subMetas.b47c0.subMetas['5'];
        expect(isReflectionProbeTextureCubeImported(missingFace, 2)).toBe(false);
    });

    it('requires the expected bake mode', () => {
        expect(isReflectionProbeTextureCubeImported(importedMeta(1), 2)).toBe(false);
        expect(isReflectionProbeTextureCubeImported(importedMeta(2), 2)).toBe(true);
        expect(isReflectionProbeTextureCubeImported(importedMeta(1), 1)).toBe(true);
    });
});

describe('ReflectionProbeService source identity', () => {
    it('rejects reopening the same scene or replacing the runtime', async () => {
        let generation = 1;
        @register('Editor')
        class EditorStub {
            getEditorSession() { return { uuid: 'scene-a', generation }; }
            isCurrentEditorSession(session: { uuid: string; generation: number }) { return session.generation === generation; }
        }
        const first = new ReflectionProbeService();
        const source = await first.getSceneIdentity();
        expect(() => first.assertSceneIdentity(source)).not.toThrow();
        generation++;
        expect(() => first.assertSceneIdentity(source)).toThrow('stale runtime or generation');
        const replacement = new ReflectionProbeService();
        expect(() => replacement.assertSceneIdentity({ ...source, generation })).toThrow('stale runtime or generation');
    });
});

describe('ReflectionProbeBakeHost output ownership', () => {
    let tempRoot: string;
    let assetRoot: string;
    let outputPath: string;
    let host: any;

    beforeEach(async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'cocos-cli-reflection-probe-host-'));
        assetRoot = join(tempRoot, 'assets');
        outputPath = join(assetRoot, SCENE_NAME, OUTPUT_NAME);
        await ensureDir(join(assetRoot, SCENE_NAME));
        await outputFile(outputPath, 'old-output');
        await outputFile(`${outputPath}.meta`, '{}');
        mockHostAssetManager.queryPath.mockReset().mockReturnValue(assetRoot);
        mockHostAssetManager.refreshAssetOnly.mockReset().mockResolvedValue(1);
        mockHostAssetManager.queryAssetInfo.mockReset().mockReturnValue({
            uuid: 'cubemap-uuid',
            url: `${OUTPUT_URL}/textureCube`,
        });
        host = new ReflectionProbeBakeHost();
        host.writeFaces = jest.fn(async () => FACE_NAMES.map((face) => `${face}.png`));
        host.runCmft = jest.fn(async (_faces: string[], stagedBase: string) => {
            await outputFile(`${stagedBase}.png`, 'new-output');
        });
        host.waitForTextureCubeImport = jest.fn(async () => undefined);
    });

    afterEach(async () => {
        await host.dispose();
        await remove(tempRoot);
    });

    it('reports an unavailable native tool without pretending baking is supported', async () => {
        host.resolveCmftExecutable = () => join(tempRoot, 'missing-cmft');
        expect(await host.getCapabilities()).toMatchObject({ bake: false, reason: expect.stringContaining('ENOENT') });
    });

    it('rolls back staged output when the Scene runtime cannot apply it', async () => {
        const prepared = await host.prepare({ captured: CAPTURE_RESULT, timeoutMs: 10_000 });
        await expect(readFile(outputPath, 'utf8')).resolves.toBe('new-output');

        await host.rollback({ operationId: prepared.operationId });

        await expect(readFile(outputPath, 'utf8')).resolves.toBe('old-output');
        expect(mockHostAssetManager.refreshAssetOnly).toHaveBeenCalledWith(OUTPUT_URL);
    });

    it('cancels only the matching Node preparation and preserves existing output', async () => {
        let finish!: () => void;
        host.runCmft = jest.fn(async (_faces: string[], stagedBase: string) => {
            await new Promise<void>((resolve) => { finish = resolve; });
            await outputFile(`${stagedBase}.png`, 'new-output');
        });
        const pending = host.prepare({ captured: CAPTURE_RESULT, taskId: 'task-1', timeoutMs: 10_000 });
        while (!finish) { await new Promise((resolve) => setTimeout(resolve, 1)); }
        await host.cancel({ taskId: 'other-task' });
        expect(host.cancelled).toBe(false);
        await host.cancel({ taskId: 'task-1' });
        finish();
        await expect(pending).rejects.toThrow('cancelled');
        await expect(readFile(outputPath, 'utf8')).resolves.toBe('old-output');
    });

    it('retains prepared output when apply acknowledgement expires', async () => {
        const prepared = await host.prepare({ captured: CAPTURE_RESULT, timeoutMs: 40 });
        await new Promise((resolve) => setTimeout(resolve, 65));
        await expect(readFile(outputPath, 'utf8')).resolves.toBe('new-output');
        await expect(host.rollback({ operationId: prepared.operationId })).rejects.toThrow('Unknown');
    });

    it('keeps staged output only after the Scene runtime commits it', async () => {
        const prepared = await host.prepare({ captured: CAPTURE_RESULT, timeoutMs: 10_000 });

        await host.commit({ operationId: prepared.operationId });

        await expect(readFile(outputPath, 'utf8')).resolves.toBe('new-output');
        await expect(pathExists(join(tempRoot, 'temp', 'reflection-probe-bake'))).resolves.toBe(true);
    });
});

describe('ReflectionProbeService bake output transaction', () => {
    let applyError: Error | undefined;
    let service: any;

    beforeEach(() => {
        mockGetScene.mockReset().mockReturnValue(null);
        applyError = undefined;

        mockRpcRequest.mockReset().mockImplementation(async (serviceName: string, method: string) => {
            if (serviceName === 'reflectionProbeRenderer' && method === 'captureActive') {
                return CAPTURE_RESULT;
            }
            if (serviceName === 'reflectionProbeBakeHost' && method === 'prepare') {
                return {
                    operationId: 'operation-1',
                    cubemapUuid: 'cubemap-uuid',
                    cubemapUrl: `${OUTPUT_URL}/textureCube`,
                };
            }
            if (serviceName === 'reflectionProbeBakeHost' && (method === 'commit' || method === 'rollback')) {
                return undefined;
            }
            if (serviceName === 'reflectionProbeRenderer' && method === 'apply') {
                if (applyError) {
                    throw applyError;
                }
                return { applied: true, saved: true };
            }
            throw new Error(`Unexpected RPC request: ${serviceName}.${method}`);
        });

        service = new ReflectionProbeService();
        jest.spyOn(service, 'broadcast').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('rolls back Node output if the source scene reopens before apply', async () => {
        const device = jest.requireMock('cc').gfx.deviceManager.gfxDevice;
        const source = { runtimeId: 'webview-1', sceneUuid: 'same-scene', generation: 1 };
        let current = source;
        service._getSceneIdentity = () => current;
        service.capturePixels = jest.fn().mockResolvedValue(CAPTURE_RESULT);
        service.applyBakedCubemap = jest.fn();
        mockRpcRequest.mockImplementation(async (module: string, method: string) => {
            if (module === 'reflectionProbeBakeHost' && method === 'prepare') {
                current = { ...source, generation: 2 };
                return { operationId: 'operation-1', cubemapUuid: 'cube', cubemapUrl: OUTPUT_URL };
            }
            if (module === 'reflectionProbeBakeHost' && method === 'rollback') { return; }
            throw new Error(`Unexpected RPC ${module}.${method}`);
        });
        device.gfxAPI = 1;
        try {
            await expect(service.bake({ nodePath: 'Probe', source })).rejects.toThrow('stale runtime or generation');
            expect(service.applyBakedCubemap).not.toHaveBeenCalled();
            expect(mockRpcRequest).toHaveBeenCalledWith('reflectionProbeBakeHost', 'rollback', [{ operationId: 'operation-1' }]);
        } finally { device.gfxAPI = 0; }
    });

    it('exposes a detached task snapshot while baking and retains the final result', async () => {
        let finish!: () => void;
        const gate = new Promise<void>((resolve) => { finish = resolve; });
        const normalRequest = mockRpcRequest.getMockImplementation()!;
        mockRpcRequest.mockImplementation(async (...args: unknown[]) => {
            if (args[0] === 'reflectionProbeBakeHost' && args[1] === 'prepare') { await gate; }
            return normalRequest(...args);
        });
        const pending = service.bake({ nodePath: 'Probe' });
        await Promise.resolve();
        const snapshot = await service.getTaskState();
        expect(snapshot).toMatchObject({ taskId: expect.any(String), status: 'baking', total: 1 });
        snapshot.remaining.push({ componentUuid: 'fake', nodePath: 'fake' });
        expect((await service.getTaskState()).remaining).toEqual([]);
        await expect(service.clearAll()).rejects.toThrow('already in progress');
        finish();
        await pending;
        expect(await service.getTaskState()).toMatchObject({ taskId: snapshot.taskId, status: 'completed', completed: 1, results: [{ componentUuid: CAPTURE_RESULT.componentUuid }] });
    });

    it('publishes ordered task snapshots and retains correlated logs after completion', async () => {
        await service.bake({ nodePath: 'Probe' });
        const events = service.broadcast.mock.calls.filter(([name]: [string]) => name === 'reflection-probe:task-changed')
            .map(([, state]: [string, any]) => state);
        expect(new Set(events.map((state: any) => state.taskId)).size).toBe(1);
        expect(events.map((state: any) => state.revision)).toEqual(events.map((_state: any, index: number) => index + 1));
        expect(events[0].status).toBe('baking');
        expect(events[events.length - 1]).toEqual(await service.getTaskState());
        expect(events[events.length - 1].logs.map((entry: any) => entry.message)).toEqual([
            'Reflection-probe bake started.', 'Baking reflection probe: Probe',
            'Reflection probe completed: Probe', 'Reflection-probe operation finished.',
        ]);
    });

    it('waits for cancellation cleanup and deduplicates repeated cancellation', async () => {
        let finish!: () => void;
        const gate = new Promise<void>((resolve) => { finish = resolve; });
        const normalRequest = mockRpcRequest.getMockImplementation()!;
        mockRpcRequest.mockImplementation(async (...args: unknown[]) => {
            if (args[0] === 'reflectionProbeBakeHost' && args[1] === 'prepare') { await gate; }
            if (args[0] === 'reflectionProbeBakeHost' && args[1] === 'cancel') { return; }
            return normalRequest(...args);
        });
        const pending = service.bake({ nodePath: 'Probe' });
        await Promise.resolve(); await Promise.resolve();
        const { taskId } = await service.getTaskState();
        await expect(service.cancelBake({ taskId: 'other' })).rejects.toThrow('Unknown');
        await service.cancelBake({ taskId });
        await service.cancelBake({ taskId });
        expect((await service.getTaskState()).status).toBe('cancelling');
        expect(mockRpcRequest.mock.calls.filter(([module, method]) => module === 'reflectionProbeBakeHost' && method === 'cancel')).toHaveLength(1);
        finish();
        await expect(pending).rejects.toThrow('cancelled');
        expect((await service.getTaskState()).status).toBe('cancelled');
        expect(mockRpcRequest).not.toHaveBeenCalledWith('reflectionProbeRenderer', 'apply', expect.anything());
    });

    it('accepts a batch immediately and appends distinct probes without replaying the current one', async () => {
        let finish!: () => void;
        const probes = [{ nodePath: 'A', componentUuid: 'a' }, { nodePath: 'B', componentUuid: 'b' }];
        mockRpcRequest.mockResolvedValue({ rendererId: 'r', sceneUrl: 'db://assets/a.scene', probes });
        service._bakeOne = jest.fn(async (_options: unknown, selected: { componentUuid: string }) => {
            service._task.current = probes.find((probe) => probe.componentUuid === selected.componentUuid);
            if (selected.componentUuid === 'a') { await new Promise<void>((resolve) => { finish = resolve; }); }
            return { componentUuid: selected.componentUuid };
        });
        const accepted = await service.startBake({ componentUuids: ['a'], saveScene: false });
        expect([accepted.current, ...accepted.remaining].some((probe) => probe?.componentUuid === 'a')).toBe(true);
        while (!finish) { await Promise.resolve(); }
        const appended = await service.startBake({ componentUuids: ['b', 'b'], saveScene: false });
        expect(appended).toMatchObject({ taskId: accepted.taskId, status: 'baking', total: 2, remaining: [{ componentUuid: 'b' }] });
        await expect(service.startBake({ componentUuids: ['a'] })).rejects.toThrow('already baking or queued');
        await expect(service.startBake({ componentUuids: ['b'] })).rejects.toThrow('already baking or queued');
        finish();
        while ((await service.getTaskState()).status === 'baking') { await Promise.resolve(); }
        expect(service._bakeOne.mock.calls.map(([, selected]: [unknown, { componentUuid: string }]) => selected.componentUuid)).toEqual(['a', 'b']);
        expect(await service.getTaskState()).toMatchObject({ taskId: accepted.taskId, status: 'completed', total: 2, completed: 2 });
    });

    it('queries real host capabilities and keeps clear available if bake infrastructure is missing', async () => {
        mockRpcRequest.mockResolvedValue({ bake: true });
        expect(await service.getCapabilities()).toMatchObject({ protocolVersion: 1, bake: true, queue: true, cancel: true, clear: true });
        mockRpcRequest.mockRejectedValue(new Error('host module unavailable'));
        expect(await service.getCapabilities()).toEqual({ protocolVersion: 1, bake: false, queue: false, cancel: false, clear: true, reason: 'host module unavailable' });
    });

    it('keeps revisions monotonic across different tasks so late snapshots cannot replace new work', async () => {
        await service.bake({ nodePath: 'A' });
        const first = await service.getTaskState();
        await service.bake({ nodePath: 'B' });
        const second = await service.getTaskState();
        expect(second.taskId).not.toBe(first.taskId);
        expect(second.revision).toBeGreaterThan(first.revision);
    });

    it('propagates a Node host preparation failure without finalizing a transaction', async () => {
        mockRpcRequest.mockImplementation(async (serviceName: string, method: string) => {
            if (serviceName === 'reflectionProbeRenderer' && method === 'captureActive') return CAPTURE_RESULT;
            if (serviceName === 'reflectionProbeBakeHost' && method === 'prepare') throw new Error('cmft failed');
            throw new Error(`Unexpected RPC request: ${serviceName}.${method}`);
        });

        await expect(service.bake({ nodePath: 'Reflection Probe' })).rejects.toThrow('cmft failed');
        expect(mockRpcRequest).not.toHaveBeenCalledWith('reflectionProbeBakeHost', 'commit', expect.anything());
        expect(mockRpcRequest).not.toHaveBeenCalledWith('reflectionProbeBakeHost', 'rollback', expect.anything());
    });

    it('rolls back the previous output when the renderer explicitly rejects apply', async () => {
        applyError = new Error('scene changed during bake');

        await expect(service.bake({ nodePath: 'Reflection Probe' }))
            .rejects.toThrow('scene changed during bake');
        expect(mockRpcRequest).toHaveBeenCalledWith('reflectionProbeBakeHost', 'rollback', [{
            operationId: 'operation-1',
        }]);
        expect(mockRpcRequest).not.toHaveBeenCalledWith('reflectionProbeBakeHost', 'commit', expect.anything());
    });

    it('commits the new output when apply acknowledgement times out with unknown final state', async () => {
        applyError = new Error(
            'The reflection-probe apply acknowledgement timed out; '
            + 'the final WebGL apply state is unknown. (operation has timed out)',
        );

        await expect(service.bake({ nodePath: 'Reflection Probe' }))
            .rejects.toThrow('final WebGL apply state is unknown');
        expect(mockRpcRequest).toHaveBeenCalledWith('reflectionProbeBakeHost', 'commit', [{
            operationId: 'operation-1',
        }]);
        expect(mockRpcRequest).not.toHaveBeenCalledWith('reflectionProbeBakeHost', 'rollback', expect.anything());
    });

    it('bakes a probe batch serially on one renderer and saves successful results once', async () => {
        const probes = [
            { nodePath: 'Probe', componentUuid: 'Comp.1' },
            { nodePath: 'Probe', componentUuid: 'Comp.2' },
        ];
        mockRpcRequest.mockImplementation(async (serviceName: string, method: string) => {
            if (serviceName === 'reflectionProbeRenderer' && method === 'listActive') {
                return {
                    rendererId: 'renderer-1',
                    sceneUrl: `db://assets/${SCENE_NAME}.scene`,
                    probes,
                };
            }
            if (serviceName === 'reflectionProbeRenderer' && method === 'save') {
                return undefined;
            }
            throw new Error(`Unexpected RPC request: ${serviceName}.${method}`);
        });
        const successfulResult = {
            nodePath: 'Probe',
            componentUuid: 'Comp.1',
            probeId: 0,
            cubemapUuid: 'cube-1',
            cubemapUrl: `db://assets/${SCENE_NAME}/reflectionProbe_0.png/textureCube`,
            fastBake: true,
        };
        service._bakeOne = jest.fn()
            .mockResolvedValueOnce(successfulResult)
            .mockRejectedValueOnce(new Error('cmft failed'));

        await expect(service.bakeAll({ saveScene: true, timeoutMs: 600_000 })).resolves.toEqual({
            sceneUrl: `db://assets/${SCENE_NAME}.scene`,
            totalCount: 2,
            bakedCount: 1,
            failedCount: 1,
            results: [successfulResult],
            failures: [{ nodePath: 'Probe', componentUuid: 'Comp.2', reason: 'cmft failed' }],
            durationMs: expect.any(Number),
        });
        expect(service._bakeOne).toHaveBeenNthCalledWith(1, expect.objectContaining({
            nodePath: 'Probe',
            saveScene: false,
        }), expect.objectContaining({ rendererId: 'renderer-1', componentUuid: 'Comp.1' }));
        expect(service._bakeOne).toHaveBeenNthCalledWith(2, expect.objectContaining({
            nodePath: 'Probe',
            saveScene: false,
        }), expect.objectContaining({ rendererId: 'renderer-1', componentUuid: 'Comp.2' }));
        expect(mockRpcRequest).toHaveBeenCalledWith('reflectionProbeRenderer', 'save', [
            'renderer-1',
            `db://assets/${SCENE_NAME}.scene`,
            expect.any(Number), undefined,
        ]);
    });

    it('rejects empty or ambiguous UUID selections before any RPC', async () => {
        await expect(service.bakeAll({ componentUuids: [] })).rejects.toThrow('non-empty');
        await expect(service.bakeAll({ componentUuids: ['Comp.2'], nodePaths: [] })).rejects.toThrow('cannot be combined');
        expect(mockRpcRequest).not.toHaveBeenCalled();
    });

    it('selects and deduplicates component UUIDs despite duplicate node names', async () => {
        mockRpcRequest.mockResolvedValue({ rendererId: 'renderer-1', sceneUrl: 'db://assets/a.scene', probes: [
            { nodePath: 'Probe', componentUuid: 'Comp.1' },
            { nodePath: 'Probe', componentUuid: 'Comp.2' },
        ] });
        service._bakeOne = jest.fn().mockResolvedValue({ componentUuid: 'Comp.2' });
        const result = await service.bakeAll({ componentUuids: ['Comp.2', 'Comp.2', 'disabled-or-missing'], saveScene: false });
        expect(service._bakeOne).toHaveBeenCalledTimes(1);
        expect(service._bakeOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ componentUuid: 'Comp.2' }));
        expect(result).toMatchObject({ totalCount: 2, bakedCount: 1, failedCount: 1,
            failures: [{ componentUuid: 'disabled-or-missing' }] });
    });

    it('stops a probe batch when its selected renderer is no longer available', async () => {
        mockRpcRequest.mockResolvedValue({
            rendererId: 'renderer-1',
            sceneUrl: `db://assets/${SCENE_NAME}.scene`,
            probes: [
                { nodePath: 'Probe A', componentUuid: 'Comp.1' },
                { nodePath: 'Probe B', componentUuid: 'Comp.2' },
            ],
        });
        service._bakeOne = jest.fn().mockRejectedValue(
            new Error('The WebGL scene renderer selected for the reflection-probe batch is no longer available.'),
        );

        await expect(service.bakeAll({ timeoutMs: 600_000 })).rejects.toThrow(
            'selected for the reflection-probe batch is no longer available',
        );
        expect(service._bakeOne).toHaveBeenCalledTimes(1);
    });

    it('shares clearing state across all entry points and releases it after failure', async () => {
        let fail!: (error: Error) => void;
        service._clearAll = jest.fn(() => new Promise((_resolve, reject) => { fail = reject; }));
        const pending = service.clearAll();
        const snapshot = await service.getTaskState();
        expect(snapshot.status).toBe('clearing');
        await expect(service.bake({ nodePath: 'Probe' })).rejects.toThrow('already in progress');
        await expect(service.startBake({ componentUuids: ['a'] })).rejects.toThrow('cannot accept');
        await expect(service.clearAll()).rejects.toThrow('already in progress');
        await expect(service.cancelBake({ taskId: snapshot.taskId })).rejects.toThrow('cannot be cancelled');
        expect((await service.getTaskState()).taskId).toBe(snapshot.taskId);
        fail(new Error('asset save failed'));
        await expect(pending).rejects.toThrow('asset save failed');
        expect(await service.getTaskState()).toMatchObject({ status: 'failed', error: 'asset save failed' });
        await expect(service.bake({ nodePath: 'Probe' })).resolves.toMatchObject({ componentUuid: CAPTURE_RESULT.componentUuid });
    });

    it('clears all bindings before deleting only conventionally generated probe assets', async () => {
        const sceneUrl = `db://assets/${SCENE_NAME}.scene`;
        const convolutionUrl = `db://assets/${SCENE_NAME}/reflectionProbe_0_convolution`;
        const removed: string[] = [];
        mockRpcRequest.mockImplementation(async (serviceName: string, method: string, args: unknown[]) => {
            if (serviceName === 'reflectionProbeRenderer' && method === 'clearActive') {
                expect(args).toEqual([true, expect.any(Number), undefined]);
                return {
                    sceneUrl,
                    sceneName: SCENE_NAME,
                    probes: [{
                        nodePath: 'Probe',
                        componentUuid: 'Comp.1',
                        probeId: 0,
                        cubemapUuid: 'cube@b47c0',
                    }],
                    clearedCount: 1,
                    saved: true,
                };
            }
            if (serviceName === 'assetManager' && method === 'queryAssetInfo') {
                const urlOrUuid = args[0];
                if (urlOrUuid === 'cube') return { uuid: 'cube', url: OUTPUT_URL };
                if (urlOrUuid === OUTPUT_URL || urlOrUuid === convolutionUrl) {
                    return { uuid: String(urlOrUuid), url: urlOrUuid };
                }
                return null;
            }
            if (serviceName === 'assetManager' && method === 'removeAsset') {
                removed.push(args[0] as string);
                return {};
            }
            throw new Error(`Unexpected RPC request: ${serviceName}.${method}`);
        });

        await expect(service.clearAll({})).resolves.toEqual({
            sceneUrl,
            totalCount: 1,
            clearedCount: 1,
            deletedAssetUrls: [convolutionUrl, OUTPUT_URL],
            failures: [],
            durationMs: expect.any(Number),
        });
        expect(removed).toEqual([convolutionUrl, OUTPUT_URL]);
    });

    it('clears but does not delete a user-owned cubemap', async () => {
        const sceneUrl = `db://assets/${SCENE_NAME}.scene`;
        mockRpcRequest.mockImplementation(async (serviceName: string, method: string) => {
            if (serviceName === 'reflectionProbeRenderer' && method === 'clearActive') {
                return {
                    sceneUrl,
                    sceneName: SCENE_NAME,
                    probes: [{
                        nodePath: 'Probe',
                        componentUuid: 'Comp.1',
                        probeId: 0,
                        cubemapUuid: 'manual@b47c0',
                    }],
                    clearedCount: 1,
                    saved: true,
                };
            }
            if (serviceName === 'assetManager' && method === 'queryAssetInfo') {
                return { uuid: 'manual', url: 'db://assets/Environment/manual.hdr' };
            }
            throw new Error(`Unexpected RPC request: ${serviceName}.${method}`);
        });

        await expect(service.clearAll({})).resolves.toEqual(expect.objectContaining({
            clearedCount: 1,
            deletedAssetUrls: [],
            failures: [],
        }));
        expect(mockRpcRequest).not.toHaveBeenCalledWith('assetManager', 'removeAsset', expect.anything());
    });

    it('lists active cube probes with component UUIDs even when node paths are duplicated', () => {
        const makeNode = (componentUuid: string) => {
            const component = { uuid: componentUuid, enabled: true, probeType: 0 };
            return {
                name: 'Probe',
                activeInHierarchy: true,
                children: [],
                getComponent: jest.fn(() => component),
            };
        };
        mockGetScene.mockReturnValue({
            activeInHierarchy: true,
            children: [makeNode('Comp.1'), makeNode('Comp.2')],
            getComponent: jest.fn(() => null),
        });

        expect(service.listBakeableProbes()).toEqual([
            { nodePath: 'Probe', componentUuid: 'Comp.1' },
            { nodePath: 'Probe', componentUuid: 'Comp.2' },
        ]);
    });
});
