import { Quat, Vec3, math } from 'cc';
import ModeBase3D from './mode-base-3d';
import { CameraMoveMode, CameraUtils } from '../utils';
import { AnimVec3 } from '../animate-value';
import type { ISceneMouseEvent, ISceneKeyboardEvent } from '../../operation/types';
import type { CameraController3D } from '../camera-controller-3d';

const v3b = new Vec3();
const v3c = new Vec3();
const v3d = new Vec3();

const minSpeedScale = 0.01;
const maxSpeedScale = 2.00;

function speedToWheelValue(delta: number, min = 0.01, max = 100) {
    return ((delta - min) * (maxSpeedScale - minSpeedScale)) / (max - min) + minSpeedScale;
}

function wheel2Speed(delta: number, min = 0.01, max = 100) {
    return ((delta - minSpeedScale) * (max - min)) / (maxSpeedScale - minSpeedScale) + min;
}

const wanderKeyMap: Record<string, string> = {
    'q': 'down',
    'w': 'zoom-in',
    'e': 'up',
    'a': 'left',
    's': 'zoom-out',
    'd': 'right',
};

function findWanderShortcut(event: ISceneKeyboardEvent): string | null {
    const key = event.key.toLowerCase();
    return wanderKeyMap[key] || null;
}

class WanderMode extends ModeBase3D {
    private _curMouseDX = 0;
    private _curMouseDY = 0;
    private _rotateSpeed = 0.002;
    private _movingSpeedShiftScale = 10;
    private _damping = 0.6;
    private _wanderSpeed = 10;
    private _flyAcceleration = 2;
    private _shiftKey = false;
    private _velocity = new Vec3();
    private _wanderKeyDown = false;
    private _destPos = new Vec3();
    private _destRot = new Quat();
    private _wanderSpeedTarget = 0;
    private _wanderAnim = new AnimVec3(new Vec3());
    private _enableAcceleration = true;

    constructor(cameraCtrl: CameraController3D) {
        super(cameraCtrl, CameraMoveMode.WANDER);
    }

    public get wanderSpeed() {
        return this._wanderSpeed;
    }

    public set wanderSpeed(value: number) {
        this._wanderSpeed = value;
    }

    public get enableAcceleration() {
        return this._enableAcceleration;
    }

    public set enableAcceleration(value: boolean) {
        this._enableAcceleration = value;
    }

