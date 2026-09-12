import { z } from 'zod';
import { MAX_LIGHTMAP_GI_SAMPLES } from '../../core/scene/common/lightfx-limits';

const SaveAndTimeout = {
    saveScene: z.boolean().optional().describe('Save the current scene after applying the bake result; defaults to true'),
    timeoutMs: z.number().int().min(1_000).max(3_600_000).optional().describe('Whole-operation timeout in milliseconds'),
};

export const SchemaLightProbeBakeOptions = z.object({
    giScale: z.number().finite().min(0).max(100).optional().describe('GI multiplier; defaults to the current scene value'),
    giSamples: z.number().int().min(64).max(65535).optional().describe('GI probe sample count; defaults to the current scene value'),
    bounces: z.number().int().min(1).max(4).optional().describe('Probe ray bounce count; defaults to the current scene value'),
    reduceRinging: z.number().finite().min(0).max(0.05).optional().describe('Spherical-harmonic ringing reduction; defaults to the current scene value'),
    showWireframe: z.boolean().optional().describe('Show light-probe connections in the scene view; defaults to the current scene value'),
    showConvex: z.boolean().optional().describe('Show the light-probe convex hull in the scene view; defaults to the current scene value'),
    lightProbeSphereVolume: z.number().finite().min(0).max(100).optional().describe('Light-probe sphere display size; defaults to the current scene value'),
    ...SaveAndTimeout,
}).describe('Light probe bake options');

export const SchemaLightProbeBakeResult = z.object({
    sceneUrl: z.string(), probeCount: z.number().int().nonnegative(),
    giScale: z.number(), giSamples: z.number().int(), bounces: z.number().int(),
    reduceRinging: z.number(), showWireframe: z.boolean(), showConvex: z.boolean(), lightProbeSphereVolume: z.number(),
    durationMs: z.number().nonnegative(),
});

export const SchemaLightmapBakeOptions = z.object({
    outputUrl: z.string().optional().describe('Existing parent directory under db://assets. Saved results publish into scene-<scene UUID>/output; omitted or db://assets uses db://assets/LightFX as parent. Use returned texture URLs.'),
    msaa: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8)]).optional(),
    resolution: z.union([z.literal(128), z.literal(256), z.literal(512), z.literal(1024), z.literal(2048)]).optional(),
    filter: z.boolean().optional(), highp: z.boolean().optional(),
    giScale: z.number().finite().min(0).max(100).optional(),
    giSamples: z.number().int().min(1).max(MAX_LIGHTMAP_GI_SAMPLES).optional()
        .describe('Lightmap GI sampling factor; 1–2590. Large values have quadratic memory and time costs.'),
    giPathLength: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    aoLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
    aoStrength: z.number().finite().min(0).optional(),
    aoRadius: z.number().finite().min(0).optional(),
    aoColor: z.tuple([z.number().min(0).max(255), z.number().min(0).max(255), z.number().min(0).max(255), z.number().min(0).max(255).optional()]).optional(),
    threads: z.number().int().min(1).max(256).optional(),
    ...SaveAndTimeout,
}).describe('Lightmap bake options');

export const SchemaLightmapBakeResult = z.object({
    sceneUrl: z.string(), textureUrls: z.array(z.string()), meshCount: z.number().int().nonnegative(),
    terrainCount: z.number().int().nonnegative(), durationMs: z.number().nonnegative(),
});

export const SchemaLightmapTextureInfo = z.object({
    uuid: z.string(),
    url: z.string(),
    filename: z.string(),
    size: z.number().int().nonnegative(),
    createdAt: z.number().finite().nonnegative(),
    modifiedAt: z.number().finite().nonnegative(),
});

export const SchemaLightmapBakeInfo = z.object({
    sceneUrl: z.string(),
    baked: z.boolean(),
    meshCount: z.number().int().nonnegative(),
    terrainCount: z.number().int().nonnegative(),
    highp: z.boolean(),
    stationaryMainLight: z.boolean(),
    textures: z.array(SchemaLightmapTextureInfo),
    missingTextureUuids: z.array(z.string()),
});

export const SchemaLightFXCancelResult = z.object({
    cancelled: z.boolean(), target: z.enum(['light-probe', 'lightmap']).nullable(),
});

export const SchemaLightProbeClearOptions = z.object({ saveScene: z.boolean().optional() });
export const SchemaLightmapClearOptions = z.object({ saveScene: z.boolean().optional(), deleteAssets: z.boolean().optional() });
export const SchemaClearCountResult = z.object({
    probeCount: z.number().int().nonnegative().optional(),
    clearedCount: z.number().int().nonnegative().optional(),
    deletedAssetCount: z.number().int().nonnegative().optional(),
    retainedAssetCount: z.number().int().nonnegative().optional(),
    failedAssetCount: z.number().int().nonnegative().optional(),
});

export type TLightProbeBakeOptions = z.infer<typeof SchemaLightProbeBakeOptions>;
export type TLightProbeBakeResult = z.infer<typeof SchemaLightProbeBakeResult>;
export type TLightmapBakeOptions = z.infer<typeof SchemaLightmapBakeOptions>;
export type TLightmapBakeResult = z.infer<typeof SchemaLightmapBakeResult>;
export type TLightmapBakeInfo = z.infer<typeof SchemaLightmapBakeInfo>;
