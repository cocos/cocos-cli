function replaceTopLevelBlock(
    content: string,
    startMarker: string,
    transformer: (block: string) => string,
): string {
    const start = content.indexOf(startMarker);
    if (start === -1) {
        return content;
    }

    const nextExport = content.indexOf('\nexport ', start + startMarker.length);
    const end = nextExport === -1 ? content.length : nextExport + 1;
    const block = content.slice(start, end);
    const updatedBlock = transformer(block);

    if (updatedBlock === block) {
        return content;
    }

    return `${content.slice(0, start)}${updatedBlock}${content.slice(end)}`;
}

function ensureBuilderFilesystemImports(content: string): string {
    // Remove any legacy relative filesystem imports that may have been generated previously
    content = content.replace(/import\s*\{[^}]*\}\s*from\s*'\.\/filesystem';\s*/g, '');
    const imports = [
        "import { IAssetDeleteOptions, IAssetWriteFileOptions } from '@cocos/asset-db';",
    ];


    const missingImports = imports.filter((line) => !content.includes(line));
    if (missingImports.length === 0) {
        return content;
    }

    const pluginImport = "import type { PluginItem } from '@babel/core';";
    const streamImport = "import { EventEmitter as EventEmitter_2 } from 'stream';";

    let insertAt = content.indexOf(pluginImport);
    if (insertAt === -1) {
        const streamIndex = content.indexOf(streamImport);
        if (streamIndex === -1) {
            return content;
        }
        insertAt = streamIndex + streamImport.length + 1;
    }

    const prefix = content.slice(0, insertAt);
    const suffix = content.slice(insertAt);
    const insertion = `${missingImports.join('\n')}\n`;
    return `${prefix}${insertion}${suffix}`;
}

function fixBareNamespaceReferences(content: string): string {
    const bareRef = /(?<!\.)ConstantManager\./g;
    const insideNamespace = /^export declare namespace StatsQuery \{/m;
    if (!insideNamespace.test(content)) {
        return content;
    }

    const nsStart = content.search(insideNamespace);
    let braceDepth = 0;
    let nsEnd = content.length;
    for (let i = content.indexOf('{', nsStart); i < content.length; i++) {
        if (content[i] === '{') braceDepth++;
        if (content[i] === '}') braceDepth--;
        if (braceDepth === 0) {
            nsEnd = i + 1;
            break;
        }
    }

    const before = content.slice(0, nsStart);
    const nsBlock = content.slice(nsStart, nsEnd);
    const after = content.slice(nsEnd);

    const fixedBefore = before.replace(bareRef, 'StatsQuery.ConstantManager.');
    const fixedAfter = after.replace(bareRef, 'StatsQuery.ConstantManager.');

    return `${fixedBefore}${nsBlock}${fixedAfter}`;
}

export function normalizeDtsRollupContent(fileName: string, content: string): string {
    if (fileName !== 'builder.d.ts') {
        return content;
    }

    let normalized = content;

    normalized = replaceTopLevelBlock(normalized, 'export declare class VirtualAsset {', (block) => (
        block.replace(
            'existsInLibrary(extOrFile: string): boolean;',
            'existsInLibrary(extOrFile: string): Promise<boolean>;',
        )
    ));

    normalized = replaceTopLevelBlock(normalized, 'export declare class Asset extends VirtualAsset {', (block) => (
        block.replace('save(): boolean;', 'save(): Promise<boolean>;')
    ));

    normalized = replaceTopLevelBlock(normalized, 'export declare class MetaManager {', (block) => (
        block
            .replace(
                'write(path: any): false | undefined;',
                'write(path: string, options?: IAssetWriteFileOptions): Promise<false | undefined>;',
            )
            .replace(
                'remove(path: string): void;',
                'remove(path: string, options?: IAssetDeleteOptions): Promise<void>;',
            )
            .replace(
                'get(path: string): MetaInfo;',
                'get(path: string): Promise<MetaInfo>;',
            )
    ));

    if (normalized.includes('IAssetDeleteOptions') || normalized.includes('IAssetWriteFileOptions')) {
        normalized = ensureBuilderFilesystemImports(normalized);
    }

    normalized = fixBareNamespaceReferences(normalized);

    return normalized;
}
