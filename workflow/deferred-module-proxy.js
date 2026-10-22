const DEFERRED_MODULE_CACHE_KEY = '__cocosCliDeferredEngineModules';

function getDeferredModule(system, id, moduleCache) {
    if (moduleCache && Object.prototype.hasOwnProperty.call(moduleCache, id)) {
        return moduleCache[id];
    }

    if (!system || !system.get) {
        return undefined;
    }

    let resolvedId = id;
    if (system.resolve) {
        try {
            const candidate = system.resolve(id);
            // @cocos/systemjs resolves import maps asynchronously. A Proxy getter
            // cannot await that Promise, so only use synchronous resolver results.
            if (typeof candidate === 'string') {
                resolvedId = candidate;
            }
        } catch {
            // Some named modules are registered without an import-map entry.
            // Fall back to the original ID for those modules.
        }
    }

    return system.get(resolvedId) || (resolvedId !== id ? system.get(id) : undefined);
}

function createDeferredModule(id, getSystem, getModule, getModuleCache = () => undefined) {
    return new Proxy({}, {
        get(target, prop) {
            const real = getModule(getSystem(), id, getModuleCache());
            return real ? real[prop] : undefined;
        },
        has(target, prop) {
            const real = getModule(getSystem(), id, getModuleCache());
            return real ? prop in real : false;
        },
    });
}

function createDeferredModuleSource() {
    return `
        const _getDeferredModule = ${getDeferredModule.toString()};
        const _createDeferredModule = ${createDeferredModule.toString()};
        function _getSystem() {
            return typeof System === 'undefined' ? undefined : System;
        }
        function _getModuleCache() {
            return typeof globalThis === 'undefined'
                ? undefined
                : globalThis[${JSON.stringify(DEFERRED_MODULE_CACHE_KEY)}];
        }
        export function syncImport(id) {
            return _createDeferredModule(id, _getSystem, _getDeferredModule, _getModuleCache);
        }
        export default { syncImport: syncImport };
    `;
}

module.exports = {
    DEFERRED_MODULE_CACHE_KEY,
    createDeferredModule,
    createDeferredModuleSource,
    getDeferredModule,
};
