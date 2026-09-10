import { SceneUndoManager } from '../scene-process/service/undo/scene-undo-manager';
import { finishSavedLightFXRecording, LightFXResultRetainedError } from '../scene-process/service/baking/lightfx/saved-recording';

function fixture() {
    let data = 'old SH';
    let disk = data;
    const events: string[] = [];
    const manager = new SceneUndoManager({ snapshotAdapter: {
        capture: () => new Map([['scene', data]]),
        apply: snapshot => { data = snapshot.get('scene'); return { success: true }; },
        equals: (before, after) => before.get('scene') === after.get('scene'),
    } });
    const undo = {
        endRecording: async (id: string) => { events.push('record'); await manager.endRecording(id); },
        createCheckpoint: () => manager.createCheckpoint(),
        markSaved: jest.fn(() => { events.push('mark'); manager.markSaved(); }),
    };
    const save = async () => { events.push('save'); disk = data; manager.markSaved(); };
    const record = (value: string) => { const id = manager.beginRecording(['scene']); data = value; return id; };
    return { manager, undo, save, record, events, read: () => ({ data, disk, dirty: manager.isDirty() }) };
}

describe('LightFX result save baseline', () => {
    it.each(['new baked SH', ''])('marks the completed saved result, Undo becomes dirty and Redo returns to saved (%s)', async value => {
        const f = fixture();
        const id = f.record(value);
        await finishSavedLightFXRecording(f.undo, id, f.save);
        expect({ ...f.read(), events: f.events }).toEqual({ data: value, disk: value, dirty: false, events: ['record', 'save'] });
        await f.manager.undo();
        expect(f.read()).toEqual({ data: 'old SH', disk: value, dirty: true });
        await f.manager.redo();
        expect(f.read()).toEqual({ data: value, disk: value, dirty: false });
    });

    it('leaves an explicitly unsaved result dirty and does not write disk', async () => {
        const f = fixture();
        await finishSavedLightFXRecording(f.undo, f.record('new SH'));
        expect({ ...f.read(), events: f.events }).toEqual({ data: 'new SH', disk: 'old SH', dirty: true, events: ['record'] });
    });

    it('retains the result and Undo if saving fails before writing disk', async () => {
        const f = fixture();
        const id = f.record('new SH');
        await expect(finishSavedLightFXRecording(f.undo, id, async () => { throw new Error('save failed'); })).rejects.toThrow('save failed');
        expect(f.read()).toEqual({ data: 'new SH', disk: 'old SH', dirty: true });
        expect(f.manager.hasActiveRecording()).toBe(false);
        await f.manager.undo();
        expect(f.read()).toEqual({ data: 'old SH', disk: 'old SH', dirty: false });
        await f.manager.redo();
        expect(f.read()).toEqual({ data: 'new SH', disk: 'old SH', dirty: true });
    });

    it('retains the saved result if the response fails after writing disk', async () => {
        const f = fixture();
        await expect(finishSavedLightFXRecording(f.undo, f.record('new SH'), async () => {
            await f.save();
            throw new Error('response lost');
        })).rejects.toBeInstanceOf(LightFXResultRetainedError);
        expect(f.read()).toEqual({ data: 'new SH', disk: 'new SH', dirty: false });
        await f.manager.undo();
        expect(f.read()).toEqual({ data: 'old SH', disk: 'new SH', dirty: true });
        await f.manager.redo();
        expect(f.read()).toEqual({ data: 'new SH', disk: 'new SH', dirty: false });
    });

    it('retains a recording if endRecording reports failure after pushing history', async () => {
        const f = fixture();
        const undo = { ...f.undo, endRecording: async (id: string) => {
            await f.undo.endRecording(id);
            throw new Error('notification failed');
        } };
        await expect(finishSavedLightFXRecording(undo, f.record('new SH'), f.save)).rejects.toBeInstanceOf(LightFXResultRetainedError);
        expect(f.events).toEqual(['record']);
        expect(f.read()).toEqual({ data: 'new SH', disk: 'old SH', dirty: true });
    });

    it('does not attempt saving when history cannot be captured', async () => {
        const f = fixture();
        const undo = { ...f.undo, endRecording: async () => { throw new Error('capture failed'); } };
        await expect(finishSavedLightFXRecording(undo, f.record('new SH'), f.save)).rejects.toThrow('capture failed');
        expect(f.events).toEqual([]);
    });

    it('leaves no-op recordings clean and does not add a second saved mark', async () => {
        const f = fixture();
        await finishSavedLightFXRecording(f.undo, f.record('old SH'), f.save);
        expect(f.undo.markSaved).not.toHaveBeenCalled();
        expect(f.read()).toEqual({ data: 'old SH', disk: 'old SH', dirty: false });
    });
});
