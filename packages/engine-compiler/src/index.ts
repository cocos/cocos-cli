import { EngineCompiler } from './core/compiler';

/**
 * 根据路径编译引擎
 * @param path
 */
export async function compileEngine(path: string) {
    const compiler = EngineCompiler.create(path);
    await compiler.clear();
    await compiler.compileEngine(path, true);
}
