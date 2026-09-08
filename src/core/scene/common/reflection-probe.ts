import type { IServiceEvents } from '../scene-process/service/core';

/** Identifies one loaded scene, including close/reopen and runtime replacement. */
export interface IReflectionProbeSceneIdentity {
    runtimeId: string;
    sceneUuid: string;
    generation: number;
}

export interface IReflectionProbeBakeOptions {
    source?: IReflectionProbeSceneIdentity;
    nodePath: string;
    saveScene?: boolean;
    timeoutMs?: number;
}

export interface IReflectionProbeBakeResult {
    nodePath: string;
    componentUuid: string;
    probeId: number;
    cubemapUuid: string;
    cubemapUrl: string;
    fastBake: boolean;
}

export interface IReflectionProbeBakeAllOptions {
    source?: IReflectionProbeSceneIdentity;
    /** Explicit component selection. Empty selections are rejected, never expanded to all probes. */
    componentUuids?: string[];
    /** Omit or pass an empty array to bake every active cube reflection probe. */
    nodePaths?: string[];
    saveScene?: boolean;
    timeoutMs?: number;
}

export interface IReflectionProbeBakeFailure {
    nodePath: string;
    componentUuid?: string;
    reason: string;
}

export interface IReflectionProbeBakeAllResult {
    sceneUrl: string;
    totalCount: number;
    bakedCount: number;
    failedCount: number;
    results: IReflectionProbeBakeResult[];
    failures: IReflectionProbeBakeFailure[];
    durationMs: number;
}

export interface IReflectionProbeClearOptions {
    source?: IReflectionProbeSceneIdentity;
    /** Save the active scene after all cubemap bindings are cleared. */
    saveScene?: boolean;
    /** Delete generated PNG and convolution assets after the scene no longer references them. */
    deleteAssets?: boolean;
    timeoutMs?: number;
}

export interface IReflectionProbeClearFailure {
    assetUrl: string;
    reason: string;
}

export interface IReflectionProbeClearResult {
    sceneUrl: string;
    totalCount: number;
    clearedCount: number;
    deletedAssetUrls: string[];
    failures: IReflectionProbeClearFailure[];
    durationMs: number;
}

export interface IReflectionProbeCancelOptions {
    taskId: string;
    source?: IReflectionProbeSceneIdentity;
}

export interface IReflectionProbeTaskState {
    revision: number;
    logs: Array<{ id: number; timestamp: number; level: 'info' | 'error'; message: string }>;
    taskId: string | null;
    source?: IReflectionProbeSceneIdentity;
    status: 'idle' | 'baking' | 'clearing' | 'completed' | 'failed' | 'cancelling' | 'cancelled';
    current?: { nodePath: string; componentUuid: string };
    remaining: Array<{ nodePath: string; componentUuid: string }>;
    total: number;
    completed: number;
    results: IReflectionProbeBakeResult[];
    failures: IReflectionProbeBakeFailure[];
    error?: string;
}

export interface IReflectionProbeEvents {
    'reflection-probe:task-changed': [state: IReflectionProbeTaskState];
    'reflection-probe:bake-start': [nodePath: string];
    'reflection-probe:bake-end': [nodePath: string, error?: string];
    'reflection-probe:bake-all-start': [totalCount: number];
    'reflection-probe:bake-all-progress': [completedCount: number, totalCount: number, nodePath: string, error?: string];
    'reflection-probe:bake-all-end': [bakedCount: number, failedCount: number, error?: string];
}

export interface IReflectionProbeService extends IServiceEvents {
    getSceneIdentity(): Promise<IReflectionProbeSceneIdentity>;
    startBake(options: IReflectionProbeBakeAllOptions): Promise<IReflectionProbeTaskState>;
    cancelBake(options: IReflectionProbeCancelOptions): Promise<IReflectionProbeTaskState>;
    getTaskState(source?: IReflectionProbeSceneIdentity): Promise<IReflectionProbeTaskState>;
    bake(options: IReflectionProbeBakeOptions): Promise<IReflectionProbeBakeResult>;
    bakeAll(options: IReflectionProbeBakeAllOptions): Promise<IReflectionProbeBakeAllResult>;
    clearAll(options?: IReflectionProbeClearOptions): Promise<IReflectionProbeClearResult>;
}

export type IPublicReflectionProbeService = Omit<IReflectionProbeService, keyof IServiceEvents>;
