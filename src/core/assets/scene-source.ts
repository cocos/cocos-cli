import { readPath } from './manager/filesystem';
import assetQuery from './manager/query';
import assetOperation from './manager/operation';

export async function querySceneSource(uuid: string): Promise<string> {
    const asset = assetQuery.queryAsset(uuid);
    if (!asset?.source || (asset.meta?.importer !== 'scene' && !/\.scene$/i.test(asset.source))) {
        throw new Error(`Scene source not found: ${uuid}`);
    }
    return String(await readPath(asset.source, 'utf8'));
}

/** Detect changes already on disk before saving; this is not a cross-process write lock. */
export async function saveSceneSource(uuid: string, expectedSource: string, content: string) {
    if (await querySceneSource(uuid) !== expectedSource) {
        throw new Error('Scene source changed on disk; refusing to overwrite it. Save As to a different scene or reopen the project before saving.');
    }
    const asset = await assetOperation.saveAsset(uuid, content);
    // Importing may normalize the scene name or UUID. Track the persisted source,
    // not the pre-import serialization, so a second save does not conflict with our own write.
    return { asset, source: await querySceneSource(uuid) };
}
