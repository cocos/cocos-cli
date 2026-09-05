import { z } from 'zod';

const SaveAndTimeout = {
    saveScene: z.boolean().optional().describe('Save the current scene after applying the bake result; defaults to true'),
    timeoutMs: z.number().int().min(1_000).max(3_600_000).optional().describe('Whole-operation timeout in milliseconds'),
};

export const SchemaLightProbeBakeOptions = z.object({
    giScale: z.number().finite().min(0).max(100).optional().describe('GI multiplier for this bake only'),
    giSamples: z.number().int().min(64).max(65535).optional().describe('GI probe sample count for this bake only'),
    bounces: z.number().int().min(1).max(4).optional().describe('Probe ray bounce count for this bake only'),
    ...SaveAndTimeout,
}).describe('Light probe bake options');

export const SchemaLightProbeBakeResult = z.object({
    sceneUrl: z.string(), probeCount: z.number().int().nonnegative(),
    giScale: z.number(), giSamples: z.number().int(), bounces: z.number().int(), durationMs: z.number().nonnegative(),
});

export const SchemaLightmapBakeOptions = z.object({
    msaa: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8)]).optional(),
    resolution: z.number().int().min(128).max(8192).optional(),
    filter: z.boolean().optional(), highp: z.boolean().optional(),
    giScale: z.number().finite().min(0).max(100).optional(),
    giSamples: z.number().int().min(1).max(65535).optional(),
    giPathLength: z.number().int().min(1).max(64).optional(),
    aoLevel: z.number().int().min(0).max(2).optional(),
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

export const SchemaLightFXCancelResult = z.object({
    cancelled: z.boolean(), target: z.enum(['light-probe', 'lightmap']).nullable(),
});

export const SchemaLightProbeClearOptions = z.object({ saveScene: z.boolean().optional() });
export const SchemaLightmapClearOptions = z.object({ saveScene: z.boolean().optional(), deleteAssets: z.boolean().optional() });
export const SchemaClearCountResult = z.object({ probeCount: z.number().int().nonnegative().optional(), clearedCount: z.number().int().nonnegative().optional() });

export type TLightProbeBakeOptions = z.infer<typeof SchemaLightProbeBakeOptions>;
export type TLightProbeBakeResult = z.infer<typeof SchemaLightProbeBakeResult>;
export type TLightmapBakeOptions = z.infer<typeof SchemaLightmapBakeOptions>;
export type TLightmapBakeResult = z.infer<typeof SchemaLightmapBakeResult>;
