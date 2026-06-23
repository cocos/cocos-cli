'use strict';

import { Camera, Color, Component, gfx, js, Layers, Node, Rect, Vec3, director } from 'cc';
import { BaseService } from './core';
import { register, Service } from './core/decorator';
import { ServiceEvents } from './core/global-events';
import { TransformToolData, ISnapConfigData } from './gizmo/transform-tool';
import GizmoDefines from './gizmo/gizmo-defines';
import GizmoBase from './gizmo/base/gizmo-base';
import GizmoOperation from './gizmo/gizmo-operation';
import { create3DNode } from './gizmo/utils/engine-utils';
import { rectTransformSnapping } from './gizmo/utils/rect-transform-snapping';
import WorldAxisController from './gizmo/controller/world-axis';
import { NodeEventType } from '../../common';
import { Rpc } from '../rpc';
import type { IGizmoEvents, IGizmoService, IChangeNodeOptions, IRectSnapConfigData } from '../../common';
import type { IOriginAxesConfig } from '../../scene-configs';

// Import component gizmo modules so they self-register via registerGizmo()
import './gizmo/components/camera';
import './gizmo/components/box-collider';
import './gizmo/components/directional-light';
import './gizmo/components/canvas';
import './gizmo/components/ui-transform';
import './gizmo/components/sphere-light';
import './gizmo/components/spot-light';
import './gizmo/components/sphere-collider';
import './gizmo/components/capsule-collider';
import './gizmo/components/cone-collider';
import './gizmo/components/cylinder-collider';
import './gizmo/components/plane-collider';
import './gizmo/components/simplex-collider';
import './gizmo/components/mesh-collider';
import './gizmo/components/box-collider-2d';
import './gizmo/components/circle-collider-2d';
import './gizmo/components/polygon-collider-2d';
import './gizmo/components/mesh-renderer';
import './gizmo/components/skinned-mesh-renderer';
import './gizmo/components/video-player';
import './gizmo/components/web-view';

type TGizmoType = 'icon' | 'persistent' | 'component';

// 与 cocos-editor GizmoConfig 一致：Gizmo 全局显示配置
class GizmoConfig {
    static toolsVisibility3d = true;
    static isIconGizmo3D = false;
    static iconGizmoSize = 2;
    static gridColor: number[] = [166, 166, 166, 255];
    static originAxis2D: IOriginAxesConfig = { x: true, y: true, z: false };
    static originAxis3D: IOriginAxesConfig = { x: true, y: false, z: true };
}

// WeakMaps to associate components with their gizmo instances
const _componentGizmoMap = new WeakMap<Component, GizmoBase | null>();
const _iconGizmoMap = new WeakMap<Component, GizmoBase | null>();
const _persistentGizmoMap = new WeakMap<Component, GizmoBase | null>();

function getGizmoMap(type: TGizmoType): WeakMap<Component, GizmoBase | null> {
    switch (type) {
        case 'component': return _componentGizmoMap;
        case 'icon': return _iconGizmoMap;
        case 'persistent': return _persistentGizmoMap;
    }
}

function getGizmoProperty(type: TGizmoType, comp: Component): GizmoBase | null | undefined {
    return getGizmoMap(type).get(comp);
}

// 与 cocos-editor data.ts setGizmoProperty 一致：替换时清除旧 gizmo 的 target
function setGizmoProperty(type: TGizmoType, comp: Component, gizmo: GizmoBase | null) {
    const oldGizmo = getGizmoMap(type).get(comp);
    if (oldGizmo) {
        oldGizmo.target = null;
    }
    getGizmoMap(type).set(comp, gizmo);
    if (gizmo) {
        gizmo.target = comp;
    }
}

function getGizmoDefMap(type: TGizmoType): Map<string, any> {
    switch (type) {
        case 'component': return GizmoDefines.components;
        case 'icon': return GizmoDefines.iconGizmo;
        case 'persistent': return GizmoDefines.persistentGizmo;
    }
}

// Hack component for transform gizmo — needs a real class so
// js.getClassName returns '_EditorHackTransformComponent_' to match GizmoDefines
class HackTransformComponent {
    node: Node;
    get enabledInHierarchy() { return true; }
    constructor(node: Node) { this.node = node; }
}
(HackTransformComponent.prototype as any).__classname__ = '_EditorHackTransformComponent_';

const _transformCompMap = new WeakMap<Node, Component>();

function getTransformHackComp(node: Node): Component {
    let comp: Component | undefined = _transformCompMap.get(node);
    if (!comp) {
        comp = new HackTransformComponent(node) as any as Component;
        _transformCompMap.set(node, comp);
    }
    return comp;
}

