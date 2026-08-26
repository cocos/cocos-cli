import { z } from 'zod';

export const SchemaReferenceImageParameters = z.object({
    x: z.number().finite().optional().describe('Horizontal offset in 2D scene world units'),
    y: z.number().finite().optional().describe('Vertical offset in 2D scene world units'),
    scaleX: z.number().finite().optional().describe('Horizontal scale factor'),
    scaleY: z.number().finite().optional().describe('Vertical scale factor'),
    opacity: z.number().min(0).max(100).optional().describe('Opacity percentage from 0 to 100'),
}).refine((value) => Object.keys(value).length > 0, {
    message: 'At least one reference image parameter is required.',
}).describe('Reference image parameters');

export const SchemaReferenceImagePath = z.object({
    path: z.string().min(1).describe('Absolute local PNG, JPG, or JPEG file path'),
}).describe('Reference image file');

export const SchemaReferenceImageVisibility = z.object({
    desiredVisible: z.boolean().describe('Whether the user wants reference images visible in supported editors'),
}).describe('Reference image visibility preference');

const SchemaReferenceImageItem = z.object({
    path: z.string(),
    x: z.number(),
    y: z.number(),
    scaleX: z.number(),
    scaleY: z.number(),
    opacity: z.number().min(0).max(100),
    missing: z.boolean(),
});

export const SchemaReferenceImageState = z.object({
    images: z.array(SchemaReferenceImageItem),
    current: z.object({
        sceneUuid: z.string().nullable(),
        imagePath: z.string().nullable(),
        image: SchemaReferenceImageItem.nullable(),
    }),
    desiredVisible: z.boolean(),
    effectiveVisible: z.boolean(),
    visibilityReason: z.enum(['visible', 'disabled', 'no-editor', 'not-2d', 'unbound', 'missing', 'load-error']),
    is2D: z.boolean(),
    hasOpenEditor: z.boolean(),
    error: z.object({
        stage: z.enum(['config', 'file', 'decode']),
        message: z.string(),
    }).nullable(),
}).describe('Current editor reference-image state');

export type TReferenceImageParameters = z.infer<typeof SchemaReferenceImageParameters>;
export type TReferenceImagePath = z.infer<typeof SchemaReferenceImagePath>;
export type TReferenceImageVisibility = z.infer<typeof SchemaReferenceImageVisibility>;
export type TReferenceImageState = z.infer<typeof SchemaReferenceImageState>;
