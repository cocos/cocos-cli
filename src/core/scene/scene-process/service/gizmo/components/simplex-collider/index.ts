'use strict';

import { Color, js, Quat, SimplexCollider, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import PointController from '../../controller/point';
import LineController from '../../controller/line';
import TriangleController from '../../controller/triangle';
import TetrahedronController from '../../controller/tetrahedron';
import { registerGizmo } from '../../gizmo-defines';

const tempVec3_a = new Vec3();
const tempVec3_b = new Vec3();
const tempVec3_c = new Vec3();
const tempVec3_d = new Vec3();
const tempQuat_a = new Quat();

class SimplexColliderGizmo extends GizmoBase<SimplexCollider> {
    private _shapeControllers: any = {};
    private _activeController: PointController | LineController | TriangleController | TetrahedronController | null = null;

    init() {
        this._isInitialized = true;
    }

    createControllerByShape(shape: SimplexCollider.ESimplexType) {
        const gizmoRoot = this.getGizmoRoot();
        let controller = null;
        switch (shape) {
            case SimplexCollider.ESimplexType.VERTEX:
                controller = new PointController(gizmoRoot);
                break;
            case SimplexCollider.ESimplexType.LINE:
                controller = new LineController(gizmoRoot);
                break;
            case SimplexCollider.ESimplexType.TRIANGLE:
                controller = new TriangleController(gizmoRoot);
                break;
            case SimplexCollider.ESimplexType.TETRAHEDRON:
                controller = new TetrahedronController(gizmoRoot);
                break;
            default:
                console.error('Invalid Type:', shape);
        }

        if (controller) {
            controller.setColor(Color.GREEN);
        }

        return controller;
    }

    getControllerByShape(shape: SimplexCollider.ESimplexType) {
        let controller = this._shapeControllers[shape];
        if (!controller) {
            controller = this.createControllerByShape(shape);
            this._shapeControllers[shape] = controller;
        }

        return controller;
    }

    onShow() {
        this.updateControllerData();
    }

    onHide() {
        if (this._activeController) {
            this._activeController.hide();
        }
    }

    updateControllerData() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        if (this.target instanceof SimplexCollider) {
            const node = this.target.node;

            const simplexCollider = this.target as SimplexCollider;

            this._activeController?.hide();

            this._activeController = this.getControllerByShape(simplexCollider.shapeType);
            const worldScale = node.getWorldScale();
            const worldPos = node.getWorldPosition();
            const worldRot = tempQuat_a;
            node.getWorldRotation(worldRot);
            this._activeController?.setScale(worldScale);
            this._activeController?.setPosition(worldPos);
            this._activeController?.setRotation(worldRot);

            switch (simplexCollider.shapeType) {
                case SimplexCollider.ESimplexType.VERTEX:
                    Vec3.add(tempVec3_a, simplexCollider.center, simplexCollider.vertex0);
                    (this._activeController as PointController).updateData(tempVec3_a);
                    break;
                case SimplexCollider.ESimplexType.LINE:
                    Vec3.add(tempVec3_a, simplexCollider.center, simplexCollider.vertex0);
                    Vec3.add(tempVec3_b, simplexCollider.center, simplexCollider.vertex1);
                    (this._activeController as LineController).updateData(tempVec3_a, tempVec3_b);
                    break;
                case SimplexCollider.ESimplexType.TRIANGLE:
                    Vec3.add(tempVec3_a, simplexCollider.center, simplexCollider.vertex0);
                    Vec3.add(tempVec3_b, simplexCollider.center, simplexCollider.vertex1);
                    Vec3.add(tempVec3_c, simplexCollider.center, simplexCollider.vertex2);
                    (this._activeController as TriangleController).updateData(tempVec3_a, tempVec3_b, tempVec3_c);
                    break;
                case SimplexCollider.ESimplexType.TETRAHEDRON:
                    Vec3.add(tempVec3_a, simplexCollider.center, simplexCollider.vertex0);
                    Vec3.add(tempVec3_b, simplexCollider.center, simplexCollider.vertex1);
                    Vec3.add(tempVec3_c, simplexCollider.center, simplexCollider.vertex2);
                    Vec3.add(tempVec3_d, simplexCollider.center, simplexCollider.vertex3);
                    (this._activeController as TetrahedronController).updateData(tempVec3_a, tempVec3_b, tempVec3_c, tempVec3_d);
            }

            this._activeController?.show();
        }
    }

    onTargetUpdate() {
        this.updateControllerData();
    }

    onNodeChanged() {
        this.updateControllerData();
    }
}

export const name = js.getClassName(SimplexCollider);
export const SelectGizmo = SimplexColliderGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
