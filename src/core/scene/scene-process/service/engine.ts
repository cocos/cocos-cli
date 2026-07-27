'use strict';

import Time from './engine/time';
import { Component, director, GeometryRenderer as CCGeometryRenderer, Node } from 'cc';
import { GeometryRenderer, methods as GeometryMethods } from './engine/geometry_renderer';
import { BaseService, register } from './core';
import { ServiceEvents } from './core/global-events';
import { Service, queryRegisteredService } from './core/decorator';
import type { ICustomLayerConfig, IEngineEvents, IEngineService } from '../../common';
import { NodeEventType } from '../../common';
import { Rpc } from '../rpc';
import { serviceManager } from './service-manager';
import { TimerUtil } from './utils/timer-util';

const tickTime = 1000 / 60;
// Engine Layers reserves bits 20-31 for built-ins; user custom layers live in bit positions 0-19.
const USER_LAYER_MIN_BIT = 0;
const USER_LAYER_MAX_BIT = 19;
const layerMask: number[] = [];
for (let i = USER_LAYER_MIN_BIT; i <= USER_LAYER_MAX_BIT; i++) {
    layerMask[i] = 1 << i;
}

// 与 cocos-editor 一致：控制连续 tick 的状态枚举
enum NeedAnimState {
    CAMERA_ORBIT,
    CAMERA_PAN,
    CAMERA_WANDER,
    ANIMATION_MODE,
    PARTICLE_SYSTEM_MODE,
    TERRAIN_SYSTEM_MODE,
    GAME_VIEW_MODE,
}

/**
 * 引擎管理器，用于引擎相关操作
 */
@register('Engine')
export class EngineService extends BaseService<IEngineEvents> implements IEngineService {
    private _setTimeoutId: NodeJS.Timeout | null = null;
    private _rafId: number | null = null;
    private _maxDeltaTimeInEM = 1 / 30;
    private _stateRecord = 0; // 记录当前状态
    private _shouldRepaintInEM = false; // 强制引擎渲染一帧
    private _tickInEM = false;
    private _tickedFrameInEM = -1;
    private _paused = false;
    private _capture = false;// 抓帧时定时器需要切换

    private _bindTick = this._tick.bind(this);
    private geometryRenderer!: GeometryRenderer & Pick<CCGeometryRenderer, typeof GeometryMethods[number]>;
    private _sceneTick = false;// tick 是否暂停
    private _nodeChangeTimer = new TimerUtil();

    // 与 cocos-editor ParticleManager 一致：跟踪选中的粒子和手动停止状态
    private _particleSelectedUUIDs: string[] = [];
    private _stoppedParticleSet = new WeakSet<Component>();
    public async init() {
        cc.game.pause(); // 暂停引擎的 mainLoop
        this.geometryRenderer = new GeometryRenderer() as GeometryRenderer & Pick<CCGeometryRenderer, typeof GeometryMethods[number]>;
        this.startTick();
        this._sceneTick = await Rpc.getInstance().request('sceneConfigInstance', 'get', ['tick']) as boolean;
        console.log('sceneTick: ' + this._sceneTick);
    }

    public setTimeout(callback: any, time: number) {
        if (this._capture) {
             
            this._rafId = requestAnimationFrame(callback);
        } else {
            this._setTimeoutId = setTimeout(callback, time);
        }
    }

