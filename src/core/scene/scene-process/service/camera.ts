import { Canvas, Color, Layers, Node, Vec3 } from 'cc';
import { BaseService } from './core';
import { register, Service } from './core/decorator';
import { CameraController2D } from './camera/camera-controller-2d';
import { CameraController3D } from './camera/camera-controller-3d';
import CameraControllerBase from './camera/camera-controller-base';
import { CameraMoveMode, CameraUtils } from './camera/utils';
import EditorCameraComponent from './camera/editor-camera-component';
import { OperationPriority } from './operation/types';
import { Rpc } from '../rpc';
import type { ICameraEvents, ICameraService } from '../../common';

/**
 * 相机服务，管理编辑器相机的 2D/3D 控制器切换、输入事件绑定和相机属性
 */
@register('Camera')
export class CameraService extends BaseService<ICameraEvents> implements ICameraService {
    private _controller2D!: CameraController2D;
    private _controller3D!: CameraController3D;
    private _controller!: CameraControllerBase;
    private _camera!: EditorCameraComponent;
    private _controllerFirstChange = false;
    private _currentUuid = '';
    private _cameraInfos: Record<string, any> = {};

    get controller2D() { return this._controller2D; }
    get controller3D() { return this._controller3D; }
    get controller() { return this._controller; }
    get camera() { return this._camera; }

    set is2D(value: boolean) {
        if (this._controller) {
            this._controller.active = false;
        }
        this._controller = value ? this._controller2D : this._controller3D;
        this._controller.active = true;
        if (!this._controllerFirstChange && this._currentUuid) {
            this.defaultFocus(this._currentUuid);
            this._controllerFirstChange = true;
        }
        const ttd = Service.Gizmo?.transformToolData;
        if (ttd) {
            ttd.is2D = value;
            ttd.toolName = value ? 'rect' : 'position';
        }
        Service.Engine.repaintInEditMode();
    }

    get is2D() { return this._controller === this._controller2D; }

    init(): void {
        this._controller2D = new CameraController2D();
        this._controller3D = new CameraController3D();
        this._controller = this._controller3D;

        // 实际相机初始化在 onEditorOpened 中场景就绪后进行
        // 绑定操作事件
        this.bindOperation();
    }

    /**
     * 场景就绪时调用，创建编辑器相机并初始化控制器
     */
    onEditorOpened(): void {
        try {
            // 一次性初始化：创建编辑器相机和控制器
            if (!this._camera) {
                const backgroundNode = Service.Gizmo?.backgroundNode || (cc as any).director?.getScene();
                if (!backgroundNode) return;

                const cam = CameraUtils.createCamera(
                    new Color(48, 48, 48, 0), backgroundNode, EditorCameraComponent,
                ) as EditorCameraComponent;
                this._camera = cam;
                this._controller2D.init(cam);
                this._controller3D.init(cam);

                this._controller3D.on('mode', (mode: CameraMoveMode) => {
                    this.emit('camera:mode-change', mode);
                });
                this._controller3D.on('projection-changed', (projection: number) => {
                    this.emit('camera:projection-changed', projection);
                });

                try {
                    const view = (cc as any).view;
                    if (view?.on) {
                        view.on('canvas-resize', () => {
                            const canvas = (cc as any).game?.canvas;
                            if (canvas) {
                                Service.Operation.dispatch('resize', { width: canvas.width, height: canvas.height });
                            }
                        });
                    }
                } catch (e) {
                    // view may not be ready
                }

                this.initFromConfig();
            }

            this.refresh();

            const scene = (cc as any).director?.getScene();
            const uuid = scene?.uuid || '';
            if (this._currentUuid !== uuid) {
                this._currentUuid = uuid;
                this._controllerFirstChange = false;
            }

            this._detachSceneCameras();

            setTimeout(() => {
                try {
                    this._controller.updateGrid();
                    this.defaultFocus(this._currentUuid);
                    Service.Engine.repaintInEditMode();
                } catch (e) {
                    console.warn('[Camera] deferred grid update failed:', e);
                }
            }, 200);
        } catch (e) {
            console.warn('[Camera] onEditorOpened failed:', e);
        }
    }

