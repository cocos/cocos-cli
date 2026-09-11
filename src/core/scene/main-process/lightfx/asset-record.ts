import { randomUUID } from 'crypto';
import { ensureDir, readFile, rename, outputFile, remove, stat } from 'fs-extra';
import { dirname, join } from 'path';
import Utils from '../../../base/utils';

/** Exact generated-asset membership, not an asset/pixel backup or project-wide collector. */
export class LightmapAssetRecord {
    private readonly file: string;

    constructor(projectRoot: string, sceneUuid: string) {
        const uuid = Utils.UUID.decompressUUID(sceneUuid).split('@', 1)[0];
        if (!Utils.UUID.isUUID(uuid)) throw new Error('Invalid Lightmap scene UUID.');
        this.file = join(projectRoot, 'settings', 'lightfx-assets', `${uuid}.json`);
    }

    async read(): Promise<string[]> {
        let text: string;
        try {
            if ((await stat(this.file)).size > 512 * 1024) throw new Error('Lightmap generated-asset record is too large.');
            text = await readFile(this.file, 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
            throw error;
        }
        const record = JSON.parse(text) as { version?: number; textures?: unknown };
        if (record?.version !== 1 || !Array.isArray(record.textures) || record.textures.length > 10_000
            || record.textures.some(uuid => typeof uuid !== 'string' || !Utils.UUID.isUUID(uuid))) {
            throw new Error('Invalid Lightmap generated-asset record.');
        }
        return [...new Set(record.textures as string[])];
    }

    async add(uuids: readonly string[]): Promise<void> {
        const roots = uuids.map(uuid => Utils.UUID.decompressUUID(uuid).split('@', 1)[0]);
        if (roots.some(uuid => !Utils.UUID.isUUID(uuid))) throw new Error('Invalid generated Lightmap texture UUID.');
        const textures = [...new Set([...(await this.read()), ...roots])];
        if (textures.length > 10_000) throw new Error('Too many recorded Lightmap assets; clear unused bake results first.');
        await this.write(textures);
    }

    async forget(uuids: readonly string[]): Promise<void> {
        const deleted = new Set(uuids);
        const previous = await this.read();
        const textures = previous.filter(uuid => !deleted.has(uuid));
        if (textures.length !== previous.length) await this.write(textures);
    }

    private async write(textures: string[]): Promise<void> {
        await ensureDir(dirname(this.file));
        const temporary = `${this.file}.${randomUUID()}.tmp`;
        try {
            await outputFile(temporary, JSON.stringify({ version: 1, textures }));
            await rename(temporary, this.file);
        } finally {
            await remove(temporary);
        }
    }
}
