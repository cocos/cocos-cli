import { LightFXBuffer } from './buffer';
import { LIGHTFX_FILE_VERSION, LightFXChunk, LightFXWorld } from './types';

export function encodeLightFXInput(world: LightFXWorld): Uint8Array {
    const b = new LightFXBuffer(); const s = world.settings;
    b.writeInt32(LIGHTFX_FILE_VERSION); b.writeString(world.name); b.writeFloats([0, 0, 0]); b.writeFloats(s.skyRadiance);
    b.writeInt32(s.msaa); b.writeInt32(s.size); b.writeFloat(s.gamma); b.writeInt8(s.highp ? 1 : 0);
    b.writeFloat(s.giScale); b.writeInt32(s.giSamples); b.writeInt32(s.giPathLength);
    b.writeFloat(s.giProbeScale); b.writeInt32(s.giProbeSamples); b.writeInt32(s.giProbePathLength);
    b.writeInt32(s.aoLevel); b.writeFloat(s.aoStrength); b.writeFloat(s.aoRadius); b.writeFloats(s.aoColor.slice(0, 3).map((v) => v / 255));
    b.writeInt32(s.threads); b.writeInt8(s.filter ? 1 : 0); b.writeInt8(s.bakeLightmap ? 1 : 0); b.writeInt8(s.bakeLightProbe ? 1 : 0);
    for (const t of world.terrains) { b.writeInt32(LightFXChunk.TERRAIN); b.writeFloats(t.position); b.writeFloat(t.tileSize); b.writeInts(t.blockCount); b.writeInt32(t.lightmapSize); b.writeHeightField(t.heightField); }
    for (const m of world.meshes) {
        b.writeInt32(LightFXChunk.MESH); b.writeInt8(m.castShadow ? 1 : 0); b.writeInt8(m.receiveShadow ? 1 : 0); b.writeInt32(m.lightmapSize);
        b.writeInt32(m.vertices.length); b.writeInt32(m.triangles.length); b.writeInt32(m.materials.length);
        m.vertices.forEach((v) => { b.writeFloats(v.position); b.writeFloats(v.normal); b.writeFloats(v.uv); b.writeFloats(v.lightmapUV); });
        m.triangles.forEach((t) => { b.writeInts(t.indices); b.writeInt32(t.materialId); });
        m.materials.forEach((m) => { b.writeFloat(m.alphaCutoff); b.writeFloat(m.metallic); b.writeFloat(m.roughness); b.writeFloats(m.diffuse); b.writeFloats(m.emissive); b.writeString(m.texture); b.writeString(m.pbrMap); b.writeString(m.emissiveMap); });
    }
    for (const l of world.lights) { b.writeInt32(LightFXChunk.LIGHT); b.writeInt32(l.type); b.writeFloats(l.position); b.writeFloats(l.direction); b.writeFloats(l.color); b.writeFloat(l.size); b.writeFloat(l.range); b.writeFloat(l.attenuationFalloff); b.writeFloat(l.spotInner); b.writeFloat(l.spotOuter); b.writeFloat(l.spotFalloff); b.writeFloat(l.directScale); b.writeFloat(l.indirectScale); b.writeInt8(l.giEnabled ? 1 : 0); b.writeInt8(l.castShadow ? 1 : 0); b.writeFloat(l.shadowMask); }
    for (const p of world.probes) { b.writeInt32(LightFXChunk.LIGHT_PROBE); b.writeFloats(p.position); b.writeFloats(p.normal); }
    b.writeInt32(LightFXChunk.EOF); return b.toUint8Array();
}
