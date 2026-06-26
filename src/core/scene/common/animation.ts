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

export interface IAnimationClipsInfo extends IAnimationRootResult {
    clipsMenu: IAnimationClipMenuItem[];
    defaultClip: string;
}

export interface IAnimationRootInfo extends IAnimationClipsInfo {
    nodeTreeDump: unknown;
    clipDump: unknown;
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

export interface IAnimationService extends IServiceEvents {
    enter(options: IAnimationEnterOptions): Promise<IAnimationStateInfo>;
    exit(options: IAnimationExitOptions): Promise<IAnimationStateInfo>;
    queryState(): Promise<IAnimationStateInfo>;
    queryRoot(options: IAnimationTargetOptions): Promise<IAnimationRootResult>;
    queryRootInfo(options: IAnimationTargetOptions): Promise<IAnimationRootInfo>;
    queryClips(options: IAnimationTargetOptions): Promise<IAnimationClipsInfo>;
    queryProperties(options: IAnimationTargetOptions): Promise<IAnimationPropertyInfo[]>;
    queryTime(options: IAnimationTimeOptions): Promise<number>;
    setTime(options: IAnimationSetTimeOptions): Promise<boolean>;
    changePlayState(options: IAnimationPlayStateOptions): Promise<boolean>;
    changeEditClip(options: IAnimationEditClipOptions): Promise<boolean>;
    save(): Promise<boolean>;
}

export type IPublicAnimationService = Omit<IAnimationService, keyof IServiceEvents>;
