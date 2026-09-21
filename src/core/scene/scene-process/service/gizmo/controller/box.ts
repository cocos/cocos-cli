import { Node, Vec3, Color, MeshRenderer, Vec2, Layers, Vec4 } from 'cc';

import type { GizmoMouseEvent } from '../utils/defines';
import ControllerUtils from '../utils/controller-utils';
import ControllerShape from '../utils/controller-shape';
import EditableController from './editable';
import {
    getModel,
    updatePositions,
    setMeshColor,
    setNodeOpacity,
    updateBoundingBox,
    CullMode,
} from '../utils/engine-utils';

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

const axisDirMap = ControllerUtils.axisDirectionMap;
const AxisName = ControllerUtils.AxisName;

const handleNameToFace: { [key: string]: Vec4 } = {
    'y': new Vec4(0, 1, 0, 0),
    'neg_y': new Vec4(0, -1, 0, 0),
    'x': new Vec4(1, 0, 0, 0),
    'neg_x': new Vec4(-1, 0, 0, 0),
    'z': new Vec4(0, 0, 1, 0),
    'neg_z': new Vec4(0, 0, -1, 0),
};

class BoxController extends EditableController {
    private _center: Vec3 = new Vec3();
    private _size: Vec3 = new Vec3(1, 1, 1);
    private _deltaSize: Vec3 = new Vec3();
    private _wireFrameBoxNode: Node | null = null;
    private _wireFrameBoxMeshRenderer: MeshRenderer | null = null;
    private _cubeNode: Node | null = null;
    private _cubeNodeMR: MeshRenderer | null = null;
    private _mouseDeltaPos: Vec2 = new Vec2();
    private _curDistScalar = 0;

    constructor(rootNode: Node) {
        super(rootNode);

        this._editHandleKeys = Object.keys(axisDirMap);

        this.initShape();
    }

    setColor(color: Color) {
        if (this._wireFrameBoxNode) {
            this._color = color;
            setMeshColor(this._wireFrameBoxNode, color);
            this.setEditHandlesColor(color);
        }
    }

    setOpacity(opacity: number) {
        if (this._wireFrameBoxNode) {
            setNodeOpacity(this._wireFrameBoxNode, opacity);
        }
    }

    _updateEditHandle(axisName: string) {
        const node = this._handleDataMap[axisName].topNode;
        const dir = axisDirMap[axisName];

        const offset = new Vec3();
        Vec3.multiply(offset, dir, this._size);
        Vec3.multiplyScalar(offset, offset, 0.5);
        const pos = new Vec3(offset);
        pos.add(this._center);
        const baseScale = this._editHandleScales[axisName];
        const curScale = this.getScale();
        node.setScale(baseScale / curScale.x, baseScale / curScale.y, baseScale / curScale.z);
        Vec3.multiply(pos, pos, curScale);
        node.setPosition(pos);
    }

    initShape() {
        this.createShapeNode('BoxController');

        this._wireFrameBoxNode = ControllerUtils.wireframeBox(this._center, this._size, this._color, { forwardPipeline: true, depthTestForTriangles: true });
        this._wireFrameBoxNode.parent = this.shape;
        this._wireFrameBoxMeshRenderer = getModel(this._wireFrameBoxNode);
        this._cubeNode = ControllerUtils.cube(1, 1, 1, Color.GREEN, Vec3.ZERO, {
            forwardPipeline: true,
            depthTestForTriangles: true,
            cullMode: CullMode.NONE,
            effectName: 'internal/editor/box-height-light',
            technique: 0,
        });
        this._cubeNode.parent = this.shape;
        setNodeOpacity(this._cubeNode, 20);
        this._cubeNodeMR = getModel(this._cubeNode);
        this._cubeNode.layer |= Layers.BitMask.IGNORE_RAYCAST;
        this._cubeNode.active = this._edit;

        this.hide();

        const editorCamera = getEditorCamera();
        if (editorCamera?.node) {
            editorCamera.node.on('transform-changed', this.onEditorCameraMoved, this);
        }
    }

    updateSize(center: Readonly<Vec3>, size: Vec3) {
        if (!this._cubeNodeMR || !this._wireFrameBoxMeshRenderer) {
            return;
        }
        const geometryChanged = !Vec3.strictEquals(this._center, center) || !Vec3.strictEquals(this._size, size);
        this._center.set(center);
        // Callers commonly reuse a temporary Vec3. Own the value so later
        // changes cannot silently mutate the cached size and its bounds.
        this._size.set(size);
        if (geometryChanged) {
            updateBoundingBox(this._cubeNodeMR, Vec3.multiplyScalar(new Vec3(), size, -0.5), Vec3.multiplyScalar(new Vec3(), size, 0.5));
            updatePositions(this._wireFrameBoxMeshRenderer, ControllerShape.calcBoxPoints(this._center, this._size));
            updatePositions(this._cubeNodeMR, ControllerShape.calcCubeData(size.x, size.y, size.z, center).positions);
        }
        if (this._edit) {
            this.updateEditHandles();
        }
        this.adjustEditHandlesSize();
    }

    onMouseDown(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        this._mouseDeltaPos = new Vec2(0, 0);
        this._curDistScalar = super.getDistScalar();
        Vec3.set(this._deltaSize, 0, 0, 0);

        if (this.onControllerMouseDown) {
            this.onControllerMouseDown(event);
        }
    }

    onMouseMove(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (this._isMouseDown) {
            this._mouseDeltaPos.x += event.moveDeltaX;
            this._mouseDeltaPos.y += event.moveDeltaY;

            const axisDir = axisDirMap[event.handleName];

            const deltaDist = this.getAlignAxisMoveDistance(this.localToWorldDir(axisDir), this._mouseDeltaPos) * this._curDistScalar;

            if (event.handleName === AxisName.x || event.handleName === AxisName.neg_x) {
                this._deltaSize.x = deltaDist;
            } else if (event.handleName === AxisName.y || event.handleName === AxisName.neg_y) {
                this._deltaSize.y = deltaDist;
            } else if (event.handleName === AxisName.z || event.handleName === AxisName.neg_z) {
                this._deltaSize.z = deltaDist;
            }

            if (this.onControllerMouseMove) {
                this.onControllerMouseMove(event);
            }
        }
    }

    onMouseUp(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (this.onControllerMouseUp) {
            this.onControllerMouseUp(event);
        }
    }

    onMouseLeave(event: GizmoMouseEvent) {
        this.onMouseUp(event);
    }

    onHoverIn(event: GizmoMouseEvent) {
        if (!this._cubeNodeMR || !this._cubeNodeMR.material) {
            return;
        }
        this._cubeNodeMR.material.setProperty('selectedFaceForward', handleNameToFace[event.handleName] || Vec4.ZERO, 0);
        this.setHandleColor(event.handleName, Color.YELLOW);
    }

    onHoverOut(event: GizmoMouseEvent<{ hoverInNodeMap: Map<Node, boolean> }>) {
        if (!this._cubeNodeMR || !this._cubeNodeMR.material) {
            return;
        }
        this._cubeNodeMR.material.setProperty('selectedFaceForward', Vec4.ZERO);
        this.resetHandleColor(event);
    }

    getDeltaSize() {
        return this._deltaSize;
    }

    showEditHandles() {
        if (!this._cubeNode) {
            return;
        }
        super.showEditHandles();
        this._cubeNode.active = true;
    }

    hideEditHandles() {
        if (!this._cubeNode) {
            return;
        }
        super.hideEditHandles();
        this._cubeNode.active = false;
    }
}

export default BoxController;
