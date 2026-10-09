import { ModeBase2D } from './mode-base-2d';
import { CameraMoveMode } from '../utils';
import type { ISceneMouseEvent } from '../../operation/types';
import type { CameraController2D } from '../camera-controller-2d';

class PanMode2D extends ModeBase2D {
    constructor(cameraCtrl: CameraController2D) {
        super(cameraCtrl, CameraMoveMode.PAN);
    }

    public async enter() {
        this._cameraCtrl.emit('camera-move-mode', CameraMoveMode.PAN);
        try {
            const { Service } = require('../../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    public async exit() {
        try {
            const { Service } = require('../../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    onMouseMove(event: ISceneMouseEvent): boolean {
        const dx = event.moveDeltaX;
        const dy = event.moveDeltaY;
        this._cameraCtrl.grid.pan(dx, dy);
        this._cameraCtrl.adjustCamera();
        return false;
    }
}

export { PanMode2D };
