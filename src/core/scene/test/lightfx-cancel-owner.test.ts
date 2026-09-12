const mockExport = jest.fn();
jest.mock('cc', () => ({}));
jest.mock('../scene-process/service/baking/lightfx/exporter', () => ({ LightFXExporter: jest.fn(() => ({ export: mockExport })) }));
jest.mock('../scene-process/service/baking/lightfx/format', () => ({ encodeLightFXInput: () => new Uint8Array([1]) }));
jest.mock('../scene-process/service/baking/lightfx/buffer', () => ({ encodeLightFXBase64: () => 'AQ==' }));
jest.mock('../scene-process/service/baking/lightfx/scene-operation', () => ({ lightFXSceneOperation: { hostTransactionId: 'owner' } }));
jest.mock('../scene-process/service/baking/lightfx/host', () => ({ lightFXBakeHost: {
    begin: jest.fn(), appendInput: jest.fn(), run: jest.fn(), commit: jest.fn(), rollback: jest.fn(),
    queryCapabilities: jest.fn(), cancel: jest.fn(),
} }));

import type { Scene } from 'cc';
import { LightFXCoordinator } from '../scene-process/service/baking/lightfx/baker';
import { lightFXBakeHost as host } from '../scene-process/service/baking/lightfx/host';
import type { LightFXSettings } from '../scene-process/service/baking/lightfx/types';

describe('LightFX cancellation ownership', () => {
    const scene = { name: 'Test' } as Scene;
    const settings = {} as LightFXSettings;
    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of Object.values(host)) {
            if (jest.isMockFunction(method)) method.mockReset();
        }
        mockExport.mockReset().mockResolvedValue({ textureSources: [], world: {} });
        jest.mocked(host.begin).mockResolvedValue({ operationId: 'first' });
        jest.mocked(host.rollback).mockResolvedValue(undefined);
        jest.mocked(host.run).mockResolvedValue({ result: { version: 1, meshes: [], terrains: [], probes: [] }, textureUrls: [] });
        jest.mocked(host.queryCapabilities).mockResolvedValue({ sceneTransactionVersion: 1, cancelOwnershipVersion: 1, busy: true });
        jest.mocked(host.cancel).mockResolvedValue({ cancelled: true, target: 'light-probe' });
    });

    it('does not contact the host for another runtime, wrong target or pre-native export', async () => {
        const owner = new LightFXCoordinator(), other = new LightFXCoordinator();
        let finish!: (value: object) => void;
        mockExport.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const bake = owner.bake(scene, 'light-probe', settings, 1000);
        expect(owner.canCancel('light-probe')).toBe(false);
        await expect(owner.cancel('light-probe')).resolves.toEqual({ cancelled: false, target: null });
        finish({ textureSources: [], world: {} });
        await bake;
        expect(owner.canCancel('light-probe')).toBe(true);
        expect(owner.canCancel('lightmap')).toBe(false);
        expect(other.canCancel('light-probe')).toBe(false);
        await expect(other.cancel('light-probe')).resolves.toEqual({ cancelled: false, target: null });
        await expect(owner.cancel('lightmap')).resolves.toEqual({ cancelled: false, target: null });
        expect(host.queryCapabilities).not.toHaveBeenCalled();
        expect(host.cancel).not.toHaveBeenCalled();
        await owner.cancel('light-probe');
        expect(host.cancel).toHaveBeenCalledWith({ operationId: 'first', transactionId: 'owner', target: 'light-probe' });
    });

    it('refuses an older host and never falls back to unscoped cancellation', async () => {
        const owner = new LightFXCoordinator();
        await owner.bake(scene, 'light-probe', settings, 1000);
        jest.mocked(host.queryCapabilities).mockResolvedValueOnce({ sceneTransactionVersion: 1, busy: true });
        await expect(owner.cancel('light-probe')).rejects.toThrow('ownership protocol');
        expect(host.cancel).not.toHaveBeenCalled();
    });

    it('a late handshake retains the old operation identity, and completed owners are cleared', async () => {
        const owner = new LightFXCoordinator();
        await owner.bake(scene, 'light-probe', settings, 1000);
        let finish!: (value: Awaited<ReturnType<typeof host.queryCapabilities>>) => void;
        jest.mocked(host.queryCapabilities).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const cancel = owner.cancel('light-probe');
        await owner.commit('first');
        expect(owner.canCancel('light-probe')).toBe(false);
        await expect(owner.cancel('light-probe')).resolves.toEqual({ cancelled: false, target: null });
        jest.mocked(host.begin).mockResolvedValueOnce({ operationId: 'second' });
        await owner.bake(scene, 'light-probe', settings, 1000);
        finish({ sceneTransactionVersion: 1, cancelOwnershipVersion: 1, busy: true });
        await cancel;
        expect(host.cancel).toHaveBeenCalledWith({ operationId: 'first', transactionId: 'owner', target: 'light-probe' });
        await owner.rollback('second');
        await expect(owner.cancel('light-probe')).resolves.toEqual({ cancelled: false, target: null });
    });

    it('clears ownership when native execution fails', async () => {
        const owner = new LightFXCoordinator();
        jest.mocked(host.run).mockRejectedValueOnce(new Error('cancelled'));
        await expect(owner.bake(scene, 'light-probe', settings, 1000)).rejects.toThrow('cancelled');
        await expect(owner.cancel('light-probe')).resolves.toEqual({ cancelled: false, target: null });
        expect(host.rollback).toHaveBeenCalledWith({ operationId: 'first' });
    });

    it('forwards the selected output directory only after the actual host confirms support', async () => {
        const owner = new LightFXCoordinator();
        await expect(owner.bake(scene, 'lightmap', settings, 1000, 'db://assets/Lightmaps')).rejects.toThrow('output directory');
        expect(mockExport).not.toHaveBeenCalled();
        expect(host.begin).not.toHaveBeenCalled();
        expect(owner.activeTarget).toBe(null);
        jest.mocked(host.queryCapabilities).mockResolvedValueOnce({ sceneTransactionVersion: 1, lightmapOutputDirectory: true, busy: true });
        await owner.bake(scene, 'lightmap', settings, 1000, 'db://assets/Lightmaps');
        expect(host.begin).toHaveBeenCalledWith(expect.objectContaining({ outputUrl: 'db://assets/Lightmaps', transactionId: 'owner' }));
        await owner.commit('first');
    });
});
