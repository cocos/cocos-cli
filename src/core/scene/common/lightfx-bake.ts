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

/** Versioned implementation support, not native executable readiness or a recoverable task. */
export interface ILightProbeBakeCapabilities {
    version: 1;
    /** SH Undo/Redo and multi-group scene reopening preserve baked results. */
    resultLifecycleVersion: 1;
    /** Both Scene and host participate in the full Bake/Clear transaction reservation. */
    sceneTransactionVersion: 1;
    /** Instantaneous shared host occupancy; execution still acquires its own reservation. */
    busy: boolean;
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

/** Implementation support, not native executable readiness, task recovery or safe asset deletion. */
export interface ILightmapBakeCapabilities {
    version: 1;
    /** Mesh/Terrain bindings, null references and live blocks are restored with the result history. */
    resultLifecycleVersion: 1;
    sceneTransactionVersion: 1;
    /** The actual host preserves previous textures in immutable per-operation directories. */
    assetVersion: 1;
    busy: boolean;
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
    /** Queries this Scene implementation and its actual host without modifying scene or task state. */
    queryCapabilities(): Promise<ILightProbeBakeCapabilities>;
    bake(options: ILightProbeBakeOptions): Promise<ILightProbeBakeResult>;
    clearBake(options?: { saveScene?: boolean }): Promise<{ probeCount: number }>;
    cancel(): Promise<ILightFXCancelResult>;
}

export interface ILightmapBakeService extends IServiceEvents {
    /** Queries this Scene and its actual host without modifying scene or task state. */
    queryCapabilities(): Promise<ILightmapBakeCapabilities>;
    bake(options: ILightmapBakeOptions): Promise<ILightmapBakeResult>;
    queryBakeInfo(): Promise<ILightmapBakeInfo>;
    clearBake(options?: { saveScene?: boolean; deleteAssets?: boolean }): Promise<{ clearedCount: number }>;
    cancel(): Promise<ILightFXCancelResult>;
}

export type IPublicLightProbeBakeService = Pick<ILightProbeBakeService, 'queryCapabilities' | 'bake' | 'clearBake' | 'cancel'>;
export type IPublicLightmapBakeService = Pick<ILightmapBakeService, 'queryCapabilities' | 'bake' | 'queryBakeInfo' | 'clearBake' | 'cancel'>;
