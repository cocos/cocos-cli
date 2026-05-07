'use strict';

import ControllerBase from '../controller/base';
import ControllerShape from '../utils/controller-shape';
import ControllerUtils from '../utils/controller-utils';
import type { GizmoMouseEvent } from '../utils/defines';
import {
    setNodeOpacity,
    getModel,
    updateIB,
    updatePositions,
    create3DNode,
    setMeshColor,
    getRaycastResultsByNodes,
} from '../utils/engine-utils';
import { Node, Quat, Vec3, Color, MeshRenderer, Vec2, Mat4 } from 'cc';

const panPlaneLayer = 1 << 30;

/**
 * 获取编辑器摄像机组件（惰性访问避免循环依赖）
 */
function getEditorCamera(): any {
    try {
        const { Service } = require('../../core/decorator');
        return Service.Camera?.getCamera?.();
    } catch (e) {
        return null;
    }
}

const tempVec3_a = new Vec3();
const tempVec3_b = new Vec3();
const tempVec3_c = new Vec3();
const tempVec3_d = new Vec3();
const tempQuat = new Quat();
const tempMat4 = new Mat4();

function deg2rad(deg: number): number {
    return deg * Math.PI / 180;
}

function clamp(val: number, min: number, max: number): number {
    return Math.min(Math.max(val, min), max);
}

let _controller: RotationController | null = null;

class RotationController extends ControllerBase {
    private _deltaRotation: Quat = new Quat(0, 0, 0, 1);
    private _rotFactor = 3;

    private _baseRadius = 100;
    private _tubeRadius = 3;
    private _circleBorderNode!: Node;
    private _circleBorderMR: MeshRenderer | null = null;
    private _cutoffNode: Node | null = null;
    private _cutoffMR: MeshRenderer | null = null;
    private _indicator: any = {};
    private _mouseDownRot: Quat = new Quat();
    private _mouseDeltaPos: Vec2 = new Vec2(0, 0);
    private _indicatorStartDir: Vec3 = new Vec3();
    private _rotateAlignDir: Vec3 = new Vec3();
    private _transformAxisDir: Vec3 = new Vec3();
    private _axisDir: any = {};
    private _deltaAngle = 0;
    private _handleAxisDir = new Vec3();
    private _graduationNode: Node | null = null;
    private _graduationMR: MeshRenderer | null = null;

    public get transformAxisDir(): Vec3 {
        return this._transformAxisDir;
    }

    public get indicatorStartDir(): Vec3 {
        return this._indicatorStartDir;
    }

    constructor(rootNode: Node) {
        super(rootNode);

        this._axisDir.x = new Vec3(1, 0, 0);
        this._axisDir.y = new Vec3(0, 1, 0);
        this._axisDir.z = new Vec3(0, 0, 1);
        this._axisDir.w = new Vec3(0, 0, 1); // for 2d z rotation, use w for hack
        this.initShape();
    }

    static getInstance(rootNode: Node): RotationController {
        if (!_controller) {
            _controller = new RotationController(rootNode);
        }
        return _controller;
    }

    createRotationShape(axisName: string, torusRot: Vec3, arrowRot: Vec3, arcFromDir: Vec3, arcRadian: number, color: Color) {
        const baseArrowHeadHeight = 25;
        const baseArrowHeadRadius = 10;
        const baseArrowBodyHeight = 140;

        const baseRadius = this._baseRadius;
        const tubeRadius = this._tubeRadius;

        const topNode = create3DNode(axisName + 'Rotation');
        topNode.parent = this.shape;

        const torusNode = ControllerUtils.torus(baseRadius, tubeRadius, { arc: Math.abs(arcRadian) }, color);
        torusNode.name = axisName + 'RotationTorus';
        torusNode.parent = topNode;
        setNodeOpacity(torusNode, 0);
        torusNode.setRotationFromEuler(torusRot);

        const arrowNode = ControllerUtils.arrow(baseArrowHeadHeight, baseArrowHeadRadius, baseArrowBodyHeight, color);
        arrowNode.name = axisName + 'Axis';
        arrowNode.parent = topNode;
        arrowNode.setRotationFromEuler(arrowRot);

        const arcNode = ControllerUtils.arc(new Vec3(), this._axisDir[axisName], arcFromDir, arcRadian, baseRadius, color, {
            noDepthTestForLines: true,
        });
        arcNode.parent = topNode;
        arcNode.name = axisName + 'RotationArc';

        // indicator circle
        const indicatorNode = ControllerUtils.arc(new Vec3(), this._axisDir[axisName], arcFromDir, this._twoPI, baseRadius, color, {
            noDepthTestForLines: true,
        });
        indicatorNode.parent = topNode;
        indicatorNode.active = false;
        indicatorNode.name = axisName + 'IndicatorCircle';

        const axisData = this.initHandle(topNode, axisName);
        if (axisData) {
            axisData.normalTorusNode = arcNode;
            axisData.indicatorCircle = indicatorNode;
            axisData.arrowNode = arrowNode;
            axisData.arrowNode.active = false;
            axisData.normalTorusMR = getModel(axisData.normalTorusNode);
        }
    }

