import { SceneUndoManager } from '../scene-process/service/undo/scene-undo-manager';
import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../common';
import { snapshotMapsEqual } from '../scene-process/service/undo/commands/command-utils-shared';

class FakeCommand implements IUndoCommand {
    meta = {
        id: 'cmd-1',
        label: 'Fake',
        type: 'test:fake',
        scope: {},
        timestamp: 1,
    };

    async undo(): Promise<IUndoRedoResult> {
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }

    async redo(): Promise<IUndoRedoResult> {
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }
}

describe('SceneUndoManager', () => {
    it('compares snapshot maps by key instead of insertion order', () => {
        const before = new Map<string, any>([
            ['node-1', { x: 1 }],
            ['node-2', { x: 2 }],
        ]);
        const after = new Map<string, any>([
            ['node-2', { x: 2 }],
            ['node-1', { x: 1 }],
        ]);

        expect(snapshotMapsEqual(before, after)).toBe(true);
    });

    it('pushes a command and exposes canUndo/canRedo', () => {
        const manager = new SceneUndoManager();

        manager.push(new FakeCommand());

        expect(manager.canUndo()).toBe(true);
        expect(manager.canRedo()).toBe(false);
    });

    it('undoes and redoes commands by moving the cursor only on success', async () => {
        const manager = new SceneUndoManager();
        const command = new ControlledCommand('cmd-1');

        manager.push(command);

        await expect(manager.undo()).resolves.toMatchObject({ success: true, commandId: 'cmd-1' });
        expect(command.calls).toEqual(['undo:cmd-1']);
        expect(manager.canUndo()).toBe(false);
        expect(manager.canRedo()).toBe(true);

        await expect(manager.redo()).resolves.toMatchObject({ success: true, commandId: 'cmd-1' });
        expect(command.calls).toEqual(['undo:cmd-1', 'redo:cmd-1']);
        expect(manager.canUndo()).toBe(true);
        expect(manager.canRedo()).toBe(false);
    });

    it('keeps the cursor unchanged when undo fails', async () => {
        const manager = new SceneUndoManager();

        manager.push(new ControlledCommand('cmd-1', false));

        await expect(manager.undo()).resolves.toMatchObject({ success: false, reason: 'fail' });
        expect(manager.canUndo()).toBe(true);
        expect(manager.canRedo()).toBe(false);
    });

    it('clears the redo branch when a new command is pushed after undo', async () => {
        const manager = new SceneUndoManager();

        manager.push(new ControlledCommand('cmd-1'));
        manager.push(new ControlledCommand('cmd-2'));

        await manager.undo();
        expect(manager.canRedo()).toBe(true);

        manager.push(new ControlledCommand('cmd-3'));
        expect(manager.canRedo()).toBe(false);
    });

    it('tracks dirty state against the saved cursor', async () => {
        const manager = new SceneUndoManager();

        expect(manager.isDirty()).toBe(false);

        manager.push(new ControlledCommand('cmd-1'));
        expect(manager.isDirty()).toBe(true);

        manager.markSaved();
        expect(manager.isDirty()).toBe(false);

        await manager.undo();
        expect(manager.isDirty()).toBe(true);

        await manager.redo();
        expect(manager.isDirty()).toBe(false);
    });

    it('groups child commands into one composite command', async () => {
        const manager = new SceneUndoManager();
        const first = new ControlledCommand('cmd-1');
        const second = new ControlledCommand('cmd-2');

        const groupId = manager.beginGroup({ label: 'Grouped' });
        expect(manager.isGroupActive()).toBe(true);

        manager.push(first);
        manager.push(second);

        expect(manager.canUndo()).toBe(false);

        expect(manager.endGroup(groupId)).toMatchObject({ success: true });
        expect(manager.isGroupActive()).toBe(false);
        expect(manager.canUndo()).toBe(true);

        await manager.undo();
        expect(first.calls).toEqual(['undo:cmd-1']);
        expect(second.calls).toEqual(['undo:cmd-2']);

        await manager.redo();
        expect(first.calls).toEqual(['undo:cmd-1', 'redo:cmd-1']);
        expect(second.calls).toEqual(['undo:cmd-2', 'redo:cmd-2']);
    });

    it('rejects nested groups and can cancel an active group', () => {
        const manager = new SceneUndoManager();

        const groupId = manager.beginGroup({ label: 'Grouped' });

        expect(() => manager.beginGroup()).toThrow(/group/i);
        expect(manager.cancelGroup(groupId)).toMatchObject({ success: true });
        expect(manager.isGroupActive()).toBe(false);
        expect(manager.canUndo()).toBe(false);
    });

    it('trims old commands when maxStackSize is reached', () => {
        const manager = new SceneUndoManager({ maxStackSize: 2 });

        manager.push(new ControlledCommand('cmd-1'));
        manager.push(new ControlledCommand('cmd-2'));
        manager.push(new ControlledCommand('cmd-3'));

        expect(manager.canUndo()).toBe(true);
        expect(manager.getHistoryForTesting().map(item => item.meta.id)).toEqual(['cmd-2', 'cmd-3']);
    });

    it('serializes concurrent undo calls', async () => {
        const manager = new SceneUndoManager();
        const first = new DelayedCommand('cmd-1');
        const second = new DelayedCommand('cmd-2');

        manager.push(first);
        manager.push(second);

        const undoSecond = manager.undo();
        await second.waitForUndoStart();
        const undoFirst = manager.undo();

        second.resolveUndo();
        await undoSecond;
        await first.waitForUndoStart();
        first.resolveUndo();
        await undoFirst;

        expect(second.calls).toEqual(['undo:cmd-2']);
        expect(first.calls).toEqual(['undo:cmd-1']);
        expect(manager.canUndo()).toBe(false);
        expect(manager.canRedo()).toBe(true);
    });

    it('records a changed snapshot for only the requested uuids', async () => {
        const snapshots = new Map<string, any>([
            ['node-1', { x: 0 }],
            ['node-2', { x: 10 }],
        ]);
        const applied: any[] = [];
        const manager = new SceneUndoManager({
            snapshotAdapter: {
                capture: async (uuids: string[]) => new Map(uuids.map(uuid => [uuid, { ...snapshots.get(uuid) }])),
                apply: async (data: Map<string, any>) => {
                    applied.push([...data.entries()]);
                    return { success: true };
                },
                equals: (before: Map<string, any>, after: Map<string, any>) => JSON.stringify([...before]) === JSON.stringify([...after]),
            },
        });

        const recordingId = manager.beginRecording(['node-1'], { label: 'Move Node' });
        snapshots.set('node-1', { x: 1 });
        snapshots.set('node-2', { x: 20 });

        expect(await manager.endRecording(recordingId)).toBe(true);
        expect(manager.canUndo()).toBe(true);

        await manager.undo();
        expect(applied).toEqual([[['node-1', { x: 0 }]]]);

        await manager.redo();
        expect(applied).toEqual([
            [['node-1', { x: 0 }]],
            [['node-1', { x: 1 }]],
        ]);
    });

    it('does not push unchanged or cancelled recordings', async () => {
        const snapshots = new Map<string, any>([['node-1', { x: 0 }]]);
        const manager = new SceneUndoManager({
            snapshotAdapter: {
                capture: async (uuids: string[]) => new Map(uuids.map(uuid => [uuid, { ...snapshots.get(uuid) }])),
                apply: async () => ({ success: true }),
                equals: (before: Map<string, any>, after: Map<string, any>) => JSON.stringify([...before]) === JSON.stringify([...after]),
            },
        });

        const unchangedId = manager.beginRecording(['node-1'], { label: 'Move Node' });
        expect(await manager.endRecording(unchangedId)).toBe(false);
        expect(manager.canUndo()).toBe(false);

        const cancelledId = manager.beginRecording(['node-1'], { label: 'Move Node' });
        snapshots.set('node-1', { x: 1 });
        expect(manager.cancelRecording(cancelledId)).toBe(true);
        expect(manager.canUndo()).toBe(false);
    });

    it('keeps active recording lookup correct for overlapping uuids', async () => {
        const snapshots = new Map<string, any>([['node-1', { x: 0 }]]);
        const manager = new SceneUndoManager({
            snapshotAdapter: {
                capture: (uuids: string[]) => new Map(uuids.map(uuid => [uuid, { ...snapshots.get(uuid) }])),
                apply: async () => ({ success: true }),
                equals: (before: Map<string, any>, after: Map<string, any>) => JSON.stringify([...before]) === JSON.stringify([...after]),
            },
        });

        const firstId = manager.beginRecording(['node-1'], { label: 'First' });
        const secondId = manager.beginRecording(['node-1'], { label: 'Second' });

        expect(manager.hasActiveRecording('node-1')).toBe(true);

        expect(manager.cancelRecording(firstId)).toBe(true);
        expect(manager.hasActiveRecording('node-1')).toBe(true);

        expect(await manager.endRecording(secondId)).toBe(false);
        expect(manager.hasActiveRecording('node-1')).toBe(false);
    });

    it('honors custom commands when a snapshot adapter is configured', async () => {
        const customCommand = new ControlledCommand('custom-recording');
        const manager = new SceneUndoManager({
            snapshotAdapter: {
                capture: async () => new Map(),
                apply: async () => ({ success: true }),
                equals: () => true,
            },
        });

        const recordingId = manager.beginRecording(['node-1'], { label: 'Custom Recording', customCommand });

        expect(manager.hasActiveRecording('node-1')).toBe(true);

        expect(await manager.endRecording(recordingId)).toBe(true);
        expect(manager.hasActiveRecording('node-1')).toBe(false);
        expect(manager.canUndo()).toBe(true);

        await manager.undo();
        await manager.redo();

        expect(customCommand.calls).toEqual(['undo:custom-recording', 'redo:custom-recording']);
    });
});

