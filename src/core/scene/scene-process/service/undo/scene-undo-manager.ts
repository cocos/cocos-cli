import type { IUndoCheckpoint, IUndoCommand, IUndoGroupOptions, IUndoOperationOptions, IUndoPushWithPreviousOptions, IUndoRedoResult, IUndoScope } from '../../../common';
import { SceneUndoCommand, SceneUndoCommandID } from './undo-command';
import { CompositeCommand } from './commands/composite-command';
import { ISnapshotAdapter, SnapshotCommand } from './commands/snapshot-command';
import { getDumpUtil } from './dump-util';
import { createUndoId } from './commands/command-utils-shared';

interface ISceneUndoOption {
    label?: string;
    tag?: string;
    auto?: boolean;
    scope?: IUndoScope;
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
    scope: IUndoScope;
    uuids: string[];
    before: Map<string, any> | Promise<Map<string, any>>;
}

class SceneUndoManager {
    private _commandArray: IUndoCommand[] = [];
    private _index = -1;
    private _lastSavedCommandId: string | null = null;
    private _checkpointGeneration = 0;
    private _autoCommands: SceneUndoCommand[] = [];
    private _manualCommands: SceneUndoCommand[] = [];
    private _snapshotRecordings: Map<string, IActiveSnapshotRecording> = new Map();
    private _activeRecordingUuidCounts: Map<string, number> = new Map();
    private _activeGroup: IActiveGroup | null = null;
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

    pushWithPrevious(command: IUndoCommand, options: IUndoPushWithPreviousOptions): void {
        if (this._activeGroup) {
            this._activeGroup.children.push(command);
            return;
        }

        if (this._index !== this._commandArray.length - 1) {
            this._pushToStack(command);
            return;
        }

        const previousCommands: IUndoCommand[] = [];
        let previousIndex = this._index;
        while (previousIndex >= 0) {
            const previous = this._commandArray[previousIndex];
            if (!previous || !matchesUndoScope(previous.meta.scope, options.previousScope) || !matchesUndoType(previous.meta.type, options.previousTypes)) {
                break;
            }
            previousCommands.unshift(previous);
            previousIndex--;
        }

        if (previousCommands.length === 0) {
            this._pushToStack(command);
            return;
        }

        this._commandArray.splice(previousIndex + 1, previousCommands.length);
        this._index = previousIndex;
        this._pushToStack(new CompositeCommand({
            id: this._createId(options.type),
            label: options.label ?? command.meta.label,
            type: options.type,
            scope: options.scope,
            timestamp: Date.now(),
        }, [...previousCommands, command]));
    }

    async undo(options?: IUndoOperationOptions): Promise<IUndoRedoResult> {
        return this._enqueue(async () => {
            if (this._index === -1) {
                return { success: false, reason: 'Cannot undo' };
            }
            const command = this._commandArray[this._index];
            if (!command) {
                return { success: false, reason: 'Cannot undo' };
            }
            if (!matchesUndoScope(command.meta.scope, options?.scope)) {
                return { success: false, reason: 'Cannot undo' };
            }
            const result = await this._applyCommand(command, 'undo');
            if (result.success) {
                this._index--;
            }
            return result;
        });
    }

