import type { OperationEvent, ISceneMouseEvent, ISceneKeyboardEvent } from '../scene-process/service/operation/types';

export type { OperationEvent, ISceneMouseEvent, ISceneKeyboardEvent };
export { OperationPriority } from '../scene-process/service/operation/types';

export interface IOperationService {
    addListener(type: OperationEvent, listener: Function, priority?: number): void;
    removeListener(type: OperationEvent, listener: Function): void;
    dispatch(type: OperationEvent, ...args: any[]): void;
    emitMouseEvent(type: string, event: ISceneMouseEvent, dpr?: number): void;
    dispatchAsync(type: OperationEvent, ...args: any[]): Promise<void>;
    emitMouseEventAsync(type: string, event: ISceneMouseEvent, dpr?: number): Promise<void>;
    requestPointerLock(): void;
    exitPointerLock(): void;
    changePointer(type: string): void;
}

export type IPublicOperationService = Pick<IOperationService,
    'dispatch' | 'emitMouseEvent' | 'requestPointerLock' | 'exitPointerLock' | 'changePointer'
>;
