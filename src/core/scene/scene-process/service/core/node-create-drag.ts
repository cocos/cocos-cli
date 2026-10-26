import type { Node, Vec3 } from 'cc';
import type {
    IBeginCreateDragParams, IUpdateCreateDragParams, ICommitCreateDragParams, ICancelCreateDragParams,
    BeginCreateDragResult, UpdateCreateDragResult, CommitCreateDragResult, CancelCreateDragResult,
    CreateDragCancelReason, PrefabCanvasHandling,
} from '../../../common/node';
import type { IPendingPrefabCanvasMutation, IPrefabCanvasUndoRecord } from '../node/prefab-canvas-mutation';

/** Data and undo operations supplied by the public Node service to a private view session. */
export interface ICreateDragHost {
    resolveCanvasTransaction(workMode: string, canvasRequired: boolean, parent: Node | null,
        position: Vec3 | undefined, prefabCanvasHandling?: PrefabCanvasHandling):
        Promise<{ parent: Node | null; mutation: IPendingPrefabCanvasMutation | null }>;
    collectSceneNodeUuidsForUndo(): Set<string> | null;
    beginPrefabCanvasUndoCapture(beforeUuids: Set<string> | null): IPrefabCanvasUndoRecord[] | null;
    endPrefabCanvasUndoCapture(): void;
    recordCreateNodeCommand(beforeUuids: Set<string> | null, paths: string[], records: IPrefabCanvasUndoRecord[] | null): void;
}

export interface INodeCreateDragController {
    begin(params: IBeginCreateDragParams): Promise<BeginCreateDragResult>;
    update(params: IUpdateCreateDragParams): Promise<UpdateCreateDragResult>;
    commit(params: ICommitCreateDragParams): Promise<CommitCreateDragResult>;
    cancel(params: ICancelCreateDragParams): Promise<CancelCreateDragResult>;
    cancelActive(reason: CreateDragCancelReason): Promise<void>;
    dispose(): void;
}

type Factory = (host: ICreateDragHost) => INodeCreateDragController;
let factory: Factory | undefined;

/** Register in the Webview only. Independent CLI workers never load the view implementation. */
export function registerNodeCreateDragFactory(value: Factory): () => void {
    if (factory) throw new Error('Node drag creation is already registered');
    factory = value;
    return () => { if (factory === value) factory = undefined; };
}

export function createNodeCreateDragController(host: ICreateDragHost): INodeCreateDragController | undefined {
    return factory?.(host);
}

export function unavailableCreateDrag() {
    return { ok: false as const, error: { code: 'NOT_EDITABLE' as const, message: 'Node drag creation requires an interactive scene runtime.' } };
}
