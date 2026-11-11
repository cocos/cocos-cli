import { fileURLToPath } from 'url';

/**
 * 脚本第一次编译时依赖还不存在，packer 会把这个脚本移出增量入口。
 * 这里记下「谁在等哪个相对路径」，等那个文件出现后再把脚本放回入口。
 */

export interface MissingModuleImport {
    specifier: string;
    parentHref: string;
}

const RELATIVE_SPECIFIER = /^\.{1,2}\//;

export function readMissingModuleImport(error: unknown): MissingModuleImport | null {
    const message = errorMessage(error);
    if (!message.includes('resolve_error_module_not_found')
        && !message.includes('not found for ')
        && !message.includes('为起点找不到模块')) {
        return null;
    }

    const jsonMatch = message.match(/resolve_error_module_not_found:\s*(\{[\s\S]*\})/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[1]) as { specifier?: unknown; parentURL?: unknown };
            if (typeof parsed.specifier === 'string' && typeof parsed.parentURL === 'string') {
                return { specifier: parsed.specifier, parentHref: parsed.parentURL };
            }
        } catch {
            // 翻译文案继续往下认
        }
    }

    const english = message.match(/Module "([^"]+)" not found for (\S+)/);
    if (english) {
        return { specifier: english[1], parentHref: english[2] };
    }

    const chinese = message.match(/以 (\S+) 为起点找不到模块 "([^"]+)"/);
    if (chinese) {
        return { specifier: chinese[2], parentHref: chinese[1] };
    }

    return null;
}

export function addedFileSatisfiesMissingImport(parentHref: string, specifier: string, addedHref: string): boolean {
    if (!RELATIVE_SPECIFIER.test(specifier)) {
        return false;
    }
    let addedPath: string;
    try {
        addedPath = fileURLToPath(new URL(addedHref));
    } catch {
        return false;
    }
    return candidatePaths(parentHref, specifier).some((candidate) => candidate === addedPath);
}

export function parentsRestoredByAddedFile(
    pending: ReadonlyMap<string, ReadonlySet<string>>,
    addedHref: string,
): string[] {
    const restored: string[] = [];
    for (const [parentHref, specifiers] of pending) {
        for (const specifier of specifiers) {
            if (addedFileSatisfiesMissingImport(parentHref, specifier, addedHref)) {
                restored.push(parentHref);
                break;
            }
        }
    }
    return restored;
}

function errorMessage(error: unknown): string {
    if (!error || typeof error !== 'object') {
        return '';
    }
    const parts: string[] = [];
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
        parts.push(message);
    }
    const cause = (error as { cause?: unknown }).cause;
    if (cause && cause !== error) {
        parts.push(errorMessage(cause));
    }
    return parts.join('\n');
}

function candidatePaths(parentHref: string, specifier: string): string[] {
    let parent: URL;
    try {
        parent = new URL(parentHref);
    } catch {
        return [];
    }
    let resolved: URL;
    try {
        resolved = new URL(specifier, parent);
    } catch {
        return [];
    }
    const paths = [fileURLToPath(resolved)];
    const baseName = resolved.pathname.split('/').pop() ?? '';
    if (!baseName || baseName.includes('.')) {
        return paths;
    }
    try {
        paths.push(fileURLToPath(new URL(`./${baseName}.ts`, resolved)));
        paths.push(fileURLToPath(new URL(`./${baseName}/index.ts`, resolved)));
    } catch {
        return paths;
    }
    return paths;
}
