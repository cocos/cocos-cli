import { registerViewUpdate, updateViews } from '../scene-process/service/core/view-updates';

it('runs registered view callbacks and stops them after idempotent release', () => {
    const callback = jest.fn();
    const release = registerViewUpdate(callback);
    updateViews(0.25);
    expect(callback).toHaveBeenCalledWith(0.25);
    release(); release();
    updateViews(1);
    expect(callback).toHaveBeenCalledTimes(1);
});

it('surfaces view failures instead of silently pretending the frame succeeded', () => {
    const release = registerViewUpdate(() => { throw new Error('view failed'); });
    try { expect(() => updateViews(0)).toThrow('view failed'); } finally { release(); }
});
