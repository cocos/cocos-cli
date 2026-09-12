/** A bake target supported by the native LightFX process. */
export type LightFXBakeTarget = 'light-probe' | 'lightmap';

/** Internal scene transaction ownership; not a public task or authentication token. */
export interface IReserveLightFXSceneOperationOptions {
    target: LightFXBakeTarget;
    action: 'bake' | 'clear';
}

export interface ILightFXSceneOperationToken {
    transactionId: string;
}

/** Read-only host protocol snapshot. Busy is advisory, not permission to start a transaction. */
export interface ILightFXHostCapabilities {
    sceneTransactionVersion: 1;
    /** Absent on legacy hosts; version 1 publishes immutable per-operation Lightmap assets. */
    lightmapAssetVersion?: 1;
    /** Accepts an existing assets directory as the Lightmap output parent. */
    lightmapOutputDirectory?: true;
    /** Deletes only unreferenced immutable LightFX textures selected by exact UUID. */
    lightmapAssetCleanupVersion?: 1;
    /** Supports exact cleanup inside the owning Bake transaction after Scene confirms saving. */
    lightmapRebakeCleanupVersion?: 1;
    /** Post-save, UUID-preserving relocation into the current fixed output directory. */
    lightmapPublicationVersion?: 1;
    /** Stages, publishes and precisely cleans up native lfx.in/out/log assets. */
    lightmapAuxiliaryAssetsVersion?: 1;
    /** Version 1 requires the exact native operation, target and scene reservation to cancel. */
    cancelOwnershipVersion?: 1;
    diagnosticsVersion?: 1;
    busy: boolean;
}

/** Native diagnostic data is informational and never controls the bake transaction. */
export interface ILightFXDiagnostics {
    /** Internal identity lets terminal readers reject logs from an earlier bake. */
    operationId?: string;
    version: 1;
    stage: string;
    logs: string[];
    progress?: string;
    /** Verified percentage from the native Progress channel; absent for unknown payload formats. */
    rate?: number;
}

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

/** Counts from the actual exported world, not the scene hierarchy or the native debug log. */
export interface ILightFXSceneStats {
    objects: number;
    lights: number;
    triangles: number;
}

export interface IBeginLightFXBakeOptions {
    sceneStats?: ILightFXSceneStats;
    /** Stable saved scene identity for exact generated-asset cleanup after reopening. */
    sceneUuid?: string;
    outputUrl?: string;
    transactionId?: string;
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

export interface IPublishLightmapAssetsOptions extends ILightFXOperationOptions {
    transactionId: string;
}

export interface ICancelLightFXOperationOptions extends ILightFXOperationOptions {
    target: LightFXBakeTarget;
    transactionId?: string;
}

export interface IRemoveLightmapAssetsOptions {
    transactionId?: string;
    /** Default Clear; Bake cleanup requires its still-held scene reservation. */
    action?: 'bake' | 'clear';
    /** Saved scene whose stale dependency entry may be ignored after Scene verified no live reference remains. */
    sceneUuid: string;
    textureUuids: string[];
}

export interface IRemoveLightmapAssetsResult {
    deletedTextureUuids: string[];
    retainedTextureUuids: string[];
    deletedAuxiliaryAssetUuids?: string[];
    retainedAuxiliaryAssetUuids?: string[];
    failures: Array<{ uuid: string; reason: string }>;
}

export interface IQueryLightmapTextureInfoOptions {
    uuids: string[];
    /** Also return this scene's known generated assets, without adding them to the preview list. */
    sceneUuid?: string;
}

export interface ILightmapTextureInfo {
    uuid: string;
    url: string;
    filename: string;
    size: number;
    createdAt: number;
    modifiedAt: number;
}

export interface IQueryLightmapTextureInfoResult {
    textures: ILightmapTextureInfo[];
    missingTextureUuids: string[];
    ownedTextureUuids?: string[];
}

/**
 * Node-hosted half of LightFX baking.
 *
 * The Scene runtime can be a child process or a browser Webview. Consequently every argument and
 * return value in this contract must remain JSON serializable and must not expose host file paths.
 */
export interface ILightFXBakeHostService {
    queryDiagnostics?(options: ICancelLightFXOperationOptions): Promise<ILightFXDiagnostics | undefined>;
    queryCapabilities(): Promise<ILightFXHostCapabilities>;
    reserveSceneOperation(options: IReserveLightFXSceneOperationOptions): Promise<ILightFXSceneOperationToken>;
    releaseSceneOperation(options: ILightFXSceneOperationToken): Promise<void>;
    resolveTextureSource(options: IResolveLightFXTextureSourceOptions): Promise<IResolvedLightFXTextureSource | null>;
    begin(options: IBeginLightFXBakeOptions): Promise<IBeginLightFXBakeResult>;
    appendInput(options: IAppendLightFXInputOptions): Promise<void>;
    run(options: IRunLightFXBakeOptions): Promise<IRunLightFXBakeResult>;
    commit(options: ILightFXOperationOptions): Promise<void>;
    publishLightmapAssets(options: IPublishLightmapAssetsOptions): Promise<{ textureUrls: string[] }>;
    rollback(options: ILightFXOperationOptions): Promise<void>;
    cancel(options?: ICancelLightFXOperationOptions): Promise<{ cancelled: boolean; target: LightFXBakeTarget | null }>;
    removeLightmapAssets(options: IRemoveLightmapAssetsOptions): Promise<IRemoveLightmapAssetsResult>;
    queryLightmapTextureInfo(options: IQueryLightmapTextureInfoOptions): Promise<IQueryLightmapTextureInfoResult>;
}
