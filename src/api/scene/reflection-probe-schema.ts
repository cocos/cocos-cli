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

export type TReflectionProbeBakeOptions = z.infer<typeof SchemaReflectionProbeBakeOptions>;
export type TReflectionProbeBakeResult = z.infer<typeof SchemaReflectionProbeBakeResult>;
