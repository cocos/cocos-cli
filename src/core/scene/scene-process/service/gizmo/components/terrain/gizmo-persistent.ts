import { Terrain } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import TerrainController from '../../controller/terrain';
import type { GizmoMouseEvent } from '../../utils/defines';
import { Service } from '../../../core/decorator';
import { getEditorNodePath } from '../../utils/editor-node';
import type TerrainGizmo from './gizmo-select';

/** Persistent gizmo receiving mouse input over the non-raycast Terrain component. */
export default class TerrainPersistentGizmo extends GizmoBase<Terrain> {
    private _controller!: TerrainController;
    private get selectGizmo(): TerrainGizmo | null {
        return this.target ? Service.Gizmo.getComponentGizmo(this.target) as TerrainGizmo | null : null;
    }
    protected init() {
        this._controller = new TerrainController(this.getGizmoRoot());
        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
        this._controller.onControllerHoverOut = this.onControllerHoverOut.bind(this);
        this.updateController();
    }
    private updateController() {
        if (!this._controller) return;
        if (!this.target) { this._controller.hide(); return; }
        this._controller.updateWorldPosition(this.target.node.getWorldPosition());
        const info = this.target.info;
        this._controller.updateSize(info.size.width, info.size.height);
        this._controller.show(); Service.Engine.repaintInEditMode();
    }
    public onTargetUpdate() { this.updateController(); }
    public onNodeChanged() { this.updateController(); }
    onControllerMouseDown(event: GizmoMouseEvent) {
        if (!this.target) return;
        const path = getEditorNodePath(this.target.node);
        if (Service.Selection.query()[0] !== path) {
            event.propagationStopped = true; Service.Selection.select(path); return;
        }
        const gizmo = this.selectGizmo; if (gizmo?.visible()) gizmo.onControllerMouseDown(event);
    }
    onControllerMouseMove(event: GizmoMouseEvent) { const gizmo = this.selectGizmo; if (gizmo?.visible()) gizmo.onControllerMouseMove(event); }
    onControllerMouseUp(event: GizmoMouseEvent) { const gizmo = this.selectGizmo; if (gizmo?.visible()) gizmo.onControllerMouseUp(event); }
    onControllerHoverOut() { const gizmo = this.selectGizmo; if (gizmo?.visible()) gizmo.onControllerHoverOut(); }
}
