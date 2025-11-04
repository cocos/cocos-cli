'use strict';

import Time from './engine/time';
import { director, GeometryRenderer as CCGeometryRenderer } from 'cc';
import { GeometryRenderer, methods as GeometryMethods } from './engine/geometry_renderer';
import { BaseService, register } from './core';
import { IEngineEvents, IEngineService } from '../../common';
import { Rpc } from '../rpc';

const tickTime = 1000 / 60;

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

    public resume() {
        this._paused = false;
        this.startTick();
    }

    public pause() {
        this.stopTick();
        this._paused = true;
    }

    private _tick() {
        if (this._paused) return;
        this.setTimeout(this._bindTick, tickTime);
        const now = performance.now() / 1000;
        Time.update(now, false, this._maxDeltaTimeInEM);

        if (this._isTickAllowed()) {
            this._shouldRepaintInEM = false;
            this.tickInEditMode(Time.deltaTime);
            this.broadcast('engine:update');
        }
        this.broadcast('engine:ticked');
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

    onNodeChanged() {
        void this.repaintInEditMode();
    }

    onComponentAdded() {
        void this.repaintInEditMode();
    }

    onComponentRemoved() {
        void this.repaintInEditMode();
    }

    onSetPropertyComponent() {
        void this.repaintInEditMode();
    }

}
