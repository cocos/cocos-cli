import type { Terrain } from 'cc';

/** Identifies one Terrain component without relying on the active gizmo selection. */
export interface ITerrainTarget {
    nodeUuid: string;
    componentUuid: string;
}

/** The active non-asset Terrain editor view; `block` is read-only block inspection. */
export type TerrainEditorMode = 'manage' | 'sculpt' | 'paint' | 'block';
/** The Sculpt behavior applied while the editor is in `sculpt` mode. */
export type TerrainSculptTool = 'bulge' | 'sunken' | 'smooth' | 'flatten' | 'set-height';
/** The brush implementation currently selected for a Terrain editor session. */
export type TerrainBrushKind = 'circle' | 'image';

/** A complete JSON-safe TerrainInfo snapshot and `saveManage` payload; map sizes and block counts must be positive integers. */
export interface ITerrainManageState {
    tileSize: number;
    weightMapSize: number;
    lightMapSize: number;
    blockCount: [number, number];
}

/** JSON-safe Terrain layer data. Its array index is the Terrain layer slot. */
export interface ITerrainLayerState {
    detailMapUuid: string | null;
    normalMapUuid: string | null;
    metallic: number;
    roughness: number;
    tileSize: number;
}

/** A partial JSON-safe Terrain layer update: omitted fields are unchanged, null texture UUIDs clear maps, and other UUIDs must resolve to compatible Texture2D assets. */
export interface ITerrainLayerPatch {
    detailMapUuid?: string | null;
    normalMapUuid?: string | null;
    metallic?: number;
    roughness?: number;
    tileSize?: number;
}

/** JSON-safe, non-asset Terrain editor brush state. */
export interface ITerrainBrushState {
    kind: TerrainBrushKind;
    imageUuid: string | null;
    radius: number;
    strength: number;
    rotation: number;
    setHeight: number;
}

/** Canonical Sculpt session state for a valid Terrain target. */
export interface ITerrainSculptState {
    tool: TerrainSculptTool;
    brush: ITerrainBrushState;
}

/** Canonical Paint session state for a valid Terrain target. */
export interface ITerrainPaintState {
    brush: ITerrainBrushState;
}

/** The canonical editor-session state for one valid Terrain target. */
export interface ITerrainEditorState {
    manage: ITerrainManageState;
    layers: Array<ITerrainLayerState | null>;
    mode: TerrainEditorMode;
    currentLayer: number;
    sculpt: ITerrainSculptState;
    paint: ITerrainPaintState;
}

/** A usable authoritative snapshot. Read its hydration state only after narrowing `valid` to `true`. */
export interface ITerrainSnapshot extends ITerrainEditorState {
    target: ITerrainTarget;
    valid: true;
}

/** A rejected target has no usable Terrain state attached to it. */
export interface ITerrainInvalidSnapshot {
    target: ITerrainTarget;
    valid: false;
}

/** Discriminated read result. Callers must replace cached state when `valid` is `false`. */
export type TerrainReadResult = ITerrainSnapshot | ITerrainInvalidSnapshot;

/** A partial, non-asset brush-session update. Omitted fields keep their current values. */
export interface ITerrainBrushPatch {
    kind?: TerrainBrushKind;
    radius?: number;
    strength?: number;
    rotation?: number;
    setHeight?: number;
}

/** A partial Sculpt session update that does not assign brush assets or create Scene Undo entries. */
export interface ITerrainSculptSessionPatch {
    tool?: TerrainSculptTool;
    brush?: ITerrainBrushPatch;
}

/** A partial Paint session update that does not assign brush assets or create Scene Undo entries. */
export interface ITerrainPaintSessionPatch {
    brush?: ITerrainBrushPatch;
}

/**
 * JSON-safe data for the currently inspected Terrain block.
 *
 * `layers` maps the block's RGBA channel slots to Terrain layer UUIDs. When present,
 * `weight.data` is row-major RGBA bytes: four 0–255 values for every texel.
 */
export interface ITerrainBlockData {
    index: { x: number; y: number };
    layers: Array<string | null>;
    weight: {
        width: number;
        height: number;
        data: number[];
    } | null;
}

