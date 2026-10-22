const {
    DEFERRED_MODULE_CACHE_KEY,
    createDeferredModule,
    createDeferredModuleSource,
    getDeferredModule,
} = require('../../workflow/deferred-module-proxy');

describe('scene bundle deferred module proxy', () => {
    it('reads an imported module through its resolved registry ID', () => {
        const moduleId = 'cc/editor/lod-group-utils';
        const resolvedId = 'q-bundled:///fs/editor/exports/lod-group-utils.js';
        const loadedModule = {
            LODGroupEditorUtility: {
                getVisibleLOD: jest.fn(),
            },
        };
        const system = {
            resolve: jest.fn(() => resolvedId),
            get: jest.fn((id) => id === resolvedId ? loadedModule : undefined),
        };
        const proxy = createDeferredModule(moduleId, () => system, getDeferredModule);

        expect(proxy.LODGroupEditorUtility).toBe(loadedModule.LODGroupEditorUtility);
        expect('LODGroupEditorUtility' in proxy).toBe(true);
        expect(system.resolve).toHaveBeenCalledWith(moduleId);
        expect(system.get).toHaveBeenCalledWith(resolvedId);
    });

    it('falls back to the original ID when the module cannot be resolved', () => {
        const loadedModule = { value: 42 };
        const system = {
            resolve: jest.fn(() => {
                throw new Error('unresolved');
            }),
            get: jest.fn((id) => id === 'named-module' ? loadedModule : undefined),
        };

        expect(getDeferredModule(system, 'named-module')).toBe(loadedModule);
        expect(system.get).toHaveBeenCalledWith('named-module');
    });

    it('reads a preloaded module when System.resolve is asynchronous', () => {
        const moduleId = 'cc/editor/lod-group-utils';
        const loadedModule = {
            LODGroupEditorUtility: {
                getVisibleLOD: jest.fn(),
            },
        };
        const system = {
            resolve: jest.fn(() => Promise.resolve('q-bundled:///fs/editor/exports/lod-group-utils.js')),
            get: jest.fn(),
        };
        const moduleCache = {
            [moduleId]: loadedModule,
        };
        const proxy = createDeferredModule(moduleId, () => system, getDeferredModule, () => moduleCache);

        expect(proxy.LODGroupEditorUtility).toBe(loadedModule.LODGroupEditorUtility);
        expect('LODGroupEditorUtility' in proxy).toBe(true);
        expect(system.resolve).not.toHaveBeenCalled();
        expect(system.get).not.toHaveBeenCalled();
    });

    it('does not pass an asynchronous resolver result to System.get', () => {
        const system = {
            resolve: jest.fn(() => Promise.resolve('resolved-module')),
            get: jest.fn((id) => id === 'named-module' ? { value: 42 } : undefined),
        };

        expect(getDeferredModule(system, 'named-module')).toEqual({ value: 42 });
        expect(system.get).toHaveBeenCalledTimes(1);
        expect(system.get).toHaveBeenCalledWith('named-module');
    });

    it('generates the same resolver used by the browser bundle', () => {
        const source = createDeferredModuleSource();

        expect(source).toContain('const candidate = system.resolve(id)');
        expect(source).toContain(`globalThis[${JSON.stringify(DEFERRED_MODULE_CACHE_KEY)}]`);
        expect(source).toContain('_createDeferredModule(id, _getSystem, _getDeferredModule, _getModuleCache)');
    });
});
