import { getEngineBackendAdapter } from '../engine/adapter';
import { selectEnginePath } from '../engine/selection';
import { TestGlobalEnv } from '../../tests/global-env';

/** Real engine-test suites must use the same backend boundary as production. */
export async function preloadTestEngine(writablePath: string) {
    const selection = selectEnginePath(TestGlobalEnv.engineRoot);
    const adapter = getEngineBackendAdapter(selection);
    const runtime = adapter.runtime(selection);
    const { EngineLoader } = await import('cc/loader.js');
    for (const id of runtime.requiredModules) {
        jest.doMock(id, () => EngineLoader.getEngineModuleById(id), { virtual: true });
    }
    const { Engine } = await import('../engine');
    await Engine.importEditorExtensions();
    const { default: preload } = await import('cc/preload');
    await preload({
        engineRoot: runtime.engineRoot, engineDev: runtime.engineDev,
        webAdapterPath: runtime.webAdapter, engineAdapterPath: runtime.engineAdapter,
        editorMode: runtime.requiresEditorMode ?? false,
        requiredModules: runtime.requiredModules, writablePath,
        configureEngine: (engine, getModule) => adapter.configureRuntime?.(engine, getModule),
        validateEngine: engine => adapter.validateRuntime(engine, selection),
    });
    await Engine.initEditorExtensions();
    return await import('cc');
}
