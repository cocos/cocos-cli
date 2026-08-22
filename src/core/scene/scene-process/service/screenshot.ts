import { Camera, Canvas, Color, Layers, Node as CCNode, Quat, Rect, UITransform, Vec3, renderer } from 'cc';
import { PNG } from 'pngjs';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BaseService, register, Service } from './core';
import { Rpc } from '../rpc';
import { ScreenshotBuffer } from './screenshot/screenshot-buffer';
import type {
    IScreenshotCameraInfo,
    IScreenshotEvents,
    IScreenshotNodeSummary,
    IScreenshotOptions,
    IScreenshotResult,
    IScreenshotService,
} from '../../common';

const DEFAULT_SIZE = 1024;
const MAX_SIZE = 4096;
const NODE_SUMMARY_MAX_DEPTH = 4;
const NODE_SUMMARY_MAX_CHILDREN = 40;

/** 临时截图相机在场景树里的节点名，销毁后不残留 */
const TEMP_CAMERA_NODE_NAME = '__cli_screenshot_camera__';

/** 从任意相机组件抽取出的、创建临时相机所需的取景参数（JSON 无关，含引擎对象） */
interface ICameraParams {
    position: Vec3;
    rotation: Quat;
    /** Camera.ProjectionType 数值 */
    projection: number;
    priority: number;
    fov: number;
    fovAxis: number;
    orthoHeight: number;
    near: number;
    far: number;
    clearFlags: number;
    clearColor?: Color;
    clearDepth: number;
    clearStencil: number;
    visibility: number;
    rect: Rect;
    aperture?: number;
    shutter?: number;
    iso?: number;
    screenScale?: number;
    usePostProcess?: boolean;
    postProcess?: any;
}

interface IResolvedFraming {
    info: IScreenshotCameraInfo;
    source: 'scene' | 'editor';
    renderNote?: string;
    params: ICameraParams;
    /** 原始场景相机，仅用于判断它是否由 Canvas 自动适配。 */
    sourceCamera?: Camera;
    /** Prefab 自动取景时直接记录 Canvas，避免依赖场景相机。 */
    canvas?: Canvas;
}

/**
 * 场景截图服务。
 *
 * 以 headless 离屏方式渲染当前打开的场景一帧，读回像素编码为 PNG 写入临时文件，
 * 连同实际相机参数、节点树概要、场景 mtime 一并返回。
 *
 * 取景策略（PRD 4.2 / 已决策「自动 + 基础入参」）：
 *   指定相机 > 场景内所有屏幕相机（按 priority 合成）> 编辑器相机当前视角兜底。
 *
 * 关键实现（修复渲染崩溃）：
 *   绝不改动运行中的编辑器相机 / 场景相机的 targetWindow 或 enabled 状态——那会在下一帧
 *   编辑态 tick（ForwardPipeline.getRenderPass）里读到 null 帧缓冲而崩溃
 *   （见 InteractivePreview.initSceneCamera 的注释）。这里改为创建完全自持的临时相机栈，
 *   把源相机的取景和合成参数拷贝过来渲染，渲染后立即禁用、移出 renderScene 并销毁其节点，
 *   因此不会污染编辑态。
 *
 * 为什么不直接把裸像素跨进程回传：RPC 走 JSON 序列化，Uint8Array 会被展开成巨型
 * `{"0":..}` 对象。因此在场景进程内就编码 PNG 落临时文件，只回传路径，由 API 层用
 * sharp 缩放压缩转 base64。
 */
@register('Screenshot')
export class ScreenshotService extends BaseService<IScreenshotEvents> implements IScreenshotService {
    private _buffer: ScreenshotBuffer | null = null;
    private _seq = 0;

    private get buffer(): ScreenshotBuffer {
        if (!this._buffer) {
            this._buffer = new ScreenshotBuffer('cli-screenshot');
        }
        return this._buffer;
    }

    async capture(options: IScreenshotOptions = {}): Promise<IScreenshotResult> {
        // 截图进程可能长期驻留，工程设计分辨率变更后 cc.view 仍可能保留旧值。
        // 在重新打开场景前主动同步，让 Canvas/Widget 在实例化时就按最新设计分辨率布局。
        await (Service.Engine as any)?.syncDesignResolution?.();

        // Keep prepare/render/restore in one serialized editor lifecycle scope.
        // Explicit target captures restore the previous clean scene afterwards;
        // a switch that would discard unsaved edits is rejected.
        return Service.Editor.withScreenshotScene(
            options.sceneUrlOrUUID,
            () => this._capturePreparedScene(options),
        );
    }

