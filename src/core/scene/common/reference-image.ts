import type { IServiceEvents } from '../scene-process/service/core';

/** Persisted locally; external files themselves are never imported into AssetDB. */
export interface IReferenceImageConfigItem {
    path: string;
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    /** Opacity is a percentage in the inclusive 0–100 range. */
    opacity: number;
}

export interface IReferenceImageConfig {
    images: IReferenceImageConfigItem[];
    sceneBindings: Record<string, string>;
    desiredVisible: boolean;
}

export interface IReferenceImageItem extends IReferenceImageConfigItem {
    missing: boolean;
}

export type ReferenceImageVisibilityReason =
    | 'visible'
    | 'disabled'
    | 'no-editor'
    | 'not-2d'
    | 'unbound'
    | 'missing'
    | 'load-error';

export interface IReferenceImageError {
    stage: 'config' | 'file' | 'decode';
    message: string;
}

/** A read-only snapshot; `current.image` is derived from library + binding. */
export interface IReferenceImageState {
    images: IReferenceImageItem[];
    current: {
        sceneUuid: string | null;
        imagePath: string | null;
        image: IReferenceImageItem | null;
    };
    desiredVisible: boolean;
    effectiveVisible: boolean;
    visibilityReason: ReferenceImageVisibilityReason;
    is2D: boolean;
    hasOpenEditor: boolean;
    error: IReferenceImageError | null;
}

export interface IReferenceImageParameters {
    x?: number;
    y?: number;
    scaleX?: number;
    scaleY?: number;
    opacity?: number;
}

export interface IReferenceImagePreviewOptions {
    interactionId: number;
    patch: IReferenceImageParameters;
}

export interface IReferenceImageCommitOptions {
    interactionId?: number;
    patch: IReferenceImageParameters;
}

export interface IReferenceImageCancelOptions {
    interactionId: number;
}

export interface IReferenceImagePathOptions {
    path: string;
}

export interface IReferenceImageVisibilityOptions {
    desiredVisible: boolean;
}

export interface IReferenceImageEvents {
    'reference-image:state-changed': [state: IReferenceImageState];
}

/** Scene-local service; preview APIs are intentionally restricted to Webviews. */
export interface IReferenceImageService extends IServiceEvents {
    getState(): Promise<IReferenceImageState>;
    addAndSelect(options: IReferenceImagePathOptions): Promise<IReferenceImageState>;
    remove(options: IReferenceImagePathOptions): Promise<IReferenceImageState>;
    select(options: IReferenceImagePathOptions): Promise<IReferenceImageState>;
    clearBinding(): Promise<IReferenceImageState>;
    setVisible(options: IReferenceImageVisibilityOptions): Promise<IReferenceImageState>;
    refresh(): Promise<IReferenceImageState>;
    previewParameters(options: IReferenceImagePreviewOptions): Promise<IReferenceImageState>;
    commitParameters(options: IReferenceImageCommitOptions): Promise<IReferenceImageState>;
    cancelPreview(options: IReferenceImageCancelOptions): Promise<IReferenceImageState>;
}

/** Node/MCP facade excludes ephemeral preview state and interaction generations. */
export type IPublicReferenceImageService = Pick<IReferenceImageService,
    'getState' | 'addAndSelect' | 'remove' | 'select' | 'clearBinding' | 'setVisible' | 'refresh' | 'commitParameters'
>;

export interface IReferenceImageFileService {
    readDataUrl(path: string): Promise<string>;
}
