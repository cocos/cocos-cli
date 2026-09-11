const mockGetScene = jest.fn();
jest.mock('cc', () => ({ director: { getScene: mockGetScene } }));
jest.mock('../scene-process/service/baking/lightfx/baker', () => ({ lightFXCoordinator: { cancel: jest.fn(), canCancel: jest.fn(() => false) } }));
jest.mock('../scene-process/service/baking/lightfx/host', () => ({ lightFXBakeHost: {
    queryCapabilities: jest.fn(),
    reserveSceneOperation: jest.fn(async () => ({ transactionId: 'test-owner' })),
    releaseSceneOperation: jest.fn(async () => undefined),
} }));
jest.mock('../scene-process/service/baking/lightfx/settings', () => ({ createDefaultLightFXSettings: jest.fn() }));
jest.mock('../scene-process/service/preview/asset-reload', () => ({ loadPreviewAsset: jest.fn() }));
jest.mock('../scene-process/rpc', () => ({ Rpc: { getInstance: jest.fn() } }));

import { LightProbeBakeService } from '../scene-process/service/light-probe-bake';
import { LightmapBakeService } from '../scene-process/service/lightmap-bake';
import { lightFXSceneOperation } from '../scene-process/service/baking/lightfx/scene-operation';
import { lightFXBakeHost } from '../scene-process/service/baking/lightfx/host';
import { lightFXCoordinator } from '../scene-process/service/baking/lightfx/baker';