    private async _capturePreparedScene(options: IScreenshotOptions): Promise<IScreenshotResult> {
        const scene = (cc as any).director?.getScene?.() as CCNode | null;
        if (!scene) {
            throw new Error('当前没有打开的场景，请先调用 scene-open 打开场景后再截图。');
        }

        if (!options.camera && this._findSceneCameras().length === 0) {
            this._focusEditorCameraForCapture(options);
        }

        const { width, height } = this._resolveCaptureSize(options, scene);
        // 解析取景后，按最终离屏目标修正每台自动适配的 Canvas 相机。
        const framings = this._resolveFramings(options);
        framings.forEach(framing => this._fitAlignedCanvasFraming(framing, width, height));

        // 每个源相机对应一台完全自持的临时相机；所有临时相机共享同一个离屏窗口，
        // 由 RenderWindow 按 priority 从小到大完成一帧合成。
        const temporaryCameras: Array<{ node: CCNode; comp: Camera; cam: any }> = [];

        let result: { width: number; height: number; buffer: Uint8Array };
        try {
            for (let index = 0; index < framings.length; index++) {
                temporaryCameras.push(this._createTemporaryCamera(scene, framings[index], index));
            }

            const renderScene = (scene as any).renderScene ?? (scene as any)._renderScene;
            result = await this.buffer.render(renderScene, temporaryCameras, width, height);
        } finally {
            for (const { node, comp } of temporaryCameras.reverse()) {
                this._teardownCamera(node, comp);
            }
            // 恢复编辑器正常渲染
            try {
                const engine = Service.Engine as any;
                if (typeof engine.forceRepaintInEditMode === 'function') {
                    engine.forceRepaintInEditMode();
                } else {
                    void engine.repaintInEditMode();
                }
            } catch {
                // engine 未就绪时忽略
            }
        }

        const filePath = this._writePng(result.width, result.height, result.buffer);
        const meta = await this._collectSceneMeta();
        const cameraInfos = framings.map(framing => framing.info);
        const renderNotes = [...new Set(framings.map(framing => framing.renderNote).filter(Boolean))];

        return {
            filePath,
            width: result.width,
            height: result.height,
            sceneUrl: meta.url,
            sceneName: meta.name,
            mtime: meta.mtime,
            // Keep the historical singular field as the top-most/only camera.
            actualCamera: cameraInfos[cameraInfos.length - 1],
            actualCameras: cameraInfos,
            nodeSummary: this._summarizeNode(scene, 0),
            renderNote: renderNotes.length ? renderNotes.join(' ') : undefined,
        };
    }

    private _createTemporaryCamera(
        scene: CCNode,
        framing: IResolvedFraming,
        index: number,
    ): { node: CCNode; comp: Camera; cam: any } {
        const { params } = framing;
        const node = new CCNode(`${TEMP_CAMERA_NODE_NAME}_${index}`);
        let comp: Camera | null = null;
        try {
            // Must be on the EDITOR layer before addComponent(Camera), otherwise
            // CameraService asynchronously detaches it as a normal game camera.
            node.layer = Layers.Enum.EDITOR;
            node.setParent(scene as any);
            node.setWorldPosition(params.position);
            node.setWorldRotation(params.rotation);

            comp = node.addComponent(Camera);
            comp.enabled = false;
            comp.priority = params.priority;
            comp.projection = params.projection;
            comp.fov = params.fov;
            comp.fovAxis = params.fovAxis;
            comp.orthoHeight = params.orthoHeight;
            comp.near = params.near;
            comp.far = params.far;
            comp.clearFlags = params.clearFlags;
            comp.clearDepth = params.clearDepth;
            comp.clearStencil = params.clearStencil;
            comp.visibility = params.visibility;
            comp.rect = params.rect;
            if (params.clearColor) comp.clearColor = params.clearColor;
            if (params.aperture != null) comp.aperture = params.aperture;
            if (params.shutter != null) comp.shutter = params.shutter;
            if (params.iso != null) comp.iso = params.iso;
            if (params.screenScale != null) comp.screenScale = params.screenScale;
            if (params.postProcess != null) comp.postProcess = params.postProcess;
            if (params.usePostProcess != null) comp.usePostProcess = params.usePostProcess;

            let cam = (comp as any).camera;
            if (!cam) {
                (comp as any)._createCamera?.();
                cam = (comp as any).camera;
            }
            if (!cam) {
                throw new Error(`创建临时截图相机失败：${framing.info.nodeName ?? index}`);
            }
            cam.isWindowSize = false;
            cam.enabled = false;
            // Edit mode only renders EDITOR-purpose cameras into its pipeline.
            cam.cameraUsage = renderer.scene.CameraUsage.EDITOR;
            (node as any).updateWorldTransform?.();
            cam.update(true);
            return { node, comp, cam };
        } catch (error) {
            // The caller can only track a camera after this method returns. Clean
            // up locally when construction or parameter assignment fails midway.
            this._teardownCamera(node, comp);
            throw error;
        }
    }

