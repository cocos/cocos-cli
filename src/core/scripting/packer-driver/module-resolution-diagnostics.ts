import { fileURLToPath } from 'url';
import type { ModLo } from '@cocos/creator-programming-mod-lo/lib/mod-lo';

type Resolver = Pick<ModLo, 'resolve'>;

/** Report the source import before QuickPack rewrites it to an opaque specifier. */
export function attachModuleResolutionDiagnostics(
    resolver: Resolver,
    target: string,
    report: (message: string) => void,
): void {
    const resolve = resolver.resolve;
    const reported = new Set<string>();
    resolver.resolve = function (...args: Parameters<Resolver['resolve']>): ReturnType<Resolver['resolve']> {
        const [specifier, importer] = args;
        const key = JSON.stringify([importer?.href, specifier, args[2]]);
        try {
            const result = resolve.apply(this, args);
            reported.delete(key);
            return result;
        } catch (error) {
            if (!reported.has(key)) {
                // Bound memory even when generated scripts continually introduce new imports.
                if (reported.size >= 1024) reported.clear();
                reported.add(key);
                let source = importer?.href ?? '<entry module>';
                if (importer?.protocol === 'file:') {
                    try { source = fileURLToPath(importer); } catch { /* Retain the original URL. */ }
                }
                const reason = error instanceof Error ? error.message : String(error);
                try {
                    report(`[ScriptModuleResolutionError] target=${JSON.stringify(target)}\n`
                        + `Source: ${source}\n`
                        + `Import: ${JSON.stringify(specifier)}\n`
                        + `Reason: ${reason}\n`
                        + 'Check the import path and wait for all related files to finish saving and compiling.');
                } catch { /* Diagnostic transports must not replace the original resolution error. */ }
            }
            throw error;
        }
    };
}
