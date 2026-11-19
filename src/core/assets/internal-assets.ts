import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { cp, readFile, readdir, realpath, stat, writeFile } from 'fs/promises';
import { join, relative, sep } from 'path';

/**
 * Identifies the selected SDK and its actual built-in sources, including uncommitted edits.
 * @param enginePath Selected Engine SDK root.
 * @returns A relocatable fingerprint for the snapshot's engine inputs.
 */
export async function internalAssetFingerprint(enginePath: string): Promise<string> {
    const hash = createHash('sha256');
    const pkg = JSON.parse(await readFile(join(enginePath, 'package.json'), 'utf8'));
    const sdkFile = join(enginePath, 'engine-sdk.json');
    const sdk = existsSync(sdkFile) ? JSON.parse(await readFile(sdkFile, 'utf8')) : undefined;
    hash.update(JSON.stringify([pkg.version, sdk?.revision]));
    const root = join(enginePath, 'editor', 'assets');
    const files: string[] = [];
    const collectFiles = async (directory: string, ancestors: Set<string>): Promise<void> => {
        const actual = await realpath(directory);
        if (ancestors.has(actual)) throw new Error(`Circular internal asset directory: ${directory}`);
        const next = new Set(ancestors).add(actual);
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const file = join(directory, entry.name);
            const info = entry.isSymbolicLink() ? await stat(file) : entry;
            if (info.isDirectory()) await collectFiles(file, next);
            else if (info.isFile()) files.push(file);
        }
    };
    await collectFiles(root, new Set());
    files.push(join(enginePath, 'cc.config.json'));
    files.sort();
    for (const file of files) {
        const content = await readFile(file);
        hash.update(JSON.stringify([relative(enginePath, file).split(sep).join('/'), content.length]));
        hash.update(content);
    }
    return hash.digest('hex');
}

/**
 * Reuses only a matching snapshot; other SDKs import a project-local copy of their sources.
 * @param enginePath Selected Engine SDK root.
 * @param libraryRoot Project library root for SDK-specific imports.
 * @param snapshotRoot CLI's packaged snapshot directory.
 * @returns The source and library paths for the selected SDK.
 */
export async function resolveInternalAssetPaths(enginePath: string, libraryRoot: string, snapshotRoot: string) {
    const fingerprint = await internalAssetFingerprint(enginePath);
    const target = join(enginePath, 'editor', 'assets');
    const manifestFile = join(snapshotRoot, 'engine.json');
    const manifest = existsSync(manifestFile) ? JSON.parse(await readFile(manifestFile, 'utf8')) : undefined;
    if (manifest?.version === 1 && manifest.fingerprint === fingerprint) {
        return { target, library: snapshotRoot };
    }
    const cache = join(libraryRoot, 'internal', fingerprint);
    const source = join(cache, 'source');
    console.info('[AssetDB] No matching internal snapshot; importing the selected Engine SDK.');
    // Importers update .meta files, so keep the Engine SDK itself untouched.
    const ready = join(cache, 'source-ready');
    if (!existsSync(ready)) {
        await cp(target, source, { recursive: true, dereference: true });
        await writeFile(ready, '');
    }
    return { target: source, library: join(cache, 'library') };
}
