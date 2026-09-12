import { existsSync, statSync, type Stats } from 'fs';
import { isAbsolute, join, resolve } from 'path';

const DEV_BUILTIN_EXTENSIONS_ROOT_ENV = 'COCOS_CLI_DEV_BUILTIN_EXTENSIONS_ROOT';

export interface ExtensionRoot {
    kind: 'project' | 'builtin';
    path: string;
}

/**
 * 定位正式打包产物中的内置扩展根目录。
 * Dev 模式可通过 COCOS_CLI_DEV_BUILTIN_EXTENSIONS_ROOT 指定内置扩展根目录；
 * 正式打包产物中的内置扩展位于 <resources>/app/extensions，开发/解包环境无该目录时返回 undefined。
 */
export function resolveBuiltinExtensionsRoot(
    resourcesPath = (process as { resourcesPath?: string }).resourcesPath,
    env: NodeJS.ProcessEnv = process.env,
): string | undefined {
    if (Object.hasOwn(env, 'VSCODE_DEV') && Object.hasOwn(env, DEV_BUILTIN_EXTENSIONS_ROOT_ENV)) {
        const override = env[DEV_BUILTIN_EXTENSIONS_ROOT_ENV];
        if (typeof override !== 'string' || override.length === 0) {
            throw new Error(`${DEV_BUILTIN_EXTENSIONS_ROOT_ENV} must be a non-empty absolute directory path`);
        }
        if (!isAbsolute(override)) {
            throw new Error(`${DEV_BUILTIN_EXTENSIONS_ROOT_ENV} must be an absolute directory path: ${override}`);
        }

        let stats: Stats;
        try {
            stats = statSync(override);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            const message = code === 'ENOENT'
                ? `${DEV_BUILTIN_EXTENSIONS_ROOT_ENV} points to a missing directory: ${override}`
                : `${DEV_BUILTIN_EXTENSIONS_ROOT_ENV} could not stat the directory: ${override}`;
            throw new Error(message, { cause: error });
        }
        if (!stats.isDirectory()) {
            throw new Error(`${DEV_BUILTIN_EXTENSIONS_ROOT_ENV} must point to a directory: ${override}`);
        }
        return override;
    }

    if (!resourcesPath) {
        return undefined;
    }
    const builtinExtensionsRoot = join(resourcesPath, 'app', 'extensions');
    return existsSync(builtinExtensionsRoot) ? builtinExtensionsRoot : undefined;
}

/**
 * 返回扩展发现的稳定顺序：项目扩展优先，打包内置扩展随后。
 * 调用方负责决定每个根目录下的 package.json 是否有效。
 */
export function resolveExtensionRoots(projectPath: string, env: NodeJS.ProcessEnv = process.env): ExtensionRoot[] {
    const projectExtensionsRoot = join(projectPath, 'extensions');
    const roots: ExtensionRoot[] = [{ kind: 'project', path: projectExtensionsRoot }];
    const builtinExtensionsRoot = resolveBuiltinExtensionsRoot(undefined, env);
    if (builtinExtensionsRoot && resolve(builtinExtensionsRoot) !== resolve(projectExtensionsRoot)) {
        roots.push({ kind: 'builtin', path: builtinExtensionsRoot });
    }
    return roots;
}
