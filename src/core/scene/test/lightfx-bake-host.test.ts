import { mkdtemp, outputFile, pathExists, readFile, readdir, remove } from 'fs-extra';
import { join } from 'path';
import { tmpdir } from 'os';

const mockAssetManager = {
    queryPath: jest.fn(),
    refreshAsset: jest.fn(),
    queryUUID: jest.fn(),
    queryAssetMeta: jest.fn(),
    saveAssetMeta: jest.fn(),
};
const mockRunnerRun = jest.fn();
const mockRunnerCancel = jest.fn();
const mockDecodedResult = { version: 1, meshes: [], terrains: [], probes: [] };

jest.mock('../../assets', () => ({ assetManager: mockAssetManager }));
jest.mock('../main-process/lightfx/process', () => ({
    LightFXProcess: jest.fn().mockImplementation(() => ({
        run: mockRunnerRun,
        cancel: mockRunnerCancel,
    })),
}));
jest.mock('../main-process/lightfx/asset-transaction', () => ({
    LightmapAssetTransaction: jest.fn(),
}));
jest.mock('../main-process/lightfx/output', () => ({
    decodeLightFXOutput: jest.fn(() => mockDecodedResult),
}));

import { LightFXBakeHost } from '../main-process/lightfx-bake-host';

describe('LightFXBakeHost', () => {
    let root: string;
    let assetRoot: string;
    let host: LightFXBakeHost;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'lightfx-host-'));
        assetRoot = join(root, 'assets');
        mockAssetManager.queryPath.mockReset().mockImplementation((value: string) => (
            value === 'db://assets' ? assetRoot : null
        ));
        mockAssetManager.refreshAsset.mockReset().mockResolvedValue(undefined);
        mockAssetManager.queryUUID.mockReset();
        mockAssetManager.queryAssetMeta.mockReset();
        mockAssetManager.saveAssetMeta.mockReset();
        mockRunnerRun.mockReset();
        mockRunnerCancel.mockReset().mockResolvedValue(undefined);
        host = new LightFXBakeHost();
    });

    afterEach(async () => {
        await host.dispose();
        await remove(root);
    });

    async function finishLightProbe(): Promise<string> {
        mockRunnerRun.mockImplementationOnce(async ({ cwd }: { cwd: string }) => {
            await outputFile(join(cwd, 'output', 'lfx.out'), Buffer.alloc(0));
        });
        const { operationId } = await host.begin({
            target: 'light-probe',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        });
        await host.appendInput({ operationId, chunkBase64: Buffer.from('input').toString('base64') });
        await expect(host.run({ operationId })).resolves.toEqual({ result: mockDecodedResult, textureUrls: [] });
        return operationId;
    }

    it('accepts chunked input, reserves one operation, and rolls it back idempotently', async () => {
        const { operationId } = await host.begin({
            target: 'light-probe',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        });

        await expect(host.begin({
            target: 'lightmap',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        })).rejects.toThrow('A light-probe LightFX bake is already in progress.');

        await host.appendInput({ operationId, chunkBase64: Buffer.from('first').toString('base64') });
        await host.appendInput({ operationId, chunkBase64: Buffer.from('-second').toString('base64') });

        const workspaces = await readdir(join(root, 'temp', 'lightfx-bake'));
        expect(workspaces).toHaveLength(1);
        await expect(readFile(join(root, 'temp', 'lightfx-bake', workspaces[0], 'tmp', 'lfx.in'), 'utf8'))
            .resolves.toBe('first-second');

        await host.rollback({ operationId });
        await expect(host.rollback({ operationId })).resolves.toBeUndefined();
        expect(mockRunnerCancel).toHaveBeenCalledTimes(1);
        await expect(pathExists(join(root, 'temp', 'lightfx-bake', workspaces[0])))
            .resolves.toBe(false);

        await expect(host.begin({
            target: 'lightmap',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        })).resolves.toEqual({ operationId: expect.any(String) });
    });

    it('rejects invalid requests without leaving a reserved operation behind', async () => {
        await expect(host.begin({
            target: 'light-probe',
            sceneName: '../LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        })).rejects.toThrow('Invalid LightFX scene name.');
        await expect(host.begin({
            target: 'light-probe',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 999,
        })).rejects.toThrow('LightFX timeout must be an integer between 1000 and 3600000 milliseconds.');

        const { operationId } = await host.begin({
            target: 'light-probe',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        });
        await expect(host.appendInput({ operationId, chunkBase64: 'not-base64' }))
            .rejects.toThrow('Invalid base64 LightFX input chunk.');
        await expect(host.appendInput({ operationId: 'missing', chunkBase64: '' }))
            .rejects.toThrow('Unknown LightFX operation: missing');
    });

    it('returns a stable no-op result when there is no operation to cancel', async () => {
        await expect(host.cancel()).resolves.toEqual({ cancelled: false, target: null });
        expect(mockRunnerCancel).not.toHaveBeenCalled();
    });

    it('reports cancellation instead of an unknown operation when upload continues after cancel', async () => {
        const { operationId } = await host.begin({
            target: 'light-probe',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        });

        await expect(host.cancel()).resolves.toEqual({ cancelled: true, target: 'light-probe' });
        await expect(host.appendInput({
            operationId,
            chunkBase64: Buffer.from('late chunk').toString('base64'),
        })).rejects.toThrow('LightFX bake was cancelled.');
        await expect(host.run({ operationId })).rejects.toThrow('LightFX bake was cancelled.');
    });

    it('waits for an accepted input write before removing the operation workspace', async () => {
        const { operationId } = await host.begin({
            target: 'light-probe',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        });
        const operation = (host as any).operation;
        let finishWrite!: () => void;
        operation.inputWritePromise = new Promise<void>((resolve) => {
            finishWrite = resolve;
        });

        const rollingBack = host.rollback({ operationId });
        await Promise.resolve();
        await expect(pathExists(operation.workspace)).resolves.toBe(true);

        finishWrite();
        await expect(rollingBack).resolves.toBeUndefined();
        await expect(pathExists(operation.workspace)).resolves.toBe(false);
    });

    it('makes commit idempotent but rejects commit after rollback', async () => {
        const committedId = await finishLightProbe();
        await expect(Promise.all([
            host.commit({ operationId: committedId }),
            host.commit({ operationId: committedId }),
        ])).resolves.toEqual([undefined, undefined]);
        await expect(host.commit({ operationId: committedId })).resolves.toBeUndefined();

        const { operationId: rolledBackId } = await host.begin({
            target: 'light-probe',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        });
        await host.rollback({ operationId: rolledBackId });
        await expect(host.commit({ operationId: rolledBackId }))
            .rejects.toThrow('LightFX bake was rolled-back and cannot be committed.');
    });

    it('lets cancel win atomically after run and prevents a stale scene result from committing', async () => {
        const operationId = await finishLightProbe();
        const cancelling = host.cancel();

        await expect(host.commit({ operationId }))
            .rejects.toThrow('LightFX bake was cancelled and cannot be committed.');
        await expect(cancelling).resolves.toEqual({ cancelled: true, target: 'light-probe' });
        await expect(host.commit({ operationId }))
            .rejects.toThrow('LightFX bake was cancelled and cannot be committed.');
    });

    it('lets commit win atomically over a concurrent cancel request', async () => {
        const operationId = await finishLightProbe();
        const committing = host.commit({ operationId });

        await expect(host.cancel()).resolves.toEqual({ cancelled: false, target: null });
        await expect(committing).resolves.toBeUndefined();
        await expect(host.commit({ operationId })).resolves.toBeUndefined();
    });

    it('preserves a rollback backup and the active operation when restoration fails', async () => {
        const { operationId } = await host.begin({
            target: 'lightmap',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        });
        const operation = (host as any).operation;
        const rollbackAssets = jest.fn()
            .mockRejectedValueOnce(new Error('restore failed'))
            .mockResolvedValueOnce(undefined);
        operation.assets = { rollback: rollbackAssets };

        await expect(host.rollback({ operationId })).rejects.toThrow('restore failed');
        await expect(pathExists(operation.workspace)).resolves.toBe(true);
        expect((host as any).completedOperations.has(operationId)).toBe(false);
        expect((host as any).operation).toBe(operation);

        await expect(host.rollback({ operationId })).resolves.toBeUndefined();
        expect(rollbackAssets).toHaveBeenCalledTimes(2);
        await expect(pathExists(operation.workspace)).resolves.toBe(false);
        await expect(host.commit({ operationId }))
            .rejects.toThrow('LightFX bake was rolled-back and cannot be committed.');
    });

    it('marks an awaiting commit as expired before asynchronous cleanup starts', async () => {
        jest.useFakeTimers();
        try {
            mockRunnerRun.mockImplementationOnce(async ({ cwd }: { cwd: string }) => {
                await outputFile(join(cwd, 'output', 'lfx.out'), Buffer.alloc(0));
            });
            const { operationId } = await host.begin({
                target: 'light-probe',
                sceneName: 'LightProbe',
                textureSources: [],
                timeoutMs: 1_000,
            });
            await host.appendInput({ operationId, chunkBase64: Buffer.from('input').toString('base64') });
            await host.run({ operationId });

            jest.advanceTimersByTime(1_000);
            await expect(host.commit({ operationId }))
                .rejects.toThrow('LightFX bake was expired and cannot be committed.');
            await Promise.resolve();
            await Promise.resolve();
        } finally {
            jest.useRealTimers();
        }
    });

    it('lets run serialize cleanup when expiry interrupts an active bake', async () => {
        jest.useFakeTimers();
        try {
            let rejectRun!: (error: Error) => void;
            mockRunnerRun.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
                rejectRun = reject;
            }));
            const { operationId } = await host.begin({
                target: 'light-probe',
                sceneName: 'LightProbe',
                textureSources: [],
                timeoutMs: 1_000,
            });
            const operation = (host as any).operation;
            await host.appendInput({ operationId, chunkBase64: Buffer.from('input').toString('base64') });
            const runResult = expect(host.run({ operationId })).rejects.toThrow('LightFX bake timed out.');
            await Promise.resolve();
            expect(mockRunnerRun).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(1_000);
            await Promise.resolve();
            await Promise.resolve();
            expect(mockRunnerCancel).toHaveBeenCalledTimes(1);
            expect(operation.cleanupPromise).toBeNull();
            await expect(pathExists(operation.workspace)).resolves.toBe(true);

            rejectRun(new Error('process stopped'));
            await runResult;
            await expect(pathExists(operation.workspace)).resolves.toBe(false);
            await expect(host.commit({ operationId }))
                .rejects.toThrow('LightFX bake was expired and cannot be committed.');
        } finally {
            jest.useRealTimers();
        }
    });
});
