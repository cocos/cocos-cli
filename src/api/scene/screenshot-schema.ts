import { z } from 'zod';

/**
 * scene-get-screenshot 工具的入参 / 返回 schema。
 */
export const SchemaScreenshotOptions = z.object({
    sceneUrlOrUUID: z.string().optional().describe(
        'Optional scene asset url or uuid. If omitted, the scene currently opened in PinK is used. An explicit target is reopened from the latest imported asset and the previous scene is restored after capture. A switch that would discard unsaved scene-process edits is rejected.',
    ), // 可选：先打开该场景再截图；不传则截当前打开的场景
    width: z.number().int().positive().max(4096).optional().describe(
        'Render width in pixels before compression (default: project design resolution width).',
    ),
    height: z.number().int().positive().max(4096).optional().describe(
        'Render height in pixels before compression (default: project design resolution height; one specified edge preserves its aspect ratio).',
    ),
    camera: z.string().optional().describe(
        'Optional camera node path or uuid to frame the shot. If omitted, all enabled cameras that render to the screen are composited in ascending priority order; the editor camera is used only when no scene camera is available.',
    ),
    viewMode: z.enum(['auto', '2d', '3d']).optional().describe(
        'View mode: auto follows the scene 2D/3D state.',
    ),
    format: z.enum(['jpeg', 'png']).default('jpeg').describe(
        'Output image format sent to the agent (default jpeg for smaller size).',
    ),
    quality: z.number().int().min(1).max(100).default(80).describe(
        'Compression quality 1-100 (jpeg / png), default 80.',
    ),
    maxSize: z.number().int().positive().max(4096).optional().describe(
        'Optional max long-edge size of the returned image in pixels. If omitted, the design-resolution render size is preserved.',
    ),
}).describe('Scene screenshot options');

const SchemaScreenshotCameraInfo = z.object({
    source: z.enum(['scene', 'editor']),
    nodeName: z.string().optional(),
    projection: z.enum(['perspective', 'ortho']),
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    rotation: z.object({ x: z.number(), y: z.number(), z: z.number(), w: z.number() }),
    fov: z.number().optional(),
    orthoHeight: z.number().optional(),
    priority: z.number(),
    clearFlags: z.number(),
    visibility: z.number(),
    viewport: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
    }),
}).describe('Actual camera parameters used for the shot');

const SchemaScreenshotNodeSummary: z.ZodType<any> = z.lazy(() => z.object({
    name: z.string(),
    active: z.boolean(),
    components: z.array(z.string()),
    children: z.array(SchemaScreenshotNodeSummary).optional(),
}));

export const SchemaScreenshotResult = z.object({
    image: z.object({
        mimeType: z.string().describe('e.g. image/jpeg or image/png'),
        attached: z.literal(true).describe('The rendered image is attached as an MCP image content block'),
    }).describe('Metadata for the rendered image attached to the MCP response'),
    meta: z.object({
        sceneUrl: z.string().optional(),
        sceneName: z.string().optional(),
        mtime: z.number().optional().describe('Scene file mtime in ms; use it to judge whether the shot matches the on-disk file'),
        actualCamera: SchemaScreenshotCameraInfo,
        actualCameras: z.array(SchemaScreenshotCameraInfo).describe('All rendered cameras in ascending priority order'),
        nodeSummary: SchemaScreenshotNodeSummary.optional(),
        renderNote: z.string().optional().describe('Notes about the render, e.g. editor-camera fallback'),
        width: z.number().describe('Width of the returned image after maxSize processing'),
        height: z.number().describe('Height of the returned image after maxSize processing'),
        renderWidth: z.number().describe('Original offscreen render width before output resizing'),
        renderHeight: z.number().describe('Original offscreen render height before output resizing'),
    }).describe('Scene metadata bound to the screenshot'),
}).describe('Scene screenshot result');

export type TScreenshotOptions = z.infer<typeof SchemaScreenshotOptions>;
export type TScreenshotResult = z.infer<typeof SchemaScreenshotResult>;