describe('LightFX service entrance ownership', () => {
    it('advertises directory selection only when the actual host supports it', async () => {
        for (const supported of [false, true]) {
            jest.mocked(lightFXBakeHost.queryCapabilities).mockResolvedValueOnce({ sceneTransactionVersion: 1, lightmapAssetVersion: 1, busy: false, ...(supported ? { lightmapOutputDirectory: true as const } : {}) });
            expect((await new LightmapBakeService().queryCapabilities()).outputDirectory).toBe(supported ? true : undefined);
        }
    });
    it('advertises exact asset cleanup only when the actual host supports it', async () => {
        for (const supported of [false, true]) {
            jest.mocked(lightFXBakeHost.queryCapabilities).mockResolvedValueOnce({ sceneTransactionVersion: 1, lightmapAssetVersion: 1, busy: false, ...(supported ? { lightmapAssetCleanupVersion: 1 as const } : {}) });
            expect((await new LightmapBakeService().queryCapabilities()).assetCleanupVersion).toBe(supported ? 1 : undefined);
        }
    });
    it.each([false, true])('advertises actual Lightmap cancellation readiness (%s)', async cancellable => {
        jest.mocked(lightFXCoordinator.canCancel).mockReturnValueOnce(cancellable);
        jest.mocked(lightFXBakeHost.queryCapabilities).mockResolvedValueOnce({ sceneTransactionVersion: 1, lightmapAssetVersion: 1, cancelOwnershipVersion: 1, busy: true });
        await expect(new LightmapBakeService().queryCapabilities()).resolves.toEqual({
            version: 1, resultLifecycleVersion: 1, sceneTransactionVersion: 1, assetVersion: 1, cancelVersion: 1, cancellable, busy: true,
        });
        expect(lightFXCoordinator.canCancel).toHaveBeenLastCalledWith('lightmap');
    });
    it.each([false, true])('advertises actual probe cancellation readiness (%s)', async cancellable => {
        jest.mocked(lightFXCoordinator.canCancel).mockReturnValueOnce(cancellable);
        jest.mocked(lightFXBakeHost.queryCapabilities).mockResolvedValueOnce({ sceneTransactionVersion: 1, cancelOwnershipVersion: 1, busy: true });
        await expect(new LightProbeBakeService().queryCapabilities()).resolves.toEqual({
            version: 1, resultLifecycleVersion: 1, sceneTransactionVersion: 1, cancelVersion: 1, cancellable, busy: true,
        });
    });
    it('passes the actual service target to cancellation', async () => {
        await new LightProbeBakeService().cancel();
        expect(lightFXCoordinator.cancel).toHaveBeenLastCalledWith('light-probe');
        await new LightmapBakeService().cancel();
        expect(lightFXCoordinator.cancel).toHaveBeenLastCalledWith('lightmap');
    });
    it.each([false, true])('queries Lightmap lifecycle and actual host asset support without reserving (busy=%s)', async busy => {
        jest.mocked(lightFXBakeHost.queryCapabilities).mockResolvedValueOnce({ sceneTransactionVersion: 1, lightmapAssetVersion: 1, busy });
        const reserveCalls = jest.mocked(lightFXBakeHost.reserveSceneOperation).mock.calls.length;
        await expect(new LightmapBakeService().queryCapabilities()).resolves.toEqual({
            version: 1, resultLifecycleVersion: 1, sceneTransactionVersion: 1, assetVersion: 1, busy,
        });
        expect(lightFXBakeHost.reserveSceneOperation).toHaveBeenCalledTimes(reserveCalls);
        expect(mockGetScene).not.toHaveBeenCalled();
    });

    it('rejects Lightmap capability on a legacy, mismatched or unreachable host', async () => {
        const query = jest.mocked(lightFXBakeHost.queryCapabilities);
        for (const value of [null, {}, { sceneTransactionVersion: 1, busy: false }, { sceneTransactionVersion: 1, lightmapAssetVersion: 2, busy: false }, { sceneTransactionVersion: 2, lightmapAssetVersion: 1, busy: false }, { sceneTransactionVersion: 1, lightmapAssetVersion: 1 }]) {
            query.mockResolvedValueOnce(value as Awaited<ReturnType<typeof query>>);
            await expect(new LightmapBakeService().queryCapabilities()).rejects.toThrow('protocol version 1');
        }
        query.mockRejectedValueOnce(new Error('Disconnected'));
        await expect(new LightmapBakeService().queryCapabilities()).rejects.toThrow('Disconnected');
        expect(mockGetScene).not.toHaveBeenCalled();
    });

    it.each([false, true])('queries the actual host without taking a reservation (busy=%s)', async (busy) => {
        const query = jest.mocked(lightFXBakeHost.queryCapabilities);
        query.mockResolvedValueOnce({ sceneTransactionVersion: 1, busy });
        const reserveCalls = jest.mocked(lightFXBakeHost.reserveSceneOperation).mock.calls.length;
        await expect(new LightProbeBakeService().queryCapabilities()).resolves.toEqual({
            version: 1, resultLifecycleVersion: 1, sceneTransactionVersion: 1, busy,
        });
        expect(lightFXBakeHost.reserveSceneOperation).toHaveBeenCalledTimes(reserveCalls);
        expect(mockGetScene).not.toHaveBeenCalled();
    });

    it('does not advertise support when the host query fails or returns an incompatible protocol', async () => {
        const query = jest.mocked(lightFXBakeHost.queryCapabilities);
        query.mockRejectedValueOnce(new Error('Method queryCapabilities is not available'));
        await expect(new LightProbeBakeService().queryCapabilities()).rejects.toThrow('not available');
        for (const value of [null, {}, { sceneTransactionVersion: 2, busy: false }, { sceneTransactionVersion: 1 }]) {
            query.mockResolvedValueOnce(value as Awaited<ReturnType<typeof query>>);
            await expect(new LightProbeBakeService().queryCapabilities()).rejects.toThrow('protocol version 1');
        }
    });

    it('rejects all four entrances before querying scene, snapshotting or rolling back another owner', async () => {
        const probe = new LightProbeBakeService();
        const lightmap = new LightmapBakeService();
        await lightFXSceneOperation.run('lightmap', 'clear', async () => {
            for (const invoke of [() => probe.bake(), () => probe.clearBake(), () => lightmap.bake(), () => lightmap.clearBake()]) {
                await expect(invoke()).rejects.toThrow('lightmap LightFX clear operation is already in progress');
            }
        });
        expect(mockGetScene).not.toHaveBeenCalled();
    });

    it('releases service preflight failures so all following entrances may run', async () => {
        mockGetScene.mockReturnValue(null);
        const probe = new LightProbeBakeService();
        const lightmap = new LightmapBakeService();
        for (const invoke of [() => probe.bake(), () => probe.clearBake(), () => lightmap.bake(), () => lightmap.clearBake()]) {
            await expect(invoke()).rejects.toThrow('No scene is currently open.');
        }
        expect(mockGetScene).toHaveBeenCalledTimes(4);
    });
});