    // 创建刻度
    createGraduationShape(parent: Node, color?: Color) {
        this._graduationNode = ControllerUtils.lines(
            [new Vec3(0, 0, 0), new Vec3(0, 0, 0)],
            [0, 1],
            color,
            { noDepthTestForLines: true },
        );
        this._graduationNode.parent = parent;
        this._graduationMR = getModel(this._graduationNode);
    }

    updateGraduation(normal: Vec3, fromDir: Vec3, graduationInterval: number) {
        Vec3.normalize(tempVec3_a, fromDir);
        Vec3.normalize(tempVec3_b, normal);

        const count = Math.round(360 / graduationInterval);
        const deltaRot = tempQuat;
        Quat.fromAxisAngle(deltaRot, tempVec3_b, deg2rad(graduationInterval));
        const startPos = tempVec3_c;
        const pivotPos = this.getPosition();
        Vec3.multiplyScalar(startPos, tempVec3_a, this._baseRadius * this.getDistScalar());
        const lineLength = 15;
        const endPos = tempVec3_d;
        Vec3.multiplyScalar(endPos, tempVec3_a, (this._baseRadius - lineLength) * this.getDistScalar());

        const lineStartPos = [];
        const lineEndPos = [];
        for (let i = 0; i < count; i++) {
            lineStartPos[i] = pivotPos.clone();
            lineEndPos[i] = pivotPos.clone();
            lineStartPos[i].add(startPos);
            lineEndPos[i].add(endPos);
            Vec3.transformQuat(startPos, startPos, deltaRot);
            Vec3.transformQuat(endPos, endPos, deltaRot);
        }

        const points = [];
        const indices = [];
        for (let i = 0; i < count; i++) {
            points.push(lineStartPos[i]);
            points.push(lineEndPos[i]);
            indices.push(i * 2, i * 2 + 1);
        }

        if (this._graduationMR) {
            const lineData = ControllerShape.calcLinesData(points, indices);
            updatePositions(this._graduationMR, lineData.positions as Vec3[]);
            updateIB(this._graduationMR, lineData.indices || []);
        }
    }

    public setGraduation(graduationInterval: number) {
        this.updateGraduation(this._transformAxisDir, this._indicatorStartDir, graduationInterval);
    }

    // 显示刻度尺
    public showGraduation() {
        if (this._graduationNode) {
            this._graduationNode.active = true;
        }
    }

    public hideGraduation() {
        if (this._graduationNode) {
            this._graduationNode.active = false;
        }
    }

