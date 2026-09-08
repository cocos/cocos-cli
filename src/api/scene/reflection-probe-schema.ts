import { z } from 'zod';

export const SchemaReflectionProbeBakeOptions = z.object({
    nodePath: z.string().trim().min(1).describe('Path of the node containing cc.ReflectionProbe in the active Pink/browser scene'),
    saveScene: z.boolean().optional().default(true).describe('Save the same live scene after hot-applying the cubemap'),
    timeoutMs: z.number().int().positive().max(600_000).optional().default(120_000)
        .describe('Timeout for capture, cmft, asset import, binding, and scene save'),
}).describe('Reflection probe bake options');

export const SchemaReflectionProbeBakeResult = z.object({
    nodePath: z.string(),
    componentUuid: z.string(),
    probeId: z.number().int(),
    cubemapUuid: z.string(),
    cubemapUrl: z.string(),
    fastBake: z.boolean(),
}).describe('Reflection probe bake result');

export const SchemaReflectionProbeBakeAllOptions = z.object({
    nodePaths: z.array(z.string().trim().min(1)).optional()
        .describe('Optional reflection-probe node paths; omit or pass an empty array to bake all'),
    saveScene: z.boolean().optional().default(true)
        .describe('Save the active scene once after all successful probes are hot-applied'),
    timeoutMs: z.number().int().positive().max(3_600_000).optional().default(600_000)
        .describe('Timeout for the complete batch operation'),
}).describe('Bake-all reflection probe options');

export const SchemaReflectionProbeBakeFailure = z.object({
    nodePath: z.string(),
    componentUuid: z.string().optional(),
    reason: z.string(),
});

export const SchemaReflectionProbeBakeAllResult = z.object({
    sceneUrl: z.string(),
    totalCount: z.number().int().nonnegative(),
    bakedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    results: z.array(SchemaReflectionProbeBakeResult),
    failures: z.array(SchemaReflectionProbeBakeFailure),
    durationMs: z.number().nonnegative(),
}).describe('Bake-all reflection probe result');

export const SchemaReflectionProbeClearOptions = z.object({
    saveScene: z.boolean().optional().default(true)
        .describe('Save the active scene once after all cubemap bindings are cleared'),
    deleteAssets: z.boolean().optional().default(true)
        .describe('Delete CLI-generated cubemap PNG and convolution assets after clearing their bindings'),
    timeoutMs: z.number().int().positive().max(600_000).optional().default(120_000)
        .describe('Timeout for the complete clear operation'),
}).refine((options) => options.saveScene || !options.deleteAssets, {
    message: 'deleteAssets requires saveScene so the saved scene cannot retain deleted cubemap references',
    path: ['deleteAssets'],
}).describe('Clear-all reflection probe options');

export const SchemaReflectionProbeClearFailure = z.object({
    assetUrl: z.string(),
    reason: z.string(),
});

export const SchemaReflectionProbeClearResult = z.object({
    sceneUrl: z.string(),
    totalCount: z.number().int().nonnegative(),
    clearedCount: z.number().int().nonnegative(),
    deletedAssetUrls: z.array(z.string()),
    failures: z.array(SchemaReflectionProbeClearFailure),
    durationMs: z.number().nonnegative(),
}).describe('Clear-all reflection probe result');

export type TReflectionProbeBakeOptions = z.infer<typeof SchemaReflectionProbeBakeOptions>;
export type TReflectionProbeBakeResult = z.infer<typeof SchemaReflectionProbeBakeResult>;
export type TReflectionProbeBakeAllOptions = z.infer<typeof SchemaReflectionProbeBakeAllOptions>;
export type TReflectionProbeBakeAllResult = z.infer<typeof SchemaReflectionProbeBakeAllResult>;
export type TReflectionProbeClearOptions = z.infer<typeof SchemaReflectionProbeClearOptions>;
export type TReflectionProbeClearResult = z.infer<typeof SchemaReflectionProbeClearResult>;