function isEditorNode(node: Node): boolean {
    if (node.layer & Layers.Enum.GIZMOS) return true;
    if (node.layer & Layers.Enum.SCENE_GIZMO) return true;
    if (node.layer & Layers.Enum.EDITOR) return true;
    return false;
}

function walkNodeComponent(node: Node, callback: (comp: Component) => void): void {
    if (!node || isEditorNode(node)) return;
    // Transform hack component
    const hackComp = getTransformHackComp(node);
    callback(hackComp);
    // Real components
    const components = node.components;
    if (components) {
        for (let i = 0; i < components.length; i++) {
            callback(components[i]);
        }
    }
}

function getNodeByPath(path: string): Node | null {
    const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
    return EditorExtends?.Node?.getNodeByPath?.(path) ?? null;
}

function getNodeByUuid(uuid: string): Node | null {
    const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
    return EditorExtends?.Node?.getNode?.(uuid) ?? null;
}

function getNodePath(node: Node): string {
    const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
    return EditorExtends?.Node?.getNodePath?.(node) ?? '';
}
const SceneGizmoLayer = Layers.Enum.SCENE_GIZMO;

@register('Gizmo')
export class GizmoService extends BaseService<IGizmoEvents> implements IGizmoService {
    gizmoRootNode!: Node;
    foregroundNode!: Node;
    backgroundNode!: Node;
    transformToolData = new TransformToolData();

    // 与 cocos-editor GizmoManager 一致：场景 Gizmo 相机 + WorldAxis 控制器
    sceneGizmoCamera!: Camera;
    private _worldAxisController: WorldAxisController | null = null;

    private _gizmoOperation!: GizmoOperation;
    private _iconVisible = false;
    private _selection: string[] = [];

    // Pool: Map<className, GizmoBase[]> — 与 cocos-editor GizmoPool 一致
    private _componentPool: Map<string, GizmoBase[]> = new Map();
    private _iconPool: Map<string, GizmoBase[]> = new Map();
    private _persistentPool: Map<string, GizmoBase[]> = new Map();

    // ── Transform tool accessors (与 cocos-editor TransformGizmoManager 一致) ──

    get transformToolName(): string {
        return this.transformToolData.toolName;
    }

    set transformToolName(value: string) {
        this.transformToolData.toolName = value as any;
    }

    get isViewMode(): boolean {
        return this.transformToolData.toolName === 'view' &&
            this.transformToolData.viewMode === 'view';
    }

    get viewMode() {
        return this.transformToolData.viewMode;
    }

    set viewMode(value) {
        this.transformToolData.viewMode = value;
    }

    get coordinate() {
        return this.transformToolData.coordinate;
    }

    set coordinate(value) {
        this.transformToolData.coordinate = value;
    }

    get pivot() {
        return this.transformToolData.pivot;
    }

    set pivot(value) {
        this.transformToolData.pivot = value;
    }

    get is2D(): boolean {
        return this.transformToolData.is2D;
    }

    set is2D(value: boolean) {
        this.transformToolData.is2D = !!value;
        if (value) {
            this._worldAxisController?.hide();
            this._iconVisible = false;
        } else {
            this._worldAxisController?.show();
            this._iconVisible = true;
        }
        this.setIconVisible(this._iconVisible);
    }

    // ── Scene Gizmo (与 cocos-editor GizmoManager.createSceneGizmo 一致) ──────

    private createSceneGizmo(): void {
        const node = new Node('Scene Gizmo Camera');
        node.layer = Layers.Enum.EDITOR | Layers.Enum.IGNORE_RAYCAST;
        node.parent = this.backgroundNode;
        const camera = node.addComponent('cc.Camera') as Camera;
        (camera as any).inEditorMode = true;
        this.sceneGizmoCamera = camera;
        camera.far = 1000;
        camera.visibility = SceneGizmoLayer;
        camera.rect = new Rect(0.7, 0.8, 0.2, 0.2);
        camera.priority = (1 << 30) + (1 << 29);
        camera.clearFlags = gfx.ClearFlagBit.DEPTH_STENCIL;
        if (this.gizmoRootNode) {
            this._worldAxisController = new WorldAxisController(this.gizmoRootNode, camera);
        }
        this.setSceneGizmoCameraRect();
    }

    private setSceneGizmoCameraRect(): void {
        const root = director.root;
        const winWidth = root?.curWindow ? root.curWindow.width : 0;
        const winHeight = root?.curWindow ? root.curWindow.height : 0;
        if (winWidth === 0 || winHeight === 0) return;
        const height = winHeight / 6;
        const heightPercent = height / winHeight;
        const delta = ((winWidth - winHeight) * heightPercent) / 2 / winWidth;
        const padding = (30 * (typeof window !== 'undefined' ? window.devicePixelRatio : 1)) / winHeight;
        if (this.sceneGizmoCamera) {
            this.sceneGizmoCamera.rect = new Rect(
                1 - heightPercent + delta,
                1 - heightPercent - padding,
                heightPercent,
                heightPercent,
            );
        }
    }

