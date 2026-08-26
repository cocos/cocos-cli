import type { IServiceEvents } from '../scene-process/service/core';

export interface IReflectionProbeBakeOptions {
    nodePath: string;
    fastBake?: boolean;
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

export interface IReflectionProbeEvents {
    'reflection-probe:bake-start': [nodePath: string];
    'reflection-probe:bake-end': [nodePath: string, error?: string];
}

export interface IReflectionProbeService extends IServiceEvents {
    bake(options: IReflectionProbeBakeOptions): Promise<IReflectionProbeBakeResult>;
}

export type IPublicReflectionProbeService = Omit<IReflectionProbeService, keyof IServiceEvents>;
