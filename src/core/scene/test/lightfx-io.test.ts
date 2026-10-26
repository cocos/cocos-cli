import { LightFXBuffer } from '../scene-process/service/baking/lightfx/buffer';
import { encodeLightFXInput } from '../scene-process/service/baking/lightfx/format';
import { LIGHTFX_FILE_VERSION, LightFXChunk, LightFXWorld } from '../scene-process/service/baking/lightfx/types';
import { createDefaultLightFXSettings } from '../scene-process/service/baking/lightfx/settings';
import { decodeLightFXOutput } from '../main-process/lightfx/output';
import { MAX_LIGHTMAP_GI_SAMPLES } from '../common/lightfx-limits';
import { validLightmapUV } from '../scene-process/service/baking/lightfx/lightmap-uv';
import { lightmapSceneStats } from '../scene-process/service/baking/lightfx/scene-stats';

describe('LightFX binary format', () => {
    it('uses the last non-overflowing native Lightmap sampling factor', () => {
        expect(MAX_LIGHTMAP_GI_SAMPLES).toBe(2590);
        expect(MAX_LIGHTMAP_GI_SAMPLES ** 2 * 64 * 5).toBeLessThanOrEqual(0x7fffffff);
        expect((MAX_LIGHTMAP_GI_SAMPLES + 1) ** 2 * 64 * 5).toBeGreaterThan(0x7fffffff);
    });

    it.each([1, 25, 1024, 2590])('encodes valid Lightmap sampling factor %s unchanged', giSamples => {
        const world: LightFXWorld = { name: 'Scene', settings: { ...createDefaultLightFXSettings('lightmap'), giSamples }, textures: [], terrains: [], meshes: [], lights: [], probes: [] };
        const encoded = encodeLightFXInput(world);
        // Version + length-prefixed name + origin/sky + msaa/size/gamma/highp + giScale.
        const offset = 4 + 4 + 'Scene'.length + 24 + 12 + 1 + 4;
        expect(new DataView(encoded.buffer, encoded.byteOffset).getInt32(offset, true)).toBe(giSamples);
    });

    it.each([2591, 65535, 65536, 0, -1, 25.5, NaN, Infinity])('rejects unsafe Lightmap sampling factor %s before encoding', giSamples => {
        const world: LightFXWorld = { name: 'Scene', settings: { ...createDefaultLightFXSettings('lightmap'), giSamples }, textures: [], terrains: [], meshes: [], lights: [], probes: [] };
        expect(() => encodeLightFXInput(world)).toThrow('Lightmap GI Samples must be an integer between 1 and 2590');
    });

    it('encodes both bake target flags and scene chunks', () => {
        const world: LightFXWorld = { name: 'Scene', settings: createDefaultLightFXSettings('light-probe'), textures: [], terrains: [], meshes: [], lights: [], probes: [{ position: [1, 2, 3], normal: [0, 1, 0] }] };
        const encoded = encodeLightFXInput(world);
        expect(encoded.byteLength).toBeGreaterThan(80);
        expect(new DataView(encoded.buffer, encoded.byteOffset).getInt32(0, true)).toBe(LIGHTFX_FILE_VERSION);
    });

    it('decodes mesh, terrain and probe results', () => {
        const b = new LightFXBuffer(); b.writeInt32(LIGHTFX_FILE_VERSION);
        b.writeInt32(LightFXChunk.MESH); b.writeInt32(1); b.writeInt32(2); b.writeInt32(3); b.writeFloats([.1, .2, .3, .4]);
        b.writeInt32(LightFXChunk.TERRAIN); b.writeInt32(4); b.writeInt32(1); b.writeInt32(5); b.writeInt32(6); b.writeFloats([.2, .3, .4, .5]);
        b.writeInt32(LightFXChunk.LIGHT_PROBE); b.writeInt32(1); b.writeFloats([1, 2, 3, 0, 1, 0]); b.writeInt32(27); b.writeFloats(Array.from({ length: 27 }, (_, i) => i));
        b.writeInt32(LightFXChunk.EOF);
        const result = decodeLightFXOutput(b.toUint8Array());
        expect(result.meshes[0]).toMatchObject({ id: 2, index: 3 }); expect(result.terrains[0]).toMatchObject({ id: 4, blockId: 5, index: 6 }); expect(result.probes[0].coefficients).toHaveLength(27);
    });

    it('accepts the legacy output version emitted by the bundled LightFX tool', () => {
        const b = new LightFXBuffer(); b.writeInt32(0x2000); b.writeInt32(LightFXChunk.EOF);
        expect(decodeLightFXOutput(b.toUint8Array()).version).toBe(0x2000);
    });

    it('rejects incompatible, truncated and unknown output', () => {
        const version = new LightFXBuffer(); version.writeInt32(1); expect(() => decodeLightFXOutput(version.toUint8Array())).toThrow('Unsupported');
        const truncated = new LightFXBuffer(); truncated.writeInt32(LIGHTFX_FILE_VERSION); truncated.writeInt32(LightFXChunk.MESH); expect(() => decodeLightFXOutput(truncated.toUint8Array())).toThrow('truncated');
        const unknown = new LightFXBuffer(); unknown.writeInt32(LIGHTFX_FILE_VERSION); unknown.writeInt32(99); expect(() => decodeLightFXOutput(unknown.toUint8Array())).toThrow('Unknown');
    });
});

describe('Lightmap export UV validation', () => {
    it.each([
        [null, 3, false], [[0, 0], 3, false], [[0, NaN], 1, false], [[Infinity, 0], 1, false],
        [[0, 0, 1, 0, 0, 1], 3, true], [new Float32Array([0, 1]), 1, true], [[], 0, false],
    ])('validates UV1 %p for %p vertices', (uv, count, expected) => {
        expect(validLightmapUV(uv as number[] | null, count as number)).toBe(expected);
    });
});

describe('Lightmap exported scene statistics', () => {
    it('counts mesh triangles plus full terrain tiles, not packed images or terrain tasks', () => {
        const world = { meshes: [{ triangles: Array(12) }], terrains: [{ blockCount: [2, 1] }], lights: [{}] } as LightFXWorld;
        expect(lightmapSceneStats(world, 32)).toEqual({ objects: 2, lights: 1, triangles: 4108 });
    });
    it('counts mesh-only and empty exported worlds without inventing objects', () => {
        const world = { meshes: [{ triangles: Array(12) }, { triangles: Array(200) }, { triangles: Array(12) }], terrains: [], lights: [{}] } as unknown as LightFXWorld;
        expect(lightmapSceneStats(world, 32)).toEqual({ objects: 3, lights: 1, triangles: 224 });
        expect(lightmapSceneStats({ meshes: [], terrains: [], lights: [] } as unknown as LightFXWorld, 32))
            .toEqual({ objects: 0, lights: 0, triangles: 0 });
    });
});