    onResize(): void {
        this.setSceneGizmoCameraRect();
    }

    // ── Lifecycle ───────────────────────────────────────────────────────────────

    init(): void {

        // 用于编辑器绘制的背景和前景节点
        this.foregroundNode = new cc.Node('Editor Scene Foreground');
        this.backgroundNode = new cc.Node('Editor Scene Background');

        // 编辑器使用的节点不需要存储和显示在层级管理器
        this.foregroundNode.objFlags |= cc.Object.Flags.DontSave | cc.Object.Flags.HideInHierarchy;
        this.backgroundNode.objFlags |= cc.Object.Flags.DontSave | cc.Object.Flags.HideInHierarchy;

        // 这些节点应该是常驻节点
        cc.director.addPersistRootNode(this.foregroundNode);
        cc.director.addPersistRootNode(this.backgroundNode);

        const scene = (cc as any).director?.getScene();
        if (scene) {
            this.foregroundNode.parent = scene;
            this.backgroundNode.parent = scene;
        }
        this.foregroundNode.layer = Layers.Enum.GIZMOS;
        this.backgroundNode.layer = Layers.Enum.GIZMOS;

        // Create gizmo root
        this.gizmoRootNode = create3DNode('gizmoRoot');
        this.gizmoRootNode.parent = this.foregroundNode;

        // 与 cocos-editor GizmoManager.init 一致：创建场景 Gizmo 相机 + WorldAxis
        this.createSceneGizmo();

        // Init GizmoOperation
        this._gizmoOperation = new GizmoOperation();
        this._gizmoOperation.init();

        // Listen for tool changes
        this.transformToolData.on('tool-name-changed', (name: string) => {
            this.emit('gizmo:tool-changed', name);
            this.saveConfig();
        });
        this.transformToolData.on('coordinate-changed', () => { this.saveConfig(); });
        this.transformToolData.on('pivot-changed', () => { this.saveConfig(); });
        this.transformToolData.on('view-mode-changed', () => { this.saveConfig(); });

        // 与 cocos-editor gizmos.ts 一致：dimension-changed → 同步相机 + 回调
        this.transformToolData.on('dimension-changed', (is2D: boolean) => {
            try {
                Service.Camera.is2D = is2D;
            } catch (e) {
                // Camera not ready yet
            }
            this.onDimensionChanged(is2D);
            ServiceEvents.emit('scene:dimension-changed', is2D);
            this.saveConfig();
        });

        // 与 cocos-editor gizmos.ts 一致：只在 IDLE 解锁、WANDER 锁定
        try {
            (Service as any).Camera?.controller3D?.on?.('camera-move-mode', (mode: number) => {
                if (mode === 0) { // CameraMoveMode.IDLE
                    this.lockGizmoTool(false);
                } else if (mode === 4) { // CameraMoveMode.WANDER
                    this.lockGizmoTool(true);
                }
            });
        } catch (e) {
            // Camera not ready yet
        }

        // 与 cocos-editor 一致：直接监听 Selection 事件
        ServiceEvents.on('selection:select', (path: string) => {
            this.onSelectionSelect(path);
        });
        ServiceEvents.on('selection:unselect', (path: string) => {
            this.onSelectionUnselect(path);
        });
        ServiceEvents.on('selection:clear', () => {
            this.onSelectionClear();
        });

        // 与 cocos-editor TransformGizmoManager.__listenEvents 一致：snap 配置变更持久化
        this._listenSnapEvents();

        // 与 cocos-editor GizmoManager.init 一致：监听相机投影变化
        try {
            (Service as any).Camera?.controller?.on?.('projection-changed', (projection: number) => {
                this._worldAxisController?.onCameraProjectionChanged(projection);
            });
        } catch (e) {
            // Camera not ready yet
        }
    }

    private _listenSnapEvents(): void {
        const snapConfigs = this.transformToolData.snapConfigs;
        const save = () => { this._saveSnapConfig(); };
        snapConfigs.on('snap-position-changed', save);
        snapConfigs.on('snap-rotation-changed', save);
        snapConfigs.on('snap-scale-changed', save);
        snapConfigs.on('enable-snap-position-changed', save);
        snapConfigs.on('enable-snap-rotation-changed', save);
        snapConfigs.on('enable-snap-scale-changed', save);
    }

    private async _saveSnapConfig(): Promise<void> {
        try {
            const rpc = Rpc.getInstance();
            const snapData = this.transformToolData.snapConfigs.getPureDataObject();
            await rpc.request('sceneConfigInstance', 'set', ['gizmo.snapConfigs', snapData]);
        } catch {
            // Config persistence not available
        }
    }