    async initFromConfig(): Promise<void> {
        try {
            const rpc = Rpc.getInstance();
            const config: any = await rpc.request('sceneConfigInstance', 'get', ['camera']);
            if (config) {
                if (config.color !== undefined) this.setCameraProperty({ clearColor: config.color });
                if (config.fov !== undefined) this.setCameraProperty({ fov: config.fov });
                if (config.far !== undefined) {
                    this._controller3D.far = config.far;
                    this._camera.far = config.far;
                }
                if (config.near !== undefined) {
                    this._controller3D.near = config.near;
                    this._camera.near = config.near;
                }
                if (config.wheelSpeed !== undefined) this._controller3D.wheelSpeed = config.wheelSpeed;
                if (config.wanderSpeed !== undefined) this._controller3D.wanderSpeed = config.wanderSpeed;
                if (config.enableAcceleration !== undefined) this._controller3D.enableAcceleration = config.enableAcceleration;
            }
        } catch {
            // 配置不可用时使用默认值
        }
    }

    private bindOperation(): void {
        const handlers: Record<string, (event: any) => any> = {
            dblclick: (event: any) => this.onMouseDBlDown(event),
            mousedown: (event: any) => this.onMouseDown(event),
            mousemove: (event: any) => this.onMouseMove(event),
            mouseup: (event: any) => this.onMouseUp(event),
            mousewheel: (event: any) => this.onMouseWheel(event),
            keydown: (event: any) => this.onKeyDown(event),
            keyup: (event: any) => this.onKeyUp(event),
            resize: (size: any) => this.onResize(size),
        };

        for (const [eventType, handler] of Object.entries(handlers)) {
            Service.Operation.addListener(eventType as any, handler, OperationPriority.Camera);
        }
    }

    // --- 代理方法 ---
    focus(nodes?: string[] | null, editorCameraInfo?: any, immediate = false): void {
        this._controller?.focus(nodes as any, editorCameraInfo, immediate);
    }

    defaultFocus(uuid: string): void {
        const cameraInfo = this._cameraInfos[uuid];
        if (this._camera?.camera) {
            this._camera.camera.update();
        }
        if (cameraInfo) {
            this.focus(null, cameraInfo, true);
        } else {
            const rootNode = Service.Editor?.getRootNode?.() as any;
            let uuids: string[] | null = rootNode?.uuid ? [rootNode.uuid] : null;
            if (this.is2D && rootNode) {
                const canvas = rootNode.getComponentInChildren?.(Canvas);
                if (canvas && canvas.node) {
                    uuids = [canvas.node.uuid];
                }
            }
            this.focus(uuids, undefined, true);
        }
    }

    rotateCameraToDir(dir: Vec3, rotateByViewDist: boolean): void {
        this._controller?.rotateCameraToDir(dir, rotateByViewDist);
    }

    changeProjection(): void {
        this._controller?.changeProjection();
    }

    setGridVisible(value: boolean): void {
        if (value === undefined || value === null) return;
        this._controller2D.isGridVisible = value;
        this._controller3D.isGridVisible = value;
        const deActiveCtrl = this._controller === this._controller3D
            ? this._controller2D
            : this._controller3D;
        deActiveCtrl.showGrid(false);
        Service.Engine.repaintInEditMode();
    }

    isGridVisible(): boolean {
        return this._controller?.isGridVisible ?? true;
    }

    setCameraProperty(options: any): void {
        if (typeof options !== 'object' || !this._camera) return;
        Object.keys(options).forEach((key) => {
            if (options[key] == null) return;
            if (key === 'clearColor') {
                this._camera[key] = cc.color(
                    options[key][0], options[key][1],
                    options[key][2], options[key][3],
                );
            } else if (key === 'near' || key === 'far') {
                (this._controller as any)[key] = options[key];
                (this._camera as any)[key] = options[key];
            } else if (key === 'fov') {
                this.emit('camera:fov-changed', options[key]);
                (this._camera as any)[key] = options[key];
            } else {
                (this._camera as any)[key] = options[key];
            }
        });
        Service.Engine.repaintInEditMode();
    }

    resetCameraProperty(): void {
        this._controller3D.wanderSpeed = 10;
        this._controller3D.enableAcceleration = true;
        if (this.is2D) {
            this._controller2D.wheelSpeed = 6;
            this.setCameraProperty({ fov: 45, far: 10000, near: 6, clearColor: [48, 48, 48, 255] });
        } else {
            this._controller3D.wheelSpeed = 0.01;
            this.setCameraProperty({ fov: 45, far: 10000, near: 0.01, clearColor: [48, 48, 48, 255] });
        }
        Service.Engine.repaintInEditMode();
    }

