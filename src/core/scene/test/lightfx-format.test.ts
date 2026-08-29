import { LightFXBuffer } from '../scene-process/service/baking/lightfx/buffer';
import { decodeLightFXOutput, encodeLightFXInput } from '../scene-process/service/baking/lightfx/format';
import { LIGHTFX_FILE_VERSION, LightFXChunk, LightFXWorld } from '../scene-process/service/baking/lightfx/types';
import { createDefaultLightFXSettings } from '../scene-process/service/baking/lightfx/settings';

describe('LightFX binary format', () => {
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
