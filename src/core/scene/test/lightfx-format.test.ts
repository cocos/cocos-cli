import { LightFXBuffer } from '../scene-process/service/baking/lightfx/buffer';
import { encodeLightFXInput } from '../scene-process/service/baking/lightfx/format';
import { LIGHTFX_FILE_VERSION, LightFXChunk, LightFXWorld } from '../scene-process/service/baking/lightfx/types';
import { createDefaultLightFXSettings } from '../scene-process/service/baking/lightfx/settings';
import { decodeLightFXOutput } from '../main-process/lightfx/output';
import { MAX_LIGHTMAP_GI_SAMPLES } from '../common/lightfx-limits';

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