/** A valid target may have no currently inspected block. */
export interface ITerrainBlockSnapshot {
    target: ITerrainTarget;
    valid: true;
    block: ITerrainBlockData | null;
}

/** A block-read result. A valid target may still have `block: null` when no block is selected. */
export type TerrainBlockReadResult = ITerrainBlockSnapshot | ITerrainInvalidSnapshot;

/**
 * Target-safe Terrain editor capability consumed by the Scene webview.
 *
 * Reads and commands always require an explicit node/component pair. Results are
 * canonical snapshots; a `valid: false` result must replace any cached state.
 * A rejected target does not mutate Terrain or create a new Undo entry.
 */
export interface ITerrainService {
    readonly name: 'cc.Terrain';
    readonly editedComponents: Terrain[];
    readonly selectedComponents: Terrain[];
    isTerrainChange: boolean;
    select(nodeUuid: string): void;
    unselect(nodeUuid: string): void;
    close(): Promise<0 | 1 | 2>;
    saveAsset(isClose?: boolean, component?: Terrain): Promise<0 | 1 | 2>;
    saveAssetDialog(file?: string, isClose?: boolean): Promise<0 | 1 | 2>;
    addAssetToComp(assetUuid: string): Promise<void>;
    serialize(component: Terrain): Uint8Array;
    onSculpt(node: any): void;

    /** Reads the canonical state for one explicit target without mutating Terrain. */
    read(target: ITerrainTarget): TerrainReadResult;
    /** Changes the active editor mode without mutating Terrain assets or creating Scene Undo. */
    setMode(target: ITerrainTarget, mode: TerrainEditorMode): TerrainReadResult;
    /** Changes the active Paint layer; pass `-1` to clear it without creating Scene Undo. */
    setCurrentLayer(target: ITerrainTarget, currentLayer: number): TerrainReadResult;
    /** Applies a partial Sculpt session update without assigning brush assets or creating Scene Undo. */
    setSculptSession(target: ITerrainTarget, patch: ITerrainSculptSessionPatch): TerrainReadResult;
    /** Applies a partial Paint session update without assigning brush assets or creating Scene Undo. */
    setPaintSession(target: ITerrainTarget, patch: ITerrainPaintSessionPatch): TerrainReadResult;
    /** Commits a complete Manage draft as one TerrainInfo/Undo mutation. */
    saveManage(target: ITerrainTarget, manage: ITerrainManageState): Promise<TerrainReadResult>;
    /** Adds a fully specified Terrain layer; `detailMapUuid` must identify a compatible Texture2D. */
    addLayer(target: ITerrainTarget, layer: ITerrainLayerState): Promise<TerrainReadResult>;
    /** Removes one Terrain layer slot and returns the authoritative state. */
    removeLayer(target: ITerrainTarget, index: number): Promise<TerrainReadResult>;
    /** Applies one explicit layer patch and returns the authoritative state. */
    updateLayer(target: ITerrainTarget, index: number, patch: ITerrainLayerPatch): Promise<TerrainReadResult>;
    /** Reads the current block without mutation or Scene Undo; `block` is null when no block is selected. */
    readBlock(target: ITerrainTarget): TerrainBlockReadResult;
}

export type IPublicTerrainService = Pick<ITerrainService,
    'name' | 'isTerrainChange' | 'select' | 'unselect' | 'close' |
    'saveAsset' | 'saveAssetDialog' | 'addAssetToComp' |
    'read' | 'setMode' | 'setCurrentLayer' | 'setSculptSession' |
    'setPaintSession' | 'saveManage' | 'addLayer' | 'removeLayer' |
    'updateLayer' | 'readBlock'
>;

export interface ITerrainEvents {
    /** Invalidation only. Do not derive UI state from `component`; re-read the explicit target. */
    'terrain:changed': [component: Terrain];
    /** Invalidation only. Do not derive UI state from `node`; re-read the explicit target. */
    'terrain:sculpt': [node: any];
    /** Invalidation only. Re-read the explicit target's canonical block state. */
    'terrain:block-update': [];
    /** Invalidation only. Re-read the explicit target's canonical Terrain state. */
    'terrain:session-changed': [target: ITerrainTarget];
}
