import { existsSync, readdir, stat } from 'fs-extra';
import { basename, dirname, extname, join, relative } from 'path';
import type { AssetOperationOption } from '../@types/public';
import utils from '../../base/utils';
import { copyPath, deletePath, readPath, renamePath, writePath } from './filesystem';

type JsonRecord = Record<string, unknown>;

interface MetaCopyEntry {
    relativePath: string | null;
    meta: JsonRecord;
}

interface AssetContentCopyEntry {
    relativePath: string | null;
    content: string;
}

export interface AssetCopyTransaction {
    finalize(): Promise<void>;
    rollback(): Promise<void>;
}

const JSON_ASSET_EXTENSIONS = new Set([
    '.json',
    '.scene',
    '.fire',
    '.prefab',
    '.mtl',
    '.pmtl',
    '.anim',
    '.animgraph',
    '.animgraphvari',
    '.animask',
    '.texture',
    '.cubemap',
    '.rt',
    '.gltf',
    '.pac',
    '.labelatlas',
    '.rpp',
    '.stg',
    '.flow',
]);

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectMetaUuidMap(
    meta: JsonRecord,
    nextUuid: string,
    uuidMap: Map<string, string>,
): void {
    if (typeof meta.uuid !== 'string' || !meta.uuid) {
        throw new Error('Asset meta is missing a valid uuid');
    }

    uuidMap.set(meta.uuid, nextUuid);

    if (!isRecord(meta.subMetas)) {
        return;
    }

    for (const [key, value] of Object.entries(meta.subMetas)) {
        if (!isRecord(value)) {
            continue;
        }
        const subId = typeof value.id === 'string' && value.id ? value.id : key;
        collectMetaUuidMap(value, `${nextUuid}@${subId}`, uuidMap);
    }
}

function replaceMappedUuids(value: unknown, uuidMap: Map<string, string>): unknown {
    if (typeof value === 'string') {
        return uuidMap.get(value) ?? value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => replaceMappedUuids(item, uuidMap));
    }
    if (!isRecord(value)) {
        return value;
    }

    const result: JsonRecord = {};
    for (const [key, item] of Object.entries(value)) {
        const mappedKey = uuidMap.get(key) ?? key;
        result[mappedKey] = replaceMappedUuids(item, uuidMap);
    }
    return result;
}

function replaceMappedJsonStrings(content: string, uuidMap: Map<string, string>): string | null {
    try {
        JSON.parse(content);
    } catch {
        return null;
    }

    let rewritten = content;
    let changed = false;
    for (const [sourceUuid, targetUuid] of uuidMap) {
        const sourceJsonString = JSON.stringify(sourceUuid);
        if (!rewritten.includes(sourceJsonString)) {
            continue;
        }
        rewritten = rewritten.split(sourceJsonString).join(JSON.stringify(targetUuid));
        changed = true;
    }
    return changed ? rewritten : null;
}

async function collectNestedMetaPaths(directory: string, paths: string[]): Promise<void> {
    for (const name of await readdir(directory)) {
        const path = join(directory, name);
        const pathStat = await stat(path);
        if (pathStat.isDirectory()) {
            await collectNestedMetaPaths(path, paths);
        } else if (name.endsWith('.meta')) {
            paths.push(path);
        }
    }
}

async function collectMetaCopyEntries(source: string): Promise<{ entries: MetaCopyEntry[]; paths: string[] }> {
    const metaPaths: string[] = [];
    const sourceMeta = `${source}.meta`;
    if (!existsSync(sourceMeta)) {
        throw new Error(`Cannot copy asset because its meta file does not exist: ${sourceMeta}`);
    }
    metaPaths.push(sourceMeta);

    if ((await stat(source)).isDirectory()) {
        await collectNestedMetaPaths(source, metaPaths);
    }

    const entries = await Promise.all(metaPaths.map(async (metaPath) => {
        const content = await readPath(metaPath, 'utf8');
        let meta: unknown;
        try {
            meta = JSON.parse(typeof content === 'string' ? content : content.toString('utf8'));
        } catch (error) {
            throw new Error(`Cannot copy asset because meta file is invalid: ${metaPath}`, { cause: error });
        }
        if (!isRecord(meta)) {
            throw new Error(`Cannot copy asset because meta file is invalid: ${metaPath}`);
        }

        return {
            relativePath: metaPath === sourceMeta ? null : relative(source, metaPath),
            meta,
        };
    }));
    return { entries, paths: metaPaths };
}

async function collectAssetContentCopyEntries(
    source: string,
    metaPaths: string[],
    uuidMap: Map<string, string>,
): Promise<AssetContentCopyEntry[]> {
    const entries: AssetContentCopyEntry[] = [];
    for (const metaPath of metaPaths) {
        const assetPath = metaPath.slice(0, -'.meta'.length);
        if (!existsSync(assetPath) || (await stat(assetPath)).isDirectory()) {
            continue;
        }
        if (!JSON_ASSET_EXTENSIONS.has(extname(assetPath).toLowerCase())) {
            continue;
        }

        const content = await readPath(assetPath, 'utf8');
        const text = typeof content === 'string' ? content : content.toString('utf8');
        const rewritten = replaceMappedJsonStrings(text, uuidMap);
        if (rewritten === null) {
            continue;
        }
        entries.push({
            relativePath: assetPath === source ? null : relative(source, assetPath),
            content: rewritten,
        });
    }
    return entries;
}

function resolveMetaTarget(root: string, relativePath: string | null): string {
    return relativePath === null ? `${root}.meta` : join(root, relativePath);
}

