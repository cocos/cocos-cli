import type { Scene } from 'cc';
import { SceneUndoManager } from '../scene-process/service/undo/scene-undo-manager';
import { LightProbeClearCommand } from '../scene-process/service/undo/commands/light-probe-clear-command';

function fixture() {
    const state = { gi: 1, coefficients: [1, 2, 3] };
    const scene = { uuid: 'scene', isValid: true, globals: { lightProbeInfo: { onProbeBakeCleared() { state.coefficients = []; } } } };
    const manager = new SceneUndoManager({ snapshotAdapter: {
        capture: () => new Map([['scene', structuredClone(state)]]),
        equals: (a, b) => JSON.stringify([...a]) === JSON.stringify([...b]),
        apply: data => { Object.assign(state, structuredClone(data.get('scene'))); return { success: true }; },
    } });
    const edit = async (gi: number, coefficients = state.coefficients) => {
        const id = manager.beginRecording(['scene']);
        Object.assign(state, { gi, coefficients });
        await manager.endRecording(id);
    };
    const clear = () => {
        manager.commitNonUndoableChange(command => command instanceof LightProbeClearCommand
            ? command : new LightProbeClearCommand(command, scene.uuid, () => scene as unknown as Scene));
        scene.globals.lightProbeInfo.onProbeBakeCleared();
    };
    return { state, scene, manager, edit, clear };
}

describe('non-Undo probe Clear', () => {
    it('is dirty without adding history, and stays dirty until saved', async () => {
        const f = fixture();
        f.clear();
        await f.manager.undo();
        expect([f.state.coefficients, f.manager.isDirty(), f.manager.canUndo()]).toEqual([[], true, false]);
        f.manager.clearHistory();
        expect(f.manager.isDirty()).toBe(true);
        f.manager.markSaved();
        expect(f.manager.isDirty()).toBe(false);
        f.clear();
        f.manager.reset();
        expect(f.manager.isDirty()).toBe(false);
    });

    it('keeps ordinary Undo/Redo and never restores pre-Clear SH even after saving', async () => {
        const f = fixture();
        await f.edit(2);
        f.clear();
        await f.manager.undo();
        expect([f.state, f.manager.isDirty()]).toEqual([{ gi: 1, coefficients: [] }, true]);
        f.manager.markSaved();
        await f.manager.redo();
        expect([f.state, f.manager.isDirty()]).toEqual([{ gi: 2, coefficients: [] }, true]);
        await f.manager.undo();
        expect([f.state, f.manager.isDirty()]).toEqual([{ gi: 1, coefficients: [] }, false]);
    });

    it('protects the existing redo branch as well as the undo branch', async () => {
        const f = fixture();
        await f.edit(2);
        await f.manager.undo();
        f.clear();
        await f.manager.redo();
        expect(f.state).toEqual({ gi: 2, coefficients: [] });
    });

    it('does not change the result lifecycle of a later Probe Bake', async () => {
        const f = fixture();
        await f.edit(2);
        f.clear();
        await f.edit(3, [9]);
        await f.manager.undo();
        await f.manager.undo();
        expect(f.state).toEqual({ gi: 1, coefficients: [] });
        await f.manager.redo();
        expect(f.state).toEqual({ gi: 2, coefficients: [] });
        await f.manager.redo();
        expect(f.state).toEqual({ gi: 3, coefficients: [9] });
    });

    it('handles repeated Clear and composite histories without adding wrappers repeatedly', async () => {
        const f = fixture();
        const group = f.manager.beginGroup();
        await f.edit(2);
        await f.edit(3);
        f.manager.endGroup(group);
        f.clear();
        const protectedCommand = f.manager.getHistoryForTesting()[0];
        f.clear();
        expect(f.manager.getHistoryForTesting()[0]).toBe(protectedCommand);
        await f.manager.undo();
        expect(f.state).toEqual({ gi: 1, coefficients: [] });
        await f.manager.redo();
        expect(f.state).toEqual({ gi: 3, coefficients: [] });
    });

    it('rejects active edits without changing history or dirty state', () => {
        const f = fixture();
        const id = f.manager.beginRecording(['scene']);
        expect(() => f.clear()).toThrow('edit is active');
        f.manager.cancelRecording(id);
        const group = f.manager.beginGroup();
        expect(() => f.clear()).toThrow('edit is active');
        f.manager.cancelGroup(group);
        expect([f.state.coefficients, f.manager.isDirty(), f.manager.canUndo()]).toEqual([[1, 2, 3], false, false]);
    });

    it('protects a reloaded instance of the same scene, but never a different scene', async () => {
        const f = fixture();
        await f.edit(2);
        const clear = jest.fn();
        let current = { ...f.scene, globals: { lightProbeInfo: { onProbeBakeCleared: clear } } };
        const command = new LightProbeClearCommand(f.manager.getHistoryForTesting()[0], f.scene.uuid, () => current as unknown as Scene);
        await command.undo();
        expect(clear).toHaveBeenCalledTimes(1);
        current = { ...current, uuid: 'other-scene' };
        await command.redo();
        expect(clear).toHaveBeenCalledTimes(1);
    });

    it('clears SH even when an old command partially applies and then fails', async () => {
        const f = fixture();
        const command = new LightProbeClearCommand({
            meta: { id: 'failed-edit', label: 'Failed edit', type: 'test', scope: {}, timestamp: 0 },
            async undo() { f.state.coefficients = [9]; throw new Error('partial failure'); },
            async redo() { return { success: true }; },
        }, f.scene.uuid, () => f.scene as unknown as Scene);
        await expect(command.undo()).rejects.toThrow('partial failure');
        expect(f.state.coefficients).toEqual([]);
    });
});