    // 与 cocos-editor GizmoManager.initFromConfig 一致
    async initFromConfig(): Promise<void> {
        try {
            const rpc = Rpc.getInstance();
            const config: any = await rpc.request('sceneConfigInstance', 'get', ['gizmo']);
            if (config) {
                if (config.is2D !== undefined) this.is2D = config.is2D;
                if (config.is3DIcon !== undefined) this.setIconGizmo3D(config.is3DIcon);
                if (config.iconSize !== undefined) this.setIconGizmoSize(config.iconSize);
                if (config.transformToolName !== undefined) this.transformToolName = config.transformToolName;
                if (config.viewMode !== undefined) this.viewMode = config.viewMode;
                if (config.pivot !== undefined) this.setPivot(config.pivot);
                if (config.coordinate !== undefined) this.setCoordinate(config.coordinate);
                if (config.toolsVisibility3d !== undefined) {
                    this.setToolsVisibility3d(config.toolsVisibility3d);
                } else {
                    this.setToolsVisibility3d(true);
                }
                if (config.snapConfigs) {
                    this.transformToolData.snapConfigs.initFromData(config.snapConfigs);
                }
                if (config.rectSnapConfig) {
                    rectTransformSnapping.initFromData(config.rectSnapConfig);
                }
                if (config.gridColor !== undefined) GizmoConfig.gridColor = config.gridColor;
                if (config.originAxis2D !== undefined) GizmoConfig.originAxis2D = config.originAxis2D;
                if (config.originAxis3D !== undefined) GizmoConfig.originAxis3D = config.originAxis3D;
            }
        } catch {
            // 配置不可用时使用默认值
        }
    }

    // 与 cocos-editor GizmoManager.saveConfig 一致
    async saveConfig(): Promise<void> {
        try {
            const rpc = Rpc.getInstance();
            const current = await rpc.request('sceneConfigInstance', 'get', ['gizmo']) as Record<string, any> ?? {};
            const gizmoConfig = {
                ...current,
                is2D: this.is2D,
                is3DIcon: this.isIconGizmo3D(),
                iconSize: this.queryIconGizmoSize(),
                transformToolName: this.transformToolName,
                viewMode: this.viewMode,
                pivot: this.pivot,
                coordinate: this.coordinate,
                toolsVisibility3d: this.queryToolsVisibility3d(),
                snapConfigs: this.transformToolData.snapConfigs.getPureDataObject(),
                rectSnapConfig: rectTransformSnapping.getPureDataObject(),
                gridColor: this.queryGridColor(),
                originAxis2D: this.queryOriginAxes2D(),
                originAxis3D: this.queryOriginAxes3D(),
            };
            await rpc.request('sceneConfigInstance', 'set', ['gizmo', gizmoConfig]);
        } catch {
            // Config persistence not available
        }
    }

    // ── Transform tool methods ──────────────────────────────────────────────────

    changeTool(name: string): void {
        this.transformToolName = name;
    }

    setCoordinate(coord: 'local' | 'global'): void {
        this.transformToolData.coordinate = coord;
    }

    setPivot(pivot: 'pivot' | 'center'): void {
        this.transformToolData.pivot = pivot;
    }

    lockGizmoTool(locked: boolean): void {
        this.transformToolData.isLocked = locked;
    }

    isGizmoToolLocked(): boolean {
        return this.transformToolData.isLocked;
    }

    // ── GizmoConfig methods (与 cocos-editor GizmoManager 一致) ────────────────

    queryToolsVisibility3d(): boolean {
        return GizmoConfig.toolsVisibility3d;
    }

    setToolsVisibility3d(value: boolean): void {
        GizmoConfig.toolsVisibility3d = Boolean(value);
        for (const uuid of this._selection) {
            try {
                const node = getNodeByUuid(uuid);
                if (node) {
                    walkNodeComponent(node, (component: Component) => {
                        const gizmo = getGizmoProperty('component', component);
                        if (gizmo) {
                            if (gizmo.target !== component) {
                                this._showGizmo('component', component, true);
                            }
                            gizmo.checkVisible() ? gizmo.show() : gizmo.hide();
                        }
                    });
                }
            } catch (e) {
                // Scene not ready
            }
        }
        Service.Engine?.repaintInEditMode?.();
        void this.saveConfig();
    }

    isIconGizmo3D(): boolean {
        return GizmoConfig.isIconGizmo3D;
    }

    setIconGizmo3D(value: boolean): void {
        if (value === null || value === undefined) return;
        GizmoConfig.isIconGizmo3D = value;
        this._walkAllSceneNodes((component: Component) => {
            const iconGizmo = getGizmoProperty('icon', component);
            if (iconGizmo && (iconGizmo as any).setIconGizmo3D) {
                (iconGizmo as any).setIconGizmo3D(value);
            }
        });
        Service.Engine?.repaintInEditMode?.();
        void this.saveConfig();
    }

