import type { IUndoCommand, IUndoGroupOptions, IUndoRedoResult } from '../../../common';
import { SceneUndoCommand, SceneUndoCommandID } from './undo-command';
import { CompositeCommand } from './commands/composite-command';
import { ISnapshotAdapter, SnapshotCommand } from './commands/snapshot-command';

interface ISceneUndoOption {
    label?: string;
    tag?: string;
    auto?: boolean;
    customCommand?: IUndoCommand;
}

interface ISceneUndoManagerOptions {
    maxStackSize?: number;
    snapshotAdapter?: ISnapshotAdapter;
}

interface IActiveGroup {
    id: string;
    label: string;
    children: IUndoCommand[];
}

interface IActiveSnapshotRecording {
    id: string;
    label: string;
    uuids: string[];
    before: Promise<Map<string, any>>;
}

class SceneUndoManager {
    private _commandArray: IUndoCommand[] = [];
    private _index = -1;
    private _lastSavedCommandId: string | null = null;
    private _autoCommands: SceneUndoCommand[] = [];
    private _manualCommands: SceneUndoCommand[] = [];
    private _snapshotRecordings: Map<string, IActiveSnapshotRecording> = new Map();
    private _activeGroup: IActiveGroup | null = null;
    private _id = 0;
    private _queue: Promise<unknown> = Promise.resolve();
    private _isApplying = false;
    private readonly _maxStackSize: number;
    private readonly _snapshotAdapter?: ISnapshotAdapter;

    constructor(options: ISceneUndoManagerOptions = {}) {
        this._maxStackSize = options.maxStackSize ?? 100;
        this._snapshotAdapter = options.snapshotAdapter;
    }

    push(command: IUndoCommand): void {
        if (this._activeGroup) {
            this._activeGroup.children.push(command);
            return;
        }
        this._pushToStack(command);
    }

    async undo(): Promise<IUndoRedoResult> {
        return this._enqueue(async () => {
            if (this._index === -1) {
                return { success: false, reason: 'Cannot undo' };
            }
            const command = this._commandArray[this._index];
            if (!command) {
                return { success: false, reason: 'Cannot undo' };
            }
            const result = await this._applyCommand(command, 'undo');
            if (result.success) {
                this._index--;
            }
            return result;
        });
    }

    async redo(): Promise<IUndoRedoResult> {
        return this._enqueue(async () => {
            if (this._index >= this._commandArray.length - 1) {
                return { success: false, reason: 'Cannot redo' };
            }
            const command = this._commandArray[this._index + 1];
            if (!command) {
                return { success: false, reason: 'Cannot redo' };
            }
            const result = await this._applyCommand(command, 'redo');
            if (result.success) {
                this._index++;
            }
            return result;
        });
    }

    reset(): void {
        this._commandArray.length = 0;
        this._index = -1;
        this._lastSavedCommandId = null;
        this._autoCommands.length = 0;
        this._manualCommands.length = 0;
        this._snapshotRecordings.clear();
        this._activeGroup = null;
    }

    clearHistory(): void {
        this.reset();
    }

    markSaved(): void {
        this._lastSavedCommandId = this._currentCommandId();
    }

    isDirty(): boolean {
        return this._lastSavedCommandId !== this._currentCommandId();
    }

    canUndo(): boolean {
        return this._index >= 0;
    }

    canRedo(): boolean {
        return this._index < this._commandArray.length - 1;
    }

    isApplying(): boolean {
        return this._isApplying;
    }

    beginGroup(options: IUndoGroupOptions = {}): string {
        if (this._activeGroup) {
            throw new Error('Undo group is already active');
        }
        const id = this._createId('group');
        this._activeGroup = {
            id,
            label: options.label ?? 'Group',
            children: [],
        };
        return id;
    }

    endGroup(groupId: string): IUndoRedoResult {
        if (!this._activeGroup || this._activeGroup.id !== groupId) {
            return { success: false, reason: 'Undo group not found' };
        }

        const group = this._activeGroup;
        this._activeGroup = null;

        if (group.children.length === 0) {
            return { success: true, commandId: group.id, label: group.label };
        }

        this._pushToStack(new CompositeCommand({
            id: group.id,
            label: group.label,
            type: 'group:composite',
            scope: {},
            timestamp: Date.now(),
        }, group.children));
        return { success: true, commandId: group.id, label: group.label };
    }

