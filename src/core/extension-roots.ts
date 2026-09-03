import { existsSync } from 'fs';
import { join, resolve } from 'path';

export interface ExtensionRoot {
    kind: 'project' | 'builtin';
    path: string;
}

/**
 * 定位正式打包产物中的内置扩展根目录。
 * Cocos 进程为 Electron Utility Process，可通过 process.resourcesPath 定位 resources 目录；
 * 打包后的内置扩展位于 <resources>/app/extensions；开发/解包环境无该目录时返回 undefined。
 */
export function resolveBuiltinExtensionsRoot(resourcesPath = (process as { resourcesPath?: string }).resourcesPath): string | undefined {
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
export function resolveExtensionRoots(projectPath: string): ExtensionRoot[] {
    const projectExtensionsRoot = join(projectPath, 'extensions');
    const roots: ExtensionRoot[] = [{ kind: 'project', path: projectExtensionsRoot }];
    const builtinExtensionsRoot = resolveBuiltinExtensionsRoot();
    if (builtinExtensionsRoot && resolve(builtinExtensionsRoot) !== resolve(projectExtensionsRoot)) {
        roots.push({ kind: 'builtin', path: builtinExtensionsRoot });
    }
    return roots;
}