    async redo(options?: IUndoOperationOptions): Promise<IUndoRedoResult> {
        return this._enqueue(async () => {
            if (this._index >= this._commandArray.length - 1) {
                return { success: false, reason: 'Cannot redo' };
            }
            const command = this._commandArray[this._index + 1];
            if (!command) {
                return { success: false, reason: 'Cannot redo' };
            }
            if (!matchesUndoScope(command.meta.scope, options?.scope)) {
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
        this._checkpointGeneration++;
        this._autoCommands.length = 0;
        this._manualCommands.length = 0;
        this._snapshotRecordings.clear();
        this._activeRecordingUuidCounts.clear();
        this._activeGroup = null;
    }

    // reset 的对外别名（IUndoService 同时暴露 reset/clearHistory）。
    clearHistory(): void {
        this.reset();
    }

    markSaved(): void {
        this._lastSavedCommandId = this._currentCommandId();
    }

    isDirty(): boolean {
        return this._lastSavedCommandId !== this._currentCommandId();
    }

    createCheckpoint(): IUndoCheckpoint {
        return { commandId: this._currentCommandId(), generation: this._checkpointGeneration };
    }

    hasScopedDifference(checkpoint: IUndoCheckpoint, scope: Partial<IUndoScope>): boolean {
        return this._hasDifferenceSince(checkpoint, command => matchesUndoScope(command.meta.scope, scope));
    }

    hasScopedDifferenceAfterCheckpoint(checkpoint: IUndoCheckpoint, scope: Partial<IUndoScope>): boolean {
        if (checkpoint.generation !== this._checkpointGeneration) {
            return false;
        }
        const checkpointIndex = this._resolveCheckpointIndex(checkpoint);
        if (checkpointIndex === undefined || this._index <= checkpointIndex) {
            return false;
        }
        for (let index = checkpointIndex + 1; index <= this._index; index++) {
            const command = this._commandArray[index];
            if (command && matchesUndoScope(command.meta.scope, scope)) {
                return true;
            }
        }
        return false;
    }

    async discardScopedChangesAfterCheckpoint(
        checkpoint: IUndoCheckpoint,
        scope: Partial<IUndoScope>,
    ): Promise<IUndoRedoResult> {
        return this._enqueue(async () => {
            if (checkpoint.generation !== this._checkpointGeneration) {
                return { success: true };
            }
            const checkpointIndex = this._resolveCheckpointIndex(checkpoint);
            const originalIndex = this._index;
            if (checkpointIndex === undefined || originalIndex <= checkpointIndex) {
                return { success: true };
            }

            const originalCommands = [...this._commandArray];
            const appliedCommands = originalCommands.slice(checkpointIndex + 1, originalIndex + 1);
            const discardedCommands = appliedCommands.filter(command => matchesUndoScope(command.meta.scope, scope));
            if (discardedCommands.length === 0) {
                return { success: true };
            }

            const restoreCommands = async (commands: IUndoCommand[], direction: 'undo' | 'redo') => {
                for (const command of commands) {
                    const result = await this._applyCommand(command, direction);
                    if (!result.success) {
                        return result;
                    }
                }
                return { success: true };
            };

            const undoneCommands: IUndoCommand[] = [];
            for (let index = originalIndex; index > checkpointIndex; index--) {
                const command = originalCommands[index];
                if (!command) {
                    continue;
                }
                const result = await this._applyCommand(command, 'undo');
                if (!result.success) {
                    for (const undoneCommand of [...undoneCommands].reverse()) {
                        const restoreResult = await this._applyCommand(undoneCommand, 'redo');
                        if (restoreResult.success) {
                            this._index++;
                        }
                    }
                    return result;
                }
                undoneCommands.push(command);
                this._index--;
            }

            const keptCommands = appliedCommands.filter(command => !matchesUndoScope(command.meta.scope, scope));
            this._commandArray.splice(checkpointIndex + 1, appliedCommands.length, ...keptCommands);
            this._index = checkpointIndex;

            const redoneCommands: IUndoCommand[] = [];
            for (const command of keptCommands) {
                const result = await this._applyCommand(command, 'redo');
                if (!result.success) {
                    await restoreCommands([...redoneCommands].reverse(), 'undo');
                    this._commandArray.splice(0, this._commandArray.length, ...originalCommands);
                    this._index = checkpointIndex;
                    await restoreCommands(appliedCommands, 'redo');
                    this._index = originalIndex;
                    return result;
                }
                redoneCommands.push(command);
                this._index++;
            }

            return { success: true };
        });
    }

    hasDifferenceOutsideScope(checkpoint: IUndoCheckpoint, scope: Partial<IUndoScope>): boolean {
        return this._hasDifferenceSince(checkpoint, command => !matchesUndoScope(command.meta.scope, scope));
    }

    canUndo(options?: IUndoOperationOptions): boolean {
        return this._index >= 0 && this._commandMatchesAt(this._index, options?.scope);
    }

    canRedo(options?: IUndoOperationOptions): boolean {
        return this._index < this._commandArray.length - 1 && this._commandMatchesAt(this._index + 1, options?.scope);
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

    private _commandMatchesAt(index: number, scope?: Partial<IUndoScope>): boolean {
        const command = this._commandArray[index];
        return Boolean(command && matchesUndoScope(command.meta.scope, scope));
    }

    hasActiveRecording(uuid?: string): boolean {
        if (uuid === undefined) {
            return this._snapshotRecordings.size > 0 || this._autoCommands.length > 0 || this._manualCommands.length > 0;
        }
        return this._activeRecordingUuidCounts.has(uuid);
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
            this._addActiveRecordingUuids(uuidSet);
            return command.id;
        }

        if (this._snapshotAdapter) {
            const id = this._createId(option.label ?? option.tag ?? 'recording');
            this._snapshotRecordings.set(id, {
                id,
                label: option.label ?? option.tag ?? id,
                scope: option.scope ?? {},
                uuids: [...uuidSet],
                before: this._snapshotAdapter.capture([...uuidSet]),
            });
            this._addActiveRecordingUuids(uuidSet);
            return id;
        }

        const command = this._createCommand(option);
        for (const uuid of uuidSet.values()) {
            command.uuids.push(uuid);
            if (!command.custom) {
                this._setUndo(command, uuid);
            }
        }
        this._addActiveRecordingUuids(uuidSet);
        return command.id;
    }

    async endRecording(id: SceneUndoCommandID): Promise<boolean> {
        if (this._snapshotAdapter && this._snapshotRecordings.has(id)) {
            const recording = this._snapshotRecordings.get(id)!;
            try {
                const before = isPromiseLike(recording.before) ? await recording.before : recording.before;
                const capturedAfter = this._snapshotAdapter.capture(recording.uuids);
                const after = isPromiseLike(capturedAfter) ? await capturedAfter : capturedAfter;
                if (this._snapshotAdapter.equals(before, after)) {
                    return false;
                }
                this.push(new SnapshotCommand({
                    id,
                    label: recording.label,
                    type: 'recording:snapshot',
                    scope: recording.scope,
                    timestamp: Date.now(),
                }, before, after, this._snapshotAdapter));
                return true;
            } finally {
                this._snapshotRecordings.delete(id);
                this._removeActiveRecordingUuids(recording.uuids);
            }
        }

        const command = this._autoCommands.find(t => t.id === id) ??
            this._manualCommands.find(t => t.id === id);
        if (!command) return false;
        if (this._commandArray.indexOf(command) !== -1) {
            console.warn('[Undo] command already exists', command.tag);
            this._removeCommand(this._autoCommands, id);
            this._removeCommand(this._manualCommands, id);
            this._removeActiveRecordingUuids(command.uuids);
            return false;
        }
        if (!command.custom) {
            command.uuids.forEach(uuid => {
                this._setRedo(command, uuid);
            });
        }
        this.push(command);
        const autoIndex = this._autoCommands.indexOf(command);
        if (autoIndex !== -1) {
            this._autoCommands.splice(autoIndex, 1);
        }
        const manualIndex = this._manualCommands.indexOf(command);
        if (manualIndex !== -1) {
            this._manualCommands.splice(manualIndex, 1);
        }
        this._removeActiveRecordingUuids(command.uuids);
        return true;
    }

    cancelRecording(id: SceneUndoCommandID): boolean {
        const snapshotRecording = this._snapshotRecordings.get(id);
        if (snapshotRecording) {
            this._snapshotRecordings.delete(id);
            this._removeActiveRecordingUuids(snapshotRecording.uuids);
            return true;
        }
        let removed = this._removeCommand(this._autoCommands, id);
        if (removed) {
            this._removeActiveRecordingUuids(removed.uuids);
            return true;
        }
        removed = this._removeCommand(this._manualCommands, id);
        if (removed) {
            this._removeActiveRecordingUuids(removed.uuids);
            return true;
        }
        return false;
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

    private _hasDifferenceSince(checkpoint: IUndoCheckpoint, matches: (command: IUndoCommand) => boolean): boolean {
        if (checkpoint.generation !== this._checkpointGeneration) {
            return false;
        }
        const checkpointIndex = this._resolveCheckpointIndex(checkpoint);
        if (checkpointIndex === undefined) {
            return this._currentCommandId() !== checkpoint.commandId;
        }
        if (checkpointIndex === this._index) {
            return false;
        }
        const start = Math.min(checkpointIndex, this._index) + 1;
        const end = Math.max(checkpointIndex, this._index);
        for (let i = start; i <= end; i++) {
            const command = this._commandArray[i];
            if (command && matches(command)) {
                return true;
            }
        }
        return false;
    }

    private _resolveCheckpointIndex(checkpoint: IUndoCheckpoint): number | undefined {
        if (checkpoint.commandId === null) {
            return -1;
        }
        const index = this._commandArray.findIndex(command => command.meta.id === checkpoint.commandId);
        return index === -1 ? undefined : index;
    }

    // 降级路径：仅在未注入 snapshotAdapter 时使用（主要是单测）。
    // 运行时 UndoService 始终注入 adapter，beginRecording/endRecording 走 snapshot 分支，不会到这里。
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
            scope: option.scope ?? {},
            timestamp: Date.now(),
        };
        return command;
    }

    private _createId(prefix: string): string {
        return createUndoId(prefix);
    }

    private _setUndo(command: SceneUndoCommand, uuid: string) {
        const EditorExtends = (cc as any).EditorExtends;
        if (!EditorExtends) return;
        try {
            const node = EditorExtends.Node.getNode(uuid);
            if (node) {
                command.undoData.set(uuid, getDumpUtil().dumpNode(node));
                return;
            }
            const comp = EditorExtends.Component?.getComponent(uuid);
            if (comp) {
                command.undoData.set(uuid, getDumpUtil().dumpComponent(comp));
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
                command.redoData.set(uuid, getDumpUtil().dumpNode(node));
                return;
            }
            const comp = EditorExtends.Component?.getComponent(uuid);
            if (comp) {
                command.redoData.set(uuid, getDumpUtil().dumpComponent(comp));
            }
        } catch (e) {
            console.error('[Undo] _setRedo error:', e);
        }
    }

    private _addActiveRecordingUuids(uuids: Iterable<string>): void {
        for (const uuid of uuids) {
            this._activeRecordingUuidCounts.set(uuid, (this._activeRecordingUuidCounts.get(uuid) ?? 0) + 1);
        }
    }

    private _removeActiveRecordingUuids(uuids: Iterable<string>): void {
        for (const uuid of uuids) {
            const count = this._activeRecordingUuidCounts.get(uuid);
            if (!count) {
                continue;
            }
            if (count === 1) {
                this._activeRecordingUuidCounts.delete(uuid);
            } else {
                this._activeRecordingUuidCounts.set(uuid, count - 1);
            }
        }
    }

    private _removeCommand(list: SceneUndoCommand[], id: SceneUndoCommandID): SceneUndoCommand | null {
        const index = list.findIndex(t => t.id === id);
        if (index !== -1) {
            const [command] = list.splice(index, 1);
            return command ?? null;
        }
        return null;
    }
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
    return !!value && typeof (value as Promise<T>).then === 'function';
}

function matchesUndoScope(commandScope: IUndoScope, expectedScope?: Partial<IUndoScope>): boolean {
    if (!expectedScope) {
        return true;
    }
    for (const [key, value] of Object.entries(expectedScope) as [keyof IUndoScope, unknown][]) {
        if (value !== undefined && commandScope[key] !== value) {
            return false;
        }
    }
    return true;
}

function matchesUndoType(commandType: string, expectedTypes?: string[]): boolean {
    return !expectedTypes || expectedTypes.includes(commandType);
}

export { SceneUndoManager, ISceneUndoOption };
