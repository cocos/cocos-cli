/** A bake target supported by the native LightFX process. */
export type LightFXBakeTarget = 'light-probe' | 'lightmap';

/** JSON-safe reference to a texture needed by a LightFX input file. */
export interface ILightFXTextureSource {
    uuid: string;
    nativeExtension: string;
    fileName: string;
}

export interface IResolveLightFXTextureSourceOptions {
    uuid: string;
    nativeExtension: string;
}

export interface IResolvedLightFXTextureSource {
    fileName: string;
}

export interface IBeginLightFXBakeOptions {
    target: LightFXBakeTarget;
    sceneName: string;
    textureSources: ILightFXTextureSource[];
    timeoutMs: number;
}

export interface IBeginLightFXBakeResult {
    operationId: string;
}

export interface IAppendLightFXInputOptions {
    operationId: string;
    chunkBase64: string;
}

export interface IRunLightFXBakeOptions {
    operationId: string;
}

export interface ILightFXMeshResult {
    id: number;
    index: number;
    offset: number[];
    scale: number[];
}

export interface ILightFXTerrainResult extends ILightFXMeshResult {
    blockId: number;
}

export interface ILightFXProbeResult {
    position: number[];
    normal: number[];
    coefficients: number[];
}

/** Decoded LightFX output. It intentionally contains JSON-safe values only. */
export interface ILightFXResult {
    version: number;
    meshes: ILightFXMeshResult[];
    terrains: ILightFXTerrainResult[];
    probes: ILightFXProbeResult[];
}

export interface IRunLightFXBakeResult {
    result: ILightFXResult;
    textureUrls: string[];
}

export interface ILightFXOperationOptions {
    operationId: string;
}

export interface IRemoveLightmapAssetsOptions {
    sceneName: string;
}

/**
 * Node-hosted half of LightFX baking.
 *
 * The Scene runtime can be a child process or a browser Webview. Consequently every argument and
 * return value in this contract must remain JSON serializable and must not expose host file paths.
 */
export interface ILightFXBakeHostService {
    resolveTextureSource(options: IResolveLightFXTextureSourceOptions): Promise<IResolvedLightFXTextureSource | null>;
    begin(options: IBeginLightFXBakeOptions): Promise<IBeginLightFXBakeResult>;
    appendInput(options: IAppendLightFXInputOptions): Promise<void>;
    run(options: IRunLightFXBakeOptions): Promise<IRunLightFXBakeResult>;
    commit(options: ILightFXOperationOptions): Promise<void>;
    rollback(options: ILightFXOperationOptions): Promise<void>;
    cancel(): Promise<{ cancelled: boolean; target: LightFXBakeTarget | null }>;
    removeLightmapAssets(options: IRemoveLightmapAssetsOptions): Promise<void>;
}
