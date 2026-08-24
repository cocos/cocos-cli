import sharp from 'sharp';
import { readFile, unlink } from 'fs/promises';
import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType, getCommonErrorStatus } from '../base/schema-base';
import { Scene } from '../../core/scene';
import {
    SchemaScreenshotOptions,
    SchemaScreenshotResult,
    TScreenshotOptions,
    TScreenshotResult,
} from './screenshot-schema';

type TScreenshotResultWithPayload = TScreenshotResult & {
    image: TScreenshotResult['image'] & { base64: string };
};

/**
 * 场景截图 MCP 工具。
 *
 * 让具备视觉能力的 Agent 以 headless 离屏渲染的方式「看到」当前场景画面：
 * 场景进程离屏渲染 → 临时 PNG → 这里用 sharp 缩放压缩 → base64 内联返回（MCP image 内容块）。
 */
export class SceneScreenshotApi {
    @tool('scene-get-screenshot')
    @title('Capture scene screenshot') // 截取当前场景画面
    @description(
        'Headlessly render the currently open scene from project files and return the image (base64, for multimodal input) plus scene metadata '
        + '(scene name, file mtime, actual camera params, node-tree summary). '
        + 'Use it to visually reason about layout, spacing, occlusion and spatial relations. '
        + 'The image is scaled/compressed and is a tool-chain rendered preview, not pixel-accurate; confirm exact values with structured data.',
    ) // 以 headless 离屏渲染当前场景，返回图片 + 场景元数据，供多模态视觉分析布局/遮挡/间距
    @result(SchemaScreenshotResult)
    async getSceneScreenshot(
        @param(SchemaScreenshotOptions) options: TScreenshotOptions,
    ): Promise<CommonResultType<TScreenshotResultWithPayload>> {
        let tempFilePath: string | undefined;
        try {
            // 场景进程在截图 RPC 内安全刷新目标，避免旧实例在重新打开前被保存。
            const shot = await Scene.Screenshot.capture({
                sceneUrlOrUUID: options.sceneUrlOrUUID,
                width: options.width,
                height: options.height,
                camera: options.camera,
                viewMode: options.viewMode,
                includeGizmos: options.includeGizmos,
            });
            tempFilePath = shot.filePath;

            const format = options.format ?? 'jpeg';
            const quality = options.quality ?? 80;
            const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';

            // 默认保持设计分辨率；调用方显式指定 maxSize 时才等比缩小。
            const raw = await readFile(shot.filePath);
            let pipeline = sharp(raw);
            if (options.maxSize != null) {
                pipeline = pipeline.resize({
                    width: options.maxSize,
                    height: options.maxSize,
                    fit: 'inside',
                    withoutEnlargement: true,
                });
            }
            pipeline = format === 'png'
                ? pipeline.png({ quality, compressionLevel: 9 })
                : pipeline.jpeg({ quality });

            const { data: out, info: outputInfo } = await pipeline.toBuffer({ resolveWithObject: true });
            const base64 = out.toString('base64');

            return {
                code: COMMON_STATUS.SUCCESS,
                data: {
                    image: { base64, mimeType, attached: true },
                    meta: {
                        sceneUrl: shot.sceneUrl,
                        sceneName: shot.sceneName,
                        mtime: shot.mtime,
                        actualCamera: shot.actualCamera,
                        actualCameras: shot.actualCameras,
                        nodeSummary: shot.nodeSummary,
                        renderNote: shot.renderNote,
                        width: outputInfo.width,
                        height: outputInfo.height,
                        renderWidth: shot.width,
                        renderHeight: shot.height,
                    },
                },
            };
        } catch (e) {
            console.error(e);
            return {
                code: getCommonErrorStatus(e),
                reason: e instanceof Error ? e.message : String(e),
            };
        } finally {
            if (tempFilePath) {
                try {
                    await unlink(tempFilePath);
                } catch (cleanupError: any) {
                    if (cleanupError?.code !== 'ENOENT') {
                        console.warn(`[Screenshot] Failed to remove temporary image ${tempFilePath}:`, cleanupError);
                    }
                }
            }
        }
    }
}
