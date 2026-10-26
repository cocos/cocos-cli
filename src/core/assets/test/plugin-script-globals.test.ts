import { DEFAULT_SIMULATED_GLOBALS, resolveSimulatedGlobals } from '../asset-handler/assets/utils/plugin-script-globals';

describe('plugin script globals', () => {
    test('uses the default aliases when no custom aliases are stored', () => {
        expect(resolveSimulatedGlobals(undefined)).toEqual(DEFAULT_SIMULATED_GLOBALS);
    });

    test('appends custom aliases after the defaults', () => {
        expect(resolveSimulatedGlobals(['PINK_PLUGIN_ALIAS'])).toEqual([
            ...DEFAULT_SIMULATED_GLOBALS,
            'PINK_PLUGIN_ALIAS',
        ]);
    });

    test('treats legacy boolean metadata as no custom aliases', () => {
        expect(resolveSimulatedGlobals(true)).toEqual(DEFAULT_SIMULATED_GLOBALS);
    });

    test('preserves an empty alias array as disabled aliases', () => {
        expect(resolveSimulatedGlobals([])).toEqual([]);
    });

    test('preserves legacy false metadata as disabled aliases', () => {
        expect(resolveSimulatedGlobals(false)).toEqual([]);
    });

    test('deduplicates default and custom aliases', () => {
        expect(resolveSimulatedGlobals(['window', 'PINK_PLUGIN_ALIAS', 'PINK_PLUGIN_ALIAS'])).toEqual([
            ...DEFAULT_SIMULATED_GLOBALS,
            'PINK_PLUGIN_ALIAS',
        ]);
    });
});
