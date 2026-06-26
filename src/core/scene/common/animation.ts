import type { IServiceEvents } from '../scene-process/service/core';

export type AnimationMode = 'general' | 'prefab' | 'animation' | 'preview' | 'unknown';
export type AnimationEditorType = 'scene' | 'prefab' | 'unknown';
export type AnimationPlayState = 'stop' | 'playing' | 'pause';
export type AnimationPlayOperation = 'play' | 'pause' | 'resume' | 'stop';

export interface IAnimationTargetOptions {
    nodePath?: string;
    nodeUuid?: string;
    rootPath?: string;
    rootUuid?: string;
}

export interface IAnimationEnterOptions {
    rootPath?: string;
    rootUuid?: string;
    clipUuid?: string;
    restoreSelectionOnExit?: boolean;
}

export interface IAnimationExitOptions {
    save?: boolean;
    restoreSelection?: boolean;
    restoreSampledSceneState?: boolean;
}

export interface IAnimationTimeOptions {
    clipUuid?: string;
}

export interface IAnimationQueryClipOptions extends IAnimationTargetOptions {
    clipUuid?: string;
}

export interface IAnimationQueryPropertyValueAtFrameOptions {
    clipUuid?: string;
    nodePath?: string;
    nodeUuid?: string;
    propKey: string;
    frame: number;
}

export interface IAnimationSetTimeOptions {
    time: number;
}

export interface IAnimationPlayStateOptions {
    operate: AnimationPlayOperation;
    clipUuid?: string;
}

export interface IAnimationEditClipOptions {
    clipUuid: string;
}

export interface IAnimationRootResult {
    rootUuid: string;
    rootPath: string;
}

export interface IAnimationClipMenuItem {
    uuid: string;
    name: string;
}

export interface IAnimationEventDump {
    frame: number;
    func: string;
    params: unknown[];
}

export interface IAnimationClipDump {
    name: string;
    duration: number;
    sample: number;
    speed: number;
    wrapMode: number;
    curves: unknown[];
    events: IAnimationEventDump[];
    embeddedPlayers: unknown[];
    embeddedPlayerGroups: unknown[];
    time: number;
    isLock: boolean;
    useBakedAnimation: boolean;
}

export interface IAnimationClipsInfo extends IAnimationRootResult {
    clipsMenu: IAnimationClipMenuItem[];
    defaultClip: string;
}

export interface IAnimationRootInfo extends IAnimationClipsInfo {
    nodeTreeDump: unknown;
    clipDump: IAnimationClipDump | null;
    time: number;
    state: AnimationPlayState;
    useBakedAnimation: boolean;
}

export interface IAnimationStateInfo {
    active: boolean;
    editorType: AnimationEditorType;
    mode: AnimationMode;
    rootUuid: string;
    rootPath: string;
    clipUuid: string;
    time: number;
    playState: AnimationPlayState;
    selection: string[];
    restoreSelectionOnExit: boolean;
}

export interface IAnimationPropertyInfo {
    name: string;
    key: string;
    displayName: string;
    type: { value: string };
    menuName: string;
    comp?: string;
    category?: string;
}

export interface IAnimationOperation {
    funcName: string;
    args: unknown[];
}

export interface IAnimationOperationOptions {
    operations: IAnimationOperation[];
    recordUndo?: boolean;
}

export interface IAnimationOperationResult {
    state: 'success' | 'failure';
    result: unknown;
    reason?: string;
}

export interface IAnimationService extends IServiceEvents {
    enter(options: IAnimationEnterOptions): Promise<IAnimationStateInfo>;
    exit(options: IAnimationExitOptions): Promise<IAnimationStateInfo>;
    queryState(): Promise<IAnimationStateInfo>;
    queryRoot(options: IAnimationTargetOptions): Promise<IAnimationRootResult>;
    queryRootInfo(options: IAnimationTargetOptions): Promise<IAnimationRootInfo>;
    queryClip(options: IAnimationQueryClipOptions): Promise<IAnimationClipDump>;
    queryClips(options: IAnimationTargetOptions): Promise<IAnimationClipsInfo>;
    queryProperties(options: IAnimationTargetOptions): Promise<IAnimationPropertyInfo[]>;
    queryTime(options: IAnimationTimeOptions): Promise<number>;
    queryPropertyValueAtFrame(options: IAnimationQueryPropertyValueAtFrameOptions): Promise<unknown>;
    setTime(options: IAnimationSetTimeOptions): Promise<boolean>;
    changePlayState(options: IAnimationPlayStateOptions): Promise<boolean>;
    changeEditClip(options: IAnimationEditClipOptions): Promise<boolean>;
    applyOperation(options: IAnimationOperationOptions): Promise<IAnimationOperationResult>;
    save(): Promise<boolean>;
}

export type IPublicAnimationService = Omit<IAnimationService, keyof IServiceEvents>;
