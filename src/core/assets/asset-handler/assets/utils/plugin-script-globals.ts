/** Default aliases made available to enclosed plugin scripts. */
export const DEFAULT_SIMULATED_GLOBALS = ['self', 'window', 'global', 'globalThis'] as const;

/**
 * Resolves persisted plugin aliases while tolerating metadata written by older PinK versions.
 */
export function resolveSimulatedGlobals(value: unknown): string[] {
    if (value === false || (Array.isArray(value) && value.length === 0)) {
        return [];
    }

    const customGlobals = Array.isArray(value) ? value : [];
    return Array.from(new Set([
        ...DEFAULT_SIMULATED_GLOBALS,
        ...customGlobals,
    ]));
}
