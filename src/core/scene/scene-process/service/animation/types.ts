import type { Animation, AnimationClip, Node, animation } from 'cc';
import type { IUndoCheckpoint } from '../../../common';
import type { IAnimationSampledNodeState } from './sampled-state';

export interface IAnimationData {
    node: Node;
    animComp: Animation | animation.AnimationController;
    clips: AnimationClip[];
    defaultClip: AnimationClip | null;
}

export interface IAnimationSession {
    previousEditorType: 'scene' | 'prefab' | 'unknown';
    previousSelection: string[];
    restoreSelectionOnExit: boolean;
    rootUuid: string;
    rootPath: string;
    clipUuid: string;
    sampledRootState: IAnimationSampledNodeState | null;
    undoBaseline: IUndoCheckpoint;
    globalDirtyAtEnter: boolean;
}
