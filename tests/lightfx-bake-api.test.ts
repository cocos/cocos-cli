import 'reflect-metadata';
import { COMMON_STATUS } from '../src/api/base/schema-base';
import { SchemaLightmapBakeOptions, SchemaLightProbeBakeOptions } from '../src/api/scene/lightfx-bake-schema';

const probeBake = jest.fn(); const lightmapBake = jest.fn();
jest.mock('../src/api/decorator/decorator', () => ({ description: () => jest.fn(), param: () => jest.fn(), result: () => jest.fn(), title: () => jest.fn(), tool: () => jest.fn() }));
jest.mock('../src/core/scene', () => ({ Scene: { LightProbeBake: { bake: (...args: unknown[]) => probeBake(...args), clearBake: jest.fn(), cancel: jest.fn() }, LightmapBake: { bake: (...args: unknown[]) => lightmapBake(...args), clearBake: jest.fn(), cancel: jest.fn() } } }));
import { LightFXBakeApi } from '../src/api/scene/lightfx-bake';

describe('LightFX bake API', () => {
    beforeEach(() => { probeBake.mockReset(); lightmapBake.mockReset(); });
    it('validates probe parameters', () => { expect(SchemaLightProbeBakeOptions.parse({ giScale: 8, giSamples: 4096, bounces: 1 })).toMatchObject({ giScale: 8 }); expect(() => SchemaLightProbeBakeOptions.parse({ giSamples: 1 })).toThrow(); expect(() => SchemaLightProbeBakeOptions.parse({ bounces: 5 })).toThrow(); });
    it('validates all Creator lightmap calculation parameters', () => { const options = { msaa: 4 as const, resolution: 1024, filter: true, highp: false, giScale: 1, giSamples: 25, giPathLength: 4, aoLevel: 0, aoStrength: .5, aoRadius: 1, aoColor: [136, 136, 136, 255] as [number, number, number, number], threads: 4 }; expect(SchemaLightmapBakeOptions.parse(options)).toEqual(options); });
    it('forwards probe bake and wraps success', async () => { const data = { sceneUrl: 'db://assets/a.scene', probeCount: 4, giScale: 1, giSamples: 64, bounces: 1, durationMs: 10 }; probeBake.mockResolvedValue(data); await expect(new LightFXBakeApi().bakeLightProbes({ saveScene: true })).resolves.toEqual({ code: COMMON_STATUS.SUCCESS, data }); expect(probeBake).toHaveBeenCalledWith({ saveScene: true }); });
    it('wraps LightFX failure', async () => { lightmapBake.mockRejectedValue(new Error('LightFX failed')); await expect(new LightFXBakeApi().bakeLightmap({})).resolves.toEqual({ code: COMMON_STATUS.FAIL, reason: 'LightFX failed' }); });
});
