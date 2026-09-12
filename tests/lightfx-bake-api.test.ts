import 'reflect-metadata';
import { COMMON_STATUS } from '../src/api/base/schema-base';
import {
    SchemaLightmapBakeInfo,
    SchemaLightmapBakeOptions,
    SchemaLightProbeBakeOptions,
} from '../src/api/scene/lightfx-bake-schema';

const probeBake = jest.fn(); const lightmapBake = jest.fn(); const queryLightmapBakeInfo = jest.fn();
const probeCancel = jest.fn(); const lightmapCancel = jest.fn();
jest.mock('../src/api/decorator/decorator', () => ({ description: () => jest.fn(), param: () => jest.fn(), result: () => jest.fn(), title: () => jest.fn(), tool: () => jest.fn() }));
jest.mock('../src/core/scene', () => ({ Scene: { LightProbeBake: { bake: (...args: unknown[]) => probeBake(...args), clearBake: jest.fn(), cancel: () => probeCancel() }, LightmapBake: { bake: (...args: unknown[]) => lightmapBake(...args), queryBakeInfo: (...args: unknown[]) => queryLightmapBakeInfo(...args), clearBake: jest.fn(), cancel: () => lightmapCancel() } } }));
import { LightFXBakeApi } from '../src/api/scene/lightfx-bake';

describe('LightFX bake API', () => {
    beforeEach(() => { probeBake.mockReset(); lightmapBake.mockReset(); queryLightmapBakeInfo.mockReset(); probeCancel.mockReset(); lightmapCancel.mockReset(); });
    it.each([true, false])('tries Lightmap cancel only when Probe did not cancel (probe=%s)', async cancelled => {
        const probe = { cancelled, target: cancelled ? 'light-probe' : null };
        const lightmap = { cancelled: true, target: 'lightmap' };
        probeCancel.mockResolvedValue(probe);
        lightmapCancel.mockResolvedValue(lightmap);
        await expect(new LightFXBakeApi().cancel()).resolves.toEqual({ code: COMMON_STATUS.SUCCESS, data: cancelled ? probe : lightmap });
        expect(lightmapCancel).toHaveBeenCalledTimes(cancelled ? 0 : 1);
    });
    it('does not cancel another type after an uncertain cancellation error', async () => {
        probeCancel.mockRejectedValue(new Error('Disconnected'));
        await expect(new LightFXBakeApi().cancel()).resolves.toEqual({ code: COMMON_STATUS.FAIL, reason: 'Disconnected' });
        expect(lightmapCancel).not.toHaveBeenCalled();
    });
    it('validates all Creator light-probe panel parameters', () => {
        const options = {
            giScale: 8, giSamples: 4096, bounces: 1, reduceRinging: 0.02,
            showWireframe: true, showConvex: false, lightProbeSphereVolume: 2,
        };
        expect(SchemaLightProbeBakeOptions.parse(options)).toEqual(options);
        expect(() => SchemaLightProbeBakeOptions.parse({ giSamples: 1 })).toThrow();
        expect(() => SchemaLightProbeBakeOptions.parse({ bounces: 5 })).toThrow();
        expect(() => SchemaLightProbeBakeOptions.parse({ reduceRinging: 0.051 })).toThrow();
        expect(() => SchemaLightProbeBakeOptions.parse({ lightProbeSphereVolume: 101 })).toThrow();
    });
    it('validates all Creator lightmap calculation parameters', () => {
        const options = { msaa: 4 as const, resolution: 1024, filter: true, highp: false, giScale: 1, giSamples: 25, giPathLength: 4, aoLevel: 0, aoStrength: .5, aoRadius: 1, aoColor: [136, 136, 136, 255] as [number, number, number, number], threads: 4 };
        expect(SchemaLightmapBakeOptions.parse(options)).toEqual(options);
        expect(() => SchemaLightmapBakeOptions.parse({ resolution: 4096 })).toThrow();
        expect(() => SchemaLightmapBakeOptions.parse({ giPathLength: 5 })).toThrow();
        expect(() => SchemaLightmapBakeOptions.parse({ aoLevel: 3 })).toThrow();
    });
    it('rejects overflowing Lightmap GI samples without restricting probe samples', () => {
        expect(SchemaLightmapBakeOptions.parse({ giSamples: 2590 })).toEqual({ giSamples: 2590 });
        for (const giSamples of [2591, 65535, 65536, 0, -1, 25.5, NaN, Infinity]) {
            expect(SchemaLightmapBakeOptions.safeParse({ giSamples }).success).toBe(false);
        }
        expect(SchemaLightProbeBakeOptions.parse({ giSamples: 65535 })).toEqual({ giSamples: 65535 });
    });
    it('forwards probe bake and wraps success', async () => { const data = { sceneUrl: 'db://assets/a.scene', probeCount: 4, giScale: 1, giSamples: 64, bounces: 1, reduceRinging: 0, showWireframe: true, showConvex: false, lightProbeSphereVolume: 1, durationMs: 10 }; probeBake.mockResolvedValue(data); await expect(new LightFXBakeApi().bakeLightProbes({ saveScene: true })).resolves.toEqual({ code: COMMON_STATUS.SUCCESS, data }); expect(probeBake).toHaveBeenCalledWith({ saveScene: true }); });
    it('wraps LightFX failure', async () => { lightmapBake.mockRejectedValue(new Error('LightFX failed')); await expect(new LightFXBakeApi().bakeLightmap({})).resolves.toEqual({ code: COMMON_STATUS.FAIL, reason: 'LightFX failed' }); });
    it('queries the current lightmap bake information', async () => {
        const data = {
            sceneUrl: 'db://assets/Lightmap.scene', baked: true, meshCount: 1, terrainCount: 0,
            highp: false, stationaryMainLight: false,
            textures: [{
                uuid: 'texture-uuid', url: 'db://assets/Lightmap/lightmap/LFX_Mesh_0000.png',
                filename: 'LFX_Mesh_0000.png', size: 1024, createdAt: 1, modifiedAt: 2,
            }],
            missingTextureUuids: [],
        };
        expect(SchemaLightmapBakeInfo.parse(data)).toEqual(data);
        queryLightmapBakeInfo.mockResolvedValue(data);
        await expect(new LightFXBakeApi().queryLightmapBakeInfo())
            .resolves.toEqual({ code: COMMON_STATUS.SUCCESS, data });
        expect(queryLightmapBakeInfo).toHaveBeenCalledTimes(1);
    });
});
