import { lstat, realpath, rmdir } from 'fs/promises';
import { ensureDir, pathExists } from 'fs-extra';
import { basename, dirname, isAbsolute, join, relative, sep } from 'path';
import { assetManager } from '../../../assets';
import Utils from '../../../base/utils';

export function isLightmapTextureUrl(url: string | undefined): boolean {
    return !!url?.startsWith('db://assets/') && /^LFX_(?:Mesh|Terrain)_\d{4,}\.png$/.test(url.split('/').at(-1) ?? '');
}

/** Only these native products belong to the Lightmap publication contract. */
export function lightmapAuxiliaryPath(filename: string): string | undefined {
    switch (filename) {
        case 'lfx.in': return 'tmp/lfx.in';
        case 'lfx.out': return 'output/lfx.out';
        case 'lfx.log': return 'lfx.log';
        default: return undefined;
    }
}

/** Reject symlinks (including dangling ones) before creating or moving managed outputs. */
async function assertAssetPath(assetRoot: string, path: string): Promise<void> {
    const local = relative(assetRoot, path);
    if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) {
        throw new Error('Lightmap publication must remain inside assets.');
    }
    let current = assetRoot;
    for (const part of local.split(sep)) {
        current = join(current, part);
        try {
            if ((await lstat(current)).isSymbolicLink()) throw new Error('Lightmap publication does not follow symbolic links.');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
    }
    // Validate the existing root as well; descendants above cannot redirect outside it.
    await realpath(assetRoot);
}

/** Removes only a verified empty temporary import directory, never its contents. */
export async function removeEmptyLightmapVersion(assetRoot: string, url: string): Promise<void> {
    const name = url.split('/').at(-1) ?? '';
    if (!url.startsWith('db://assets/') || !name.startsWith('bake-') || !Utils.UUID.isUUID(name.slice(5))) return;
    const path = join(assetRoot, url.slice('db://assets/'.length));
    await assertAssetPath(assetRoot, path);
    try {
        await rmdir(path);
    } catch (error) {
        if (['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) return;
        throw error;
    }
    // Let Asset DB reconcile its now-missing directory and metadata through the normal importer.
    await assetManager.refreshAsset(dirname(url));
}

/** Post-save relocation: UUIDs stay valid even if a later move fails. Never overwrite assets. */
export async function publishLightmapTextures(assetRoot: string, uuids: readonly string[], stagingUrl: string, rootUrl: string,
    auxiliaryUuids: readonly string[] = []): Promise<string[]> {
    if (!rootUrl.startsWith('db://assets') || (rootUrl !== 'db://assets' && !rootUrl.startsWith('db://assets/'))) {
        throw new Error('Invalid Lightmap publication directory.');
    }
    const outputUrl = `${rootUrl}/output`;
    const outputDir = join(assetRoot, outputUrl.slice('db://assets/'.length));
    await assertAssetPath(assetRoot, outputDir);
    const auxiliary = new Set(auxiliaryUuids);
    const files = [...uuids, ...auxiliaryUuids].map(uuid => {
        const info = assetManager.queryAssetInfo(uuid);
        if (!info?.file || !info.url?.startsWith('db://assets/')) throw new Error('Published Lightmap asset is missing.');
        const filename = basename(info.file);
        const path = auxiliary.has(uuid) ? lightmapAuxiliaryPath(filename) : isLightmapTextureUrl(info.url) ? `output/${filename}` : undefined;
        if (!path) throw new Error('Invalid Lightmap publication asset.');
        const url = `${rootUrl}/${path}`;
        if (info.url !== `${stagingUrl}/${filename}` && info.url !== url) throw new Error('Lightmap publication source no longer belongs to this bake.');
        return { uuid, source: info.url, sourceFile: info.file, url, file: join(assetRoot, url.slice('db://assets/'.length)) };
    });
    if (new Set(files.map(file => file.url)).size !== files.length) throw new Error('Duplicate Lightmap output names.');
    // Preflight every target before the first move. Partial moves still keep their original UUIDs.
    for (const file of files) {
        await assertAssetPath(assetRoot, file.sourceFile);
        await assertAssetPath(assetRoot, `${file.sourceFile}.meta`);
        await assertAssetPath(assetRoot, file.file);
        await assertAssetPath(assetRoot, `${file.file}.meta`);
        if (!(await pathExists(file.sourceFile))) throw new Error('Lightmap publication source file is missing.');
        if (file.source !== file.url && (await pathExists(file.file) || await pathExists(`${file.file}.meta`) || assetManager.queryUUID(file.url))) {
            throw new Error(`Lightmap output is occupied; refusing to overwrite: ${file.url}`);
        }
    }
    await ensureDir(outputDir);
    for (const file of files) await ensureDir(dirname(file.file));
    await assetManager.refreshAsset(rootUrl);
    for (const file of files) {
        if (file.source !== file.url) await assetManager.moveAsset(file.source, file.url, { overwrite: false, rename: false });
        const info = assetManager.queryAssetInfo(file.uuid);
        if (info?.url !== file.url || assetManager.queryUUID(file.url) !== file.uuid || !(await pathExists(file.file))
            || (file.source !== file.url && await pathExists(file.sourceFile))) {
            throw new Error(`Lightmap publication was not confirmed: ${file.url}`);
        }
    }
    await removeEmptyLightmapVersion(assetRoot, stagingUrl);
    return files.filter(file => !auxiliary.has(file.uuid)).map(file => file.url);
}
