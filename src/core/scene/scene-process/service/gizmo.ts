'use strict';

import { Component, js, Layers, Node } from 'cc';
import { BaseService } from './core';
import { register, Service } from './core/decorator';
import { ServiceEvents } from './core/global-events';
import { TransformToolData } from './gizmo/transform-tool';
import GizmoDefines from './gizmo/gizmo-defines';
import GizmoBase from './gizmo/base/gizmo-base';
import GizmoOperation from './gizmo/gizmo-operation';
import { create3DNode } from './gizmo/utils/engine-utils';
import { NodeEventType } from '../../common';
import type { IGizmoEvents, IGizmoService, IChangeNodeOptions } from '../../common';

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

// WeakMaps to associate components with their gizmo instances
const _componentGizmoMap = new WeakMap < Component, GizmoBase | null > ();
const _iconGizmoMap = new WeakMap < Component, GizmoBase | null > ();
const _persistentGizmoMap = new WeakMap < Component, GizmoBase | null > ();

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

function setGizmoProperty(type: TGizmoType, comp: Component, gizmo: GizmoBase | null) {
    getGizmoMap(type).set(comp, gizmo);
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

const _transformCompMap = new WeakMap < Node, Component> ();

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

@register('Gizmo')
export class GizmoService extends BaseService<IGizmoEvents> implements IGizmoService {
    gizmoRootNode!: Node;
    foregroundNode!: Node;
    backgroundNode!: Node;
    transformToolData = new TransformToolData();

    private _gizmoOperation!: GizmoOperation;
    private _iconVisible = true;
    private _selection: string[] = [];

    // Pool: Map<className, GizmoBase[]>
    private _componentPool: Map<string, GizmoBase[]> = new Map();
    private _iconPool: Map<string, GizmoBase[]> = new Map();
    private _persistentPool: Map<string, GizmoBase[]> = new Map();

    get transformToolName(): string {
        return this.transformToolData.toolName;
    }

    get isViewMode(): boolean {
        return this.transformToolData.toolName === 'view' &&
            this.transformToolData.viewMode === 'view';
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

        // Init GizmoOperation
        this._gizmoOperation = new GizmoOperation();
        this._gizmoOperation.init();

        // Listen for tool changes
        this.transformToolData.on('tool-name-changed', (name: string) => {
            this.emit('gizmo:tool-changed', name);
        });

        // 与 cocos-editor 一致：2D 视图下隐藏 IconGizmo，让 UI 编辑更干净
        this.transformToolData.on('dimension-changed', (is2D: boolean) => {
            this.setIconVisible(!is2D);
        });

        // Listen for camera mode changes to lock/unlock gizmo tool
        // 与 cocos-editor 一致：监听 'camera-move-mode'，回调参数为 CameraMoveMode 枚举(number)
        try {
            (Service as any).Camera?.controller3D?.on?.('camera-move-mode', (mode: number) => {
                this.transformToolData.isLocked = mode !== 0; // 0 = CameraMoveMode.IDLE
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
    }

    async initFromConfig(): Promise<void> {
        // Load persisted tool settings (stub for CLI)
    }

    async saveConfig(): Promise<void> {
        // Save tool settings (stub for CLI)
    }

    // ── Transform tool methods ──────────────────────────────────────────────────

    changeTool(name: string): void {
        this.transformToolData.toolName = name as any;
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

    setIconVisible(visible: boolean): void {
        this._iconVisible = visible;
        // Update all icon gizmos
        for (const [, instances] of this._iconPool) {
            for (const gizmo of instances) {
                if ((gizmo as any).setIconGizmoVisible) {
                    (gizmo as any).setIconGizmoVisible(visible);
                }
            }
        }
    }

    // ── Pool management ─────────────────────────────────────────────────────────

    private _getPool(type: TGizmoType): Map<string, GizmoBase[]> {
        switch (type) {
            case 'component': return this._componentPool;
            case 'icon': return this._iconPool;
            case 'persistent': return this._persistentPool;
        }
    }

    private _createGizmo(type: TGizmoType, name: string): GizmoBase | null {
        const defMap = getGizmoDefMap(type);
        const GizmoCtor = defMap.get(name);
        if (!GizmoCtor) return null;

        const pool = this._getPool(type);
        let instances = pool.get(name);
        if (!instances) {
            instances = [];
            pool.set(name, instances);
        }

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

    private _showGizmo(type: TGizmoType, component: Component, _focusCreate = false): void {
        if (!component) return;
        const name = js.getClassName(component);
        let gizmo = getGizmoProperty(type, component);
        if (!gizmo) {
            gizmo = this._createGizmo(type, name);
            if (!gizmo) return;
            setGizmoProperty(type, component, gizmo);
        }
        gizmo.target = component;
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

    showAllGizmoOfNode(node: Node, recursive = false): void {
        if (!node || isEditorNode(node)) return;
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

    clearAllGizmos(): void {
        const clearPool = (pool: Map<string, GizmoBase[]>) => {
            for (const [, instances] of pool) {
                for (const gizmo of instances) {
                    gizmo.target = null;
                    gizmo.destroy();
                }
            }
            pool.clear();
        };
        clearPool(this._componentPool);
        clearPool(this._iconPool);
        clearPool(this._persistentPool);
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

    // ── Selection integration ───────────────────────────────────────────────────

    onSelectionSelect(path: string): void {
        const node = getNodeByPath(path);
        if (!node) return;
        const uuid = node.uuid;
        if (this._selection.includes(uuid)) return;
        this._selection.push(uuid);
        try {
            this.showAllGizmoOfNode(node);
            this._onNodeSelectionChanged(node, true);
        } catch (e) {
            // Scene not ready
        }
    }

    onSelectionUnselect(path: string): void {
        const node = getNodeByPath(path);
        if (!node) return;
        const uuid = node.uuid;
        const idx = this._selection.indexOf(uuid);
        if (idx >= 0) this._selection.splice(idx, 1);
        try {
            this._onNodeSelectionChanged(node, false);
            walkNodeComponent(node, (component: Component) => {
                this._removeGizmo('component', component);
            });
        } catch (e) {
            // Scene not ready
        }
    }

    onSelectionClear(): void {
        const oldSelection = [...this._selection];
        this._selection.length = 0;
        for (const uuid of oldSelection) {
            try {
                const node = getNodeByUuid(uuid);
                if (node) {
                    this._onNodeSelectionChanged(node, false);
                    walkNodeComponent(node, (component: Component) => {
                        this._removeGizmo('component', component);
                    });
                }
            } catch (e) {
                // Scene not ready
            }
        }
    }

    private _onNodeSelectionChanged(node: Node, selected: boolean): void {
        walkNodeComponent(node, (component: Component) => {
            const iconGizmo = getGizmoProperty('icon', component);
            if (iconGizmo && (iconGizmo as any).onNodeSelectionChanged) {
                (iconGizmo as any).onNodeSelectionChanged(selected);
            }
        });
    }

    // ── Scene lifecycle (called by BaseService event hooks) ─────────────────────

    onEditorOpened(): void {
        this._showIconGizmosForScene();
    }

    onSceneOpened(): void {
        this.clearAllGizmos();
        this.transformToolData.toolName = 'position';
    }

    onSceneClosed(): void {
        this.clearAllGizmos();
    }

    onNodeChanged(node: Node, opts?: IChangeNodeOptions): void {
        if (!node) return;

        const has = this._selection.includes(node.uuid);

        walkNodeComponent(node, (component: Component) => {
            const isHackComp = (component as any).__classname__ === '_EditorHackTransformComponent_';
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