    initShape() {
        this.createShapeNode('RotationController');
        this.registerEvents();

        this._baseRadius = 100;
        this._tubeRadius = 5;

        // x rotation
        this.createRotationShape('x', new Vec3(0, 0, 90), new Vec3(-90, -90, 0), this._axisDir.z, -this._twoPI, Color.RED);
        // y rotation
        this.createRotationShape('y', new Vec3(0, 0, 0), new Vec3(0, 0, 0), this._axisDir.z, this._twoPI, Color.GREEN);
        // z rotation
        this.createRotationShape('z', new Vec3(-90, 0, 0), new Vec3(90, 0, 90), this._axisDir.x, this._twoPI, Color.BLUE);
        // for 2d z rotation, use w for hack
        this.createRotationShape('w', new Vec3(-90, 0, 0), new Vec3(0, 0, -90), this._axisDir.x, this._twoPI, Color.BLUE);

        // circle border
        const editorCamera = getEditorCamera();
        const cameraNode = editorCamera?.node;
        const cameraRot = cameraNode?.getWorldRotation(tempQuat) ?? Quat.IDENTITY;
        const cameraNormal = new Vec3();
        Vec3.transformQuat(cameraNormal, new Vec3(0, 0, 1), cameraRot);
        const circleBorderNode = ControllerUtils.circle(new Vec3(), cameraNormal, this._baseRadius, Color.GRAY);
        circleBorderNode.name = 'circleBorder';
        circleBorderNode.parent = this._rootNode;
        setNodeOpacity(circleBorderNode, 200);

        this._circleBorderNode = circleBorderNode;
        this._circleBorderMR = getModel(circleBorderNode);
        this._circleBorderNode.setWorldPosition(this.getPosition());

        // for cut off
        const cutoffNode = ControllerUtils.disc(new Vec3(), Vec3.UNIT_Z, this._baseRadius, Color.RED);
        setNodeOpacity(cutoffNode, 0);
        cutoffNode.name = 'cutoff';
        cutoffNode.parent = this._rootNode;
        cutoffNode.layer = panPlaneLayer;
        this._cutoffNode = cutoffNode;
        this._cutoffMR = getModel(cutoffNode);

        // for rotation indicator sector
        const indicator: any = {};
        indicator.sectorNode = ControllerUtils.sector(
            new Vec3(),
            new Vec3(0, 1, 0),
            new Vec3(1, 0, 0),
            Math.PI,
            this._baseRadius,
            Color.YELLOW,
            { unlit: true },
        );
        setNodeOpacity(indicator.sectorNode, 200);
        indicator.sectorNode.parent = this._rootNode;
        indicator.sectorNode.active = false;
        indicator.meshRenderer = getModel(indicator.sectorNode);
        this._indicator = indicator;

        this.createGraduationShape(this._rootNode!, Color.YELLOW);
        this.hideGraduation();

        this.shape.active = false;
    }

    isHitOnAxisArrow(hitNode: Node, axisName: string) {
        const arrowTopNode = this._handleDataMap[axisName]?.arrowNode;
        if (!arrowTopNode) return false;

        for (let i = 0; i < arrowTopNode.children.length; i++) {
            const child = arrowTopNode.children[i];
            if (hitNode === child) {
                return true;
            }
        }
        return false;
    }

    isInCutoffBack(axisName: string, x: number, y: number) {
        const hitAxisNode = this._handleDataMap[axisName]?.normalTorusNode;
        if (!hitAxisNode || !this._cutoffNode) return false;
        let results = getRaycastResultsByNodes([this._cutoffNode], x, y);
        if (results.length > 0) {
            const cutOffDist = results[0].distance;
            results = getRaycastResultsByNodes([hitAxisNode], x, y);
            if (results.length > 0) {
                const axisDist = results[0].distance;
                if (axisDist > cutOffDist) {
                    return true;
                }
            }
        }
        return false;
    }

    onMouseDown(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (!(this.transformToolData?.is2D ?? false) && this.isInCutoffBack(event.handleName, event.x, event.y)) {
            this._isMouseDown = false;
            return;
        }

        this._mouseDownRot = Quat.clone(this.getRotation());
        this._mouseDeltaPos = new Vec2(0, 0);

        // 计算旋转量参考坐标轴
        const hitPoint = event.hitPoint;
        Vec3.copy(this._handleAxisDir, this._axisDir[event.handleName]);
        const axisDir = Vec3.clone(this._handleAxisDir);
        const hitDir = new Vec3();
        const crossDir = new Vec3();
        this._indicatorStartDir = new Vec3();

        this._deltaAngle = 0;
        const is2D = this.transformToolData?.is2D ?? false;
        if (is2D) {
            if (event.node && this.isHitOnAxisArrow(event.node, event.handleName)) {
                Vec3.transformQuat(hitDir, new Vec3(1, 0, 0), this.getRotation());
            } else {
                hitPoint && Vec3.subtract(hitDir, hitPoint, this.getPosition());
            }
            // 2D情况下rotation扇形指示器从自身x轴为起始方向
            Vec3.transformQuat(this._indicatorStartDir, new Vec3(1, 0, 0), this.getRotation());
        } else {
            hitPoint && Vec3.subtract(hitDir, hitPoint, this.getPosition());
            this._indicatorStartDir = hitDir;
        }

        Vec3.normalize(hitDir, hitDir);
        Vec3.transformQuat(axisDir, axisDir, this.getRotation());
        Vec3.cross(crossDir, hitDir, axisDir);
        Vec3.cross(hitDir, axisDir, crossDir);

        this._rotateAlignDir = crossDir;
        this._transformAxisDir = axisDir;

        // show indicator
        this.updateRotationIndicator(this._transformAxisDir, this._indicatorStartDir, 0);
        this._indicator.sectorNode.active = true;
        this._handleDataMap[event.handleName].indicatorCircle!.active = true;

        // hide border
        this._circleBorderNode.active = false;

        Object.keys(this._handleDataMap).forEach((key) => {
            if (key === event.handleName) {
                this._handleDataMap[key].normalTorusNode!.active = false;
                this._handleDataMap[key].arrowNode!.active = true;
            } else {
                this._handleDataMap[key].topNode.active = false;
            }
        });

        // CLI: no pointer lock

        if (this.onControllerMouseDown) {
            this.onControllerMouseDown(event);
        }
    }