    getCameraFov(): number {
        return this._camera?.fov ?? 45;
    }

    zoomUp(): void { this._controller?.zoomUp(); }
    zoomDown(): void { this._controller?.zoomDown(); }
    zoomReset(): void { this._controller?.zoomReset(); }

    alignNodeToSceneView(nodes: string[]): void {
        this._controller?.alignNodeToSceneView(nodes);
    }

    alignSceneViewToNode(nodes: string[]): void {
        this._controller?.alignSceneViewToNode(nodes);
    }

    onUpdate(deltaTime: number): void {
        this._controller?.onUpdate(deltaTime);
    }

    // --- 输入事件代理 ---
    private onMouseDBlDown(event: any) { return this._controller?.onMouseDBlDown(event); }
    private onMouseDown(event: any) { return this._controller?.onMouseDown(event); }
    private onMouseMove(event: any) { return this._controller?.onMouseMove(event); }
    private onMouseUp(event: any) { return this._controller?.onMouseUp(event); }
    private onMouseWheel(event: any) { return this._controller?.onMouseWheel(event); }
    private onKeyDown(event: any) { return this._controller?.onKeyDown(event); }
    private onKeyUp(event: any) { return this._controller?.onKeyUp(event); }

    // --- 其他方法 ---
    onResize(size: any): void {
        this._controller?.onResize(size);
    }

    refresh(): void {
        this._controller?.refresh();
    }

    getCamera() {
        return this._camera;
    }

    /**
     * 与原始编辑器 ScenePreview.detachSceneCameras 一致：
     * 将所有非编辑器的场景相机从渲染管线中移除，并设置 tempWindow
     * 使后续新建的相机默认渲染到离屏窗口，不干扰编辑器相机。
     */
    private _detachSceneCameras(): void {
        try {
            const root = (cc as any).director?.root;
            const scene = (cc as any).director?.getScene();
            if (!root || !scene) return;

            const editorMask = Layers.makeMaskInclude([
                Layers.Enum.GIZMOS,
                Layers.Enum.SCENE_GIZMO,
                Layers.Enum.EDITOR,
            ]);

            const renderScene = scene.renderScene || scene._renderScene;
            if (renderScene) {
                const cameras = [...renderScene.cameras];
                for (const cam of cameras) {
                    if (!cam || !cam.node) continue;
                    if (cam.node.layer & editorMask) continue;
                    const comp = cam.node.getComponent?.('cc.Camera');
                    if (comp) {
                        cam.detachCamera();
                    }
                }
            }

            // 设置 tempWindow，与原始编辑器一致：
            // 后续新建的相机 (_inEditorMode=false) 会默认渲染到 tempWindow 而非 mainWindow
            if (root.createWindow && root.mainWindow && !root.tempWindow) {
                try {
                    const mainSwapchain = root.mainWindow.swapchain;
                    if (mainSwapchain) {
                        const win = root.createWindow({
                            title: 'CLI Temp',
                            width: 1,
                            height: 1,
                            swapchain: mainSwapchain,
                        });
                        if (win) root.tempWindow = win;
                    }
                } catch {
                    // tempWindow 创建失败不影响核心功能
                }
            }
        } catch (e) {
            console.warn('[Camera] _detachSceneCameras failed:', e);
        }
    }

    /**
     * 新增的 Camera 组件也需要 detach，与原始编辑器 ScenePreview.onComponentAdded 一致
     */
    detachNewSceneCamera(comp: any): void {
        if (!comp || !comp.camera) return;
        const editorMask = Layers.makeMaskInclude([
            Layers.Enum.GIZMOS,
            Layers.Enum.SCENE_GIZMO,
            Layers.Enum.EDITOR,
        ]);
        if (comp.node?.layer & editorMask) return;
        if (comp === this._camera) return;
        Promise.resolve().then(() => {
            if (comp.camera) {
                comp.camera.detachCamera();
            }
        });
    }

    onComponentAdded(comp: any): void {
        this.detachNewSceneCamera(comp);
    }
}
