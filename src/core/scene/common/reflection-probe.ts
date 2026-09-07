import type { IServiceEvents } from '../scene-process/service/core';

export interface IReflectionProbeBakeOptions {
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

export interface IReflectionProbeEvents {
    'reflection-probe:bake-start': [nodePath: string];
    'reflection-probe:bake-end': [nodePath: string, error?: string];
    'reflection-probe:bake-all-start': [totalCount: number];
    'reflection-probe:bake-all-progress': [completedCount: number, totalCount: number, nodePath: string, error?: string];
    'reflection-probe:bake-all-end': [bakedCount: number, failedCount: number, error?: string];
}

export interface IReflectionProbeService extends IServiceEvents {
    bake(options: IReflectionProbeBakeOptions): Promise<IReflectionProbeBakeResult>;
    bakeAll(options: IReflectionProbeBakeAllOptions): Promise<IReflectionProbeBakeAllResult>;
}

export type IPublicReflectionProbeService = Omit<IReflectionProbeService, keyof IServiceEvents>;
