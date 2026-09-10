import { ProbeSelection } from '../scene-process/service/gizmo/components/light-probe-group/selection';

describe('ProbeSelection', () => {
    it('does not carry selection across pooled targets, including equally sized groups', () => {
        const selection = new ProbeSelection();
        const first = {};
        selection.bind(first, 32);
        selection.all();
        expect(selection.indices.size).toBe(32);
        selection.bind({}, 32);
        expect([...selection.indices]).toEqual([]);
        selection.all();
        selection.bind(null, 0);
        expect([...selection.indices]).toEqual([]);
        selection.bind(first, 32);
        expect([...selection.indices]).toEqual([]);
    });

    it('retains selection during a same-target move but drops invalid indices after regeneration', () => {
        const selection = new ProbeSelection();
        const owner = {};
        selection.bind(owner, 4);
        selection.all();
        selection.bind(owner, 4);
        expect([...selection.indices]).toEqual([0, 1, 2, 3]);
        selection.bind(owner, 2);
        expect([...selection.indices]).toEqual([]);
    });

    it('uses the original additive selection on every frame and drops transient rectangle hits', () => {
        const selection = new ProbeSelection();
        selection.bind({}, 5);
        selection.indices.add(0);
        selection.beginRegion();
        selection.region([1, 2, 3], true);
        expect([...selection.indices]).toEqual([0, 1, 2, 3]);
        selection.region([2], true);
        expect([...selection.indices]).toEqual([0, 2]);
        selection.region([], true);
        expect([...selection.indices]).toEqual([0]);
        selection.endRegion();
        selection.region([4], true);
        expect([...selection.indices]).toEqual([0, 4]);
    });

    it('replacement selection ignores both the baseline and invalid indices', () => {
        const selection = new ProbeSelection();
        selection.bind({}, 4);
        selection.all();
        selection.beginRegion();
        selection.region([-1, 2, 9], false);
        expect([...selection.indices]).toEqual([2]);
        selection.region([], false);
        expect([...selection.indices]).toEqual([]);
    });
});
