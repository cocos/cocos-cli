import type { Vec3 } from 'cc';
import ModeBase3D from './mode-base-3d';
import { CameraMoveMode } from '../utils';
import type { ISceneMouseEvent } from '../../operation/types';
import type { CameraController3D } from '../camera-controller-3d';
import { enterCameraState, exitCameraState, NeedAnimState } from './engine-state';

class PanMode extends ModeBase3D {
    private _reference?: Vec3;

    constructor(cameraCtrl: CameraController3D) {
        super(cameraCtrl, CameraMoveMode.PAN);
    }

    /**
     * 进入平移模式并记录本次拖动的参考点
     *
     * 空格键进入时没有鼠标坐标，参考点延迟到首次移动时确定
     */
    public async enter(options?: { event?: ISceneMouseEvent }) {
        const event = options?.event;
        this._reference = event ? this._cameraCtrl.getPanPoint(event.x, event.y) : undefined;

        this._cameraCtrl.emit('camera-move-mode', CameraMoveMode.PAN);
        enterCameraState(NeedAnimState.CAMERA_PAN);
    }

    /** 结束拖动并同步聚焦点，为后续环绕和缩放提供参考 */
    public async exit() {
        this._reference = undefined;
        this._cameraCtrl.updateViewCenterByDist(-this._cameraCtrl.viewDist);

        exitCameraState(NeedAnimState.CAMERA_PAN);
    }

    /** 按本次拖动固定的参考深度处理鼠标位移 */
    onMouseMove(event: ISceneMouseEvent): boolean {
        // 用当前位置减去本次增量还原起点，后续移动复用同一个参考点
        this._reference ??= this._cameraCtrl.getPanPoint(
            event.x - event.moveDeltaX,
            event.y - event.moveDeltaY,
        );

        this._cameraCtrl.pan(event.moveDeltaX, event.moveDeltaY, this._reference);
        return false;
    }
}

export default PanMode;
