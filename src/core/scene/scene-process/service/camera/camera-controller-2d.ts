import { Camera, Color, ISizeLike, Node, Quat, Rect, Vec3, MeshRenderer, SpriteRenderer, UITransform, gfx } from 'cc';
import CameraControllerBase, { EditorCameraInfo } from './camera-controller-base';
import { CameraMoveMode, CameraUtils } from './utils';
import FiniteStateMachine from '../utils/state-machine/finite-state-machine';
import Grid from './grid';
import { ModeBase2D } from './modes/mode-base-2d';
import { IdleMode2D } from './modes/idle-mode-2d';
import { PanMode2D } from './modes/pan-mode-2d';
import { tweenPosition } from './tween';
import type { ISceneMouseEvent, ISceneKeyboardEvent } from '../operation/types';

function getCanvasSize(): ISizeLike {
    const canvas = (cc as any).game?.canvas;
    if (canvas) {
        return { width: canvas.width, height: canvas.height };
    }
    return { width: 1280, height: 720 };
}

const _defaultMarginPercentage = 30;
const _maxTicks = 100;

function clamp(val: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, val));
}

enum ModeCommand {
    ToIdle = 'toIdle',
    ToPan = 'toPan',
}

export class CameraController2D extends CameraControllerBase {
    private _size: ISizeLike = { width: 1920, height: 1080 };
    private _modeFSM!: FiniteStateMachine<ModeBase2D>;
    private _idleMode!: IdleMode2D;
    private _panMode!: PanMode2D;
    private _lineColor = cc.color().fromHEX('#555555');
    private _grid!: Grid;
    private _contentRect!: Rect;
    private _scale2D = 1;

    protected _wheelSpeed = 6;
    protected _near = 1;
    protected _far = 10000;

    // 空格键跟踪，用于切换平移模式
    private _spaceKeyHeld = false;

    // 动画状态
    private _posAnim: any = null;

    isMoving(): boolean {
        return this._modeFSM.currentState !== this._idleMode;
    }

    get lineColor() { return this._lineColor; }
    set lineColor(value: Color) { this._lineColor = value; }
    get grid() { return this._grid; }
    get contentRect(): Rect { return this._contentRect; }
    get scale2D(): number { return this._scale2D; }

    /**
     * 同步 scale2D 到 Gizmo（如果可用）
     */
    private setScale2D(value: number) {
        this._scale2D = value;
        try {
            const { Service } = require('../core/decorator');
            if (Service.Gizmo?.transformToolData) {
                Service.Gizmo.transformToolData.scale2D = value;
            }
        } catch (e) {
            // Gizmo not ready
        }
    }

    showGrid(visible: boolean) {
        super.showGrid(visible);
        if (this._originAxisHorizontalMeshComp?.node) {
            this._originAxisHorizontalMeshComp.node.active = visible;
        }
    }

    init(camera: Camera) {
        super.init(camera);
        this._size = getCanvasSize();
        this._contentRect = new Rect(0, 0, this._size.width, this._size.height);
        this._gridMeshComp = CameraUtils.createGrid('internal/editor/grid-2d', this.node.parent!);
        this._gridMeshComp.node.active = false;
        this._initGrid();
        this._initMode();
        this.initOriginAxis();
    }

    // ---------- 模式状态机 ----------

    private _initMode() {
        this._idleMode = new IdleMode2D(this);
        this._panMode = new PanMode2D(this);

        const modes = [this._idleMode, this._panMode];
        this._modeFSM = new FiniteStateMachine<ModeBase2D>(modes);

        // idle <-> pan 双向转换
        this._modeFSM.addTransition(this._idleMode, this._panMode, ModeCommand.ToPan);
        this._modeFSM.addTransition(this._panMode, this._idleMode, ModeCommand.ToIdle);

        this._modeFSM.Begin(this._idleMode);
    }

    // ---------- 网格初始化 ----------

    private _initGrid() {
        const grid = new Grid(this._size.width, this._size.height);
        grid.setScaleH([5, 2], 0.01, 5000);
        grid.setMappingH(0, 1, 1);
        grid.setScaleV([5, 2], 0.01, 5000);
        grid.setMappingV(1, 0, 1);
        grid.setAnchor(0.5, 0.5);
        this._grid = grid;
    }

    // ---------- active ----------