    cancelGroup(groupId: string): IUndoRedoResult {
        if (!this._activeGroup || this._activeGroup.id !== groupId) {
            return { success: false, reason: 'Undo group not found' };
        }
        const label = this._activeGroup.label;
        this._activeGroup = null;
        return { success: true, commandId: groupId, label };
    }

    isGroupActive(): boolean {
        return this._activeGroup !== null;
    }

    getHistoryForTesting(): IUndoCommand[] {
        return [...this._commandArray];
    }

    hasActiveRecording(uuid?: string): boolean {
        if (uuid === undefined) {
            return this._snapshotRecordings.size > 0 || this._autoCommands.length > 0 || this._manualCommands.length > 0;
        }
        for (const recording of this._snapshotRecordings.values()) {
            if (recording.uuids.includes(uuid)) {
                return true;
            }
        }
        const all = this._autoCommands.concat(this._manualCommands);
        return all.some(cmd => cmd.uuids.includes(uuid));
    }

    beginRecording(uuids: string | string[], option?: ISceneUndoOption): SceneUndoCommandID {
        const uuidList = Array.isArray(uuids) ? uuids : [uuids];
        const uuidSet = new Set(uuidList);
        option = option ?? { auto: false };

        if (option.customCommand) {
            const command = this._createCommand(option);
            for (const uuid of uuidSet.values()) {
                command.uuids.push(uuid);
            }
            return command.id;
        }

        if (this._snapshotAdapter) {
            const id = this._createId(option.label ?? option.tag ?? 'recording');
            this._snapshotRecordings.set(id, {
                id,
                label: option.label ?? option.tag ?? id,
                uuids: [...uuidSet],
                before: Promise.resolve(this._snapshotAdapter.capture([...uuidSet])),
            });
            return id;
        }

        const command = this._createCommand(option);
        for (const uuid of uuidSet.values()) {
            command.uuids.push(uuid);
            if (!command.custom) {
                this._setUndo(command, uuid);
            }
        }
        return command.id;
    }

    async endRecording(id: SceneUndoCommandID): Promise<boolean> {
        if (this._snapshotAdapter && this._snapshotRecordings.has(id)) {
            const recording = this._snapshotRecordings.get(id)!;
            const before = await recording.before;
            const after = await this._snapshotAdapter.capture(recording.uuids);
            this._snapshotRecordings.delete(id);
            if (this._snapshotAdapter.equals(before, after)) {
                return false;
            }
            this.push(new SnapshotCommand({
                id,
                label: recording.label,
                type: 'recording:snapshot',
                scope: {},
                timestamp: Date.now(),
            }, before, after, this._snapshotAdapter));
            return true;
        }

        const command = this._autoCommands.find(t => t.id === id) ??
            this._manualCommands.find(t => t.id === id);
        if (!command) return false;
        if (this._commandArray.indexOf(command) !== -1) {
            console.warn('[Undo] command already exists', command.tag);
            return false;
        }
        if (!command.custom) {
            command.uuids.forEach(uuid => {
                this._setRedo(command, uuid);
            });
        }
        this.push(command);
        const index = this._manualCommands.indexOf(command);
        if (index !== -1) {
            this._manualCommands.splice(index, 1);
        }
        return true;
    }

    cancelRecording(id: SceneUndoCommandID): boolean {
        if (this._snapshotRecordings.delete(id)) {
            return true;
        }
        let removed = this._removeCommand(this._autoCommands, id);
        if (!removed) {
            removed = this._removeCommand(this._manualCommands, id);
        }
        return removed;
    }

    private _pushToStack(command: IUndoCommand): void {
        if (this._index !== this._commandArray.length - 1) {
            this._commandArray.splice(this._index + 1);
        }
        this._commandArray.push(command);
        this._index = this._commandArray.length - 1;
        this._trimToMaxStackSize();
    }

