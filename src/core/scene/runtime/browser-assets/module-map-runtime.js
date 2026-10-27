/* global fetch, URL, console, AbortController, setTimeout, clearTimeout */

// QuickPack placeholders are ordinary scoped imports, not proof of missing source files.
export function findPackMapping(map, specifier, importer, baseURL) {
    const scopes = Object.entries(map.scopes || {})
        .map(([scope, imports]) => [new URL(scope, baseURL).href, imports])
        .filter(([scope]) => importer === scope || (scope.endsWith('/') && importer.startsWith(scope)))
        .sort((a, b) => b[0].length - a[0].length);
    for (const [, imports] of scopes) {
        if (Object.prototype.hasOwnProperty.call(imports, specifier)) {
            return typeof imports[specifier] === 'string' ? new URL(imports[specifier], baseURL).href : undefined;
        }
    }
    return undefined;
}

export function installModuleMapDiagnostics(system, serverURL, options = {}) {
    if (system.__pinkModuleMapDiagnostics) return;
    system.__pinkModuleMapDiagnostics = true;
    const backendBase = serverURL.endsWith('/') ? serverURL : serverURL + '/';
    const packMapURL = options.packMapURL || new URL('scripting/x/pack-import-map-url', backendBase).href;
    const diagnosticURL = options.diagnosticURL || new URL('scripting/module-diagnostic', backendBase).href;
    const mapBaseURL = options.mapBaseURL || backendBase;
    const resolve = system.resolve;
    const timeoutMs = Number.isFinite(options.requestTimeoutMs) && options.requestTimeoutMs > 0
        ? options.requestTimeoutMs : 1500;
    // Bound both fetch and response.json(); an unavailable diagnostic must not hang resolution.
    const readJSON = async url => {
        const controller = new AbortController();
        let timer;
        try {
            return await Promise.race([
                (async () => {
                    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
                    if (!response.ok) throw new Error('Module diagnostic HTTP ' + response.status);
                    return await response.json();
                })(),
                new Promise((_, reject) => {
                    timer = setTimeout(() => { controller.abort(); reject(new Error('Module diagnostic request timed out')); }, timeoutMs);
                }),
            ]);
        } finally { clearTimeout(timer); }
    };
    let pending;
    const freshMap = () => {
        if (!pending) {
            pending = readJSON(new URL(packMapURL)).finally(() => { pending = undefined; });
        }
        return pending;
    };
    system.resolve = async function (specifier, importer, ...rest) {
        try {
            return await resolve.call(this, specifier, importer, ...rest);
        } catch (original) {
            if (!/^__unresolved_\d+$/.test(specifier) || typeof importer !== 'string') throw original;
            let mapped;
            try {
                const map = await freshMap();
                mapped = findPackMapping(map, specifier, importer, mapBaseURL);
            } catch (error) {
                console.warn('[ScriptModuleRuntimeError] Could not refresh import map:', error);
            }
            let diagnostic;
            try {
                const url = new URL(diagnosticURL);
                url.searchParams.set('chunk', importer);
                url.searchParams.set('specifier', specifier);
                diagnostic = await readJSON(url);
            } catch { /* Preserve the original error if diagnostics are unavailable. */ }
            const details = diagnostic
                ? `\nLatest compiled source: ${diagnostic.source}\nLatest compiled import: ${diagnostic.import}\nLocation: ${diagnostic.line || '?'}:${diagnostic.column || '?'}`
                : `\nChunk: ${importer}\nSpecifier: ${specifier}`;
            // Chunk IDs identify module URLs, not source revisions. Never combine a loaded
            // old chunk with a newer mapping. Let the host/user reload the runtime, preserving
            // unsaved editor state instead of forcing a page reload here.
            const reloadRequired = mapped
                ? '\n[ScriptModuleRuntimeReloadRequired] A newer mapping exists, but its source revision cannot be verified. Reload the preview or runtime before retrying.'
                : '';
            const error = new Error(String(original && original.message || original) + '\n[ScriptModuleRuntimeError]' + details + reloadRequired);
            error.cause = original;
            throw error;
        }
    };
}
