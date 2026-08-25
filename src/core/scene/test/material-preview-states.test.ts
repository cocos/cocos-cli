import { omitEmptyMaterialPhaseOverrides } from '../scene-process/service/preview/material-preview-states';

describe('omitEmptyMaterialPhaseOverrides', () => {
    it('removes empty-string phase from dump states so apply uses the effect default', () => {
        const states = [
            { phase: '', primitive: 7 },
            { primitive: 7 },
        ];
        const single = { phase: '', rasterizerState: { cullMode: 2 } };

        expect(omitEmptyMaterialPhaseOverrides(states)).toBe(true);
        expect(states[0]).toEqual({ primitive: 7 });
        expect(states[1]).toEqual({ primitive: 7 });

        expect(omitEmptyMaterialPhaseOverrides(single)).toBe(true);
        expect(single).toEqual({ rasterizerState: { cullMode: 2 } });
        expect(omitEmptyMaterialPhaseOverrides(states)).toBe(false);
    });

    it('keeps named or numeric phase overrides and ignores unrelated input', () => {
        const states = [
            { phase: 'forward-add', primitive: 7 },
            { phase: 'default' },
            { phase: 16 },
        ];

        expect(omitEmptyMaterialPhaseOverrides(states)).toBe(false);
        expect(states[0].phase).toBe('forward-add');
        expect(states[1].phase).toBe('default');
        expect(states[2].phase).toBe(16);
        expect(omitEmptyMaterialPhaseOverrides(null)).toBe(false);
        expect(omitEmptyMaterialPhaseOverrides(undefined)).toBe(false);
        expect(omitEmptyMaterialPhaseOverrides('')).toBe(false);
        expect(omitEmptyMaterialPhaseOverrides([{ phase: null }])).toBe(false);
    });
});