function resolveAssetTarget(root: string, relativePath: string | null): string {
    return relativePath === null ? root : join(root, relativePath);
}

async function removePathIfExists(path: string): Promise<void> {
    if (existsSync(path)) {
        await deletePath(path, { useTrash: false });
    }
}

async function runCleanupSteps(steps: Array<() => Promise<void>>, message: string): Promise<void> {
    const errors: unknown[] = [];
    for (const step of steps) {
        try {
            await step();
        } catch (error) {
            errors.push(error);
        }
    }
    if (errors.length) {
        const details = errors.map((error) => error instanceof Error ? error.message : String(error)).join('; ');
        throw new Error(`${message}: ${details}`, { cause: errors[0] });
    }
}

/**
 * Copy an asset source into a hidden staging path, install it as one transaction,
 * and rebuild UUIDs in both metadata and supported serialized asset files.
 */
export async function copyAssetSource(
    source: string,
    target: string,
    options?: AssetOperationOption,
): Promise<AssetCopyTransaction> {
    const { entries: metaEntries, paths: metaPaths } = await collectMetaCopyEntries(source);
    const uuidMap = new Map<string, string>();

    for (const entry of metaEntries) {
        collectMetaUuidMap(entry.meta, utils.UUID.generate(false), uuidMap);
    }

    const rewrittenMetas = metaEntries.map((entry) => ({
        relativePath: entry.relativePath,
        content: `${JSON.stringify(replaceMappedUuids(entry.meta, uuidMap), null, 2)}\n`,
    }));
    const rewrittenAssets = await collectAssetContentCopyEntries(source, metaPaths, uuidMap);

    const transactionId = utils.UUID.generate(false);
    const targetDirectory = dirname(target);
    const targetName = basename(target);
    const staging = join(targetDirectory, `.${targetName}.copy-asset-${transactionId}`);
    const backup = join(targetDirectory, `.${targetName}.copy-backup-${transactionId}`);
    const targetMeta = `${target}.meta`;
    const stagingMeta = `${staging}.meta`;
    const backupMeta = `${backup}.meta`;
    const targetExists = existsSync(target);
    const targetMetaExists = existsSync(targetMeta);

    if ((targetExists || targetMetaExists) && !options?.overwrite) {
        throw new Error(`file ${target} already exists, please use overwrite option to overwrite it.`);
    }

    try {
        await copyPath(source, staging, { overwrite: false });
        for (const entry of rewrittenMetas) {
            await writePath(resolveMetaTarget(staging, entry.relativePath), entry.content);
        }
        for (const entry of rewrittenAssets) {
            await writePath(resolveAssetTarget(staging, entry.relativePath), entry.content);
        }
    } catch (error) {
        try {
            await runCleanupSteps([
                () => removePathIfExists(staging),
                () => removePathIfExists(stagingMeta),
            ], `Failed to clean staging copy ${staging} for ${target}`);
        } catch (cleanupError) {
            const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
            throw new Error(`Copy asset to ${target} failed and staging cleanup also failed: ${cleanupMessage}`, { cause: error });
        }
        throw error;
    }

    let backupMoved = false;
    let backupMetaMoved = false;
    let targetInstalled = false;
    let targetMetaInstalled = false;

    const restoreFailedCommit = async (): Promise<void> => {
        await runCleanupSteps([
            async () => {
                if (targetInstalled) {
                    await removePathIfExists(target);
                }
            },
            async () => {
                if (targetMetaInstalled) {
                    await removePathIfExists(targetMeta);
                }
            },
            async () => {
                if (backupMetaMoved && existsSync(backupMeta)) {
                    await renamePath(backupMeta, targetMeta, { overwrite: true });
                }
            },
            async () => {
                if (backupMoved && existsSync(backup)) {
                    await renamePath(backup, target, { overwrite: true });
                }
            },
            () => removePathIfExists(staging),
            () => removePathIfExists(stagingMeta),
        ], `Failed to roll back copy to ${target}`);
    };

    try {
        if (targetMetaExists) {
            await renamePath(targetMeta, backupMeta, { overwrite: false });
            backupMetaMoved = true;
        }
        if (targetExists) {
            await renamePath(target, backup, { overwrite: false });
            backupMoved = true;
        }
        await renamePath(stagingMeta, targetMeta, { overwrite: false });
        targetMetaInstalled = true;
        await renamePath(staging, target, { overwrite: false });
        targetInstalled = true;
    } catch (error) {
        try {
            await restoreFailedCommit();
        } catch (rollbackError) {
            const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
            throw new Error(`Copy asset to ${target} failed and rollback also failed: ${rollbackMessage}`, { cause: error });
        }
        throw error;
    }

    let active = true;
    return {
        async finalize(): Promise<void> {
            if (!active) {
                return;
            }
            await runCleanupSteps([
                () => removePathIfExists(backup),
                () => removePathIfExists(backupMeta),
            ], `Failed to clean copy backup ${backup} for ${target}`);
            active = false;
        },
        async rollback(): Promise<void> {
            if (!active) {
                return;
            }
            await runCleanupSteps([
                () => removePathIfExists(target),
                () => removePathIfExists(targetMeta),
                async () => {
                    if (backupMetaMoved && existsSync(backupMeta)) {
                        await renamePath(backupMeta, targetMeta, { overwrite: true });
                    }
                },
                async () => {
                    if (backupMoved && existsSync(backup)) {
                        await renamePath(backup, target, { overwrite: true });
                    }
                },
                () => removePathIfExists(staging),
                () => removePathIfExists(stagingMeta),
            ], `Failed to roll back copy to ${target}`);
            active = false;
        },
    };
}
