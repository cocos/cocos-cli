'use strict';

import { CCObject, Color, IVec2Like, Layers, Mat4, Node, Quat, Rect, Size, UITransform, Vec2, Vec3 } from 'cc';
import type { GizmoMouseEvent } from '../utils/defines';
import TransformBaseGizmo from './transform-base';
import { RectangleController, RectHandleType as HandleType } from './rectangle-controller';
import { getRaycastResultNodes, getNodeWorldBounds, getNodeWorldOrientedBounds } from '../utils/node-utils';
import { rectTransformSnapping, SnapGuidelineGroup } from '../utils/rect-transform-snapping';
import LinesController from '../controller/lines';

function getService(): any {
    try {
        const { Service } = require('../../core/decorator');
        return Service;
    } catch (e) {
        return null;
    }
}

function toPrecision(val: number, n: number): number {
    const f = Math.pow(10, n);
    return Math.round(val * f) / f;
}

function makeVec3InPrecision(v: Vec3, p: number): Vec3 {
    const f = Math.pow(10, p);
    v.x = Math.round(v.x * f) / f;
    v.y = Math.round(v.y * f) / f;
    v.z = Math.round(v.z * f) / f;
    return v;
}

function boundsToRect(bounds: IVec2Like[]) {
    return new Rect(
        bounds[1].x, bounds[1].y,
        bounds[3].x - bounds[1].x,
        bounds[3].y - bounds[1].y,
    );
}

const tempVec2 = new Vec2();
const tempVec3 = new Vec3();
const tempMat4 = new Mat4();
const tempQuat_a = new Quat();

let _controller: RectangleController | null = null;
let _nodeSnapLinesCtrl!: LinesController;
let _canvasSnapLinesCtrl!: LinesController;
let _equalSpacingLinesCtrl!: LinesController;

class RectGizmo extends TransformBaseGizmo {
    declare protected _controller: RectangleController;

    private _worldPosList: Vec3[] = [];
    private _localPosList: Vec3[] = [];
    private _sizeList: Size[] = [];
    private _anchorList: Vec2[] = [];
    private _rectList: Rect[] = [];
    private _validTarget: UITransform[] = [];
    private _tempRect = new Rect();
    private _editRect = new Rect();
    private _altKey = false;
    private _shiftKey = false;

    // for snapping
    private _snapDistVec2 = new Vec2();
    private _nodeSnapLinesCtrl!: LinesController;
    private _canvasSnapLinesCtrl!: LinesController;
    private _equalSpacingLinesCtrl!: LinesController;

    init() {
        this.createController();
    }

    layer() {
        return 'foreground';
    }

    isNodePositionLocked(node: Node) {
        if (!node) {
            return false;
        }
        return node.components.some((component: any) => component._objFlags & CCObject.Flags.IsPositionLocked);
    }

    isNodeAnchorLocked(node: Node) {
        if (!node) {
            return false;
        }
        return node.components.some((component: any) => component._objFlags & CCObject.Flags.IsAnchorLocked);
    }

    isNodeContentSizeLocked(node: Node) {
        if (!node) {
            return false;
        }
        return node.components.some((component: any) => component._objFlags & CCObject.Flags.IsSizeLocked);
    }

    onTargetUpdate(): void {
        if (_controller) {
            this._controller = _controller;
            _controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
            _controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
            _controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
        }

        if (_nodeSnapLinesCtrl) {
            this._nodeSnapLinesCtrl = _nodeSnapLinesCtrl;
        }
        if (_canvasSnapLinesCtrl) {
            this._canvasSnapLinesCtrl = _canvasSnapLinesCtrl;
        }
        if (_equalSpacingLinesCtrl) {
            this._equalSpacingLinesCtrl = _equalSpacingLinesCtrl;
        }
        if (this._controller) {
            this._controller.editable = !!this.target;
        }
        super.onTargetUpdate();
    }

    createController() {
        if (_controller) {
            this._controller = _controller;
        } else {
            const gizmoRoot = this.getGizmoRoot();
            const rectCtrl = new RectangleController(gizmoRoot, { needAnchor: true });
            this._controller = _controller = rectCtrl;
        }
        const gizmoRoot = this.getGizmoRoot();

        this._controller.setColor(new Color(0, 153, 255));
        this._controller.setEditHandlesColor(new Color(0, 153, 255));

        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);