    onMouseMove(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (this._isMouseDown) {
            const deltaX = clamp(event.moveDeltaX, -10, 10);
            const deltaY = clamp(event.moveDeltaY, -10, 10);

            this._mouseDeltaPos.x += deltaX;
            this._mouseDeltaPos.y += deltaY;

            Quat.identity(this._deltaRotation);

            let radian = 0;
            if (event.handleName.length === 1) {
                const alignAxisMoveDist = this.getAlignAxisMoveDistance(this._rotateAlignDir, this._mouseDeltaPos);

                this._deltaAngle = -alignAxisMoveDist / this._rotFactor;
                radian = this._deltaAngle * this._degreeToRadianFactor;
                Vec3.copy(this._handleAxisDir, this._axisDir[event.handleName]);
                Quat.fromAxisAngle(this._deltaRotation, this._handleAxisDir, radian);
            }

            this.updateRotationIndicator(this._transformAxisDir, this._indicatorStartDir, radian);
            const rot = this.getRotation();
            Quat.multiply(rot, this._mouseDownRot, this._deltaRotation);
            if (this.isLock) {
                if (this.onControllerMouseMove) {
                    this.onControllerMouseMove(event);
                }
                return;
            }
            this.setRotation(rot);

            if (this.onControllerMouseMove) {
                this.onControllerMouseMove(event);
            }

            this.updateController();
        }
    }

    /**
     * 重置所有 handle 的节点的可见性
     */
    protected resetAllHandelNodes() {
        const is2D = this.transformToolData?.is2D ?? false;
        if (is2D) {
            this._handleDataMap.w.indicatorCircle!.active = false;
            this._handleDataMap.w.normalTorusNode!.active = true;
            this._handleDataMap.w.topNode.active = true;
        } else {
            Object.keys(this._handleDataMap).forEach((key) => {
                if (key !== 'w') {
                    this._handleDataMap[key].normalTorusNode!.active = true;
                    this._handleDataMap[key].topNode.active = true;
                    this._handleDataMap[key].indicatorCircle!.active = false;
                    this._handleDataMap[key].arrowNode!.active = false;
                }
            });
        }
    }

    onMouseUp(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        // CLI: no pointer lock to exit
        this._indicator.sectorNode.active = false;
        Quat.identity(this._deltaRotation);

        const is2D = this.transformToolData?.is2D ?? false;
        if (!is2D) {
            // show border
            this._circleBorderNode.active = true;
        }

        this.resetAllHandelNodes();
        if (this.onControllerMouseUp) {
            this.onControllerMouseUp(event);
        }

        this._handleAxisDir.set(0, 0, 0);
    }

    onMouseLeave(event: GizmoMouseEvent) {
        this.onMouseUp(event);
    }

    onHoverIn(event: GizmoMouseEvent) {
        if (!(this.transformToolData?.is2D ?? false) && this.isInCutoffBack(event.handleName, event.x, event.y)) {
            return;
        }
        this.setHandleColor(event.handleName, Color.YELLOW);

        Object.keys(this._handleDataMap).forEach((key) => {
            if (key !== event.handleName) {
                this.setNodesOpacity(this._handleDataMap[key].rendererNodes, 50);
            }
        });
    }