    set active(value: boolean) {
        if (value) {
            // 正交投影
            this._camera.projection = Camera.ProjectionType.ORTHO;
            // 重置旋转为单位四元数
            this.node.setWorldRotation(Quat.IDENTITY);
            this._camera.near = this._near;
            this._camera.far = this._far;
            this.onResize();
            this.showGrid(true);
        } else {
            this.showGrid(false);
        }
    }

    // ---------- 调整到中心 ----------

    private _adjustToCenter(marginPercentage = _defaultMarginPercentage, contentBounds: Rect | null = null, immediate = false, forceScale?: number) {
        let contentX = 0;
        let contentY = 0;
        let contentWidth = 0;
        let contentHeight = 0;

        if (contentBounds) {
            contentX = contentBounds.x;
            contentY = contentBounds.y;
            contentWidth = contentBounds.width;
            contentHeight = contentBounds.height;
        } else {
            contentWidth = this._size.width;
            contentHeight = this._size.height;
        }

        let scale = forceScale ?? 1;
        const leftMargin = (marginPercentage / 100) * this._size.width;
        const rightMargin = (marginPercentage / 100) * this._size.height;
        const fitW = this._size.width - leftMargin;
        const fitH = this._size.height - rightMargin;

        if (!forceScale) {
            if (contentWidth <= fitW && contentHeight <= fitH) {
                if (contentWidth === 0 || contentHeight === 0) {
                    scale = 1;
                } else {
                    const targetAspect = contentWidth / contentHeight;
                    const displayAspect = fitW / fitH;
                    if (targetAspect > displayAspect) {
                        scale = fitW / contentWidth;
                    } else {
                        scale = fitH / contentHeight;
                    }
                    contentWidth = contentWidth * scale;
                    contentHeight = contentHeight * scale;
                }
            } else {
                const result = this._fitSizeCalc(contentWidth, contentHeight, fitW, fitH);
                scale = this._getSizeScale(result[0], result[1], contentWidth, contentHeight);
                contentWidth = result[0];
                contentHeight = result[1];
            }
        }

        this.setScale2D(scale);

        const gridX = ((this._size.width - contentWidth) / 2 - contentX * scale) * this._grid.xDirection;
        const gridY = ((this._size.height - contentHeight) / 2 - contentY * scale) * this._grid.yDirection;
        this._grid.xAxisSync(gridX, scale);
        this._grid.yAxisSync(gridY, scale);
        this.updateGrid();
        this.adjustCamera(immediate);

        if (contentBounds) {
            this._contentRect.x = contentX;
            this._contentRect.y = contentY;
            this._contentRect.width = contentWidth;
            this._contentRect.height = contentHeight;
        }
    }

    private _fitSizeCalc(srcWidth: number, srcHeight: number, destWidth: number, destHeight: number): [number, number] {
        let width = 0;
        let height = 0;
        if (srcWidth > destWidth && srcHeight > destHeight) {
            width = destWidth;
            height = (srcHeight * destWidth) / srcWidth;
            if (height > destHeight) {
                height = destHeight;
                width = (srcWidth * destHeight) / srcHeight;
            }
        } else if (srcWidth > destWidth) {
            width = destWidth;
            height = (srcHeight * destWidth) / srcWidth;
        } else if (srcHeight > destHeight) {
            width = (srcWidth * destHeight) / srcHeight;
            height = destHeight;
        } else {
            width = srcWidth;
            height = srcHeight;
        }
        return [width, height];
    }

    private _getSizeScale(newWidth: number, newHeight: number, oldWidth: number, oldHeight: number): number {
        const scaleWidth = oldWidth <= 0 ? 1 : newWidth / oldWidth;
        const scaleHeight = oldHeight <= 0 ? 1 : newHeight / oldHeight;
        return Math.max(scaleWidth, scaleHeight);
    }

    // ---------- adjustCamera ----------

