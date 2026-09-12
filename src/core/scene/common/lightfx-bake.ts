import type { IServiceEvents } from '../scene-process/service/core';
import type { ILightmapTextureInfo, ILightFXDiagnostics } from './lightfx-host';

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
    diagnostics?: ILightFXDiagnostics;
    version: 1;
    /** Same-Scene probe cancellation verifies the actual host's native operation ownership. */
    cancelVersion?: 1;
    /** Advisory readiness of this Scene's native probe operation; absent on older implementations. */
    cancellable?: boolean;
    /** SH Undo/Redo and multi-group scene reopening preserve baked results. */
    resultLifecycleVersion: 1;
    /** Both Scene and host participate in the full Bake/Clear transaction reservation. */
    sceneTransactionVersion: 1;
    /** Instantaneous shared host occupancy; execution still acquires its own reservation. */
    busy: boolean;
}

export interface ILightProbeBakeResult {
    diagnostics?: ILightFXDiagnostics;
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
    /** Existing assets parent directory. Saved results publish to scene-<scene UUID>/output; omitted uses db://assets/LightFX. */
    outputUrl?: string;
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

/** Implementation support, not native executable readiness or task recovery. */
export interface ILightmapBakeCapabilities {
    /** The actual host accepts a selected assets output directory. */
    outputDirectory?: true;
    diagnostics?: ILightFXDiagnostics;
    version: 1;
    /** Mesh/Terrain bindings, null references and live blocks are restored with the result history. */
    resultLifecycleVersion: 1;
    sceneTransactionVersion: 1;
    /** The actual host stages new UUIDs separately before saving and replacing prior outputs. */
    assetVersion: 1;
    /** Clear saves first, then deletes exact unreferenced immutable LightFX texture assets. */
    assetCleanupVersion?: 1;
    /** Same-Scene cancellation requires the actual host ownership protocol. */
    cancelVersion?: 1;
    /** Advisory: this Scene has obtained a native Lightmap operation ID. */
    cancellable?: boolean;
    busy: boolean;
}

export interface ILightmapBakeResult {
    diagnostics?: ILightFXDiagnostics;
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

export interface ILightmapClearResult {
    clearedCount: number;
    deletedAssetCount: number;
    retainedAssetCount: number;
    failedAssetCount: number;
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
    /** Cancels only this Scene's probe bake after native ownership is acquired; otherwise a no-op. */
    cancel(): Promise<ILightFXCancelResult>;
}

export interface ILightmapBakeService extends IServiceEvents {
    /** Queries this Scene and its actual host without modifying scene or task state. */
    queryCapabilities(): Promise<ILightmapBakeCapabilities>;
    bake(options: ILightmapBakeOptions): Promise<ILightmapBakeResult>;
    queryBakeInfo(): Promise<ILightmapBakeInfo>;
    /** Asset deletion saves the scene; unrelated history is kept, but pre-Clear baked results cannot be restored. */
    clearBake(options?: { saveScene?: boolean; deleteAssets?: boolean }): Promise<ILightmapClearResult>;
    /** Cancels only this Scene's lightmap bake after native ownership is acquired; otherwise a no-op. */
    cancel(): Promise<ILightFXCancelResult>;
}

export type IPublicLightProbeBakeService = Pick<ILightProbeBakeService, 'queryCapabilities' | 'bake' | 'clearBake' | 'cancel'>;
export type IPublicLightmapBakeService = Pick<ILightmapBakeService, 'queryCapabilities' | 'bake' | 'queryBakeInfo' | 'clearBake' | 'cancel'>;
