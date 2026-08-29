export type LightFXBakeTarget = 'light-probe' | 'lightmap';

export interface LightFXSettings {
    msaa: number; size: number; gamma: number; highp: boolean; skyRadiance: number[];
    giScale: number; giSamples: number; giPathLength: number;
    giProbeScale: number; giProbeSamples: number; giProbePathLength: number;
    aoLevel: number; aoStrength: number; aoRadius: number; aoColor: number[];
    threads: number; filter: boolean; bakeLightmap: boolean; bakeLightProbe: boolean;
}
export interface LightFXVertex { position: number[]; normal: number[]; uv: number[]; lightmapUV: number[] }
export interface LightFXTriangle { indices: number[]; materialId: number }
export interface LightFXMaterial { alphaCutoff: number; metallic: number; roughness: number; diffuse: number[]; emissive: number[]; texture: string; pbrMap: string; emissiveMap: string }
export interface LightFXMesh { castShadow: boolean; receiveShadow: boolean; lightmapSize: number; vertices: LightFXVertex[]; triangles: LightFXTriangle[]; materials: LightFXMaterial[] }
export interface LightFXTerrain { position: number[]; tileSize: number; blockCount: number[]; lightmapSize: number; heightField: Uint16Array }
export interface LightFXLight { type: number; position: number[]; direction: number[]; color: number[]; size: number; range: number; attenuationFalloff: number; spotInner: number; spotOuter: number; spotFalloff: number; directScale: number; indirectScale: number; giEnabled: boolean; castShadow: boolean; shadowMask: number }
export interface LightFXProbe { position: number[]; normal: number[] }
export interface LightFXWorld { name: string; settings: LightFXSettings; meshes: LightFXMesh[]; terrains: LightFXTerrain[]; lights: LightFXLight[]; probes: LightFXProbe[]; textures: string[] }
export interface LightFXMeshResult { id: number; index: number; offset: number[]; scale: number[] }
export interface LightFXTerrainResult extends LightFXMeshResult { blockId: number }
export interface LightFXProbeResult { position: number[]; normal: number[]; coefficients: number[] }
export interface LightFXResult { version: number; meshes: LightFXMeshResult[]; terrains: LightFXTerrainResult[]; probes: LightFXProbeResult[] }

export const LIGHTFX_FILE_VERSION = 0x3730;
export const LIGHTFX_OUTPUT_VERSIONS = new Set([0x2000, 0x2002, 0x2003, LIGHTFX_FILE_VERSION]);
export const enum LightFXChunk { EOF = 0, TERRAIN = 1, MESH = 2, LIGHT = 3, LIGHT_PROBE = 4 }
