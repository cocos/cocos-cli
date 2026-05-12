'use strict';

import Time from './engine/time';
import { Component, director, GeometryRenderer as CCGeometryRenderer, Node } from 'cc';
import { GeometryRenderer, methods as GeometryMethods } from './engine/geometry_renderer';
import { BaseService, register } from './core';
import { Service } from './core/decorator';
import { IEngineEvents, IEngineService } from '../../common';
import { NodeEventType } from '../../common';
import { Rpc } from '../rpc';

const tickTime = 1000 / 60;

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
            // eslint-disable-next-line no-undef
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
            // eslint-disable-next-line no-undef
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
                try { Service.Camera?.onUpdate?.(Time.deltaTime); } catch (e) { /* not registered yet */ }
                try { Service.Gizmo?.onUpdate?.(Time.deltaTime); } catch (e) { /* not registered yet */ }
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
        void this.repaintInEditMode();
    }

    onEditorReload() {
        void this.repaintInEditMode();
    }

    onNodeChanged(node: Node, opts?: any) {
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
        const self = this;

        function addUnique(comps: Component[]) {
            for (const comp of comps) {
                if (!result.includes(comp)) {
                    result.push(comp);
                }
            }
        }

        function collectInChildren(node: Node): Component[] {
            const found: Component[] = [];
            if (node.components) {
                for (const comp of node.components) {
                    if (self._isParticleSystem3D(comp)) {
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
        }

        function recursivelyAdd(node: Node) {
            const hasParticle = node.components?.some((c: Component) => self._isParticleSystem3D(c));
            if (hasParticle) {
                const parent = node.parent;
                if (parent && parent.components?.some((c: Component) => self._isParticleSystem3D(c))) {
                    recursivelyAdd(parent);
                } else {
                    addUnique(collectInChildren(node));
                }
            }
        }

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
