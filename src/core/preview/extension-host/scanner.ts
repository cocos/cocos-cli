import { join, isAbsolute, relative, resolve, sep } from 'path';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'fs';
import { resolveExtensionRoots } from '../../extension-roots';

/**
 * 一个项目扩展的预览相关贡献信息。
 */
export interface PreviewExtension {
    /** 扩展名（package.json name），即消息 IPC 的 domain，例如 'localization-editor' */
    name: string;
    /** 扩展根目录绝对路径 */
    dir: string;
    /** 预览主进程入口绝对路径（contributions.preview.main，或缺失时的 package.json main） */
    mainPath?: string;
    /** 扩展 server 贡献入口绝对路径（contributions.server），导出 get/post 路由 */
    serverPath?: string;
    /** contributions.messages：消息名 -> { methods: 主进程导出方法名[] } */
    messages: Record<string, { methods?: string[] }>;
    /** 原始 package.json，供后续按需读取其它贡献 */
    manifest: any;
}

function resolveContribPath(ownerRoot: string, p: unknown): string | undefined {
    if (typeof p !== 'string' || !p) {
        return undefined;
    }
    // URI、Unix/Windows 绝对路径和 UNC 路径都不能脱离扩展 owner root。
    if (/^[a-z][a-z\d+.-]*:/i.test(p) || /^[/\\]{2}/.test(p) || /^[a-z]:[/\\]/i.test(p) || isAbsolute(p)) {
        return undefined;
    }
    const owner = resolve(ownerRoot);
    const candidate = resolve(owner, p);
    const candidateRelative = relative(owner, candidate);
    if (!candidateRelative || candidateRelative === '..' || candidateRelative.startsWith(`..${sep}`) || isAbsolute(candidateRelative)) {
        return undefined;
    }
    if (!existsSync(candidate)) {
        return undefined;
    }
    try {
        const ownerReal = realpathSync(owner);
        const candidateReal = realpathSync(candidate);
        const realRelative = relative(ownerReal, candidateReal);
        if (!realRelative || realRelative === '..' || realRelative.startsWith(`..${sep}`) || isAbsolute(realRelative)) {
            return undefined;
        }
    } catch {
        return undefined;
    }
    return candidate;
}

function readMessages(value: unknown): Record<string, { methods?: string[] }> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    const messages: Record<string, { methods?: string[] }> = {};
    for (const [message, declaration] of Object.entries(value)) {
        if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
            continue;
        }
        const methods = Array.isArray((declaration as { methods?: unknown }).methods)
            ? (declaration as { methods: unknown[] }).methods.filter((method): method is string => typeof method === 'string')
            : undefined;
        messages[message] = methods ? { methods } : {};
    }
    return messages;
}

/**
 * 扫描项目扩展与打包内置扩展中声明了 server / messages 贡献的扩展。
 * 只读 package.json，不加载代码；roots 已按 project → builtin 排序，项目扩展优先。
 */
export function scanPreviewExtensions(projectPath: string): PreviewExtension[] {
    const result: PreviewExtension[] = [];
    const seenNames = new Set<string>();
    for (const root of resolveExtensionRoots(projectPath)) {
        if (!existsSync(root.path)) {
            continue;
        }
        let entries: import('fs').Dirent[];
        try {
            entries = readdirSync(root.path, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch {
            continue;
        }
        for (const entry of entries) {
            const dir = join(root.path, entry.name);
            const pkgPath = join(dir, 'package.json');
            if (!existsSync(pkgPath)) {
                continue;
            }
            let manifest: any;
            try {
                manifest = JSON.parse(readFileSync(pkgPath, 'utf8'));
            } catch {
                continue;
            }
            const contributions = manifest?.contributions;
            if (!contributions || typeof contributions !== 'object' || Array.isArray(contributions)) {
                continue;
            }
            const name = typeof manifest.name === 'string' && manifest.name ? manifest.name : entry.name;
            const messages = readMessages(contributions.messages);
            const hasServerContribution = typeof contributions.server === 'string' && contributions.server.length > 0;
            // preview.main-only 不是 Preview Host 的纳入条件。
            if (!hasServerContribution && Object.keys(messages).length === 0) {
                continue;
            }
            // 项目根先扫描；命中 identity 后即使后续显式 preview.main 无效也不能让 builtin 补位。
            if (seenNames.has(name)) {
                continue;
            }
            seenNames.add(name);

            const serverPath = resolveContribPath(dir, contributions.server);
            const preview = contributions.preview;
            const hasExplicitPreviewMain = !!preview
                && typeof preview === 'object'
                && !Array.isArray(preview)
                && Object.prototype.hasOwnProperty.call(preview, 'main');
            let mainPath: string | undefined;
            if (hasExplicitPreviewMain) {
                mainPath = resolveContribPath(dir, (preview as { main?: unknown }).main);
                if (!mainPath) {
                    console.warn(`[ExtensionHost] skip preview extension '${name}': invalid contributions.preview.main (no fallback to manifest.main)`);
                    continue;
                }
            } else {
                // 兼容旧扩展；manifest.main 仍是 VS Code Extension Host 入口，只有 preview.main 缺失时才沿用。
                mainPath = resolveContribPath(dir, manifest.main);
            }
            result.push({
                name,
                dir,
                mainPath,
                serverPath,
                messages,
                manifest,
            });
        }
    }
    return result;
}