class ControlledCommand implements IUndoCommand {
    meta: IUndoCommandMeta;
    calls: string[] = [];

    constructor(id: string, private ok = true) {
        this.meta = { id, label: id, type: 'test', scope: {}, timestamp: Date.now() };
    }

    async undo(): Promise<IUndoRedoResult> {
        this.calls.push(`undo:${this.meta.id}`);
        return this.ok ? { success: true, commandId: this.meta.id } : { success: false, reason: 'fail' };
    }

    async redo(): Promise<IUndoRedoResult> {
        this.calls.push(`redo:${this.meta.id}`);
        return this.ok ? { success: true, commandId: this.meta.id } : { success: false, reason: 'fail' };
    }
}

class DelayedCommand extends ControlledCommand {
    private undoResolver?: () => void;
    private undoStartedResolver?: () => void;
    private undoStarted = new Promise<void>(resolve => {
        this.undoStartedResolver = resolve;
    });

    async undo(): Promise<IUndoRedoResult> {
        this.calls.push(`undo:${this.meta.id}`);
        this.undoStartedResolver?.();
        await new Promise<void>(resolve => {
            this.undoResolver = resolve;
        });
        return { success: true, commandId: this.meta.id };
    }

    waitForUndoStart(): Promise<void> {
        return this.undoStarted;
    }

    resolveUndo(): void {
        this.undoResolver?.();
    }
}