    queryIconGizmoSize(): number {
        return GizmoConfig.iconGizmoSize;
    }

    setIconGizmoSize(size: number): void {
        if (size === null || size === undefined) return;
        GizmoConfig.iconGizmoSize = size;
        this._walkAllSceneNodes((component: Component) => {
            const iconGizmo = getGizmoProperty('icon', component);
            if (iconGizmo && (iconGizmo as any).setIconGizmoSize) {
                (iconGizmo as any).setIconGizmoSize(size);
            }
        });
        Service.Engine?.repaintInEditMode?.();
        void this.saveConfig();
    }

    queryGridColor(): number[] {
        return GizmoConfig.gridColor;
    }

    setGridColor(color: number[]): void {
        if (!color) return;
        GizmoConfig.gridColor = [...color];
        Service.Camera?.setGridColor?.(color);
        void this.saveConfig();
    }

    queryOriginAxes2D(): IOriginAxesConfig {
        return GizmoConfig.originAxis2D;
    }

    setOriginAxes2D(config: IOriginAxesConfig): void {
        if (!config) return;
        GizmoConfig.originAxis2D = { ...config };
        Service.Camera?.setOriginAxes2D?.(config);
        void this.saveConfig();
    }

    queryOriginAxes3D(): IOriginAxesConfig {
        return GizmoConfig.originAxis3D;
    }

    setOriginAxes3D(config: IOriginAxesConfig): void {
        if (!config) return;
        GizmoConfig.originAxis3D = { ...config };
        Service.Camera?.setOriginAxes3D?.(config);
        void this.saveConfig();
    }

    setIconVisible(visible: boolean): void {
        this._iconVisible = visible;
        // 与 cocos-editor iconVisible setter 一致：遍历场景所有节点
        this._walkAllSceneNodes((component: Component) => {
            const iconGizmo = getGizmoProperty('icon', component);
            if (iconGizmo && (iconGizmo as any).setIconGizmoVisible) {
                (iconGizmo as any).setIconGizmoVisible(visible);
            }
        });
    }

    // 与 cocos-editor iconVisible setter 一致：遍历场景所有节点而非 pool
    private _walkAllSceneNodes(callback: (comp: Component) => void): void {
        const scene = (cc as any).director?.getScene();
        if (!scene) return;
        this._walkNodeTree(scene, callback);
    }

    private _walkNodeTree(node: Node, callback: (comp: Component) => void): void {
        if (!node || isEditorNode(node)) return;
        walkNodeComponent(node, callback);
        const children = node.children;
        if (children) {
            for (let i = 0; i < children.length; i++) {
                this._walkNodeTree(children[i], callback);
            }
        }
    }

    // ── Snap config methods (与 cocos-editor TransformGizmoManager 一致) ───────

    queryTransformSnapConfigs(): ISnapConfigData {
        return this.transformToolData.snapConfigs.getPureDataObject();
    }

    setTransformSnapConfigs(name: string, value: any): void {
        (this.transformToolData.snapConfigs as any)[name] = value;
    }

    queryRectSnapConfig(): IRectSnapConfigData {
        return rectTransformSnapping.getPureDataObject();
    }

    setRectSnapConfig(config: Partial<IRectSnapConfigData>): void {
        rectTransformSnapping.initFromData({
            ...rectTransformSnapping.getPureDataObject(),
            ...config,
        });
        Service.Engine?.repaintInEditMode?.();
        void this.saveConfig();
    }

    // ── Pool management (与 cocos-editor GizmoPool 一致) ────────────────────────

    private _getPool(type: TGizmoType): Map<string, GizmoBase[]> {
        switch (type) {
            case 'component': return this._componentPool;
            case 'icon': return this._iconPool;
            case 'persistent': return this._persistentPool;
        }
    }

    // 与 cocos-editor GizmoPool.unmountGizmo 一致
    private _unmountGizmo(gizmo: GizmoBase): void {
        if (gizmo.target) {
            const types: TGizmoType[] = ['component', 'icon', 'persistent'];
            for (const type of types) {
                const existing = getGizmoProperty(type, gizmo.target);
                if (existing === gizmo) {
                    setGizmoProperty(type, gizmo.target, null);
                }
            }
        }
        gizmo.target = null;
    }

