import type { IServiceEvents } from '../scene-process/service/core';

export interface ILightProbeBakeOptions {
    giScale?: number;
    giSamples?: number;
    bounces?: number;
    saveScene?: boolean;
    timeoutMs?: number;
}

export interface ILightProbeBakeResult {
    sceneUrl: string;
    probeCount: number;
    giScale: number;
    giSamples: number;
    bounces: number;
    durationMs: number;
}

export interface ILightmapBakeOptions {
    msaa?: 1 | 2 | 4 | 8;
    resolution?: number;
    filter?: boolean;
    highp?: boolean;
    giScale?: number;
    giSamples?: number;
    giPathLength?: number;
    aoLevel?: number;
    aoStrength?: number;
    aoRadius?: number;
    aoColor?: [number, number, number, number?];
    threads?: number;
    saveScene?: boolean;
    timeoutMs?: number;
}

export interface ILightmapBakeResult {
    sceneUrl: string;
    textureUrls: string[];
    meshCount: number;
    terrainCount: number;
    durationMs: number;
}

export interface ILightFXCancelResult {
    cancelled: boolean;
    target: 'light-probe' | 'lightmap' | null;
}

export interface ILightFXBakeEvents {
    'lightfx:bake-start': [target: 'light-probe' | 'lightmap'];
    'lightfx:bake-end': [target: 'light-probe' | 'lightmap', error?: string];
}

export interface ILightProbeBakeService extends IServiceEvents {
    bake(options: ILightProbeBakeOptions): Promise<ILightProbeBakeResult>;
    clearBake(options?: { saveScene?: boolean }): Promise<{ probeCount: number }>;
    cancel(): Promise<ILightFXCancelResult>;
}

export interface ILightmapBakeService extends IServiceEvents {
    bake(options: ILightmapBakeOptions): Promise<ILightmapBakeResult>;
    clearBake(options?: { saveScene?: boolean; deleteAssets?: boolean }): Promise<{ clearedCount: number }>;
    cancel(): Promise<ILightFXCancelResult>;
}

export type IPublicLightProbeBakeService = Pick<ILightProbeBakeService, 'bake' | 'clearBake' | 'cancel'>;
export type IPublicLightmapBakeService = Pick<ILightmapBakeService, 'bake' | 'clearBake' | 'cancel'>;
