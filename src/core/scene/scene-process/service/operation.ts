import { BaseService } from './core';
import { register } from './core/decorator';
import { OperationManager } from './operation/operation-manager';
import type { ISceneMouseEvent, ISceneKeyboardEvent, OperationEvent } from './operation/types';

export interface IOperationEvents {
    'pointer-lock': [locked: boolean];
    'pointer-change': [type: string];
}

@register('Operation')
export class OperationService extends BaseService<IOperationEvents> {
    private _manager = new OperationManager();

    addListener(type: OperationEvent, listener: Function, priority?: number): void {
        this._manager.addListener(type, listener, priority);
    }

    removeListener(type: OperationEvent, listener: Function): void {
        this._manager.removeListener(type, listener);
    }

    dispatch(type: OperationEvent, ...args: any[]): void {
        this._manager.emit(type, ...args);
    }

    emitMouseEvent(type: string, event: ISceneMouseEvent, dpr: number = 1): void {
        this._manager.emitMouseEvent(type, event, dpr);
    }

    requestPointerLock(): void {
        this.broadcast('pointer-lock', true);
        try {
            const canvas = (cc as any).game?.canvas;
            if (canvas && canvas.requestPointerLock) {
                canvas.requestPointerLock();
            }
        } catch (e) {
            // canvas may not be ready
        }
    }

    exitPointerLock(): void {
        this.broadcast('pointer-lock', false);
        try {
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
        } catch (e) {
            // ignore
        }
    }

    changePointer(type: string): void {
        this.broadcast('pointer-change', type);
    }
}
