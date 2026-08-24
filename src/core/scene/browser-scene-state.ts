export interface IBrowserEditorCameraState {
    is2D: boolean;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    projection: number;
    fov: number;
    orthoHeight: number;
    near: number;
    far: number;
}

export interface IBrowserNodeTransformState {
    uuid: string;
    path: string;
    revision: number;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    scale: { x: number; y: number; z: number };
}

export interface IBrowserNodeSnapshotState {
    uuid: string;
    path: string;
    revision: number;
    /** JSON-safe inspector dump produced by dumpUtil.dumpNode(). */
    dump: unknown;
}

export interface IBrowserSceneState {
    uuid: string;
    url: string;
    type: string;
    name: string;
    selection: string[];
    camera?: IBrowserEditorCameraState;
    /** Unsaved transforms from the browser editor, merged by node UUID. */
    nodeTransforms: IBrowserNodeTransformState[];
    /** Latest unsaved node/component inspector values, merged by node UUID. */
    nodeSnapshots: IBrowserNodeSnapshotState[];
    updatedAt: number;
}

/**
 * Main-process bridge for the scene currently opened by PinK's browser editor.
 *
 * The browser editor and the headless screenshot worker are separate processes,
 * so the worker cannot infer a scene switch from its own EditorService state.
 */
class BrowserSceneState {
    private current: IBrowserSceneState | null = null;

    setCurrent(
        info: Omit<
            IBrowserSceneState,
            'updatedAt' | 'selection' | 'camera' | 'nodeTransforms' | 'nodeSnapshots'
        > & {
            selection?: string[];
            camera?: IBrowserEditorCameraState;
            nodeTransforms?: IBrowserNodeTransformState[];
            nodeSnapshots?: IBrowserNodeSnapshotState[];
        },
    ): IBrowserSceneState {
        if (!info?.uuid) {
            throw new Error('Browser scene UUID is required.');
        }
        this.current = {
            uuid: info.uuid,
            url: info.url ?? '',
            type: info.type ?? '',
            name: info.name ?? '',
            selection: Array.isArray(info.selection) ? [...info.selection] : [],
            camera: info.camera ? { ...info.camera } : undefined,
            nodeTransforms: this.cloneNodeTransforms(info.nodeTransforms ?? []),
            nodeSnapshots: this.cloneNodeSnapshots(info.nodeSnapshots ?? []),
            updatedAt: Date.now(),
        };
        return this.cloneCurrent();
    }

    setEditorState(
        expectedUuid: string,
        state: {
            selection?: string[];
            camera?: IBrowserEditorCameraState;
            nodeTransforms?: IBrowserNodeTransformState[];
            nodeSnapshots?: IBrowserNodeSnapshotState[];
        },
    ): boolean {
        if (!this.current || this.current.uuid !== expectedUuid) {
            return false;
        }
        if (Array.isArray(state.selection)) {
            this.current.selection = [...state.selection];
        }
        if (state.camera) {
            this.current.camera = { ...state.camera };
        }
        if (Array.isArray(state.nodeTransforms)) {
            for (const transform of state.nodeTransforms) {
                const index = this.current.nodeTransforms.findIndex(item => item.uuid === transform.uuid);
                if (index < 0) {
                    this.current.nodeTransforms.push(this.cloneNodeTransform(transform));
                } else if (transform.revision >= this.current.nodeTransforms[index].revision) {
                    this.current.nodeTransforms[index] = this.cloneNodeTransform(transform);
                }
            }
        }
        if (Array.isArray(state.nodeSnapshots)) {
            for (const snapshot of state.nodeSnapshots) {
                const index = this.current.nodeSnapshots.findIndex(item => item.uuid === snapshot.uuid);
                if (index < 0) {
                    this.current.nodeSnapshots.push(this.cloneNodeSnapshot(snapshot));
                } else if (snapshot.revision >= this.current.nodeSnapshots[index].revision) {
                    this.current.nodeSnapshots[index] = this.cloneNodeSnapshot(snapshot);
                }
            }
        }
        this.current.updatedAt = Date.now();
        return true;
    }

    getCurrent(): IBrowserSceneState | null {
        return this.current ? this.cloneCurrent() : null;
    }

    clearCurrent(expectedUuid?: string): boolean {
        if (expectedUuid && this.current?.uuid !== expectedUuid) {
            return false;
        }
        this.current = null;
        return true;
    }

    private cloneCurrent(): IBrowserSceneState {
        const current = this.current!;
        return {
            ...current,
            selection: [...current.selection],
            camera: current.camera ? { ...current.camera } : undefined,
            nodeTransforms: this.cloneNodeTransforms(current.nodeTransforms),
            nodeSnapshots: this.cloneNodeSnapshots(current.nodeSnapshots),
        };
    }

    private cloneNodeTransforms(transforms: IBrowserNodeTransformState[]): IBrowserNodeTransformState[] {
        return transforms.map(transform => this.cloneNodeTransform(transform));
    }

    private cloneNodeTransform(transform: IBrowserNodeTransformState): IBrowserNodeTransformState {
        return {
            ...transform,
            position: { ...transform.position },
            rotation: { ...transform.rotation },
            scale: { ...transform.scale },
        };
    }

    private cloneNodeSnapshots(snapshots: IBrowserNodeSnapshotState[]): IBrowserNodeSnapshotState[] {
        return snapshots.map(snapshot => this.cloneNodeSnapshot(snapshot));
    }

    private cloneNodeSnapshot(snapshot: IBrowserNodeSnapshotState): IBrowserNodeSnapshotState {
        return {
            ...snapshot,
            // RPC transport is JSON-based; clone with the same semantics so callers
            // cannot mutate the main-process cache after publishing.
            dump: snapshot.dump == null ? snapshot.dump : JSON.parse(JSON.stringify(snapshot.dump)),
        };
    }
}

export const browserSceneState = new BrowserSceneState();
