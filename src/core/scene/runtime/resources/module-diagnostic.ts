import { fileURLToPath } from 'url';

export function describeChunkImport(record: {
    modules?: Record<string, { chunkId: string; imports?: Array<{
        value: string; resolved?: string; loc?: { start: { line: number; column: number } };
    }> }>;
}, chunkURL: string, specifier: string) {
    const match = /(?:^|\/)chunks\/([a-f0-9]{2})\/([a-f0-9]{40})\.js(?:[?#].*)?$/.exec(chunkURL);
    if (!match || match[2].slice(0, 2) !== match[1] || !/^__unresolved_\d+$/.test(specifier)) return undefined;
    for (const [url, module] of Object.entries(record.modules || {})) {
        if (module.chunkId !== match[2]) continue;
        const dependency = module.imports?.find(item => item.resolved === specifier);
        if (!dependency) return undefined;
        let source = url;
        if (url.startsWith('file:')) {
            try { source = fileURLToPath(url); } catch { /* Keep URL on malformed records. */ }
        }
        return { source, import: dependency.value, line: dependency.loc?.start.line,
            column: dependency.loc ? dependency.loc.start.column + 1 : undefined };
    }
    return undefined;
}
