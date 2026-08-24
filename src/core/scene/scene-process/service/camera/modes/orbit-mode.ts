import { Quat, Vec3 } from 'cc';
import ModeBase3D from './mode-base-3d';
import { CameraMoveMode } from '../utils';
import type { ISceneMouseEvent } from '../../operation/types';
import type { CameraController3D } from '../camera-controller-3d';
import { enterCameraState, exitCameraState, NeedAnimState } from './engine-state';

class OrbitMode extends ModeBase3D {
    private _rotateSpeed = 0.006;

    constructor(cameraCtrl: CameraController3D) {
        super(cameraCtrl, CameraMoveMode.ORBIT);
    }

    public async enter() {
        const node = this._cameraCtrl.node;
        node.getWorldPosition(this._curPos);
        node.getWorldRotation(this._curRot);
        this._cameraCtrl.viewDist = Vec3.distance(this._curPos, this._cameraCtrl.sceneViewCenter);
        this._cameraCtrl.emit('camera-move-mode', CameraMoveMode.ORBIT);
        enterCameraState(NeedAnimState.CAMERA_ORBIT);
    }

    public async exit() {
        exitCameraState(NeedAnimState.CAMERA_ORBIT);
    }

    onMouseDown(event: ISceneMouseEvent): boolean {
        return false;
    }

    onMouseMove(event: ISceneMouseEvent): boolean {
        if (!event.leftButton) return true;

        const dx = event.moveDeltaX;
        const dy = event.moveDeltaY;
        const rot = this._curRot;

        Quat.rotateX(rot, rot, -dy * this._rotateSpeed);
        Quat.rotateAround(rot, rot, Vec3.UNIT_Y, -dx * this._rotateSpeed);

        const euler = new Vec3();
        Quat.toEuler(euler, rot);
        Quat.fromEuler(rot, euler.x, euler.y, 0); // clear Z rotation

        const offset = new Vec3(0, 0, 1);
        Vec3.transformQuat(offset, offset, rot);
        Vec3.normalize(offset, offset);
        Vec3.multiplyScalar(offset, offset, this._cameraCtrl.viewDist);
        Vec3.add(this._curPos, this._cameraCtrl.sceneViewCenter, offset);

        this._cameraCtrl.node.setWorldPosition(this._curPos);

        const up = new Vec3(0, 1, 0);
        Vec3.transformQuat(up, up, rot);
        Vec3.normalize(up, up);

        this._cameraCtrl.node.lookAt(this._cameraCtrl.sceneViewCenter, up);
        this._cameraCtrl.updateGrid();

        return false;
    }

    onMouseUp(event: ISceneMouseEvent): boolean {
        return false;
    }
}

export default OrbitMode;