    onHoverOut(event: GizmoMouseEvent<{ hoverInNodeMap: Map<Node, boolean> }>) {
        this.resetHandleColor(event);

        Object.keys(this._handleDataMap).forEach((key) => {
            this.setNodesOpacity(this._handleDataMap[key].rendererNodes, 255);
        });
    }

    setNodesOpacity(nodes: Node[], opacity: number) {
        nodes.forEach((node) => {
            setNodeOpacity(node, opacity);
        });
    }

    getDeltaRotation() {
        return this._deltaRotation;
    }

    getDeltaAngle() {
        return this._deltaAngle;
    }

    getHandleAxisDir() {
        return this._handleAxisDir;
    }

    onShow() {
        this.registerEvents();
        const is2D = this.transformToolData?.is2D ?? false;
        if (is2D) {
            this._handleDataMap.x.topNode.active = false;
            this._handleDataMap.y.topNode.active = false;
            this._handleDataMap.z.topNode.active = false;

            this._handleDataMap.w.topNode.active = true;
            this._handleDataMap.w.arrowNode!.active = true;
            this._circleBorderNode.active = false;
            this._cutoffNode!.active = false;
            this.updateController();
        } else {
            this._handleDataMap.x.topNode.active = true;
            this._handleDataMap.y.topNode.active = true;
            this._handleDataMap.z.topNode.active = true;

            this._handleDataMap.w.topNode.active = false;
            this._handleDataMap.w.arrowNode!.active = false;
            this._circleBorderNode.active = true;
            this._cutoffNode!.active = true;
        }
    }

    onHide() {
        this.unregisterEvents();
        // CLI: no pointer lock to exit
        this._indicator.sectorNode.active = false;
        this._circleBorderNode.active = false;
        this._cutoffNode!.active = false;
        this.resetAllHandelNodes();
    }

    public updateRotationIndicator(normal: Vec3, fromDir: Vec3, radian: number) {
        const positions = ControllerShape.calcSectorPoints(
            this.getPosition(),
            normal,
            fromDir,
            radian,
            this._baseRadius * this.getDistScalar(),
            60,
        );

        updatePositions(this._indicator.meshRenderer, positions);
    }

    adjustControllerSize() {
        const scalar = this.getDistScalar();
        const scale = this.getScale();
        const newScale = tempVec3_a;
        Vec3.copy(newScale, scale);
        newScale.multiplyScalar(scalar);
        this.shape.setScale(newScale);

        // update circle border
        this._circleBorderNode.setScale(newScale);
        this._circleBorderNode.setWorldPosition(this.getPosition());
        const editorCamera = getEditorCamera();
        const cameraNode = editorCamera?.node;
        const cameraRot = cameraNode?.getWorldRotation(tempQuat) ?? Quat.IDENTITY;
        const cameraNormal = tempVec3_b;
        Vec3.transformQuat(cameraNormal, Vec3.UNIT_Z, cameraRot);
        let positions = ControllerShape.calcCirclePoints(Vec3.ZERO, cameraNormal, this._baseRadius);
        updatePositions(this._circleBorderMR!, positions);

        // update cutoff
        this._cutoffNode!.setScale(newScale);
        this._cutoffNode!.setWorldPosition(this.getPosition());
        this._cutoffNode!.setWorldRotation(cameraRot);

        const localCamNormal = tempVec3_b;
        const worldToLocalMat = tempMat4;
        this.shape.getWorldMatrix(worldToLocalMat);
        Mat4.invert(worldToLocalMat, worldToLocalMat);
        Vec3.transformMat4Normal(localCamNormal, cameraNormal, worldToLocalMat);

        const is2D = this.transformToolData?.is2D ?? false;
        if (!is2D) {
            Object.keys(this._handleDataMap).forEach((key) => {
                if (key !== 'w') {
                    const from = tempVec3_c;
                    const axisDir = this._axisDir[key];
                    Vec3.cross(from, axisDir, localCamNormal);
                    Vec3.normalize(from, from);
                    positions = ControllerShape.calcArcPoints(Vec3.ZERO, axisDir, from, -Math.PI, this._baseRadius);

                    const axisData = this._handleDataMap[key];
                    updatePositions(axisData.normalTorusMR!, positions);
                }
            });
        }
    }
}

export default RotationController;
