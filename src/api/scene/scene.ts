import sharp from 'sharp';
import { readFile, unlink } from 'fs/promises';
import {
    SchemaOpenOptions,
    SchemaCloseResult,
    SchemaCreateOptions,
    SchemaCreateResult,
    SchemaCurrentResult,
    SchemaOpenResult,
    SchemaReload,
    SchemaSaveResult,
    TOpenOptions,
    TCloseResult,
    TCreateOptions,
    TCreateResult,
    TCurrentResult,
    TOpenResult,
    TReload,
    TSaveResult,
} from './schema';
import {
    SchemaScreenshotOptions,
    SchemaScreenshotResult,
    TScreenshotOptions,
    TScreenshotResult,
} from './screenshot-schema';
import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType, getCommonErrorStatus } from '../base/schema-base';
import { Scene, TSceneTemplateType } from '../../core/scene';
import { ComponentApi } from './component';
import { NodeApi } from './node';
import { PrefabApi } from './prefab';

type TScreenshotResultWithPayload = TScreenshotResult & {
    image: TScreenshotResult['image'] & { base64: string };
};

export class SceneApi {
    public component: ComponentApi;
    public node: NodeApi;
    public prefab: PrefabApi;

    constructor() {
        this.component = new ComponentApi();
        this.node = new NodeApi();
        this.prefab = new PrefabApi();
    }

    @tool('scene-query-current')
    @title('Get current opened scene/prefab info') // 获取当前打开的场景/预制体信息
    @description('Get current opened scene/prefab info, if no scene is opened, the data is not returned.') // 获取当前打开场景/预制体信息，如果没有打开，返回 null
    @result(SchemaCurrentResult)
    async queryCurrent(): Promise<CommonResultType<TCurrentResult>> {
        try {
            const data = await Scene.queryCurrent();
            const result = {
                data: data as TCurrentResult,
                code: COMMON_STATUS.SUCCESS,
            };
            if (!data) {
                delete (result as any).data;
                (result as any).reason = 'No scene is currently open.';
            }
            return result;
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-open')
    @title('Open scene/prefab') // 打开场景/预制体
    @description('Open specified scene/prefab asset.') // 打开指定场景/预制体资源。
    @result(SchemaOpenResult)
    async open(@param(SchemaOpenOptions) options: TOpenOptions): Promise<CommonResultType<TOpenResult>> {
        try {
            const data = await Scene.open({ urlOrUUID: options.dbURLOrUUID, includeChildren: options.includeChildren, includeComponents: options.includeComponents });
            return {
                data: data as TOpenResult,
                code: COMMON_STATUS.SUCCESS,
            };
        } catch (e) {
            console.error(e);
            return {
                code: getCommonErrorStatus(e),
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-close')
    @title('Close scene/prefab') // 关闭场景/预制体
    @description('Close current opened scene/prefab.') // 关闭当前打开的场景/预制体。
    @result(SchemaCloseResult)
    async close(): Promise<CommonResultType<TCloseResult>> {
        try {
            const data = await Scene.close({});
            return {
                data,
                code: COMMON_STATUS.SUCCESS,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-save')
    @title('Save scene/prefab') // 保存场景/预制体
    @description('Save current opened scene/prefab to asset, including scene node structure, component data, asset references etc. Will update .meta file after save.') // 保存当前打开的场景/预制体到资源，包括场景节点结构、组件数据、资源引用等信息。保存后会更新场景的 .meta 文件。
    @result(SchemaSaveResult)
    async save(): Promise<CommonResultType<TSaveResult>> {
        try {
            const data = await Scene.save({});
            return {
                data,
                code: COMMON_STATUS.SUCCESS,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-create')
    @title('Create scene') // 创建场景
    @description('Create new scene asset in project') // 在项目中创建新的场景资源
    @result(SchemaCreateResult)
    async createScene(@param(SchemaCreateOptions) options: TCreateOptions): Promise<CommonResultType<TCreateResult>> {
        try {
            const data = await Scene.create({
                type: 'scene',
                baseName: options.baseName,
                targetDirectory: options.dbURL,
                templateType: options.templateType as TSceneTemplateType,
            });

            return {
                code: COMMON_STATUS.SUCCESS,
                data: data as TCreateResult,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-reload')
    @title('Reload scene/prefab') // 重新加载场景/预制体
    @description('Reload scene/prefab') // 重新加载场景/预制体
    @result(SchemaReload)
    async reloadScene(): Promise<CommonResultType<TReload>> {
        try {
            const data = await Scene.reload({});
            return {
                code: COMMON_STATUS.SUCCESS,
                data: data as TReload,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-get-screenshot')
    @title('Capture scene screenshot') // 截取当前场景画面
    @description(
        'Headlessly render the currently open scene from project files and return the image (base64, for multimodal input) plus scene metadata '
        + '(scene name, file mtime, actual camera params). '
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
                    image: { base64, mimeType },
                    meta: {
                        sceneUrl: shot.sceneUrl,
                        sceneName: shot.sceneName,
                        mtime: shot.mtime,
                        actualCameras: shot.actualCameras,
                        width: outputInfo.width,
                        height: outputInfo.height,
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
