import { Component } from 'cc';
import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../../common';
import {
    captureComponentStructureSnapshot,
    createComponentCommandMeta,
    type IComponentStructureSnapshot,
    removeComponentStructureSnapshot,
    restoreComponentStructureSnapshot,
    success,
} from './component-command-utils';

export class AddComponentCommand implements IUndoCommand {
    meta: IUndoCommandMeta;

    constructor(private readonly snapshots: IComponentStructureSnapshot[]) {
        this.meta = createComponentCommandMeta('component:add', 'Add Component');
    }

    static capture(component: Component): AddComponentCommand | null {
        const snapshot = captureComponentStructureSnapshot(component);
        if (!snapshot) {
            return null;
        }
        return new AddComponentCommand([snapshot]);
    }

    static captureMany(components: Component[]): AddComponentCommand | null {
        const snapshots = components
            .map(component => captureComponentStructureSnapshot(component))
            .filter((snapshot): snapshot is IComponentStructureSnapshot => snapshot !== null);
        if (snapshots.length === 0) {
            return null;
        }
        return new AddComponentCommand(snapshots);
    }

    async undo(): Promise<IUndoRedoResult> {
        for (let i = this.snapshots.length - 1; i >= 0; i--) {
            const result = removeComponentStructureSnapshot(this.snapshots[i], this.meta);
            if (!result.success) {
                return result;
            }
        }
        return success(this.meta);
    }

    async redo(): Promise<IUndoRedoResult> {
        for (const snapshot of this.snapshots) {
            const result = await restoreComponentStructureSnapshot(snapshot, this.meta);
            if (!result.success) {
                return result;
            }
        }
        return success(this.meta);
    }
}
