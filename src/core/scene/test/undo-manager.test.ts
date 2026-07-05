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

    it('checks scoped differences on both sides of an undo checkpoint', async () => {
        const manager = new SceneUndoManager();
        const sceneCommand = new ControlledCommand('scene-command', true, { editorType: 'scene', mode: 'general' }, 'node:create');
        const animationCommand = new ControlledCommand('animation-command', true, { editorType: 'animation', mode: 'animation', assetUuid: 'clip-1' }, 'animation:clip-snapshot');

        manager.push(sceneCommand);
        const baseline = manager.createCheckpoint();
        expect(manager.hasScopedDifference(baseline, { editorType: 'animation', mode: 'animation', assetUuid: 'clip-1' })).toBe(false);

        manager.push(animationCommand);
        expect(manager.hasScopedDifference(baseline, { editorType: 'animation', mode: 'animation', assetUuid: 'clip-1' })).toBe(true);
        const savedAnimation = manager.createCheckpoint();
        expect(manager.hasScopedDifference(savedAnimation, { editorType: 'animation', mode: 'animation', assetUuid: 'clip-1' })).toBe(false);

        await manager.undo({ scope: { editorType: 'animation', mode: 'animation' } });
        expect(manager.hasScopedDifference(savedAnimation, { editorType: 'animation', mode: 'animation', assetUuid: 'clip-1' })).toBe(true);
        expect(manager.hasScopedDifference(baseline, { editorType: 'animation', mode: 'animation', assetUuid: 'clip-1' })).toBe(false);
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

        const recordingId = manager.beginRecording(['node-1'], {
            label: 'Move Node',
            scope: { editorType: 'scene', nodePath: 'Canvas/Hero', propPath: 'position' },
        });
        snapshots.set('node-1', { x: 1 });
        snapshots.set('node-2', { x: 20 });

        expect(await manager.endRecording(recordingId)).toBe(true);
        expect(manager.canUndo()).toBe(true);
        expect(manager.getHistoryForTesting()[0].meta.scope).toEqual({
            editorType: 'scene',
            nodePath: 'Canvas/Hero',
            propPath: 'position',
        });

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

    it('releases active recording state when ending a snapshot recording throws', async () => {
        let captureCount = 0;
        const manager = new SceneUndoManager({
            snapshotAdapter: {
                capture: (uuids: string[]) => {
                    captureCount++;
                    if (captureCount === 2) {
                        throw new Error('capture after failed');
                    }
                    return new Map(uuids.map(uuid => [uuid, { x: 0 }]));
                },
                apply: async () => ({ success: true }),
                equals: () => false,
            },
        });

        const recordingId = manager.beginRecording(['node-1'], { label: 'Move Node' });
        expect(manager.hasActiveRecording('node-1')).toBe(true);

        await expect(manager.endRecording(recordingId)).rejects.toThrow('capture after failed');
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

    it('does not undo the stack top when it is outside the requested scope', async () => {
        const manager = new SceneUndoManager();
        const animationCommand = new ControlledCommand('animation-command', true, { editorType: 'animation', mode: 'animation' });
        const sceneCommand = new ControlledCommand('scene-command', true, { editorType: 'scene', mode: 'general' });

        manager.push(animationCommand);
        manager.push(sceneCommand);

        await expect(manager.undo({ scope: { editorType: 'animation', mode: 'animation' } })).resolves.toMatchObject({
            success: false,
            reason: 'Cannot undo',
        });
        expect(animationCommand.calls).toEqual([]);
        expect(sceneCommand.calls).toEqual([]);

        await expect(manager.undo()).resolves.toMatchObject({ success: true, commandId: 'scene-command' });
        expect(sceneCommand.calls).toEqual(['undo:scene-command']);

        await expect(manager.undo({ scope: { editorType: 'animation', mode: 'animation' } })).resolves.toMatchObject({
            success: true,
            commandId: 'animation-command',
        });
        expect(animationCommand.calls).toEqual(['undo:animation-command']);

        await expect(manager.redo({ scope: { editorType: 'animation', mode: 'animation' } })).resolves.toMatchObject({
            success: true,
            commandId: 'animation-command',
        });
        expect(animationCommand.calls).toEqual(['undo:animation-command', 'redo:animation-command']);
    });

    it('merges a consumed scene property command into the animation undo scope', async () => {
        const manager = new SceneUndoManager();
        const sceneCommand = new ControlledCommand('scene-property-command', true, { editorType: 'scene', mode: 'general' }, 'node:set-property');
        const animationCommand = new ControlledCommand('animation-command', true, { editorType: 'animation', mode: 'animation' }, 'animation:clip-snapshot');

        manager.push(sceneCommand);
        manager.pushWithPrevious(animationCommand, {
            label: 'Animation Property Commit',
            type: 'animation:property-commit',
            scope: { editorType: 'animation', mode: 'animation' },
            previousScope: { editorType: 'scene' },
            previousTypes: ['node:set-property', 'component:set-property'],
        });

        expect(manager.canUndo({ scope: { editorType: 'animation', mode: 'animation' } })).toBe(true);
        expect(manager.getHistoryForTesting()).toHaveLength(1);

        await expect(manager.undo({ scope: { editorType: 'animation', mode: 'animation' } })).resolves.toMatchObject({
            success: true,
        });
        expect(animationCommand.calls).toEqual(['undo:animation-command']);
        expect(sceneCommand.calls).toEqual(['undo:scene-property-command']);

        await expect(manager.redo({ scope: { editorType: 'animation', mode: 'animation' } })).resolves.toMatchObject({
            success: true,
        });
        expect(sceneCommand.calls).toEqual(['undo:scene-property-command', 'redo:scene-property-command']);
        expect(animationCommand.calls).toEqual(['undo:animation-command', 'redo:animation-command']);
    });

    it('merges consecutive consumed scene property commands into one animation undo scope', async () => {
        const manager = new SceneUndoManager();
        const firstSceneCommand = new ControlledCommand('scene-property-command-1', true, { editorType: 'scene', mode: 'general' }, 'node:set-property');
        const secondSceneCommand = new ControlledCommand('scene-property-command-2', true, { editorType: 'scene', mode: 'general' }, 'node:set-property');
        const animationCommand = new ControlledCommand('animation-command', true, { editorType: 'animation', mode: 'animation' }, 'animation:clip-snapshot');

        manager.push(firstSceneCommand);
        manager.push(secondSceneCommand);
        manager.pushWithPrevious(animationCommand, {
            label: 'Animation Property Commit',
            type: 'animation:property-commit',
            scope: { editorType: 'animation', mode: 'animation' },
            previousScope: { editorType: 'scene' },
            previousTypes: ['node:set-property', 'component:set-property'],
        });

        expect(manager.getHistoryForTesting()).toHaveLength(1);
        await expect(manager.undo({ scope: { editorType: 'animation', mode: 'animation' } })).resolves.toMatchObject({
            success: true,
        });
        expect(animationCommand.calls).toEqual(['undo:animation-command']);
        expect(secondSceneCommand.calls).toEqual(['undo:scene-property-command-2']);
        expect(firstSceneCommand.calls).toEqual(['undo:scene-property-command-1']);

        await expect(manager.redo({ scope: { editorType: 'animation', mode: 'animation' } })).resolves.toMatchObject({
            success: true,
        });
        expect(firstSceneCommand.calls).toEqual(['undo:scene-property-command-1', 'redo:scene-property-command-1']);
        expect(secondSceneCommand.calls).toEqual(['undo:scene-property-command-2', 'redo:scene-property-command-2']);
        expect(animationCommand.calls).toEqual(['undo:animation-command', 'redo:animation-command']);
    });

    it('does not absorb a previous command with the wrong type', async () => {
        const manager = new SceneUndoManager();
        const sceneCommand = new ControlledCommand('scene-create-command', true, { editorType: 'scene', mode: 'general' }, 'node:create');
        const animationCommand = new ControlledCommand('animation-command', true, { editorType: 'animation', mode: 'animation' }, 'animation:clip-snapshot');

        manager.push(sceneCommand);
        manager.pushWithPrevious(animationCommand, {
            type: 'animation:property-commit',
            scope: { editorType: 'animation', mode: 'animation' },
            previousScope: { editorType: 'scene' },
            previousTypes: ['node:set-property', 'component:set-property'],
        });

        expect(manager.getHistoryForTesting()).toHaveLength(2);
        await expect(manager.undo({ scope: { editorType: 'animation', mode: 'animation' } })).resolves.toMatchObject({
            success: true,
        });
        expect(animationCommand.calls).toEqual(['undo:animation-command']);
        expect(sceneCommand.calls).toEqual([]);
    });

    it('does not search past the stack top when absorbing previous commands', async () => {
        const manager = new SceneUndoManager();
        const sceneCommand = new ControlledCommand('scene-property-command', true, { editorType: 'scene', mode: 'general' }, 'node:set-property');
        const unrelatedCommand = new ControlledCommand('unrelated-command', true, { editorType: 'scene', mode: 'general' }, 'node:create');
        const animationCommand = new ControlledCommand('animation-command', true, { editorType: 'animation', mode: 'animation' }, 'animation:clip-snapshot');

        manager.push(sceneCommand);
        manager.push(unrelatedCommand);
        manager.pushWithPrevious(animationCommand, {
            type: 'animation:property-commit',
            scope: { editorType: 'animation', mode: 'animation' },
            previousScope: { editorType: 'scene' },
            previousTypes: ['node:set-property', 'component:set-property'],
        });

        expect(manager.getHistoryForTesting()).toHaveLength(3);
        await expect(manager.undo({ scope: { editorType: 'animation', mode: 'animation' } })).resolves.toMatchObject({
            success: true,
        });
        expect(animationCommand.calls).toEqual(['undo:animation-command']);
        expect(unrelatedCommand.calls).toEqual([]);
        expect(sceneCommand.calls).toEqual([]);
    });
});

class ControlledCommand implements IUndoCommand {
    meta: IUndoCommandMeta;
    calls: string[] = [];

    constructor(id: string, private ok = true, scope: IUndoCommandMeta['scope'] = {}, type = 'test') {
        this.meta = { id, label: id, type, scope, timestamp: Date.now() };
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
