import { PropertyPreviewStore } from '../scene-process/service/core/property-preview';
import { sceneSessionMethods } from '../session/methods';

describe('property preview transactions', () => {
    const target = { uuid: 'node', path: 'name', previewId: 'edit-1' };
    function fixture() {
        let value = 'Original';
        let exists = true;
        const write = jest.fn(async (_target, next: string) => { if (!exists) return false; value = next; return true; });
        const commit = jest.fn();
        const store = new PropertyPreviewStore<string>({ read: () => exists ? value : undefined, write, commit });
        return { store, write, commit, value: () => value, remove: () => { exists = false; }, restore: () => { exists = true; } };
    }
    it('publishes all three operations through the scene session allowlist', () => {
        expect(sceneSessionMethods.Node).toEqual(expect.arrayContaining(['previewSetProperty', 'cancelPreviewSetProperty', 'commitPreviewSetProperty', 'getPathByUuid']));
    });
    it('retains the first value through repeated previews and cancels without committing', async () => {
        const f = fixture();
        await f.store.preview(target, 'First');
        await f.store.preview(target, 'Final');
        expect(await f.store.cancel(target)).toBe(true);
        expect(f.value()).toBe('Original');
        expect(f.commit).not.toHaveBeenCalled();
    });
    it('commits original and final values without restoring or reapplying the property', async () => {
        const f = fixture();
        await f.store.preview(target, 'First');
        await f.store.preview(target, 'Final');
        expect(await f.store.commit(target)).toBe(true);
        expect(f.commit).toHaveBeenCalledWith(target, 'Original', 'Final');
        expect(f.write).toHaveBeenCalledTimes(2);
        expect(f.value()).toBe('Final');
    });
    it('rejects competing sessions and stale requests after completion', async () => {
        const f = fixture();
        await f.store.preview(target, 'First');
        const other = { ...target, previewId: 'other' };
        await expect(f.store.preview(other, 'Other')).rejects.toThrow('PREVIEW_CONFLICT');
        await expect(f.store.cancel(other)).rejects.toThrow('PREVIEW_CONFLICT');
        await expect(f.store.commit(other)).rejects.toThrow('PREVIEW_CONFLICT');
        expect(() => f.store.assertAvailable(target.uuid, target.path)).toThrow('PREVIEW_CONFLICT');
        await f.store.commit(target);
        await expect(f.store.preview(target, 'Late')).rejects.toThrow('PREVIEW_FINISHED');
        await expect(f.store.cancel(target)).rejects.toThrow('PREVIEW_FINISHED');
        await f.store.preview(other, 'Other');
        await f.store.cancel(other);
        expect(f.value()).toBe('First');
    });
    it.each(['false', 'throw'])('retains restoration state after cancel returns %s', async failure => {
        const f = fixture();
        await f.store.preview(target, 'Draft');
        if (failure === 'throw') {
            f.write.mockRejectedValueOnce(new Error('restore failed'));
            await expect(f.store.cancel(target)).rejects.toThrow('restore failed');
        } else {
            f.write.mockResolvedValueOnce(false);
            expect(await f.store.cancel(target)).toBe(false);
        }
        expect(await f.store.cancel(target)).toBe(true);
        expect(f.value()).toBe('Original');
    });
    it('retains the transaction if pushing Undo fails', async () => {
        const f = fixture();
        await f.store.preview(target, 'Draft');
        f.commit.mockImplementationOnce(() => { throw new Error('push failed'); });
        await expect(f.store.commit(target)).rejects.toThrow('push failed');
        expect(await f.store.commit(target)).toBe(true);
        expect(f.commit).toHaveBeenLastCalledWith(target, 'Original', 'Draft');
    });
    it('rejects overlapping properties even within the same edit ID', async () => {
        const f = fixture();
        await f.store.preview({ ...target, path: 'position' }, 'Draft');
        await expect(f.store.preview({ ...target, path: 'position.x' }, 'Nested')).rejects.toThrow('PREVIEW_CONFLICT');
        expect(() => f.store.assertAvailable(target.uuid, 'position.x')).toThrow('PREVIEW_CONFLICT');
    });
    it('does not resurrect a transaction when the scene closes during cancellation', async () => {
        const f = fixture();
        await f.store.preview(target, 'Draft');
        let release!: (value: boolean) => void;
        f.write.mockImplementationOnce(() => new Promise<boolean>(resolve => { release = resolve; }));
        const cancelled = f.store.cancel(target);
        await Promise.resolve();
        f.store.clear();
        release(true);
        await expect(cancelled).rejects.toThrow('PREVIEW_SCENE_CLOSED');
        await f.store.preview(target, 'New edit');
        expect(await f.store.commit(target)).toBe(true);
    });
    it('reports a missing node and preserves cancellation state for retry', async () => {
        const f = fixture();
        await f.store.preview(target, 'Draft');
        f.remove();
        expect(await f.store.commit(target)).toBe(false);
        expect(await f.store.cancel(target)).toBe(false);
        f.restore();
        expect(await f.store.cancel(target)).toBe(true);
    });
    it('serializes updates and a commit even when callers do not await previews', async () => {
        const f = fixture();
        const first = f.store.preview(target, 'First');
        const last = f.store.preview(target, 'Final');
        const commit = f.store.commit(target);
        await Promise.all([first, last, commit]);
        expect(f.commit).toHaveBeenCalledWith(target, 'Original', 'Final');
    });
    it('invalidates queued requests when the scene closes', async () => {
        const f = fixture();
        const queued = f.store.preview(target, 'Old scene');
        f.store.clear();
        await expect(queued).rejects.toThrow('PREVIEW_SCENE_CLOSED');
        expect(f.value()).toBe('Original');
        await f.store.preview(target, 'New scene');
        await f.store.cancel(target);
        expect(f.value()).toBe('Original');
    });
    it.each(['parent', 'children', '__comps__.0.name', '_components.0.name', '__proto__.name', 'constructor.name'])('rejects structural or unsafe path %s', async path => {
        const f = fixture();
        await expect(f.store.preview({ ...target, path }, 'Draft')).rejects.toThrow('UNSUPPORTED_PREVIEW_PROPERTY');
        expect(f.write).not.toHaveBeenCalled();
    });
});