    adjustCamera(immediate = true) {
        if (!this._camera) return;

        const scale = this._scale2D;
        const grid = this._grid;
        const sceneX = grid.xDirection * grid.xAxisOffset;
        const sceneY = grid.yDirection * grid.yAxisOffset;

        // 反向计算出 contentRect，与编辑器一致
        this._contentRect.x = ((this._size.width - this._contentRect.width) / 2 - grid.xAxisOffset / grid.xDirection) / scale;
        this._contentRect.y = ((this._size.height - this._contentRect.height) / 2 - grid.yAxisOffset / grid.yDirection) / scale;
        this._contentRect.width = this._size.width;
        this._contentRect.height = this._size.height;

        const targetPos = new Vec3(
            this._size.width / 2 / scale - sceneX / scale,
            this._size.height / 2 / scale - sceneY / scale,
            5000,
        );

        if (immediate) {
            this.node.setWorldPosition(targetPos);
        } else {
            const startPos = this.node.getWorldPosition().clone();
            this._posAnim = tweenPosition(startPos, targetPos, 300);
            this._posAnim.step((pos: Vec3) => {
                this.node.setWorldPosition(pos);
            });
        }

        this._updateOrthoHeight(scale);

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    // ---------- 更新正交高度 ----------

    private _updateOrthoHeight(scale: number) {
        if (scale > 0) {
            this._camera.orthoHeight = this._size.height / 2 / scale;
        }
    }

    // ---------- 网格数据更新 ----------

    private _updateGridData() {
        this._grid.updateRange();

        const positions: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];

        const left = this._grid.left;
        const right = this._grid.right;
        const top = this._grid.top;
        const bottom = this._grid.bottom;

        const r = this._lineColor.r / 255;
        const g = this._lineColor.g / 255;
        const b = this._lineColor.b / 255;
        const baseAlpha = this._lineColor.a / 255;

        let idx = 0;

        // 竖线 (hTicks)
        if (this._grid.hTicks) {
            for (let level = this._grid.hTicks.minTickLevel; level <= this._grid.hTicks.maxTickLevel; level++) {
                const ticks = this._grid.hTicks.ticksAtLevel(level, true);
                const ratio = this._grid.hTicks.tickRatios[level];
                const alpha = baseAlpha * ratio;

                for (const tick of ticks) {
                    if (idx + 2 > _maxTicks * _maxTicks) break;
                    // 如果显示了中心轴，就跳过绘制网格的垂直中线
                    if (this.originAxisY_Visible && 0 === tick) continue;
                    // 竖线：固定 x，从 bottom 到 top
                    positions.push(tick, bottom);
                    colors.push(r, g, b, alpha);
                    idx++;

                    positions.push(tick, top);
                    colors.push(r, g, b, alpha);
                    idx++;
                }
            }
        }

        // 横线 (vTicks)
        if (this._grid.vTicks) {
            for (let level = this._grid.vTicks.minTickLevel; level <= this._grid.vTicks.maxTickLevel; level++) {
                const ticks = this._grid.vTicks.ticksAtLevel(level, true);
                const ratio = this._grid.vTicks.tickRatios[level];
                const alpha = baseAlpha * ratio;

                for (const tick of ticks) {
                    if (idx + 2 > _maxTicks * _maxTicks) break;
                    // 如果显示了中心轴，就跳过绘制网格的横向中线
                    if (this.originAxisX_Visible && 0 === tick) continue;
                    // 横线：固定 y，从 left 到 right
                    positions.push(left, tick);
                    colors.push(r, g, b, alpha);
                    idx++;

                    positions.push(right, tick);
                    colors.push(r, g, b, alpha);
                    idx++;
                }
            }
        }

        // 填充剩余为零
        while (idx < _maxTicks * _maxTicks) {
            positions.push(0, 0);
            colors.push(0, 0, 0, 0);
            idx++;
        }

        // 构建索引
        for (let i = 0; i < _maxTicks * _maxTicks; i++) {
            indices.push(i);
        }

        return { positions, colors, indices };
    }

    updateGrid() {
        if (!this._gridMeshComp) return;

        const { positions, colors, indices } = this._updateGridData();

        CameraUtils.updateVBAttr(this._gridMeshComp, 'a_position', positions);
        CameraUtils.updateVBAttr(this._gridMeshComp, gfx.AttributeName.ATTR_COLOR, colors);
        CameraUtils.updateIB(this._gridMeshComp, indices);

        this.updateOriginAxis();
    }

    // ---------- 原点轴 ----------

    private initOriginAxis() {
        const parentNode = this.node.parent || this.node;
        this._originAxisHorizontalMeshComp = CameraUtils.createGrid('internal/editor/grid-2d', parentNode);
        this.originAxisX_Visible = true;
        this.originAxisY_Visible = true;
        this._originAxisHorizontalMeshComp.node.active = false;
    }

