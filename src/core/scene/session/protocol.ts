/** Wire types shared by the CLI owner and remote editor clients. No engine imports. */
export interface SceneVersion { epoch: string; revision: number }
export interface SceneCommand {
    module: string;
    method: string;
    args?: unknown[];
}
export interface SceneSessionCommand extends SceneCommand {
    source: string;
    operationId: string;
    expected: SceneVersion;
}
export interface SceneSessionEvent {
    sequence: number;
    version: SceneVersion;
    source?: string;
    operationId?: string;
    events: string[];
}
export interface SceneSessionSnapshot {
    project: string;
    version: SceneVersion;
    sequence: number;
    current: unknown;
    serializedScene: string | null;
    render?: SceneRenderSnapshot | null;
    dirty: boolean;
    canUndo: boolean;
    canRedo: boolean;
}
export interface SceneRenderSnapshot {
    serializedScene: string;
    rootUuid: string;
    assetUuid: string;
    kind: 'scene' | 'prefab';
    prefabUUIDs: unknown;
}
export interface SceneRecordedChange { uuid: string; kind: 'node' | 'component'; dump: any }
export interface SceneSessionDescriptor {
    protocol: 1;
    project: string;
    url: string;
    token: string;
}
export interface SceneCommandResult { value: unknown; version: SceneVersion }
export interface SceneEventBatch {
    version: SceneVersion;
    sequence: number;
    resync: boolean;
    events: SceneSessionEvent[];
}
export class SceneSessionError extends Error {
    constructor(public readonly code: string, message: string) { super(message); this.name = 'SceneSessionError'; }
}
