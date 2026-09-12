import type { Terrain } from 'cc';
import type TerrainGizmo from './gizmo-select';

export enum TerrainEditorModeType {
    MANAGE,
    SCULPT,
    PAINT,
    SELECT,
}

/**
 * Base adapter for one Terrain editor mode.
 *
 * TerrainEditor invokes lifecycle hooks only while a Terrain is attached.
 * deactivate() observes the outgoing Terrain, activate() observes the incoming
 * Terrain, and implementations must not change the editor attachment.
 */
export abstract class TerrainEditorMode {
    protected readonly _gizmo: TerrainGizmo;

    constructor(gizmo: TerrainGizmo) {
        this._gizmo = gizmo;
    }

    public get gizmo(): TerrainGizmo {
        return this._gizmo;
    }

    public update(_terrain: Terrain, _deltaTime: number, _isShiftDown: boolean): void {}
    public activate(): void {}
    public deactivate(): void {}
    public refreshPreview(): void {}
}
