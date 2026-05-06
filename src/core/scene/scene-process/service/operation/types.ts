export interface ISceneMouseEvent {
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    deltaX: number;
    deltaY: number;
    wheelDeltaX: number;
    wheelDeltaY: number;
    moveDeltaX: number;
    moveDeltaY: number;
    leftButton: boolean;
    middleButton: boolean;
    rightButton: boolean;
    button: number;
    buttons: number;
    movementX: number;
    movementY: number;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    hitPoint?: any;
    type?: string;
    handleName?: string;
}

export interface ISceneKeyboardEvent {
    key: string;
    keyCode: number;
    code: string;
    repeat: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
}

export type SceneMouseEvent = 'dblclick' | 'mousedown' | 'mousemove' | 'mouseup' | 'mousewheel';
export type SceneKeyboardEvent = 'keydown' | 'keyup';
export type SceneDragEvent = 'onDragLeave' | 'onDragOver' | 'onDrop';
export type OperationEvent = SceneDragEvent | SceneKeyboardEvent | SceneMouseEvent | 'resize';

export enum OperationPriority {
    Preview = 999,
    Gizmo = 99,
    Camera = 98,
}