    updateOriginAxisByConfig(config: { x?: boolean; y?: boolean }, update = true) {
        if (config.x !== undefined) this.originAxisX_Visible = config.x;
        if (config.y !== undefined) this.originAxisY_Visible = config.y;

        const showAxis = this.originAxisX_Visible || this.originAxisY_Visible;
        if (this._originAxisHorizontalMeshComp?.node) {
            this._originAxisHorizontalMeshComp.node.active = showAxis;
        }

        if (update) {
            this.updateOriginAxis();
        }

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    updateOriginAxis() {
        if (!this._originAxisHorizontalMeshComp?.node?.active) return;

        const left = this._grid.left;
        const right = this._grid.right;
        const top = this._grid.top;
        const bottom = this._grid.bottom;

        const positions: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];

        if (this.originAxisX_Visible) {
            const lineLeft = Math.fround(Math.min(left, right)) - 100;
            const lineRight = Math.fround(Math.max(left, right)) + 100;
            positions.push(lineLeft, 0, lineRight, 0);
            const c = this.originAxisX_Color;
            colors.push(c.x, c.y, c.z, c.w, c.x, c.y, c.z, c.w);
        }

        if (this.originAxisY_Visible) {
            const lineTop = Math.fround(Math.min(top, bottom)) - 100;
            const lineBottom = Math.fround(Math.max(top, bottom)) + 100;
            positions.push(0, lineTop, 0, lineBottom);
            const c = this.originAxisY_Color;
            colors.push(c.x, c.y, c.z, c.w, c.x, c.y, c.z, c.w);
        }

        if (positions.length > 0) {
            for (let i = 0; i < positions.length; i += 2) {
                indices.push(i / 2);
            }
            CameraUtils.updateVBAttr(this._originAxisHorizontalMeshComp, gfx.AttributeName.ATTR_POSITION, positions);
            CameraUtils.updateVBAttr(this._originAxisHorizontalMeshComp, gfx.AttributeName.ATTR_COLOR, colors);
            CameraUtils.updateIB(this._originAxisHorizontalMeshComp, indices);
        }

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    // ---------- 焦点 ----------

    focus(nodeUuids: string[], editorCameraInfo?: EditorCameraInfo, immediate = false) {
        const { contentRect, scale } = editorCameraInfo || {} as any;
        let contentBounds: Rect | null = null;

        if (contentRect) {
            contentBounds = new Rect(contentRect.x, contentRect.y, contentRect.width, contentRect.height);
        } else if (nodeUuids && nodeUuids.length > 0) {
            const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
            if (!EditorExtends) return;

            let maxX = -1e10;
            let maxY = -1e10;
            let minX = 1e10;
            let minY = 1e10;

            for (const uuid of nodeUuids) {
                const node = EditorExtends.Node.getNode(uuid);
                if (!node) continue;

                const uiTransform = node.getComponent(UITransform) as UITransform | null;
                if (uiTransform) {
                    const bounds = uiTransform.getBoundingBoxToWorld();
                    maxX = Math.max(bounds.xMax, maxX);
                    maxY = Math.max(bounds.yMax, maxY);
                    minX = Math.min(bounds.xMin, minX);
                    minY = Math.min(bounds.yMin, minY);
                } else {
                    const meshRenderer = node.getComponent(MeshRenderer) as MeshRenderer | null
                        || node.getComponent(SpriteRenderer) as any;
                    if (meshRenderer && meshRenderer.model && meshRenderer.model.worldBounds) {
                        const b = meshRenderer.model.worldBounds;
                        minX = Math.min(minX, b.center.x - b.halfExtents.x);
                        minY = Math.min(minY, b.center.y - b.halfExtents.y);
                        maxX = Math.max(maxX, b.center.x + b.halfExtents.x);
                        maxY = Math.max(maxY, b.center.y + b.halfExtents.y);
                    } else {
                        const worldPos = node.getWorldPosition();
                        maxX = Math.max(worldPos.x, maxX);
                        maxY = Math.max(worldPos.y, maxY);
                        minX = Math.min(worldPos.x, minX);
                        minY = Math.min(worldPos.y, minY);
                    }
                }
            }
            if (minX < maxX && minY < maxY) {
                contentBounds = new Rect(minX, minY, maxX - minX, maxY - minY);
            }
        }

        this._adjustToCenter(_defaultMarginPercentage, contentBounds, immediate, scale);
    }

    // ---------- 缩放 ----------

    smoothScale(delta: number, curScale: number): number {
        return Math.pow(2, delta * 0.002) * curScale;
    }

    scale(delta: number, offsetX?: number, offsetY?: number) {
        const width = this._size.width;
        const height = this._size.height;

        let newScale = this.smoothScale(delta * this._wheelSpeed, this._scale2D);

        if (this._grid.hTicks) {
            newScale = clamp(newScale, this._grid.hTicks.minValueScale, this._grid.hTicks.maxValueScale);
        }

        const px = offsetX !== undefined ? offsetX : width / 2;
        const py = offsetY !== undefined ? offsetY : height / 2;

        this._grid.xAxisScaleAt(px, newScale);
        this._grid.yAxisScaleAt(py, newScale);

        this.setScale2D(newScale);
        this.updateGrid();
        this.adjustCamera();
    }

    // ---------- fitSize ----------

    fitSize(rect: Rect) {
        this._adjustToCenter(_defaultMarginPercentage, rect, true);
    }

    onMouseDown(event: ISceneMouseEvent) {
        // 中键、右键或 view 模式下 → 进入平移模式（与编辑器一致）
        let isViewMode = false;
        try {
            const { Service } = require('../core/decorator');
            isViewMode = !!Service.Gizmo?.isViewMode;
        } catch (e) {
            // Gizmo not ready
        }
        if (event.middleButton || event.rightButton || isViewMode) {
            void this._modeFSM.issueCommand(ModeCommand.ToPan);
            return false;
        }

        const currentMode = this._modeFSM.currentState as ModeBase2D;
        return currentMode.onMouseDown(event);
    }

    onMouseMove(event: ISceneMouseEvent) {
        const currentMode = this._modeFSM.currentState as ModeBase2D;
        currentMode.onMouseMove(event);

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    onMouseUp(event: ISceneMouseEvent) {
        // 与编辑器一致：Pan 模式下松开按键直接回 Idle（除非空格保持）
        if (this._modeFSM.currentState !== this._idleMode && !this._spaceKeyHeld) {
            void this._modeFSM.issueCommand(ModeCommand.ToIdle);
            return false;
        }

        const currentMode = this._modeFSM.currentState as ModeBase2D;
        return currentMode.onMouseUp(event);
    }

    onMouseWheel(event: ISceneMouseEvent) {
        const delta = event.wheelDeltaY * this._wheelBaseScale;
        this.scale(delta, event.x, event.y);

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    onMouseDBlDown(event: ISceneMouseEvent) {
        const currentMode = this._modeFSM.currentState as ModeBase2D;
        currentMode.onMouseDBlDown(event);
    }

    onKeyDown(event: ISceneKeyboardEvent) {
        // 空格键切换到平移模式
        if (event.key === ' ' || event.code === 'Space') {
            this._spaceKeyHeld = true;
            void this._modeFSM.issueCommand(ModeCommand.ToPan);
        }

        const currentMode = this._modeFSM.currentState as ModeBase2D;
        currentMode.onKeyDown(event);
    }

    onKeyUp(event: ISceneKeyboardEvent) {
        // 释放空格键返回空闲模式
        if (event.key === ' ' || event.code === 'Space') {
            this._spaceKeyHeld = false;
            void this._modeFSM.issueCommand(ModeCommand.ToIdle);
        }

        const currentMode = this._modeFSM.currentState as ModeBase2D;
        currentMode.onKeyUp(event);
    }

    onUpdate(deltaTime: number) {
        const currentMode = this._modeFSM.currentState as ModeBase2D;
        currentMode.onUpdate(deltaTime);
    }

    // ---------- onResize ----------

    onResize(size?: ISizeLike) {
        size ??= getCanvasSize();
        this._size = size;
        const width = this._size.width;
        const height = this._size.height;
        this._grid.resize(width, height);
        this.updateGrid();
        this.adjustCamera();
    }

    // ---------- refresh ----------

    refresh() {
        this.updateGrid();
        this.adjustCamera();
        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    // ---------- 缩放快捷键 ----------

    zoomTo(scaleValue: number) {
        const width = this._size.width;
        const height = this._size.height;
        const px = width / 2;
        const py = height / 2;

        let finalScale = scaleValue;
        if (this._grid.hTicks) {
            finalScale = clamp(finalScale, this._grid.hTicks.minValueScale, this._grid.hTicks.maxValueScale);
        }

        this._grid.xAxisScaleAt(px, finalScale);
        this._grid.yAxisScaleAt(py, finalScale);

        this.setScale2D(finalScale);
        this.updateGrid();
        this.adjustCamera();
    }

    zoomUp() {
        this.zoomTo(this._scale2D * 1.5);
    }

    zoomDown() {
        this.zoomTo(this._scale2D / 1.5);
    }

    zoomReset() {
        this.zoomTo(1);
    }

    onDesignResolutionChange() {
        this.updateGrid();
        this.adjustCamera();
    }
}

export default CameraController2D;