    public async enter() {
        const node = this._cameraCtrl.node;
        node.getWorldPosition(this._curPos);
        node.getWorldRotation(this._curRot);
        this._destPos = this._curPos.clone();
        this._destRot = this._curRot.clone();

        this._curMouseDX = 0;
        this._curMouseDY = 0;
        this._wanderKeyDown = false;
        this._shiftKey = false;
        this._wanderSpeedTarget = 0;
        this._wanderAnim.value = new Vec3();

        try {
            const { Service } = require('../../core/decorator');
            Service.Operation?.requestPointerLock?.();
        } catch (e) {
            // Operation may not be ready
        }

        this._cameraCtrl.emit('camera-move-mode', CameraMoveMode.WANDER);
        CameraUtils.showWanderTip();

        try {
            const { Service } = require('../../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    public async exit() {
        CameraUtils.hideWanderTip();
        try {
            const { Service } = require('../../core/decorator');
            Service.Operation?.exitPointerLock?.();
        } catch (e) {
            // Operation may not be ready
        }

        this._cameraCtrl.updateViewCenterByDist(-this._cameraCtrl.viewDist);
        this._velocity.set(0, 0, 0);

        try {
            const { Service } = require('../../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    onMouseMove(event: ISceneMouseEvent): boolean {
        this._curMouseDX += event.moveDeltaX;
        this._curMouseDY += event.moveDeltaY;
        return false;
    }

    onMouseWheel(event: ISceneMouseEvent) {
        const step = 0.1;
        let speed = speedToWheelValue(this.wanderSpeed);
        if (event.deltaY > 0) {
            speed -= step;
            speed = Math.max(0.01, speed);
        } else {
            speed += step;
            speed = Math.min(2, speed);
        }
        this.wanderSpeed = parseFloat(wheel2Speed(speed).toFixed(2));
        CameraUtils.showWanderSpeedToast(speed, this.wanderSpeed);
    }

    onKeyDown(event: ISceneKeyboardEvent) {
        this._shiftKey = event.shiftKey;

        const message = findWanderShortcut(event);
        if (!message) return;

        switch (message) {
            case 'right':
                this._velocity.x = 1;
                break;
            case 'left':
                this._velocity.x = -1;
                break;
            case 'up':
                this._velocity.y = 1;
                break;
            case 'down':
                this._velocity.y = -1;
                break;
            case 'zoom-out':
                this._velocity.z = 1;
                break;
            case 'zoom-in':
                this._velocity.z = -1;
                break;
        }

        if (!this._wanderKeyDown) {
            this._wanderKeyDown = true;
        }
    }

    onKeyUp(event: ISceneKeyboardEvent) {
        this._shiftKey = event.shiftKey;

        const message = findWanderShortcut(event);
        if (!message) return;

        switch (message) {
            case 'right':
                if (this._velocity.x > 0) {
                    this._velocity.x = 0;
                }
                break;
            case 'left':
                if (this._velocity.x < 0) {
                    this._velocity.x = 0;
                }
                break;
            case 'up':
                if (this._velocity.y > 0) {
                    this._velocity.y = 0;
                }
                break;
            case 'down':
                if (this._velocity.y < 0) {
                    this._velocity.y = 0;
                }
                break;
            case 'zoom-out':
                if (this._velocity.z > 0) {
                    this._velocity.z = 0;
                }
                break;
            case 'zoom-in':
                if (this._velocity.z < 0) {
                    this._velocity.z = 0;
                }
                break;
        }

        if (this._velocity.equals3f(0, 0, 0)) {
            this._wanderKeyDown = false;
        }
    }

    onUpdate(deltaTime: number) {
        const eye = this._destPos;
        const rot = this._destRot;
        const dt = deltaTime;

        Quat.rotateX(rot, rot, -this._curMouseDY * this._rotateSpeed);
        Quat.rotateAround(rot, rot, Vec3.UNIT_Y, -this._curMouseDX * this._rotateSpeed);
        const euler = v3b;
        Quat.toEuler(euler, rot);
        Quat.fromEuler(rot, euler.x, euler.y, 0);
        Quat.slerp(this._curRot, this._curRot, rot, this._damping);

        const isMoving = this._velocity.lengthSqr() > 0;
        const moveScale = this._shiftKey ? this._movingSpeedShiftScale : 1;

        if (isMoving) {
            let acceleration = 1;
            if (this._enableAcceleration) {
                acceleration = Math.pow(this._flyAcceleration, dt);
            }
            this._wanderSpeedTarget = this._wanderSpeedTarget < math.EPSILON ? this._wanderSpeed : this._wanderSpeedTarget * acceleration;
        } else {
            this._wanderSpeedTarget = 0;
        }

        Vec3.multiplyScalar(v3c, this._velocity.normalize(), this._wanderSpeedTarget * moveScale);
        this._wanderAnim.target = v3c;

        this._wanderAnim.update(dt);

        v3c.set(0, 0, 0);
        Vec3.multiplyScalar(v3d, this._wanderAnim.value, dt);
        Vec3.transformQuat(v3d, v3d, this._curRot);
        Vec3.add(eye, eye, v3d);
        Vec3.lerp(this._curPos, this._curPos, eye, this._damping);

        // CLI-specific: request repaint since we don't have enterState/exitState
        if (this._wanderKeyDown || this._curMouseDX !== 0 || this._curMouseDY !== 0) {
            try {
                const { Service } = require('../../core/decorator');
                Service.Engine?.repaintInEditMode?.();
            } catch (e) {
                // Engine may not be ready
            }
        }

        this._cameraCtrl.node.setPosition(this._curPos);
        this._cameraCtrl.node.setRotation(this._curRot);
        this._curMouseDX = 0;
        this._curMouseDY = 0;
        this._cameraCtrl.updateGrid();
    }
}

export default WanderMode;
