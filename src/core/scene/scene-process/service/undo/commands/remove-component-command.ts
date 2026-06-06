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

export class RemoveComponentCommand implements IUndoCommand {
    meta: IUndoCommandMeta;

    constructor(private readonly snapshot: IComponentStructureSnapshot) {
        this.meta = createComponentCommandMeta('component:remove', 'Remove Component');
    }

    static capture(component: Component): RemoveComponentCommand | null {
        const snapshot = captureComponentStructureSnapshot(component);
        return snapshot ? new RemoveComponentCommand(snapshot) : null;
    }

    async undo(): Promise<IUndoRedoResult> {
        return restoreComponentStructureSnapshot(this.snapshot, this.meta);
    }

    async redo(): Promise<IUndoRedoResult> {
        const result = removeComponentStructureSnapshot(this.snapshot, this.meta);
        return result.success ? success(this.meta) : result;
    }
}