    private _createGizmo(type: TGizmoType, name: string): GizmoBase | null {
        const defMap = getGizmoDefMap(type);
        const GizmoCtor = defMap.get(name);

        const pool = this._getPool(type);
        let instances = pool.get(name);
        if (!instances) {
            instances = [];
            pool.set(name, instances);
        }

        // 与 cocos-editor pool.createGizmo 一致：检查构造函数是否匹配，不匹配则销毁
        if (instances.length > 0 && instances[0].constructor !== GizmoCtor) {
            instances.forEach((inst) => inst.destroy());
            instances.length = 0;
        }

        if (!GizmoCtor) return null;

        // Reuse hidden instance
        for (const inst of instances) {
            if (!inst.visible()) {
                return inst;
            }
        }

        // Create new
        const gizmo = new GizmoCtor(null);
        instances.push(gizmo);
        return gizmo;
    }

    // 与 cocos-editor GizmoPool.destroyGizmo 一致
    private _destroyGizmo(gizmo: GizmoBase): void {
        this._unmountGizmo(gizmo);
        gizmo.destroy();
        const pools = [this._componentPool, this._iconPool, this._persistentPool];
        for (const pool of pools) {
            for (const [, instances] of pool) {
                const index = instances.indexOf(gizmo);
                if (index !== -1) {
                    instances.splice(index, 1);
                }
            }
        }
    }

    forEachInstanceList(type: TGizmoType, name: string, handle: (gizmo: GizmoBase) => void): void {
        const pool = this._getPool(type);
        const instances = pool.get(name);
        if (!instances) return;
        instances.forEach(handle);
    }

    private _showGizmo(type: TGizmoType, component: Component, focusCreate = false): void {
        if (!component) return;
        let gizmo = getGizmoProperty(type, component);
        // 与 cocos-editor showGizmo 一致：focusCreate 时强制重新创建
        if (!gizmo || focusCreate) {
            const name = js.getClassName(component);
            gizmo = this._createGizmo(type, name);
            if (!gizmo) return;
            setGizmoProperty(type, component, gizmo);
        }
        if (type === 'icon') {
            if ((gizmo as any).setIconGizmoVisible) {
                (gizmo as any).setIconGizmoVisible(this._iconVisible);
            }
        } else {
            gizmo.show();
        }
    }

    private _hideGizmo(gizmo: GizmoBase): void {
        gizmo.hide();
    }

    private _removeGizmo(type: TGizmoType, component: Component): void {
        const gizmo = getGizmoProperty(type, component);
        if (gizmo) {
            this._hideGizmo(gizmo);
            setGizmoProperty(type, component, null);
        }
    }

    // ── Node gizmo management ───────────────────────────────────────────────────

    // 与 cocos-editor GizmoPoolManager.showGizmoOfNode 一致
    showGizmoOfNode(type: TGizmoType, node: Node): void {
        if (!node || !node.parent || !node.activeInHierarchy) return;
        walkNodeComponent(node, (component: Component) => {
            if (!component.enabledInHierarchy) return;
            this._showGizmo(type, component);
        });
    }

    showAllGizmoOfNode(node: Node, recursive = false): void {
        if (!node || isEditorNode(node)) return;
        if (!node.parent || !node.activeInHierarchy) return;
        walkNodeComponent(node, (component: Component) => {
            if (component.enabledInHierarchy === false) return;
            this._showGizmo('icon', component);
            this._showGizmo('persistent', component);
            this._showGizmo('component', component);
        });
        if (recursive) {
            node.children.forEach((child) => {
                this.showAllGizmoOfNode(child, true);
            });
        }
    }

    // 与 cocos-editor GizmoPoolManager.removeGizmoOfNode 一致
    removeGizmoOfNode(type: TGizmoType, node: Node): void {
        walkNodeComponent(node, (component: Component) => {
            this._removeGizmo(type, component);
        });
    }

    removeAllGizmoOfNode(node: Node, recursive = false): void {
        if (!node) return;
        walkNodeComponent(node, (component: Component) => {
            this._removeGizmo('component', component);
            this._removeGizmo('icon', component);
            this._removeGizmo('persistent', component);
        });
        if (recursive) {
            node.children.forEach((child) => {
                this.removeAllGizmoOfNode(child, true);
            });
        }
    }

    // 与 cocos-editor GizmoPool.clearAllGizmos 一致
    clearAllGizmos(): void {
        const pools = [this._componentPool, this._iconPool, this._persistentPool];
        for (const pool of pools) {
            for (const [, instances] of pool) {
                for (const gizmo of instances) {
                    this._unmountGizmo(gizmo);
                    gizmo.destroy();
                }
            }
            pool.clear();
        }
    }

    callAllGizmoFuncOfNode(node: Node, funcName: string, ...params: any[]): boolean {
        let stopped = false;
        if (!node) return true;
        walkNodeComponent(node, (component: Component) => {
            const compGizmo = getGizmoProperty('component', component);
            if (component && compGizmo && (compGizmo as any)[funcName]) {
                const res = (compGizmo as any)[funcName](...params);
                if (res === false) stopped = true;
            }
        });
        return !stopped;
    }