    // ---- 取景 ----

    private _resolveFramings(options: IScreenshotOptions): IResolvedFraming[] {
        // 1) 指定相机
        if (options.camera) {
            const cam = this._findCameraByRef(options.camera);
            if (!cam) {
                throw new Error(`未找到指定相机：${options.camera}`);
            }
            const params = this._paramsFromComponent(cam);
            return [{
                info: this._cameraInfoFromParams(params, 'scene', cam.node.name),
                source: 'scene',
                params,
                sourceCamera: cam,
            }];
        }

        // 2) 场景内所有输出到屏幕的启用相机，保持原 priority 合成顺序。
        const sceneCameras = this._findSceneCameras();
        if (sceneCameras.length) {
            return sceneCameras.map((camera) => {
                const params = this._paramsFromComponent(camera);
                return {
                    info: this._cameraInfoFromParams(params, 'scene', camera.node.name),
                    source: 'scene',
                    params,
                    sourceCamera: camera,
                };
            });
        }

        // UI Prefab 在 headless 场景进程中没有浏览器视口尺寸，编辑器 2D
        // 相机可能尚未得到有效的 orthoHeight。直接按其预览 Canvas 的世界
        // 边界构造取景参数，避免只渲染出清屏颜色。
        const prefab2D = this._resolvePrefab2DFraming(options);
        if (prefab2D) {
            return [prefab2D];
        }

        // 3) 编辑器相机当前视角兜底（不做 frame-all，避免移动用户的编辑器视角）
        const editorCam = (Service.Camera as any)?.getCamera?.();
        if (!editorCam || !editorCam.node) {
            throw new Error('场景内没有可用相机，且编辑器相机不可用，无法截图。');
        }
        const params = this._paramsFromComponent(editorCam);
        // 编辑器相机通常没有面向游戏内容的 clearColor / visibility，这里给出安全默认：
        // 纯色背景 + 排除性能面板与 Gizmo 图层，尽量呈现场景内容本身。
        params.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        params.clearColor = new Color(51, 51, 51, 255);
        params.visibility = Layers.makeMaskExclude([
            Layers.BitMask.PROFILER,
            Layers.Enum.GIZMOS,
            Layers.Enum.SCENE_GIZMO,
        ]);
        return [{
            info: this._cameraInfoFromParams(params, 'editor', editorCam.node.name),
            source: 'editor',
            params,
            renderNote: '场景内无相机，已使用编辑器相机当前视角取景（不含 Gizmo/网格）。',
        }];
    }

    private get _editorMask(): number {
        return Layers.makeMaskInclude([
            Layers.Enum.GIZMOS,
            Layers.Enum.SCENE_GIZMO,
            Layers.Enum.EDITOR,
        ]);
    }

    private _findSceneCameras(): Camera[] {
        const root = Service.Editor?.getRootNode?.() as CCNode | null;
        if (!root) return [];
        const editorCamera = (Service.Camera as any)?.getCamera?.();
        const cams: Camera[] = (root as any).getComponentsInChildren?.(Camera) ?? [];
        const candidates = cams.filter((cam) => {
            if (!cam || cam === editorCamera) return false;
            if (!cam.enabledInHierarchy) return false;
            if (cam.targetTexture) return false;
            if (cam.node && (cam.node.layer & this._editorMask)) return false;
            return true;
        });
        // RenderWindow uses ascending priority: lower cameras establish the
        // background and higher cameras compose overlays such as UI afterwards.
        candidates.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
        return candidates;
    }

