import { Vec3 } from 'cc';
import ModeBase3D from './mode-base-3d';
import { CameraMoveMode } from '../utils';
import type { ISceneMouseEvent } from '../../operation/types';
import type { CameraController3D } from '../camera-controller-3d';
import { enterCameraState, exitCameraState, NeedAnimState } from './engine-state';

const v3a = new Vec3();
const v3b = new Vec3();

class PanMode extends ModeBase3D {
    private _right = new Vec3();
    private _up = new Vec3();
    private _panningSpeed = 0.4;

    constructor(cameraCtrl: CameraController3D) {
        super(cameraCtrl, CameraMoveMode.PAN);
    }

    public async enter() {
        const node = this._cameraCtrl.node;
        node.getWorldRotation(this._curRot);

        Vec3.transformQuat(this._right, Vec3.UNIT_X, this._curRot);
        Vec3.normalize(this._right, this._right);
        Vec3.transformQuat(this._up, Vec3.UNIT_Y, this._curRot);
        Vec3.normalize(this._up, this._up);

        this._cameraCtrl.emit('camera-move-mode', CameraMoveMode.PAN);
        enterCameraState(NeedAnimState.CAMERA_PAN);
    }

    public async exit() {
        this._cameraCtrl.updateViewCenterByDist(-this._cameraCtrl.viewDist);
        exitCameraState(NeedAnimState.CAMERA_PAN);
    }

    onMouseMove(event: ISceneMouseEvent): boolean {
        const dx = event.moveDeltaX;
        const dy = event.moveDeltaY;
        const scalar = this._cameraCtrl.viewDist / 800;

        Vec3.multiplyScalar(v3a, this._right, -dx * this._panningSpeed * scalar);
        Vec3.multiplyScalar(v3b, this._up, dy * this._panningSpeed * scalar);

        this._cameraCtrl.node.getWorldPosition(this._curPos);
        Vec3.add(this._curPos, this._curPos, v3a);
        Vec3.add(this._curPos, this._curPos, v3b);
        this._cameraCtrl.node.setWorldPosition(this._curPos);

        Vec3.add(this._cameraCtrl.sceneViewCenter, this._cameraCtrl.sceneViewCenter, v3a);
        Vec3.add(this._cameraCtrl.sceneViewCenter, this._cameraCtrl.sceneViewCenter, v3b);
        this._cameraCtrl.viewDist = Vec3.distance(this._curPos, this._cameraCtrl.sceneViewCenter);

        this._cameraCtrl.updateGrid();

        return false;
    }
}

export default PanMode;
