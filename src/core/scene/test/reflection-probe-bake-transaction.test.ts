import {
    ensureDir,
    mkdtemp,
    outputFile,
    outputJson,
    pathExists,
    readFile,
    readJson,
    readdir,
    remove,
} from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';

const mockRpcRequest = jest.fn();
const mockGetScene = jest.fn();

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

import { ReflectionProbeService } from '../scene-process/service/reflection-probe';
import { isReflectionProbeTextureCubeImported } from '../scene-process/service/reflection-probe-import-state';

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

interface ITransactionSpies {
    commit: jest.Mock<Promise<void>, []>;
    rollback: jest.Mock<Promise<void>, []>;
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

describe('ReflectionProbeService bake output transaction', () => {
    let tempRoot: string;
    let assetRoot: string;
    let sceneDir: string;
    let backupRoot: string;
    let workDir: string;
    let applyError: Error | undefined;
    let service: any;
    let transaction: ITransactionSpies | undefined;

    beforeEach(async () => {
        mockGetScene.mockReset().mockReturnValue(null);
        tempRoot = await mkdtemp(join(tmpdir(), 'cocos-cli-reflection-probe-bake-'));
        assetRoot = join(tempRoot, 'assets');
        sceneDir = join(assetRoot, SCENE_NAME);
        backupRoot = join(tempRoot, 'temp', 'reflection-probe-bake');
        workDir = '';
        applyError = undefined;
        transaction = undefined;
        await ensureDir(assetRoot);

        mockRpcRequest.mockReset().mockImplementation(async (serviceName: string, method: string) => {
            if (serviceName === 'reflectionProbeRenderer' && method === 'captureActive') {
                return CAPTURE_RESULT;
            }
            if (serviceName === 'assetManager' && method === 'queryPath') {
                return assetRoot;
            }
            if (serviceName === 'assetManager' && method === 'refreshAssetOnly') {
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
        service._writeFaces = jest.fn(async (_faces: string[], directory: string) => {
            workDir = directory;
            await outputFile(join(directory, 'work-marker'), 'temporary');
            return FACE_NAMES.map((face) => join(directory, `${face}.png`));
        });
        service._runCmft = jest.fn(async (_facePaths: string[], outputBase: string) => {
            await outputFile(`${outputBase}.png`, 'new-output');
        });
        service._waitForTextureCubeImport = jest.fn(async () => undefined);
        service._waitForTextureCube = jest.fn(async () => ({
            uuid: 'cubemap-uuid',
            url: `${OUTPUT_URL}/textureCube`,
        }));

        const replaceOutput = service._replaceOutput.bind(service);
        service._replaceOutput = jest.fn(async (...args: unknown[]) => {
            const outputTransaction = await replaceOutput(...args);
            transaction = {
                commit: jest.fn(async () => outputTransaction.commit()),
                rollback: jest.fn(async () => outputTransaction.rollback()),
            };
            return transaction;
        });
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await remove(tempRoot);
    });

    async function preparePreviousOutput(): Promise<{
        outputPath: string;
        oldMeta: Record<string, unknown>;
        convolutionPath: string;
    }> {
        const outputPath = join(sceneDir, OUTPUT_NAME);
        const convolutionPath = join(sceneDir, 'reflectionProbe_0_convolution', 'mipmap_0.png');
        const oldMeta = {
            ver: '1.0.0',
            importer: 'image',
            imported: true,
            userData: { marker: 'old-meta' },
        };
        await ensureDir(join(convolutionPath, '..'));
        await outputFile(outputPath, 'old-output');
        await outputJson(`${outputPath}.meta`, oldMeta, { spaces: 2 });
        await outputFile(convolutionPath, 'old-convolution');
        return { outputPath, oldMeta, convolutionPath };
    }

    function refreshCalls(): unknown[][] {
        return mockRpcRequest.mock.calls.filter(([serviceName, method]) => (
            serviceName === 'assetManager' && method === 'refreshAssetOnly'
        ));
    }

    it('removes the work directory when cmft fails before the output transaction starts', async () => {
        service._runCmft.mockRejectedValueOnce(new Error('cmft failed'));

        await expect(service.bake({ nodePath: 'Reflection Probe' })).rejects.toThrow('cmft failed');

        expect(workDir).not.toBe('');
        await expect(pathExists(workDir)).resolves.toBe(false);
        expect(service._replaceOutput).not.toHaveBeenCalled();
        await expect(readdir(backupRoot)).resolves.toEqual([]);
    });

    it('rolls back the previous output when the renderer explicitly rejects apply', async () => {
        const { outputPath, oldMeta, convolutionPath } = await preparePreviousOutput();
        applyError = new Error('scene changed during bake');

        await expect(service.bake({ nodePath: 'Reflection Probe' }))
            .rejects.toThrow('scene changed during bake');

        expect(transaction?.rollback).toHaveBeenCalledTimes(1);
        expect(transaction?.commit).not.toHaveBeenCalled();
        await expect(readFile(outputPath, 'utf8')).resolves.toBe('old-output');
        await expect(readJson(`${outputPath}.meta`)).resolves.toEqual(oldMeta);
        await expect(readFile(convolutionPath, 'utf8')).resolves.toBe('old-convolution');
        await expect(pathExists(workDir)).resolves.toBe(false);
        await expect(readdir(backupRoot)).resolves.toEqual([]);
        expect(refreshCalls()).toHaveLength(2);
    });

    it('commits the new output when apply acknowledgement times out with unknown final state', async () => {
        const { outputPath, oldMeta, convolutionPath } = await preparePreviousOutput();
        applyError = new Error(
            'The reflection-probe apply acknowledgement timed out; '
            + 'the final WebGL apply state is unknown. (operation has timed out)',
        );

        await expect(service.bake({ nodePath: 'Reflection Probe' }))
            .rejects.toThrow('final WebGL apply state is unknown');

        expect(transaction?.commit).toHaveBeenCalledTimes(1);
        expect(transaction?.rollback).not.toHaveBeenCalled();
        await expect(readFile(outputPath, 'utf8')).resolves.toBe('new-output');
        await expect(readJson(`${outputPath}.meta`)).resolves.toEqual(expect.objectContaining({
            imported: false,
            userData: expect.objectContaining({
                marker: (oldMeta.userData as { marker: string }).marker,
                type: 'texture cube',
                isRGBE: true,
            }),
            subMetas: expect.objectContaining({
                b47c0: expect.objectContaining({
                    imported: false,
                    userData: expect.objectContaining({ mipBakeMode: 1 }),
                }),
            }),
        }));
        await expect(pathExists(convolutionPath)).resolves.toBe(false);
        await expect(pathExists(workDir)).resolves.toBe(false);
        await expect(readdir(backupRoot)).resolves.toEqual([]);
        expect(refreshCalls()).toHaveLength(1);
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
            expect.any(Number),
        ]);
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

    it('clears all bindings before deleting only conventionally generated probe assets', async () => {
        const sceneUrl = `db://assets/${SCENE_NAME}.scene`;
        const convolutionUrl = `db://assets/${SCENE_NAME}/reflectionProbe_0_convolution`;
        const removed: string[] = [];
        mockRpcRequest.mockImplementation(async (serviceName: string, method: string, args: unknown[]) => {
            if (serviceName === 'reflectionProbeRenderer' && method === 'clearActive') {
                expect(args).toEqual([true, expect.any(Number)]);
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