    private _findCameraByRef(ref: string): Camera | null {
        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        let node: CCNode | null = null;
        // 先按路径，再按 uuid
        node = EditorExtends?.Node?.getNodeByPath?.(ref) ?? EditorExtends?.Node?.getNode?.(ref) ?? null;
        if (!node) return null;
        return node.getComponent(Camera) ?? node.getComponentInChildren(Camera) ?? null;
    }

    private _resolvePrefab2DFraming(options: IScreenshotOptions): {
        info: IScreenshotCameraInfo;
        source: 'editor';
        renderNote: string;
        params: ICameraParams;
        canvas: Canvas;
    } | null {
        if (options.viewMode === '3d') {
            return null;
        }

        const editor = Service.Editor as any;
        if (editor?.getCurrentEditorType?.() !== 'prefab') {
            return null;
        }
        const root = editor.getRootNode?.() as CCNode | null;
        if (!root) {
            return null;
        }

        let canvas = root.getComponentInChildren?.(Canvas) as Canvas | null;
        let ancestor: CCNode | null = root;
        while (!canvas && ancestor) {
            canvas = ancestor.getComponent?.(Canvas) as Canvas | null;
            ancestor = ancestor.parent;
        }
        if (!canvas?.node) {
            return null;
        }

        const transform = canvas.node.getComponent(UITransform);
        if (!transform) {
            return null;
        }
        const bounds = transform.getBoundingBoxToWorld?.();
        const width = this._finitePositive(bounds?.width, transform.width);
        const height = this._finitePositive(bounds?.height, transform.height);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            return null;
        }

