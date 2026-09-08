import type { IServiceEvents } from '../scene-process/service/core';
import type { ILightmapTextureInfo } from './lightfx-host';

export interface ILightProbeBakeOptions {
    giScale?: number;
    giSamples?: number;
    bounces?: number;
    reduceRinging?: number;
    showWireframe?: boolean;
    showConvex?: boolean;
    lightProbeSphereVolume?: number;
    saveScene?: boolean;
    timeoutMs?: number;
}

export interface ILightProbeBakeResult {
    sceneUrl: string;
    probeCount: number;
    giScale: number;
    giSamples: number;
    bounces: number;
    reduceRinging: number;
    showWireframe: boolean;
    showConvex: boolean;
    lightProbeSphereVolume: number;
    durationMs: number;
}

export interface ILightmapBakeOptions {
    msaa?: 1 | 2 | 4 | 8;
    resolution?: 128 | 256 | 512 | 1024 | 2048;
    filter?: boolean;
    highp?: boolean;
    giScale?: number;
    giSamples?: number;
    giPathLength?: 1 | 2 | 3 | 4;
    aoLevel?: 0 | 1 | 2;
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

export interface ILightmapBakeInfo {
    sceneUrl: string;
    baked: boolean;
    meshCount: number;
    terrainCount: number;
    highp: boolean;
    stationaryMainLight: boolean;
    textures: ILightmapTextureInfo[];
    missingTextureUuids: string[];
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
    queryBakeInfo(): Promise<ILightmapBakeInfo>;
    clearBake(options?: { saveScene?: boolean; deleteAssets?: boolean }): Promise<{ clearedCount: number }>;
    cancel(): Promise<ILightFXCancelResult>;
}

export type IPublicLightProbeBakeService = Pick<ILightProbeBakeService, 'bake' | 'clearBake' | 'cancel'>;
export type IPublicLightmapBakeService = Pick<ILightmapBakeService, 'bake' | 'queryBakeInfo' | 'clearBake' | 'cancel'>;
