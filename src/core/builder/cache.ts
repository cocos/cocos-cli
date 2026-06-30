import { emptyDir, ensureDir, lstat, pathExists, readdir, remove } from 'fs-extra';
import { basename, extname, join, parse, resolve } from 'path';
import builderConfig from './share/builder-config';
import { GlobalPaths } from '../../global';

export type BuildCacheScope = 'project' | 'global' | 'all';

export interface ClearCacheResult {
    scope: BuildCacheScope;
    cleared: string[];
}

const BUILD_ASSET_CACHE_VERSION = '1.0.1';

function getProjectBuilderCacheRoot() {
    const projectTempDir = builderConfig.projectTempDir;
    return basename(projectTempDir) === 'builder' ? projectTempDir : join(projectTempDir, 'builder');
}

function getProjectAssetCacheRoot() {
    return join(builderConfig.projectTempDir, 'asset-db');
}

function getLegacyProjectAssetCacheRoot() {
    return join(getProjectBuilderCacheRoot(), 'asset-db');
}

function getGlobalCacheRoots() {
    const engineBin = join(GlobalPaths.enginePath, 'bin');
    return [
        join(engineBin, 'temp'),
        join(engineBin, '.cache', 'editor-cache'),
        join(engineBin, '.cache', 'dev-cli'),
    ];
}

function uniquePaths(paths: string[]) {
    return Array.from(new Set(paths.map((path) => resolve(path))));
}

function assertSafeCachePath(path: string) {
    const resolved = resolve(path);
    const root = parse(resolved).root;
    if (!resolved || resolved === root) {
        throw new Error(`Unsafe cache path: ${path}`);
    }
    return resolved;
}

function containsPath(parent: string, child: string) {
    const resolvedParent = assertSafeCachePath(parent);
    const resolvedChild = resolve(child);
    return resolvedParent === resolvedChild || resolvedChild.startsWith(resolvedParent + '\\') || resolvedChild.startsWith(resolvedParent + '/');
}

async function clearProjectAssetBuildCache(assetCacheRoot: string, cleared: string[]) {
    const resolvedRoot = assertSafeCachePath(assetCacheRoot);
    if (!await pathExists(resolvedRoot)) {
        return;
    }

    async function walk(dir: string) {
        const entries = await readdir(dir);
        await Promise.all(entries.map(async (entry) => {
            const current = join(dir, entry);
            const stats = await lstat(current);
            if (!stats.isDirectory()) {
                return;
            }
            if (entry === `build${BUILD_ASSET_CACHE_VERSION}`) {
                await emptyDir(current);
                cleared.push(current);
                return;
            }
            await walk(current);
        }));
    }

    await walk(resolvedRoot);
}

async function clearProjectBuilderCache(builderCacheRoot: string, skipRoots: string[], cleared: string[]) {
    const resolvedRoot = assertSafeCachePath(builderCacheRoot);
    if (!await pathExists(resolvedRoot)) {
        await ensureDir(resolvedRoot);
        return;
    }

    const resolvedSkipRoots = uniquePaths(skipRoots);

    async function clearDir(dir: string) {
        const entries = await readdir(dir);
        await Promise.all(entries.map(async (entry) => {
            const current = join(dir, entry);
            const resolvedCurrent = resolve(current);
            if (resolvedSkipRoots.some((skipRoot) => containsPath(skipRoot, resolvedCurrent))) {
                return;
            }

            const stats = await lstat(current);
            if (stats.isDirectory()) {
                await clearDir(current);
                return;
            }
            if (extname(current) === '.log') {
                return;
            }
            await remove(current);
            cleared.push(current);
        }));
    }

    await clearDir(resolvedRoot);
}

async function clearProjectCache(): Promise<string[]> {
    const cleared: string[] = [];
    const assetCacheRoot = getProjectAssetCacheRoot();
    const legacyAssetCacheRoot = getLegacyProjectAssetCacheRoot();
    await clearProjectAssetBuildCache(assetCacheRoot, cleared);
    if (resolve(legacyAssetCacheRoot) !== resolve(assetCacheRoot)) {
        await clearProjectAssetBuildCache(legacyAssetCacheRoot, cleared);
    }
    await clearProjectBuilderCache(getProjectBuilderCacheRoot(), [assetCacheRoot, legacyAssetCacheRoot], cleared);
    return cleared;
}

async function clearGlobalCache(): Promise<string[]> {
    const cleared: string[] = [];
    for (const cacheRoot of uniquePaths(getGlobalCacheRoots())) {
        const resolvedRoot = assertSafeCachePath(cacheRoot);
        await emptyDir(resolvedRoot);
        cleared.push(resolvedRoot);
    }
    return cleared;
}

export async function clearCache(scope: BuildCacheScope): Promise<ClearCacheResult> {
    if (scope !== 'project' && scope !== 'global' && scope !== 'all') {
        throw new Error(`Invalid builder cache scope: ${scope}`);
    }

    const cleared = scope === 'project'
        ? await clearProjectCache()
        : scope === 'global'
            ? await clearGlobalCache()
            : [
                ...await clearProjectCache(),
                ...await clearGlobalCache(),
            ];

    return {
        scope,
        cleared,
    };
}
