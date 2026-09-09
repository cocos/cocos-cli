export interface IReflectionProbeCapturedFaces {
    sceneUrl: string;
    sceneName: string;
    componentUuid: string;
    probeId: number;
    resolution: number;
    fastBake: boolean;
    captureToken: string;
    faces: string[];
    rendererId?: string;
}

export interface IPrepareReflectionProbeBakeOptions {
    taskId?: string;
    captured: IReflectionProbeCapturedFaces;
    timeoutMs: number;
}

export interface IPreparedReflectionProbeBake {
    operationId: string;
    cubemapUuid: string;
    cubemapUrl: string;
}

export interface IReflectionProbeBakeOperationOptions {
    operationId: string;
}

/** Node-only filesystem and native-process boundary used by every Scene runtime. */
export interface IReflectionProbeBakeHostService {
    getCapabilities(): Promise<{ bake: boolean; reason?: string }>;
    cancel(options: { taskId: string }): Promise<void>;
    prepare(options: IPrepareReflectionProbeBakeOptions): Promise<IPreparedReflectionProbeBake>;
    commit(options: IReflectionProbeBakeOperationOptions): Promise<void>;
    rollback(options: IReflectionProbeBakeOperationOptions): Promise<void>;
    dispose(): Promise<void>;
}