    public clearTimeout() {
        if (this._setTimeoutId) {
            clearTimeout(this._setTimeoutId);
            this._setTimeoutId = null;
        }
        if (this._rafId) {
             
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    public async repaintInEditMode() {
        // 避免 tickInEditMode() 在同一帧执行时又调到这里，导致下一帧又执行 tickInEditMode，陷入循环
        if (this._tickedFrameInEM !== director.getTotalFrames()) {
            this._shouldRepaintInEM = true;
        }
    }

    /**
     * 渲染调试视图（DebugView）：单一通道调试 / 组合光照项开关 / 纯光照带固有色 / 级联阴影染色。
     * 与 cocos-editor scene-facade-manager.changeDebugOption 对齐。
     * 注意：不对外暴露为公共 API（未加入 IEngineService / EngineProxy，不生成到 cocos-cli-types）；
     * 目前仅由场景编辑器页面（scene-editor.ejs）在浏览器内通过 window.cli.Scene.Engine 直接调用。
     * @param key 'single' | 'composite' | 'LIGHTING_WITH_BASE_COLOR' | 'CSM_LAYER_COLORATION'
     * @param value single: DebugViewSingleType 数值；composite: { key: DebugViewCompositeType | 10000(=ALL), value: boolean }；其余: boolean
     */
    public async changeDebugOption(key: string, value: any) {
        // debugView 未在 Root 类型里声明；2D 或引擎未就绪时可能为空
        const debugView = (director.root as any)?.debugView;
        if (!debugView) {
            return;
        }
        switch (key) {
            case 'single':
                // 渲染单项调试模式
                debugView.singleMode = value;
                break;
            case 'composite':
                // 渲染组合调试模式（key === 10000 表示全部）
                if (value?.key === 10000) {
                    debugView.enableAllCompositeMode(value.value);
                } else {
                    debugView.enableCompositeMode(value?.key, value?.value);
                }
                break;
            case 'LIGHTING_WITH_BASE_COLOR':
                // 光照信息带固有色（纯光照切换）
                debugView.lightingWithAlbedo = value;
                break;
            case 'CSM_LAYER_COLORATION':
                // 级联阴影染色
                debugView.csmLayerColoration = value;
                break;
            default:
                // 未知 key：不做任何变更，直接返回，避免空转重绘
                return;
        }
        void this.repaintInEditMode();
    }

     /* 从服务端拉取当前工程的设计分辨率，同步到 cc.view 并重排已打开场景里的 Canvas。
     *
     * 为什么必须手动重排：编辑器模式（EDITOR_NOT_IN_PREVIEW）下 cc.Canvas 不会注册
     * 'design-resolution-changed' 监听（只有预览/运行模式才注册），只在场景实例化的 __preload 里
     * 调 fitDesignResolution_EDITOR 对齐一次。因此改分辨率后：新实例化的场景会自动对齐，但
     * 已打开、未重新实例化的场景不会更新——需要在这里手动调 fitDesignResolution_EDITOR
     * （与 cocos-editor startup.initDesignResolution 的重排逻辑一致）。
     *
     * 在打开场景、重开同一场景、以及选中节点时都会调用：由于浏览器场景收不到主进程的配置变更推送，
     * 只能在这些交互时机主动拉取比对。cc.view 未变化时直接返回（每次仅一次极小的读取），
     * 变化时才更新并重排——因为 cc.view 每次变化都会连同重排当前场景，故不会出现“已更新但场景未重排”的情况。
     */
    public async syncDesignResolution() {
        try {
            const view = (cc as any).view;
            if (!view || typeof fetch !== 'function') {
                return;
            }
            const serverURL = serviceManager.getServerUrl();
            const res = await fetch(`${serverURL}/scripting/engine/design-resolution`);
            const dr = await res.json();
            const width = Number(dr?.width);
            const height = Number(dr?.height);
            if (Number.isNaN(width) || Number.isNaN(height)) {
                return;
            }
            const size = view.getDesignResolutionSize();
            if (size && size.width === width && size.height === height) {
                return; // 未变化，无需处理
            }
            // 保持与场景进程启动时一致的 ResolutionPolicy
            view.setDesignResolutionSize(width, height, view.getResolutionPolicy());
            // 手动对齐已打开场景里的 Canvas（编辑器模式不会自动响应 design-resolution-changed）
            const scene = director.getScene();
            if (scene) {
                const canvases = (scene as any).getComponentsInChildren('cc.Canvas') as any[];
                canvases.forEach((canvas) => {
                    if (!canvas || !canvas.node) {
                        return;
                    }
                    // 带 Widget 的 Canvas 由 Widget 对齐；未激活/未启用的跳过
                    if (canvas.node.getComponent('cc.Widget') || !canvas.node.active || !canvas.enabled) {
                        return;
                    }
                    canvas.fitDesignResolution_EDITOR?.();
                });
            }
            void this.repaintInEditMode();
        } catch (error) {
            console.debug('[Engine] syncDesignResolution failed:', error);
        }
    }

    public async initCustomLayer(layers?: ICustomLayerConfig[]) {
        if (!Array.isArray(layers)) {
            return;
        }

        for (let i = USER_LAYER_MIN_BIT; i <= USER_LAYER_MAX_BIT; i++) {
            cc.Layers.deleteLayer(i);
        }

        layers.forEach((layer) => {
            const index = layerMask.findIndex((num) => layer.value === num);
            if (index !== -1) {
                cc.Layers.addLayer(layer.name, index);
            }
        });
    }

    /**
     * 运行时重建物理碰撞分组枚举（cc.internal.PhysicsGroup / PhysicsGroup2D）。
     *
     * 分组只在 cc.game.init 时从 physics.collisionGroups 读一次并生成枚举，改配置后不重建就要重启 IDE
     * （属性面板 Group 下拉的 enumList 直接来自该枚举）。这里对齐 cocos-editor 的 updatePhysicsGroup：
     * 用 cc.Enum.update 就地更新枚举，再对当前选中节点广播 node:change，让属性面板重新 dump 拿到新分组。
     *
     * 与 cocos-editor 不同点：这里按「内置 DEFAULT + 当前分组」完整重建，先清掉所有旧的用户分组条目，
     * 以支持分组的删除 / 重命名（editor 只做覆盖，删除后残留旧项）。
     */
    public updatePhysicsGroup(groups: { index: number; name: string }[] = []) {
        const internal = (cc as any).internal;
        const enums = [internal?.PhysicsGroup, internal?.PhysicsGroup2D].filter(Boolean);
        if (!enums.length) {
            return;
        }

        // 引擎内置 DEFAULT 分组（PhysicsGroup / PhysicsGroup2D 均为 1<<0），恒定保留
        const DEFAULT_VALUE = 1 << 0;

        // 目标用户分组（name→value）
        const desired: Record<string, number> = {};
        (groups || []).forEach((group) => {
            if (!group || typeof group.index !== 'number' || !group.name) {
                return;
            }
            desired[group.name] = 1 << group.index;
        });

        enums.forEach((e: any) => {
            // 先移除所有非内置（DEFAULT）的旧用户分组条目，含 name→value 与 value→name 反向映射，
            // 这样删除 / 重命名的分组不会残留。__enums__ 必须保留，否则 Enum.isEnum 失败、Enum.update 抛错。
            for (const key of Object.keys(e)) {
                if (key === '__enums__') {
                    continue;
                }
                const v = e[key];
                if (typeof v === 'number') {
                    // name → value 条目
                    if (v !== DEFAULT_VALUE) {
                        delete e[key];
                    }
                } else if (typeof v === 'string') {
                    // value → name 反向映射
                    if (Number(key) !== DEFAULT_VALUE) {
                        delete e[key];
                    }
                }
            }
            Object.assign(e, desired);
            cc.Enum.update(e);
        });

        // 通知属性面板重新 dump，刷新 Group 下拉。
        // 关键：仅「路径级」node:change 只刷新属性“值”，不会重取 enumList（元数据）；必须像 setProperty
        // 那样带上具体属性的 propPath（node.components 里碰撞体的 group），面板才会重 dump 该属性、更新下拉
        // 选项。这与用户“切换 group 后才出现新分组”走的是同一条通道。
        const NodeMgr = ((cc as any).EditorExtends || (globalThis as any).EditorExtends)?.Node;
        const selection = queryRegisteredService<{ query?: () => string[] }>('Selection');
        const paths: string[] = selection?.query?.() ?? [];
        for (const path of paths) {
            if (!path) {
                continue;
            }
            const node: any = NodeMgr?.getNodeByPath?.(path);
            if (!node) {
                // 定位不到节点时，退回路径级 node:change
                ServiceEvents.broadcast('node:change', path);
                continue;
            }
            const comps: any[] = node.components || [];
            let matched = false;
            comps.forEach((comp, index) => {
                // 碰撞体（Collider / Collider2D）用 group 属性引用 PhysicsGroup 枚举
                if (comp && typeof comp.group === 'number') {
                    matched = true;
                    ServiceEvents.emit('node:change', node, { type: NodeEventType.SET_PROPERTY, propPath: `_components.${index}.group` });
                }
            });
            if (!matched) {
                // 选中节点上没有碰撞体：仍发一次路径级 node:change 兜底
                ServiceEvents.broadcast('node:change', path);
            }
        }
    }

    public setFrameRate(fps: number) {
        this._maxDeltaTimeInEM = 1 / fps;
    }

    public startTick() {
        if (this._setTimeoutId === null) {
            this._tick();
        }
    }

    public stopTick() {
        this.clearTimeout();
    }

    public tickInEditMode(deltaTime: number) {
        this._tickedFrameInEM = director.getTotalFrames();

        if (this.geometryRenderer) {
            this.geometryRenderer.flush();
        }
        director.tick(deltaTime);
    }

    public getGeometryRenderer() {
        return this.geometryRenderer;
    }

    public enterState(state: NeedAnimState) {
        this._stateRecord |= 1 << state;
        this._updateTickState();
    }

    public exitState(state: NeedAnimState) {
        this._stateRecord &= ~(1 << state);
        this._updateTickState();
    }

    public enterAnimationMode() {
        this.enterState(NeedAnimState.ANIMATION_MODE);
    }

    public exitAnimationMode() {
        this.exitState(NeedAnimState.ANIMATION_MODE);
    }

    public resume() {
        this._paused = false;
        this.startTick();
    }

    public pause() {
        this.stopTick();
        this._paused = true;
    }


    // 与 cocos-editor 一致：检查节点是否含有粒子/地形组件，控制连续 tick
    public checkToSetAnimState(nodes: Node[]) {
        let hasParticleComp = false;
        let hasTerrain = false;
        nodes.forEach((node: Node) => {
            if (node && node.components) {
                node.components.forEach((component: Component) => {
                    const className = cc.js.getClassName(component);
                    if (className === 'cc.ParticleSystem' || className === 'cc.ParticleSystem2D') {
                        hasParticleComp = true;
                    } else if (className === 'cc.Terrain') {
                        hasTerrain = true;
                    }
                });
            }
        });

        if (hasParticleComp) {
            this.enterState(NeedAnimState.PARTICLE_SYSTEM_MODE);
        } else {
            this.exitState(NeedAnimState.PARTICLE_SYSTEM_MODE);
        }

        if (hasTerrain) {
            this.enterState(NeedAnimState.TERRAIN_SYSTEM_MODE);
        } else {
            this.exitState(NeedAnimState.TERRAIN_SYSTEM_MODE);
        }
    }

    private _tick() {
        try {
            if (this._paused) return;
            this.setTimeout(this._bindTick, tickTime);
            const now = performance.now() / 1000;
            Time.update(now, false, this._maxDeltaTimeInEM);

            if (this._isTickAllowed()) {
                this._shouldRepaintInEM = false;
                this.tickInEditMode(Time.deltaTime);
                this.broadcast('engine:update');

                // Dispatch per-frame updates to Camera and Gizmo services
                try { Service.Camera?.onUpdate?.(Time.deltaTime); } catch { /* not registered yet */ }
                try { Service.Gizmo?.onUpdate?.(Time.deltaTime); } catch { /* not registered yet */ }
            }
            this.broadcast('engine:ticked');
        } catch (e) {
            console.error(e);
        }
    }

    private _updateTickState() {
        this._tickInEM = this._stateRecord > 0;
    }

    private _isTickAllowed() {
        return this._sceneTick || this._shouldRepaintInEM || this._tickInEM;
    }

    public get capture() {
        return this._capture;
    }
    public set capture(b: boolean) {
        this._capture = b;
    }

    private _getNodeByPath(path: string): Node | null {
        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        return EditorExtends?.Node?.getNodeByPath?.(path) ?? null;
    }

    private _getNodeByUuid(uuid: string): Node | null {
        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        return EditorExtends?.Node?.getNode?.(uuid) ?? null;
    }

    //

    onEditorOpened() {
        void this.repaintInEditMode();
    }

    onEditorClosed() {
        this._nodeChangeTimer.clear();
        void this.repaintInEditMode();
    }

    onEditorReload() {
        void this.repaintInEditMode();
    }

    onNodeChanged(node: Node, opts?: any) {
        this._nodeChangeTimer.callFunctionLimit(node.uuid, this._doNodeChanged.bind(this), node, opts);
    }

    private _doNodeChanged(node: Node, opts?: any) {
        const type = opts?.type;
        if (type === NodeEventType.TRANSFORM_CHANGED ||
            type === NodeEventType.SIZE_CHANGED ||
            type === NodeEventType.ANCHOR_CHANGED ||
            type === NodeEventType.COMPONENT_CHANGED ||
            type === NodeEventType.PARENT_CHANGED ||
            type === NodeEventType.CHILD_CHANGED) {
            // 与 cocos-editor 一致：这些类型不需要重新检查状态
        } else {
            this.checkToSetAnimState([node]);
        }
        void this.repaintInEditMode();
    }

    onComponentAdded(comp: Component) {
        const nodeUuids = Service.Selection?.query?.() ?? [];
        if (comp.node && nodeUuids.includes(comp.node.uuid)) {
            this.checkToSetAnimState([comp.node]);
            if (this._isParticleSystem3D(comp) && !(comp as any).isPlaying) {
                (comp as any).play();
            }
        }
        void this.repaintInEditMode();
    }

    onComponentRemoved(comp: Component) {
        const nodeUuids = Service.Selection?.query?.() ?? [];
        if (comp.node && nodeUuids.includes(comp.node.uuid)) {
            this.checkToSetAnimState([comp.node]);
        }
        void this.repaintInEditMode();
    }

    onSetPropertyComponent() {
        void this.repaintInEditMode();
    }

    // 与 cocos-editor SceneSelection 一致：选中/反选时检查粒子/地形组件
    onSelectionSelect(path: string, paths: string[]) {
        const nodes: Node[] = [];
        for (const p of paths) {
            const node = this._getNodeByPath(p);
            if (node) nodes.push(node);
        }
        this.checkToSetAnimState(nodes);
        const uuids = nodes.map(n => n.uuid);
        this._playParticlesOnSelect(uuids);
        void this.repaintInEditMode();
    }

    onSelectionUnselect(path: string, paths: string[]) {
        const unselectedNode = this._getNodeByPath(path);
        const nodes: Node[] = [];
        for (const p of paths) {
            const node = this._getNodeByPath(p);
            if (node) nodes.push(node);
        }
        const remaining = nodes.filter(n => n !== unselectedNode);
        this.checkToSetAnimState(remaining);
        const uuids = nodes.map(n => n.uuid);
        this._pauseParticlesOnUnselect(uuids);
        void this.repaintInEditMode();
    }

    onSelectionClear() {
        this.checkToSetAnimState([]);
        this._stopAllParticles();
        void this.repaintInEditMode();
    }

    // 与 cocos-editor ParticleManager 一致：选中时播放粒子系统
    private _playParticlesOnSelect(uuids: string[]) {
        this._particleSelectedUUIDs = uuids.slice();
        const components = this._getSelectedParticleSystems();
        const willPlay = components.some(item => !this._stoppedParticleSet.has(item));
        if (willPlay) {
            components.forEach(item => this._stoppedParticleSet.delete(item));
        }
        components.forEach((ps: any) => {
            if (!ps.isPlaying && !this._stoppedParticleSet.has(ps)) {
                ps.play();
            }
        });
    }

    // 与 cocos-editor ParticleManager 一致：取消选中时暂停粒子系统
    private _pauseParticlesOnUnselect(uuids: string[]) {
        this._getSelectedParticleSystems().forEach((ps: any) => {
            if (!uuids.includes(ps.node.uuid) && ps.isPlaying) {
                ps.pause();
            }
        });
        this._particleSelectedUUIDs = uuids.slice();
    }

    private _stopAllParticles() {
        this._getSelectedParticleSystems().forEach((ps: any) => {
            if (ps.isPlaying) {
                ps.stop();
            }
        });
        this._particleSelectedUUIDs = [];
    }

    // 与 cocos-editor ParticleManager.getSelectedParticleSystemComponents 一致
    private _getSelectedParticleSystems(): Component[] {
        const result: Component[] = [];

        const addUnique = (comps: Component[]) => {
            for (const comp of comps) {
                if (!result.includes(comp)) {
                    result.push(comp);
                }
            }
        };

        const collectInChildren = (node: Node): Component[] => {
            const found: Component[] = [];
            if (node.components) {
                for (const comp of node.components) {
                    if (this._isParticleSystem3D(comp)) {
                        found.push(comp);
                    }
                }
            }
            if (node.children) {
                for (const child of node.children) {
                    found.push(...collectInChildren(child));
                }
            }
            return found;
        };

        const recursivelyAdd = (node: Node) => {
            const hasParticle = node.components?.some((c: Component) => this._isParticleSystem3D(c));
            if (hasParticle) {
                const parent = node.parent;
                if (parent && parent.components?.some((c: Component) => this._isParticleSystem3D(c))) {
                    recursivelyAdd(parent);
                } else {
                    addUnique(collectInChildren(node));
                }
            }
        };

        for (const uuid of this._particleSelectedUUIDs) {
            const node = this._getNodeByUuid(uuid);
            if (node) {
                recursivelyAdd(node);
            }
        }

        return result.filter((comp: any) => comp.enabled);
    }

    // 与 cocos-editor ParticleManager 一致：只处理 3D ParticleSystem
    // ParticleSystem2D 通过 onFocusInEditor → _startPreview 自行处理
    private _isParticleSystem3D(comp: Component): boolean {
        return cc.js.getClassName(comp) === 'cc.ParticleSystem';
    }

}

export { NeedAnimState };
