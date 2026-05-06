'use strict';

import { Color, gfx, js, Mesh, MeshCollider, MeshRenderer, Node, Quat, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import ControllerUtils from '../../utils/controller-utils';
import ControllerBase from '../../controller/base';
import { AttributeName, getModel, updateVBAttr, updateIB } from '../../utils/engine-utils';
import { registerGizmo } from '../../gizmo-defines';

const tempQuat_a = new Quat();

class MeshController extends ControllerBase {
    private _linesNode: Node | null = null;
    private _linesMR: MeshRenderer | null = null;

    constructor(rootNode: Node) {
        super(rootNode);
        this._color = Color.GREEN;
        this.initShape();
    }

    initShape() {
        this.createShapeNode('MeshController');
        this._linesNode = ControllerUtils.lines([new Vec3(), new Vec3(0, 0, 1)], [0, 1], this._color, { forwardPipeline: true });
        this._linesMR = getModel(this._linesNode);
        this._linesNode.parent = this.shape;
    }

    updateData(points: number[], indices: number[]) {
        updateVBAttr(this._linesMR!, AttributeName.ATTR_POSITION, points);
        updateIB(this._linesMR!, indices);
    }
}

class MeshColliderGizmo extends GizmoBase<MeshCollider> {
    private _controller!: MeshController;

    init() {
        this._controller = new MeshController(this.getGizmoRoot());
        this._isInitialized = true;
    }

    onShow() {
        this.updateControllerData();
    }

    onHide() {
        this._controller.hide();
    }

    updateControllerData() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        if (this.target instanceof MeshCollider) {
            const node = this.target.node;

            const worldScale = node.getWorldScale();
            const worldPos = node.getWorldPosition();
            const worldRot = tempQuat_a;
            node.getWorldRotation(worldRot);
            this._controller.setScale(worldScale);
            this._controller.setPosition(worldPos);
            this._controller.setRotation(worldRot);

            const meshCollider = this.target;
            const mesh = meshCollider.mesh;

            if (mesh) {
                this._controller.show();
                const calcMeshData = this.calcMeshData(mesh);
                const points = calcMeshData.points;

                const center = meshCollider.center;
                for (let i = 0; i < points.length; i += 3) {
                    points[i] += center.x;
                    points[i + 1] += center.y;
                    points[i + 2] += center.z;
                }

                this._controller.updateData(points, calcMeshData.indices);
            } else {
                this._controller.hide();
            }
        }
    }

    calcMeshData(mesh: Mesh) {
        let points: number[] = [];
        let indices: number[] = [];

        const len = mesh?.renderingSubMeshes.length;
        for (let i = 0; i < len; i++) {
            const subMesh = mesh.renderingSubMeshes[i];
            const geoInfo = subMesh.geometricInfo;
            if (geoInfo) {
                const primitiveMode = subMesh.primitiveMode;
                const vb: any = geoInfo.positions;
                const ib: any = geoInfo.indices;
                const wireFrameData = this._generateWireFrameData(vb, points.length / 3, ib, primitiveMode);
                if (wireFrameData) {
                    points = points.concat(wireFrameData.positions);
                    indices = indices.concat(wireFrameData.edgeIndices);
                }
            }
        }

        return { points, indices };
    }

    private _generateWireFrameData(vb: Float32Array, pointsOffset: number, ib: number[], primitiveMode: gfx.PrimitiveMode) {
        if (!ib) {
            console.error('indexBuffer of mesh is undefined');
            return null;
        }

        let positions: number[] = [];
        const edgeIndices: number[] = [];

        if (primitiveMode === gfx.PrimitiveMode.TRIANGLE_LIST) {
            positions = Array.from(vb);
            const triCount = ib.length / 3;
            for (let i = 0; i < triCount; i++) {
                const i0 = ib[i * 3 + 0] + pointsOffset;
                const i1 = ib[i * 3 + 1] + pointsOffset;
                const i2 = ib[i * 3 + 2] + pointsOffset;
                edgeIndices.push(i0, i1, i1, i2, i2, i0);
            }
        } else if (primitiveMode === gfx.PrimitiveMode.TRIANGLE_STRIP) {
            positions = Array.from(vb);
            const triCount = ib.length - 2;
            let rev = 0;
            for (let i = 0; i < triCount; i++) {
                const i0 = ib[i - rev] + pointsOffset;
                const i1 = ib[i + rev + 1] + pointsOffset;
                const i2 = ib[i + 2] + pointsOffset;
                edgeIndices.push(i0, i1, i1, i2, i2, i0);
                rev = ~rev;
            }
        } else if (primitiveMode === gfx.PrimitiveMode.TRIANGLE_FAN) {
            positions = Array.from(vb);
            const triCount = ib.length - 2;
            const i0 = ib[0] + pointsOffset;
            for (let i = 0; i < triCount; i += 1) {
                const i1 = ib[i + 1] + pointsOffset;
                const i2 = ib[i + 2] + pointsOffset;
                edgeIndices.push(i0, i1, i1, i2, i2, i0);
            }
        }

        return { positions, edgeIndices };
    }

    onTargetUpdate() {
        this.updateControllerData();
    }

    onNodeChanged() {
        this.updateControllerData();
    }
}

export const name = js.getClassName(MeshCollider);
export const SelectGizmo = MeshColliderGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