    private _trimToMaxStackSize(): void {
        const overflow = this._commandArray.length - this._maxStackSize;
        if (overflow <= 0) {
            return;
        }

        const removed = this._commandArray.splice(0, overflow);
        this._index = Math.max(-1, this._index - overflow);
        if (this._lastSavedCommandId && removed.some(command => command.meta.id === this._lastSavedCommandId)) {
            this._lastSavedCommandId = null;
        }
    }

    private async _applyCommand(command: IUndoCommand, direction: 'undo' | 'redo'): Promise<IUndoRedoResult> {
        this._isApplying = true;
        try {
            return await command[direction]();
        } catch (e) {
            return {
                success: false,
                commandId: command.meta.id,
                label: command.meta.label,
                reason: e instanceof Error ? e.message : String(e),
            };
        } finally {
            this._isApplying = false;
        }
    }

    private _enqueue<T>(task: () => Promise<T>): Promise<T> {
        const next = this._queue.then(task, task);
        this._queue = next.catch(() => undefined);
        return next;
    }

    private _currentCommandId(): string | null {
        return this._index === -1 ? null : this._commandArray[this._index]?.meta.id ?? null;
    }

    private _createCommand(option: ISceneUndoOption): SceneUndoCommand {
        let command: SceneUndoCommand;
        if (option.customCommand) {
            if (option.customCommand instanceof SceneUndoCommand) {
                command = option.customCommand;
            } else {
                const customCommand = option.customCommand;
                command = new SceneUndoCommand();
                command.undo = () => customCommand.undo();
                command.redo = () => customCommand.redo();
            }
            command.custom = true;
        } else {
            command = new SceneUndoCommand();
        }
        const label = option.label ?? option.tag ?? '';
        if (label !== '') command.tag = label;
        if (option.auto !== undefined) command.auto = option.auto;
        if (command.auto !== false) {
            this._autoCommands.push(command);
        } else {
            this._manualCommands.push(command);
        }
        const id = this._createId(command.tag || 'cmd');
        command.id = id;
        command.meta = {
            id,
            label: command.tag || id,
            type: command.custom ? 'custom' : 'recording:snapshot',
            scope: {},
            timestamp: Date.now(),
        };
        return command;
    }

    private _createId(prefix: string): string {
        try {
            const randomUUID = require('crypto')?.randomUUID;
            if (typeof randomUUID === 'function') {
                return `${prefix}-${randomUUID()}`;
            }
        } catch (_e) {
            // Fall back to process-local ids.
        }
        this._id++;
        return `${prefix}-${this._id}`;
    }

    private _setUndo(command: SceneUndoCommand, uuid: string) {
        const EditorExtends = (cc as any).EditorExtends;
        if (!EditorExtends) return;
        try {
            const node = EditorExtends.Node.getNode(uuid);
            if (node) {
                command.undoData.set(uuid, this._dumpUtil().dumpComponent(node));
                return;
            }
            const comp = EditorExtends.Component?.getComponent(uuid);
            if (comp) {
                command.undoData.set(uuid, this._dumpUtil().dumpComponent(comp));
            }
        } catch (e) {
            console.error('[Undo] _setUndo error:', e);
        }
    }

    private _setRedo(command: SceneUndoCommand, uuid: string) {
        const EditorExtends = (cc as any).EditorExtends;
        if (!EditorExtends) return;
        try {
            const node = EditorExtends.Node.getNode(uuid);
            if (node) {
                command.redoData.set(uuid, this._dumpUtil().dumpComponent(node));
                return;
            }
            const comp = EditorExtends.Component?.getComponent(uuid);
            if (comp) {
                command.redoData.set(uuid, this._dumpUtil().dumpComponent(comp));
            }
        } catch (e) {
            console.error('[Undo] _setRedo error:', e);
        }
    }

    private _removeCommand(list: SceneUndoCommand[], id: SceneUndoCommandID): boolean {
        const index = list.findIndex(t => t.id === id);
        if (index !== -1) {
            list.splice(index, 1);
            return true;
        }
        return false;
    }

    private _dumpUtil(): typeof import('../dump/index').default {
        return require('../dump/index').default;
    }
}

export { SceneUndoManager, ISceneUndoOption };