    // ── Selection integration (与 cocos-editor SelectionGizmoManager 一致) ─────

    querySelectNodes(): Node[] {
        return this._selection
            .map((uuid) => getNodeByUuid(uuid))
            .filter((node): node is Node => node !== null);
    }

    hasSelected(uuid: string): boolean {
        return this._selection.includes(uuid);
    }

    onSelectionSelect(path: string): void {
        const node = getNodeByPath(path);
        if (!node) return;
        const uuid = node.uuid;
        if (this._selection.includes(uuid)) return;
        try {
            this.showAllGizmoOfNode(node);
            this._onNodeSelectionChanged(node, true);
        } catch (e) {
            // Scene not ready
        }
        this._selection.push(uuid);
    }

    onSelectionUnselect(path: string): void {
        const node = getNodeByPath(path);
        if (!node) return;
        const uuid = node.uuid;
        const idx = this._selection.indexOf(uuid);
        if (idx >= 0) this._selection.splice(idx, 1);
        try {
            const node = getNodeByUuid(uuid);
            if (node) {
                this._onNodeSelectionChanged(node, false);
                this.removeGizmoOfNode('component', node);
            }
        } catch (e) {
            // Scene not ready
        }
        Service.Engine?.repaintInEditMode?.();
    }

    onSelectionClear(): void {
        const oldSelection = [...this._selection];
        this._selection.length = 0;
        for (const uuid of oldSelection) {
            try {
                const node = getNodeByUuid(uuid);
                if (node) {
                    this._onNodeSelectionChanged(node, false);
                    this.removeGizmoOfNode('component', node);
                }
            } catch (e) {
                // Scene not ready
            }
        }
    }

    // 与 cocos-editor GizmoManager.onNodeSelectionChanged 一致
    private _onNodeSelectionChanged(node: Node, selected: boolean): void {
        if (!node || !node.parent) return;
        if (!node.activeInHierarchy) return;
        walkNodeComponent(node, (component: Component) => {
            const iconGizmo = getGizmoProperty('icon', component);
            if (iconGizmo && (iconGizmo as any).onNodeSelectionChanged) {
                (iconGizmo as any).onNodeSelectionChanged(selected);
            }
        });
    }

    private _rebindSelectedGizmos(): void {
        const selectedPaths = Service.Selection?.query?.() ?? [];
        this._selection.length = 0;
        for (const path of selectedPaths) {
            this.onSelectionSelect(path);
        }
    }

    // ── 编辑器生命周期（由 BaseService 事件钩子调用）───────────────────────────

    onEditorOpened(): void {
        this.clearAllGizmos();
        this._showIconGizmosForScene();
        this.initFromConfig();
        // 编辑器打开/重载后节点和组件对象可能已重建，保留选择路径并重新挂到新组件上。
        this._rebindSelectedGizmos();
        // Camera.onEditorOpened 有 200ms 延迟的 defaultFocus，需要等它完成后再显示世界坐标轴
        setTimeout(() => {
            // init 阶段编辑器相机还不存在，registerCameraMovedEvent 静默失败，此处补注册
            this._worldAxisController?.registerCameraMovedEvent();
            if (!this.transformToolData.is2D) {
                this._worldAxisController?.show();
            }
            this._worldAxisController?.onEditorCameraMoved();
            Service.Engine?.repaintInEditMode?.();
        }, 300);
    }

    onEditorClosed(): void {
        this.saveConfig();
    }

    onNodeChanged(node: Node, opts?: IChangeNodeOptions): void {
        if (!node) return;
        const has = this._selection.includes(node.uuid);

        walkNodeComponent(node, (component: Component) => {
            const isHackComp = component instanceof HackTransformComponent ||
                (component as any).__classname__ === '_EditorHackTransformComponent_';
            if (!isHackComp && (!component.enabled || !node.active || !node.parent)) {
                if (has) this._removeGizmo('component', component);
                this._removeGizmo('icon', component);
                this._removeGizmo('persistent', component);
                return;
            }

            let gizmo: GizmoBase | null | undefined;

            if (has) {
                gizmo = getGizmoProperty('component', component);
                if (gizmo) {
                    if ((gizmo as any).onNodeChanged && gizmo.checkVisible()) {
                        (gizmo as any).onNodeChanged(opts);
                    }
                } else {
                    this._showGizmo('component', component);
                }
            }

            gizmo = getGizmoProperty('persistent', component);
            if (gizmo) {
                if ((gizmo as any).onNodeChanged && gizmo.checkVisible()) {
                    (gizmo as any).onNodeChanged(opts);
                }
            } else {
                this._showGizmo('persistent', component);
            }

            gizmo = getGizmoProperty('icon', component);
            if (gizmo) {
                if ((gizmo as any).onNodeChanged && gizmo.checkVisible()) {
                    (gizmo as any).onNodeChanged(opts);
                }
            } else {
                this._showGizmo('icon', component);
            }
        });

        if (opts?.type !== NodeEventType.CHILD_CHANGED) {
            node.children.forEach((child) => {
                this.onNodeChanged(child, opts);
            });
        }

        Service.Engine?.repaintInEditMode?.();
    }