        this._controller.editable = !!this.target;

        if (_nodeSnapLinesCtrl) {
            this._nodeSnapLinesCtrl = _nodeSnapLinesCtrl;
        } else {
            this._nodeSnapLinesCtrl = _nodeSnapLinesCtrl = new LinesController(gizmoRoot);
        }
        if (_canvasSnapLinesCtrl) {
            this._canvasSnapLinesCtrl = _canvasSnapLinesCtrl;
        } else {
            this._canvasSnapLinesCtrl = _canvasSnapLinesCtrl = new LinesController(gizmoRoot);
        }
        if (_equalSpacingLinesCtrl) {
            this._equalSpacingLinesCtrl = _equalSpacingLinesCtrl;
        } else {
            this._equalSpacingLinesCtrl = _equalSpacingLinesCtrl = new LinesController(gizmoRoot, { dashed: true });
        }
    }

    onControllerMouseDown() {
        if (this._controller && this.nodes.length) {
            this._controller.contentSizeLocked = this.nodes.some(node => this.isNodeContentSizeLocked(node));
            this._controller.anchorLocked = this.nodes.some(node => this.isNodeAnchorLocked(node));
        }
        this._worldPosList.length = 0;
        this._localPosList.length = 0;
        this._sizeList.length = 0;
        this._anchorList.length = 0;
        this._rectList.length = 0;
        // 可能有不含 ui transform component 的 node 被选中，剔除掉
        this._validTarget.length = 0;

        const nodes = this.nodes;
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const uiTransComp = node.getComponent(UITransform);
            if (uiTransComp) {
                this._validTarget.push(uiTransComp);
                this._worldPosList.push(node.getWorldPosition());
                this._localPosList.push(node.getPosition());
                this._sizeList.push(uiTransComp.contentSize.clone());
                this._anchorList.push(uiTransComp.anchorPoint.clone());
                this._rectList.push(getNodeWorldBounds(node));
            }
        }

        const validNodes = this._validTarget.map(t => t.node);
        const bounds = this.getBounds(false, false, validNodes);
        this._tempRect = boundsToRect(bounds);

        const scale = this._controller.transformToolData?.scale2D ?? 1;
        const snapDist = rectTransformSnapping.snapThreshold / scale;
        this._snapDistVec2.x = snapDist;
        this._snapDistVec2.y = snapDist;

        if (rectTransformSnapping.enableSnapping) {
            // 暂时只处理单选情况
            const node = this.nodes[0];
            if (node && node.parent) {
                rectTransformSnapping.calculateNodeSnapGuidelines(node.parent, node);
                rectTransformSnapping.calculateCanvasSnapGuidelines();
                rectTransformSnapping.calculateSpacingSnapGuidelines(node.parent, node);
            }
        }
    }

    onControllerMouseMove() {
        this.updateDataFromController();
    }

    onControllerMouseUp(event: GizmoMouseEvent) {
        if (this._controller.updated) {
            this.onControlEnd('position');
        } else {
            const svc = getService();
            const selected: string[] = svc?.Selection?.query?.() ?? [];
            if (selected.length === 1) {
                const camera = svc?.Camera?.getCamera?.()?.camera;
                const mask = Layers.makeMaskExclude([Layers.Enum.GIZMOS, Layers.Enum.SCENE_GIZMO]);
                const results = getRaycastResultNodes(camera, event.x, event.y, mask);
                const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
                const firstSelection = selected[0];
                for (let i = 0; i < results.length; i++) {
                    const resultPath = EditorExtends?.Node?.getNodePath?.(results[i]) ?? '';
                    if (results[i] && firstSelection === resultPath) {
                        if (i === results.length - 1) {
                            const nextPath = EditorExtends?.Node?.getNodePath?.(results[0]) ?? '';
                            svc?.Selection?.unselect?.(firstSelection);
                            if (nextPath) svc?.Selection?.select?.(nextPath);
                        } else if (results[i + 1]) {
                            const nextPath = EditorExtends?.Node?.getNodePath?.(results[i + 1]) ?? '';
                            svc?.Selection?.unselect?.(firstSelection);
                            if (nextPath) svc?.Selection?.select?.(nextPath);
                        }
                        break;
                    }
                }
            }
        }

        this.clearNodeSnappingGuideline();
        this.clearCanvasSnappingGuideline();
        this.clearEqualSpacingGuideline();
    }

    onKeyDown(event: any) {
        this._altKey = event.altKey;
        this._shiftKey = event.shiftKey;
        return super.onKeyDown(event);
    }

    onKeyUp(event: any) {
        const curType = this._controller.getCurHandleType();
        const curHandleIsCorner = this._controller.isCorner(curType) || this._controller.isBorder(curType);
        const isAltTurnToFalse = this._altKey && !event.altKey;
        if (isAltTurnToFalse && curHandleIsCorner) {
            this._controller.reset();
        }
        this._altKey = event.altKey;
        this._shiftKey = event.shiftKey;

        return super.onKeyUp(event);
    }

    handleAreaMove(delta: Vec3) {
        for (let i = 0; i < this._validTarget.length; i++) {
            const node = this._validTarget[i].node;

            if (this.isNodePositionLocked(node)) {
                continue;
            }

            const worldPos = this._worldPosList[i];
            let rectToolPos = new Vec3();
            Vec3.add(rectToolPos, worldPos, delta);

            if (i === 0) {
                if (rectTransformSnapping.enableSnapping) {
                    const rect = this._rectList[i];
                    rectToolPos = rectTransformSnapping.snapPosToNodeGuidelines(rectToolPos, rect, this._snapDistVec2);
                    this.drawNodeSnappingGuideline();
                    rectToolPos = rectTransformSnapping.snapPosToCanvasSnapGuidelines(rectToolPos, rect, this._snapDistVec2);
                    this.drawCanvasSnappingGuideline();
                    rectToolPos = rectTransformSnapping.snapPosToEqualSpacing(rectToolPos, rect, this._snapDistVec2);
                    this.drawEqualSpacingGuideline();
                }
            }

            rectToolPos.x = toPrecision(rectToolPos.x, 3);
            rectToolPos.y = toPrecision(rectToolPos.y, 3);
            node.setWorldPosition(rectToolPos);
        }
    }

    handleAnchorMove(delta: Vec3) {
        // 不处理多UI选择的anchor编辑
        if (this._validTarget.length > 1) {
            return;
        }

        const uiTransComp = this._validTarget[0];
        const node = uiTransComp.node;
        const size = this._sizeList[0];
        const oldAnchor = this._anchorList[0];
        const worldPos = this._worldPosList[0];

        const posDelta = delta.clone();
        makeVec3InPrecision(posDelta, 3);
        tempVec3.set(worldPos);
        tempVec3.add(posDelta);
        node.setWorldPosition(tempVec3);

        // 转换到局部坐标
        node.getWorldMatrix(tempMat4);
        Mat4.invert(tempMat4, tempMat4);
        tempMat4.m12 = tempMat4.m13 = 0;
        Vec3.transformMat4(posDelta, posDelta, tempMat4);

        tempVec2.x = posDelta.x / size.width;
        tempVec2.y = posDelta.y / size.height;

        tempVec2.add(oldAnchor);
        uiTransComp.anchorPoint = tempVec2;
    }

    getSizePoint(type: HandleType) {
        const sizePointPos = new Vec2();

        const rect = this._rectList[0];

        if (type === HandleType.Right ||
            type === HandleType.TopRight ||
            type === HandleType.BottomRight) {
            sizePointPos.x = rect.x + rect.width;
        } else {
            sizePointPos.x = rect.x;
        }

        if (type === HandleType.BottomLeft ||
            type === HandleType.Bottom ||
            type === HandleType.BottomRight) {
            sizePointPos.y = rect.y;
        } else {
            sizePointPos.y = rect.y + rect.height;
        }

        return sizePointPos;
    }

    modifyPosDeltaWithAnchor(type: any, posDelta: Vec3, sizeDelta: Vec2, anchor: Vec2, keepCenter: boolean) {
        if (type === HandleType.Right ||
            type === HandleType.TopRight ||
            type === HandleType.BottomRight) {
            if (keepCenter) {
                sizeDelta.x /= (1 - anchor.x);
            }
            posDelta.x = sizeDelta.x * anchor.x;
        } else {
            if (keepCenter) {
                sizeDelta.x /= anchor.x;
            }
            posDelta.x = -sizeDelta.x * (1 - anchor.x);
        }

        if (type === HandleType.Bottom ||
            type === HandleType.BottomRight ||
            type === HandleType.BottomLeft) {
            if (keepCenter) {
                sizeDelta.y /= anchor.y;
            }
            posDelta.y = -sizeDelta.y * (1 - anchor.y);
        } else {
            if (keepCenter) {
                sizeDelta.y /= (1 - anchor.y);
            }
            posDelta.y = sizeDelta.y * anchor.y;
        }
    }

    // 用于size宽高大小的delta变化映射到边框坐标点的delta变化
    formatSizeDelta(type: HandleType, sizeDelta: Vec2) {
        if (type === HandleType.Left ||
            type === HandleType.TopLeft ||
            type === HandleType.BottomLeft) {
            sizeDelta.x = -sizeDelta.x;
        }

        if (type === HandleType.Bottom ||
            type === HandleType.BottomRight ||
            type === HandleType.BottomLeft) {
            sizeDelta.y = -sizeDelta.y;
        }
    }

    handleOneTargetSize(type: HandleType, delta: Vec3, keepCenter: boolean, keepScale: boolean) {
        const size = this._sizeList[0];

        const posDelta = delta.clone();
        let sizeDelta = new Vec2(delta.x, delta.y);
        const localPos = this._localPosList[0];
        const uiTransComp = this._validTarget[0];
        const node = uiTransComp.node;
        const anchor = this._anchorList[0];

        if (rectTransformSnapping.enableSnapping) {
            this.formatSizeDelta(type, sizeDelta);
            sizeDelta = rectTransformSnapping.snapSizeToNodeGuidelines(this.getSizePoint(type), sizeDelta, this._snapDistVec2);
            this.formatSizeDelta(type, sizeDelta);
            this.drawNodeSnappingGuideline();
        }

        sizeDelta.x = toPrecision(sizeDelta.x, 3);
        sizeDelta.y = toPrecision(sizeDelta.y, 3);
        this.modifyPosDeltaWithAnchor(type, posDelta, sizeDelta, anchor, keepCenter);
        // 转换到基于父节点的局部坐标系
        if (node.parent) {
            node.parent.getWorldMatrix(tempMat4);
            Mat4.invert(tempMat4, tempMat4);
            tempMat4.m12 = tempMat4.m13 = 0;
            Vec3.transformMat4(posDelta, posDelta, tempMat4);
        }

        if (!keepCenter) {
            // 乘上当前节点的旋转
            const localRot = tempQuat_a;
            node.getRotation(localRot);
            Vec3.transformQuat(posDelta, posDelta, localRot);
            posDelta.z = 0;
            tempVec3.set(localPos);
            tempVec3.add(posDelta);
            node.setPosition(tempVec3);
        }

        // contentSize 受到scale 影响
        const worldScale = new Vec3();
        node.getWorldScale(worldScale);
        sizeDelta.x = sizeDelta.x / worldScale.x;
        sizeDelta.y = sizeDelta.y / worldScale.y;

        let height = size.height;
        let width = size.width;
        if (keepScale) {
            if (sizeDelta.x) {
                width = size.width + sizeDelta.x;
                if (size.width) {
                    const scale = width / size.width;
                    height = scale * size.height;
                } else {
                    height = width;
                }
            } else if (sizeDelta.y) {
                height = size.height + sizeDelta.y;
                if (size.height) {
                    const scale = height / size.height;
                    width = scale * size.width;
                } else {
                    width = height;
                }
            }
        } else {
            height = size.height + sizeDelta.y;
            width = size.width + sizeDelta.x;
        }

        uiTransComp.contentSize = new Size(width, height);
    }

    handleMultiTargetSize(type: HandleType, delta: Vec3, keepCenter: boolean) {
        const oriRect = this._tempRect;
        const sizeDelta = new Vec2(delta.x, delta.y);
        const posDelta = delta.clone();
        const anchor = new Vec2(0, 0);

        sizeDelta.x = toPrecision(sizeDelta.x, 3);
        sizeDelta.y = toPrecision(sizeDelta.y, 3);
        this.modifyPosDeltaWithAnchor(type, posDelta, sizeDelta, anchor, false);

        const rect = oriRect.clone();
        rect.x = oriRect.x + posDelta.x;
        rect.y = oriRect.y + posDelta.y;
        rect.width = oriRect.width + sizeDelta.x;
        rect.height = oriRect.height + sizeDelta.y;
        this._editRect = rect;

        for (let i = 0, l = this._validTarget.length; i < l; i++) {
            const uiTransComp = this._validTarget[i];
            const node = uiTransComp.node;
            const worldPos = this._worldPosList[i];

            const xPercent = (worldPos.x - oriRect.x) / oriRect.width;
            const yPercent = (worldPos.y - oriRect.y) / oriRect.height;
            const newPos = new Vec3(
                rect.x + xPercent * rect.width,
                rect.y + yPercent * rect.height,
                worldPos.z,
            );
            node.setWorldPosition(newPos);

            const r = this._rectList[i];
            const wPercent = r.width / oriRect.width;
            const hPercent = r.height / oriRect.height;

            const size = this._sizeList[i];
            const sd = sizeDelta.clone();
            sd.x = sd.x * wPercent;
            sd.y = sd.y * hPercent;

            const worldScale = new Vec3();
            node.getWorldScale(worldScale);
            sd.x = sd.x / worldScale.x;
            sd.y = sd.y / worldScale.y;

            uiTransComp.contentSize = new Size(size.width + sd.x, size.height + sd.y);
        }
    }

    getBounds(flipX: boolean, flipY: boolean, nodes: Node[]) {
        let minX = Number.MAX_VALUE, maxX = -Number.MAX_VALUE;
        let minY = Number.MAX_VALUE, maxY = -Number.MAX_VALUE;
        function calcBounds(p: any) {
            if (p.x > maxX) maxX = p.x;
            if (p.x < minX) minX = p.x;
            if (p.y > maxY) maxY = p.y;
            if (p.y < minY) minY = p.y;
        }
        nodes.forEach((node) => {
            if (node.getComponent(UITransform)) {
                const ob = getNodeWorldOrientedBounds(node);
                calcBounds(ob[0]);
                calcBounds(ob[1]);
                calcBounds(ob[2]);
                calcBounds(ob[3]);
            }
        });
        let temp;
        if (flipX) { temp = minX; minX = maxX; maxX = temp; }
        if (flipY) { temp = minY; minY = maxY; maxY = temp; }
        return [new Vec2(minX, maxY), new Vec2(minX, minY), new Vec2(maxX, minY), new Vec2(maxX, maxY)];
    }

    updateDataFromController() {
        if (this._controller.updated) {
            this.onControlUpdate('position');

            const rectCtrl = this._controller as RectangleController;
            const handleType = rectCtrl.getCurHandleType();
            const deltaSize = rectCtrl.getDeltaSize();
            if (handleType === HandleType.Area) {
                this.handleAreaMove(deltaSize);
            } else if (handleType === HandleType.Anchor) {
                this.handleAnchorMove(deltaSize);
            } else {
                const keepCenter: boolean = this._altKey;
                const keepScale: boolean = this._shiftKey;
                if (this.nodes.length > 1) {
                    this.handleMultiTargetSize(handleType, deltaSize, keepCenter);
                } else {
                    this.handleOneTargetSize(handleType, deltaSize, keepCenter, keepScale);
                }
            }
        }
    }

    updateControllerTransform() {
        this._controller.editable = !!this.target;
        this.updateControllerData();
    }

    updateControllerData() {
        if (!this._isInitialized || !this.nodes || this.nodes.length === 0) {
            return;
        }

        const rectCtrl = this._controller as RectangleController;
        rectCtrl.checkEdit();

        const length = this.nodes.length;
        if (length === 1) {
            const node = this.nodes[0];

            const worldPos = node.getWorldPosition();
            const worldRot = tempQuat_a;
            node.getWorldRotation(worldRot);
            const worldScale = node.getWorldScale();

            rectCtrl.setPosition(worldPos);
            rectCtrl.setRotation(worldRot);
            rectCtrl.setScale(worldScale);

            const uiTransComp = node.getComponent(UITransform);
            if (uiTransComp) {
                const size = uiTransComp.contentSize;
                const anchor = uiTransComp.anchorPoint;
                const center = new Vec3();
                center.x = (0.5 - anchor.x) * size.width;
                center.y = (0.5 - anchor.y) * size.height;
                rectCtrl.updateSize(center, new Vec2(size.width, size.height));
            } else {
                rectCtrl.hide();
            }
        } else {
            const bounds = this.getBounds(false, false, this.nodes);
            const rect = boundsToRect(bounds);
            const rectCenter = new Vec3(rect.x + rect.width / 2, rect.y + rect.height / 2, 0);
            rectCtrl.setPosition(rectCenter);
            rectCtrl.setRotation(Quat.IDENTITY);
            rectCtrl.setScale(new Vec3(1, 1, 1));
            rectCtrl.updateSize(new Vec3(), new Vec2(rect.width, rect.height));
        }
    }

    drawNodeGuidelineGroup(guidelineGroup: SnapGuidelineGroup) {
        if (!guidelineGroup) {
            return;
        }

        const currentGuidelines = guidelineGroup.currentGuidelines;
        if (!currentGuidelines || currentGuidelines.length <= 0) {
            return;
        }

        const color = rectTransformSnapping.guidelineColor;

        const drawLineVertices: Vec3[] = [];
        currentGuidelines.forEach((guideline) => {
            const lineVertices = guideline.lineVertices.slice();

            const checkNode = guideline.checkNode;
            if (!checkNode) {
                return;
            }

            function posCompare(axis: keyof(Vec3)) {
                return function(v1: Vec3, v2: Vec3) {
                    return (v1[axis] as number) - (v2[axis] as number);
                };
            }

            // hack，将对齐线延长到当前检测的节点上
            const rect = rectTransformSnapping.getWorldRectEx(checkNode);
            const center = rect.center;
            const halfWidth = rect.width / 2;
            const halfHeight = rect.height / 2;
            if (guideline.axis === 'x') {
                // up
                lineVertices.push(new Vec3(guideline.value, center.y + halfHeight, center.z));
                // down
                lineVertices.push(new Vec3(guideline.value, center.y - halfHeight, center.z));
                lineVertices.sort(posCompare('y'));
            } else if (guideline.axis === 'y') {
                // left
                lineVertices.push(new Vec3(center.x + halfWidth, guideline.value, center.z));
                // right
                lineVertices.push(new Vec3(center.x - halfWidth, guideline.value, center.z));
                lineVertices.sort(posCompare('x'));
            }

            drawLineVertices.push(lineVertices[0]);
            drawLineVertices.push(lineVertices[lineVertices.length - 1]);
        });

        this.drawGuidelines(this._nodeSnapLinesCtrl, drawLineVertices, color);
    }

    drawNodeSnappingGuideline() {
        this.clearNodeSnappingGuideline();

        const guidelineGroups = rectTransformSnapping.nodeSnapGuidelineGroups;
        this.drawNodeGuidelineGroup(guidelineGroups[0]);
        this.drawNodeGuidelineGroup(guidelineGroups[1]);
    }

    clearNodeSnappingGuideline() {
        this._nodeSnapLinesCtrl.clearData();
    }

    getDrawLineVertices(guidelineGroup: SnapGuidelineGroup) {
        if (!guidelineGroup) {
            return null;
        }

        const currentGuidelines = guidelineGroup.currentGuidelines;
        if (!currentGuidelines || currentGuidelines.length <= 0) {
            return null;
        }

        const drawLineVertices: Vec3[] = [];
        currentGuidelines.forEach((guideline) => {
            const lineVertices = guideline.lineVertices;
            drawLineVertices.push(lineVertices[0]);
            drawLineVertices.push(lineVertices[lineVertices.length - 1]);
        });

        return drawLineVertices;
    }

    drawGuidelineGroup(guidelineGroup: SnapGuidelineGroup, linesCtrl: LinesController, color = Color.RED) {
        if (!guidelineGroup) {
            return;
        }

        const currentGuidelines = guidelineGroup.currentGuidelines;
        if (!currentGuidelines || currentGuidelines.length <= 0) {
            return;
        }

        const drawLineVertices: Vec3[] = [];
        currentGuidelines.forEach((guideline) => {
            const lineVertices = guideline.lineVertices;
            drawLineVertices.push(lineVertices[0]);
            drawLineVertices.push(lineVertices[lineVertices.length - 1]);
        });

        linesCtrl.setColor(color);
        const lineIndices: number[] = [];
        drawLineVertices.forEach((_value, index) => {
            lineIndices.push(index);
        });
        linesCtrl.updateData(drawLineVertices, lineIndices);
    }

    drawGuidelines(linesCtrl: LinesController, drawLineVertices: Vec3[], color = Color.RED) {
        linesCtrl.setColor(color);
        const lineIndices: number[] = [];
        drawLineVertices.forEach((_value, index) => {
            lineIndices.push(index);
        });
        linesCtrl.updateData(drawLineVertices, lineIndices);
    }

    drawCanvasSnappingGuideline() {
        this.clearCanvasSnappingGuideline();

        const guidelineGroups = rectTransformSnapping.canvasSnapGuidelineGroups;

        const color = rectTransformSnapping.canvasSnapColor;
        const drawLineVertices: Vec3[] = [];
        let lineVertices = this.getDrawLineVertices(guidelineGroups[0]);
        if (lineVertices) {
            drawLineVertices.push(...lineVertices);
        }
        lineVertices = this.getDrawLineVertices(guidelineGroups[1]);
        if (lineVertices) {
            drawLineVertices.push(...lineVertices);
        }

        this.drawGuidelines(this._canvasSnapLinesCtrl, drawLineVertices, color);
    }

    clearCanvasSnappingGuideline() {
        this._canvasSnapLinesCtrl.clearData();
    }

    drawEqualSpacingGuideline() {
        this.clearEqualSpacingGuideline();

        const currentMatchMinDistInfos = rectTransformSnapping.currentMatchMinDistInfos;
        const color = rectTransformSnapping.guidelineColor;
        const sideHalfLength = 10;

        const drawLineVertices: Vec3[] = [];
        currentMatchMinDistInfos.forEach((info) => {
            const startPos = info.minDistPosA;
            const endPos = info.minDistPosB;
            drawLineVertices.push(startPos);
            drawLineVertices.push(endPos);

            // add more detail
            if (info.axis === 'x') {
                // draw like this
                // |-----|
                drawLineVertices.push(new Vec3(startPos.x, startPos.y + sideHalfLength));
                drawLineVertices.push(new Vec3(startPos.x, startPos.y - sideHalfLength));
                drawLineVertices.push(new Vec3(endPos.x, endPos.y + sideHalfLength));
                drawLineVertices.push(new Vec3(endPos.x, endPos.y - sideHalfLength));
            } else if (info.axis === 'y') {
                // draw like this
                // ---
                //  |
                // ---
                drawLineVertices.push(new Vec3(startPos.x - sideHalfLength, startPos.y));
                drawLineVertices.push(new Vec3(startPos.x + sideHalfLength, startPos.y));
                drawLineVertices.push(new Vec3(endPos.x - sideHalfLength, endPos.y));
                drawLineVertices.push(new Vec3(endPos.x + sideHalfLength, endPos.y));
            }
        });

        this.drawGuidelines(this._equalSpacingLinesCtrl, drawLineVertices, color);
    }

    clearEqualSpacingGuideline() {
        this._equalSpacingLinesCtrl.clearData();
    }
}

export default RectGizmo;