        const canvasPosition = canvas.node.getWorldPosition?.() ?? Vec3.ZERO;
        const centerX = this._finiteNumber(bounds?.x, canvasPosition.x - width / 2) + width / 2;
        const centerY = this._finiteNumber(bounds?.y, canvasPosition.y - height / 2) + height / 2;
        const params: ICameraParams = {
            position: new Vec3(centerX, centerY, this._finiteNumber(canvasPosition.z, 0) + 1000),
            rotation: new Quat(0, 0, 0, 1),
            projection: Camera.ProjectionType?.ORTHO ?? 0,
            priority: 0,
            fov: 45,
            fovAxis: Camera.FOVAxis?.VERTICAL ?? 0,
            orthoHeight: height / 2,
            near: 0.01,
            far: 10000,
            clearFlags: Camera.ClearFlag.SOLID_COLOR,
            clearColor: new Color(51, 51, 51, 255),
            clearDepth: 1,
            clearStencil: 0,
            visibility: Layers.makeMaskExclude([
                Layers.BitMask.PROFILER,
                Layers.Enum.GIZMOS,
                Layers.Enum.SCENE_GIZMO,
            ]),
            rect: new Rect(0, 0, 1, 1),
        };
        return {
            info: this._cameraInfoFromParams(params, 'editor', 'Prefab 2D Camera'),
            source: 'editor',
            params,
            canvas,
            renderNote: 'UI Prefab 已按预览 Canvas 边界自动取景（不含 Gizmo/网格）。',
        };
    }

    /**
     * Canvas 的 alignCanvasWithScreen 会按当前预览窗口更新源相机 orthoHeight。
     * 截图改用设计分辨率离屏窗口后，不能继续复制该预览值，否则会把 960×640
     * 预览下的 SHOW_ALL 可视范围带到 1280×720 截图中并产生黑边。
     */
    private _fitAlignedCanvasFraming(framing: IResolvedFraming, targetWidth: number, targetHeight: number): void {
        const canvas = framing.canvas
            ?? (framing.sourceCamera ? this._findAlignedCanvasForCamera(framing.sourceCamera) : null);
        const orthoEnum = Camera.ProjectionType?.ORTHO ?? 0;
        if (!canvas?.node || !canvas.alignCanvasWithScreen || framing.params.projection !== orthoEnum) {
            return;
        }

        const designSize = (cc as any).view?.getDesignResolutionSize?.();
        const designWidth = this._finitePositive(designSize?.width, 0);
        const designHeight = this._finitePositive(designSize?.height, 0);
        const targetAspect = targetWidth / targetHeight;
        if (designWidth <= 0 || designHeight <= 0 || !Number.isFinite(targetAspect) || targetAspect <= 0) {
            return;
        }

        // 场景进程使用 SHOW_ALL：目标较窄时扩大纵向范围，目标相同或更宽时保持设计高度。
        const visibleHeight = Math.max(designHeight, designWidth / targetAspect);
        const canvasPosition = canvas.node.getWorldPosition?.() ?? Vec3.ZERO;
        framing.params.position = new Vec3(
            this._finiteNumber(canvasPosition.x, 0),
            this._finiteNumber(canvasPosition.y, 0),
            this._finiteNumber(canvasPosition.z, 0) + 1000,
        );
        framing.params.orthoHeight = visibleHeight / 2;
        framing.info = this._cameraInfoFromParams(
            framing.params,
            framing.source,
            framing.info.nodeName,
        );

        const note = 'Canvas 相机已按工程设计分辨率重新取景。';
        framing.renderNote = framing.renderNote ? `${framing.renderNote} ${note}` : note;
    }

    private _findAlignedCanvasForCamera(camera: Camera): Canvas | null {
        const root = Service.Editor?.getRootNode?.() as CCNode | null;
        if (!root) return null;
        const canvases: Canvas[] = (root as any).getComponentsInChildren?.(Canvas) ?? [];
        return canvases.find((canvas) => (
            Boolean(canvas?.enabledInHierarchy)
            && canvas.alignCanvasWithScreen
            && canvas.cameraComponent === camera
        )) ?? null;
    }

    /**
     * A freshly opened prefab restores its editor camera asynchronously. Capture
     * happens in the same RPC turn, so synchronously frame the prefab first and
     * copy that stable view into the temporary screenshot camera.
     */
    private _focusEditorCameraForCapture(options: IScreenshotOptions): void {
        try {
            const editor = Service.Editor as any;
            const camera = Service.Camera as any;
            const root = editor?.getRootNode?.() as CCNode | null;
            if (!root || !camera?.getCamera?.()) {
                return;
            }

            const has2DContent = Boolean(root.getComponentInChildren?.(Canvas))
                || ((root.getComponentsInChildren?.(UITransform) ?? []).length > 0);
            const use2D = options.viewMode === '2d'
                || (options.viewMode !== '3d' && has2DContent);
            camera.is2D = use2D;

            const uuid = editor.getCurrentEditorUuid?.();
            if (uuid && typeof camera.defaultFocus === 'function') {
                camera.defaultFocus(uuid);
            } else if (root.uuid && typeof camera.focus === 'function') {
                camera.focus([root.uuid], undefined, true);
            }
        } catch (error) {
            console.warn('[Screenshot] Failed to focus editor camera before capture.', error);
        }
    }

    // ---- 相机参数抽取 ----

    /** 从任意相机组件（场景相机 / 编辑器相机）抽取创建临时相机所需参数 */
    private _paramsFromComponent(comp: any): ICameraParams {
        const node = comp.node as CCNode;
        const position = node.getWorldPosition();
        const rotation = node.getWorldRotation();
        const orthoEnum = Camera.ProjectionType?.ORTHO ?? 0;
        const perspEnum = Camera.ProjectionType?.PERSPECTIVE ?? 1;
        const isOrtho = (comp.projection as number) === orthoEnum;
        return {
            position,
            rotation,
            projection: isOrtho ? orthoEnum : perspEnum,
            priority: typeof comp.priority === 'number' ? comp.priority : 0,
            fov: typeof comp.fov === 'number' ? comp.fov : 45,
            fovAxis: typeof comp.fovAxis === 'number' ? comp.fovAxis : (Camera.FOVAxis?.VERTICAL ?? 0),
            orthoHeight: typeof comp.orthoHeight === 'number' ? comp.orthoHeight : 10,
            near: typeof comp.near === 'number' ? comp.near : 0.01,
            far: typeof comp.far === 'number' ? comp.far : 10000,
            clearFlags: typeof comp.clearFlags === 'number' ? comp.clearFlags : Camera.ClearFlag.SOLID_COLOR,
            clearColor: comp.clearColor?.clone ? comp.clearColor.clone() : undefined,
            clearDepth: typeof comp.clearDepth === 'number' ? comp.clearDepth : 1,
            clearStencil: typeof comp.clearStencil === 'number' ? comp.clearStencil : 0,
            visibility: typeof comp.visibility === 'number' ? comp.visibility : 0xffffffff,
            rect: comp.rect?.clone ? comp.rect.clone() : new Rect(
                this._finiteNumber(comp.rect?.x, 0),
                this._finiteNumber(comp.rect?.y, 0),
                this._finitePositive(comp.rect?.width, 1),
                this._finitePositive(comp.rect?.height, 1),
            ),
            aperture: typeof comp.aperture === 'number' ? comp.aperture : undefined,
            shutter: typeof comp.shutter === 'number' ? comp.shutter : undefined,
            iso: typeof comp.iso === 'number' ? comp.iso : undefined,
            screenScale: typeof comp.screenScale === 'number' ? comp.screenScale : undefined,
            usePostProcess: typeof comp.usePostProcess === 'boolean' ? comp.usePostProcess : undefined,
            postProcess: comp.postProcess,
        };
    }

    private _cameraInfoFromParams(
        params: ICameraParams,
        source: 'scene' | 'editor',
        nodeName?: string,
    ): IScreenshotCameraInfo {
        const isOrtho = params.projection === (Camera.ProjectionType?.ORTHO ?? 0);
        return {
            source,
            nodeName,
            projection: isOrtho ? 'ortho' : 'perspective',
            position: {
                x: this._finiteNumber(params.position.x, 0),
                y: this._finiteNumber(params.position.y, 0),
                z: this._finiteNumber(params.position.z, 0),
            },
            rotation: {
                x: this._finiteNumber(params.rotation.x, 0),
                y: this._finiteNumber(params.rotation.y, 0),
                z: this._finiteNumber(params.rotation.z, 0),
                w: this._finiteNumber(params.rotation.w, 1),
            },
            fov: isOrtho ? undefined : this._finitePositive(params.fov, 45),
            orthoHeight: isOrtho ? this._finitePositive(params.orthoHeight, 10) : undefined,
            priority: this._finiteNumber(params.priority, 0),
            clearFlags: this._finiteNumber(params.clearFlags, Camera.ClearFlag.SOLID_COLOR),
            visibility: this._finiteNumber(params.visibility, 0xffffffff),
            viewport: {
                x: this._finiteNumber(params.rect.x, 0),
                y: this._finiteNumber(params.rect.y, 0),
                width: this._finitePositive(params.rect.width, 1),
                height: this._finitePositive(params.rect.height, 1),
            },
        };
    }

    // ---- 临时相机销毁 ----

    /** 禁用 + 移出 renderScene + 销毁节点，保证下一帧编辑态 tick 不再渲染它 */
    private _teardownCamera(node: CCNode, comp: any) {
        try {
            const cam = comp?.camera;
            if (cam) {
                cam.enabled = false;
                if (cam.scene?.removeCamera) {
                    cam.scene.removeCamera(cam);
                } else {
                    cam.detachCamera?.();
                }
            }
        } catch (e) {
            console.warn('[Screenshot] detach temp camera from render scene failed:', e);
        }
        try {
            if (comp) comp.enabled = false;
        } catch (e) {
            console.warn('[Screenshot] disable temp camera component failed:', e);
        }
        try {
            // Node.destroy() is deferred. Detach immediately so metadata collected
            // in the same turn cannot include the temporary screenshot camera.
            node.setParent(null);
        } catch (e) {
            console.warn('[Screenshot] detach temp camera node failed:', e);
        }
        try {
            node.destroy();
        } catch (e) {
            console.warn('[Screenshot] destroy temp camera node failed:', e);
        }
    }

    // ---- PNG 编码 ----

    /**
     * 默认使用工程设计分辨率，让离屏目标不受当前编辑器预览视口尺寸影响。
     * 只指定一条边时按设计分辨率比例推导另一条边；两条边都指定时保持调用方的精确尺寸。
     */
    private _resolveCaptureSize(options: IScreenshotOptions, scene: CCNode): { width: number; height: number } {
        const canvasSize = this._getSceneCanvasSize(scene);
        const requestedWidth = this._validSize(options.width);
        const requestedHeight = this._validSize(options.height);

        if (requestedWidth != null && requestedHeight != null) {
            return {
                width: this._clampSize(requestedWidth, canvasSize.width),
                height: this._clampSize(requestedHeight, canvasSize.height),
            };
        }

        const aspect = canvasSize.width / canvasSize.height;
        let width = requestedWidth ?? (requestedHeight != null ? requestedHeight * aspect : canvasSize.width);
        let height = requestedHeight ?? (requestedWidth != null ? requestedWidth / aspect : canvasSize.height);
        const scale = Math.min(1, MAX_SIZE / width, MAX_SIZE / height);
        width *= scale;
        height *= scale;
        return {
            width: Math.max(1, Math.floor(width)),
            height: Math.max(1, Math.floor(height)),
        };
    }

    private _getSceneCanvasSize(scene: CCNode): { width: number; height: number } {
        // 场景进程启动及配置同步时会把工程设计分辨率写入 cc.view。
        // 这里优先使用它，避免 alignCanvasWithScreen / Widget 将 Canvas 的运行时尺寸
        // 改成当前预览视口大小，从而让截图尺寸随 PinK 窗口变化。
        const designSize = (cc as any).view?.getDesignResolutionSize?.();
        if (designSize?.width > 0 && designSize?.height > 0) {
            return { width: designSize.width, height: designSize.height };
        }

        const root = (Service.Editor?.getRootNode?.() as CCNode | null) ?? scene;
        const canvases: Canvas[] = (root as any).getComponentsInChildren?.(Canvas) ?? [];
        const canvas = canvases.find(item => item.enabledInHierarchy) ?? canvases[0];
        const transform = canvas?.node?.getComponent(UITransform);
        if (transform && transform.width > 0 && transform.height > 0) {
            return { width: transform.width, height: transform.height };
        }

        // ScenePreview 的缓冲区尺寸来自编辑器画布最近一次 query-preview-data，
        // 仅在设计分辨率和场景 Canvas 均不可用时作为兼容兜底。
        const previewBuffer = (Service.Preview as any)?.scenePreview?.previewBuffer;
        if (previewBuffer?.width > 0 && previewBuffer?.height > 0) {
            return { width: previewBuffer.width, height: previewBuffer.height };
        }

        const gameCanvas = (cc as any).game?.canvas;
        if (gameCanvas?.width > 0 && gameCanvas?.height > 0) {
            return { width: gameCanvas.width, height: gameCanvas.height };
        }

        return { width: DEFAULT_SIZE, height: DEFAULT_SIZE };
    }

    private _writePng(width: number, height: number, rgba: Uint8Array): string {
        const png = new PNG({ width, height });
        png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
        const buffer = PNG.sync.write(png);
        const file = join(tmpdir(), `cocos-cli-screenshot-${Date.now()}-${this._seq++}.png`);
        writeFileSync(file, buffer);
        return file;
    }

    // ---- 场景元数据 ----

    private async _collectSceneMeta(): Promise<{ url?: string; name?: string; mtime?: number }> {
        try {
            const uuid = (Service.Editor as any)?.getCurrentEditorUuid?.();
            if (!uuid) return {};
            const info = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [uuid]);
            if (!info) return {};
            let mtime: number | undefined;
            if (info.file) {
                try {
                    // 动态引入 fs，读取磁盘文件 mtime（PRD 4.3 / 风险 8）
                    const { statSync } = await import('fs');
                    mtime = statSync(info.file).mtimeMs;
                } catch {
                    // 文件不存在（如未保存的新场景）时无 mtime
                }
            }
            return { url: info.url, name: info.name, mtime };
        } catch {
            return {};
        }
    }

    private _summarizeNode(node: CCNode, depth: number): IScreenshotNodeSummary {
        const components = (node.components ?? [])
            .map((c) => cc.js.getClassName(c))
            .filter(Boolean);
        const summary: IScreenshotNodeSummary = {
            name: node.name,
            active: node.active,
            components,
        };
        if (depth < NODE_SUMMARY_MAX_DEPTH && node.children?.length) {
            const kids = node.children.slice(0, NODE_SUMMARY_MAX_CHILDREN);
            summary.children = kids.map((child) => this._summarizeNode(child, depth + 1));
            if (node.children.length > NODE_SUMMARY_MAX_CHILDREN) {
                summary.children.push({
                    name: `…(+${node.children.length - NODE_SUMMARY_MAX_CHILDREN} more)`,
                    active: true,
                    components: [],
                });
            }
        }
        return summary;
    }

    private _clampSize(value: number | undefined, fallback: number): number {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
            return Math.min(MAX_SIZE, Math.max(1, Math.floor(fallback)));
        }
        return Math.min(MAX_SIZE, Math.max(1, Math.floor(value)));
    }

    private _validSize(value: number | undefined): number | null {
        return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
    }

    private _finiteNumber(value: unknown, fallback: number): number {
        return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    }

    private _finitePositive(value: unknown, fallback: number): number {
        const finite = this._finiteNumber(value, fallback);
        return finite > 0 ? finite : fallback;
    }
}
