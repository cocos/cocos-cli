/**
 * Removes empty-string `phase` overrides from material pipeline states.
 *
 * Inspector dumps encode an unset effect pass.phase as `PassStatesEditor.phase = ''`.
 * `Pass.fillPipelineInfo` treats any defined phase as an override, and
 * `getPhaseID('')` registers a unique unused render phase. The preview camera
 * never draws that phase, so the mesh disappears after apply.
 *
 * @param states Material `_states` array, a single override record, or unrelated input.
 * @returns Whether any empty phase was removed.
 *
 * @example
 * ```ts
 * const states = [{ phase: '', primitive: 7 }, { phase: 'forward-add' }];
 * omitEmptyMaterialPhaseOverrides(states);
 * // states[0] has no phase; states[1].phase is still 'forward-add'
 * ```
 */
export function omitEmptyMaterialPhaseOverrides(states: unknown): boolean {
    if (Array.isArray(states)) {
        let mutated = false;
        for (const state of states) {
            if (omitEmptyPhaseFromRecord(state)) {
                mutated = true;
            }
        }
        return mutated;
    }
    return omitEmptyPhaseFromRecord(states);
}

function omitEmptyPhaseFromRecord(state: unknown): boolean {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
        return false;
    }
    const record = state as Record<string, unknown>;
    if (record.phase !== '') {
        return false;
    }
    delete record.phase;
    return true;
}
