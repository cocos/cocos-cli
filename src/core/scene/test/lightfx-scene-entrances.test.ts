const mockGetScene = jest.fn();
jest.mock('cc', () => ({ director: { getScene: mockGetScene } }));
jest.mock('../scene-process/service/baking/lightfx/baker', () => ({ lightFXCoordinator: {} }));
jest.mock('../scene-process/service/baking/lightfx/host', () => ({ lightFXBakeHost: {} }));
jest.mock('../scene-process/service/baking/lightfx/settings', () => ({ createDefaultLightFXSettings: jest.fn() }));
jest.mock('../scene-process/service/preview/asset-reload', () => ({ loadPreviewAsset: jest.fn() }));
jest.mock('../scene-process/rpc', () => ({ Rpc: { getInstance: jest.fn() } }));

import { LightProbeBakeService } from '../scene-process/service/light-probe-bake';
import { LightmapBakeService } from '../scene-process/service/lightmap-bake';
import { lightFXSceneOperation } from '../scene-process/service/baking/lightfx/scene-operation';

describe('LightFX service entrance ownership', () => {
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