    onComponentAdded(comp: Component): void {
        const node = comp.node;
        if (!node) return;
        if (this._selection.includes(node.uuid)) {
            this.showAllGizmoOfNode(node);
        }
    }

    onComponentRemoved(comp: Component): void {
        this._removeGizmo('icon', comp);
        this._removeGizmo('persistent', comp);
        const compGizmo = getGizmoProperty('component', comp);
        if (compGizmo) {
            this._hideGizmo(compGizmo);
        }
    }

    onNodeAdded(node: Node): void {
        if (this._selection.includes(node.uuid)) {
            this.showAllGizmoOfNode(node);
        }
    }

    onNodeRemoved(node: Node): void {
        this.removeAllGizmoOfNode(node, true);
    }

    // 与 cocos-editor GizmoManager.onDimensionChanged 一致
    onDimensionChanged(_is2D: boolean): void {
        this.setToolsVisibility3d(GizmoConfig.toolsVisibility3d);
    }

    private _showIconGizmosForScene(): void {
        const scene = (cc as any).director?.getScene();
        if (!scene) return;
        this._walkSceneForIcons(scene);
    }

    private _walkSceneForIcons(node: Node): void {
        if (!node || isEditorNode(node)) return;
        const components = node.components;
        if (components) {
            for (let i = 0; i < components.length; i++) {
                const comp = components[i];
                const className = js.getClassName(comp);
                if (GizmoDefines.iconGizmo.has(className)) {
                    this._showGizmo('icon', comp);
                }
                if (GizmoDefines.persistentGizmo.has(className)) {
                    this._showGizmo('persistent', comp);
                }
            }
        }
        const children = node.children;
        if (children) {
            for (let i = 0; i < children.length; i++) {
                this._walkSceneForIcons(children[i]);
            }
        }
    }

    // ── Selection region (与 cocos-editor GizmoManager 一致) ──────────────────

    showSelectionRegion(left: number, right: number, top: number, bottom: number): void {
        const cameraComp = (Service.Camera as any)?.getCamera?.();
        if (!cameraComp) return;

        const pos0 = new Vec3(left, bottom, 0.1);
        const pos1 = new Vec3(right, bottom, 0.1);
        const pos2 = new Vec3(right, top, 0.1);
        const pos3 = new Vec3(left, top, 0.1);
        const p0 = new Vec3();
        const p1 = new Vec3();
        const p2 = new Vec3();
        const p3 = new Vec3();
        cameraComp.screenToWorld(pos0, p0);
        cameraComp.screenToWorld(pos1, p1);
        cameraComp.screenToWorld(pos2, p2);
        cameraComp.screenToWorld(pos3, p3);

        const geometryRenderer = (Service.Engine as any)?.getGeometryRenderer?.();
        if (geometryRenderer) {
            geometryRenderer.removeData('addQuad');
            geometryRenderer.addQuad(p0, p1, p2, p3, new Color(255, 255, 255, 120), false, false, true);
        }
        Service.Engine?.repaintInEditMode?.();
    }

    hideSelectionRegion(): void {
        (Service.Engine as any)?.getGeometryRenderer?.()?.removeData('addQuad');
        Service.Engine?.repaintInEditMode?.();
    }

    // 与 cocos-editor GizmoManager.execGizmoMethods 一致
    execGizmoMethods(name: string, funcName: string, params: any[] = []): any {
        const methods = (GizmoDefines as any).methods?.get?.(name);
        if (!methods || !methods[funcName]) {
            return;
        }
        return methods[funcName](...params);
    }

    _changeRegionSelectMode(mode: number): void {
        (GizmoOperation as any).changeRegionSelectMode?.(mode);
    }

    // ── Update ──────────────────────────────────────────────────────────────────

    onUpdate(deltaTime: number): void {
        for (const uuid of this._selection) {
            try {
                const node = getNodeByUuid(uuid);
                if (!node) continue;
                walkNodeComponent(node, (component: Component) => {
                    const compGizmo = getGizmoProperty('component', component);
                    if (compGizmo && compGizmo.checkVisible()) {
                        compGizmo.update(deltaTime);
                    }
                });
            } catch (e) {
                // Scene not ready
            }
        }
    }
}
