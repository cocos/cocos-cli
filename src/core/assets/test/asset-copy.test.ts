import { copy as fsCopy, ensureDir, existsSync, mkdtemp, outputFile, outputJson, readFile, readJson, remove } from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import type { IAssetFileSystemProvider } from '../@types/public';
import { copyAssetSource } from '../manager/asset-copy';
import { resetFileSystemProvider, setFileSystemProvider } from '../manager/filesystem';

const CUBE_META = join(__dirname, '../../../../packages/engine/editor/assets/default_skybox/default_skybox.png.meta');
const SPRITE_FRAME_META = join(__dirname, '../../../../tests/fixtures/projects/asset-operation/assets/default_btn_normal.png.meta');

describe('copyAssetSource', () => {
    let tempRoot: string;
    let copy: jest.Mock;
    let writeFile: jest.Mock;
    let providerReadFile: jest.Mock;
    let deleteFile: jest.Mock;

    beforeEach(async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'cocos-cli-copy-asset-'));
        copy = jest.fn(async (source: string, target: string, options?: { overwrite?: boolean }) => {
            await fsCopy(source, target, options?.overwrite === undefined ? undefined : { overwrite: options.overwrite });
        });
        writeFile = jest.fn(async (path: string, content: Buffer | string | Uint8Array) => {
            await ensureDir(join(path, '..'));
            await outputFile(path, content as any);
        });
        providerReadFile = jest.fn(async (path: string, encoding?: BufferEncoding) => {
            return encoding ? await readFile(path, encoding) : await readFile(path);
        });
        deleteFile = jest.fn(async (path: string) => {
            await remove(path);
        });
        setFileSystemProvider({
            readFile: providerReadFile,
            writeFile,
            copy,
            delete: deleteFile,
        } as IAssetFileSystemProvider);
    });

    afterEach(async () => {
        resetFileSystemProvider();
        await remove(tempRoot);
    });

    async function prepareImage(metaFixture: string) {
        const source = join(tempRoot, 'source.png');
        const target = join(tempRoot, 'target.png');
        await outputFile(source, 'image');
        await fsCopy(metaFixture, `${source}.meta`);
        return { source, target };
    }

    it('preserves texture cube metadata while rebuilding parent and nested subMeta UUIDs', async () => {
        const { source, target } = await prepareImage(CUBE_META);
        const sourceMeta = await readJson(`${source}.meta`);
        const externalUuid = '11111111-2222-4333-8444-555555555555';
        sourceMeta.userData.externalUuid = externalUuid;
        sourceMeta.userData.partialUuid = `${sourceMeta.uuid}-suffix`;
        await outputJson(`${source}.meta`, sourceMeta, { spaces: 2 });

        const transaction = await copyAssetSource(source, target, { overwrite: true });
        await transaction.finalize();

        const targetMeta = await readJson(`${target}.meta`);
        const cubeId = Object.keys(sourceMeta.subMetas)[0];
        const sourceCube = sourceMeta.subMetas[cubeId];
        const targetCube = targetMeta.subMetas[cubeId];

        expect(targetMeta.userData.type).toBe('texture cube');
        expect(targetMeta.uuid).not.toBe(sourceMeta.uuid);
        expect(targetCube.uuid).toBe(`${targetMeta.uuid}@${cubeId}`);
        expect(targetCube.userData.imageDatabaseUri).toBe(targetMeta.uuid);

        for (const [faceId, sourceFace] of Object.entries<any>(sourceCube.subMetas)) {
            const targetFace = targetCube.subMetas[faceId];
            expect(targetFace.uuid).toBe(`${targetCube.uuid}@${faceId}`);
            expect(targetFace.uuid).not.toBe(sourceFace.uuid);
        }

        expect(targetMeta.userData.externalUuid).toBe(externalUuid);
        expect(targetMeta.userData.partialUuid).toBe(`${sourceMeta.uuid}-suffix`);
        expect(copy).toHaveBeenCalledWith(
            source,
            expect.stringContaining('.target.png.copy-asset-'),
            { overwrite: false },
        );
        expect(writeFile).toHaveBeenCalledWith(
            expect.stringContaining('.target.png.copy-asset-'),
            expect.any(String),
            undefined,
        );
    });

    it('preserves sprite-frame type and rewrites redirect and image references to the copy', async () => {
        const { source, target } = await prepareImage(SPRITE_FRAME_META);
        const sourceMeta = await readJson(`${source}.meta`);

        const transaction = await copyAssetSource(source, target);
        await transaction.finalize();

        const targetMeta = await readJson(`${target}.meta`);
        const textureId = '6c48a';
        const spriteFrameId = 'f9941';
        expect(targetMeta.userData.type).toBe('sprite-frame');
        expect(targetMeta.uuid).not.toBe(sourceMeta.uuid);
        expect(targetMeta.subMetas[textureId].userData.imageUuidOrDatabaseUri).toBe(targetMeta.uuid);
        expect(targetMeta.subMetas[spriteFrameId].userData.imageUuidOrDatabaseUri).toBe(`${targetMeta.uuid}@${textureId}`);
        expect(targetMeta.userData.redirect).toBe(`${targetMeta.uuid}@${textureId}`);
    });

    it('rewrites references between assets when copying a directory', async () => {
        const source = join(tempRoot, 'source');
        const target = join(tempRoot, 'target');
        const directoryUuid = '00000000-0000-4000-8000-000000000001';
        const imageUuid = '00000000-0000-4000-8000-000000000002';
        const materialUuid = '00000000-0000-4000-8000-000000000003';
        await ensureDir(source);
        await outputFile(join(source, 'image.png'), 'image');
        await outputJson(join(source, 'material.mtl'), {
            effectAsset: { __uuid__: imageUuid },
        });
        await outputJson(`${source}.meta`, createMeta(directoryUuid));
        await outputJson(join(source, 'image.png.meta'), createMeta(imageUuid));
        await outputJson(join(source, 'material.mtl.meta'), createMeta(materialUuid, { image: imageUuid }));

        const transaction = await copyAssetSource(source, target);
        await transaction.finalize();

        const targetDirectoryMeta = await readJson(`${target}.meta`);
        const targetImageMeta = await readJson(join(target, 'image.png.meta'));
        const targetMaterialMeta = await readJson(join(target, 'material.mtl.meta'));
        const targetMaterial = await readJson(join(target, 'material.mtl'));
        expect(targetDirectoryMeta.uuid).not.toBe(directoryUuid);
        expect(targetImageMeta.uuid).not.toBe(imageUuid);
        expect(targetMaterialMeta.uuid).not.toBe(materialUuid);
        expect(targetMaterialMeta.userData.image).toBe(targetImageMeta.uuid);
        expect(targetMaterial.effectAsset.__uuid__).toBe(targetImageMeta.uuid);
    });

    it('replaces an overwritten directory instead of retaining target-only assets', async () => {
        const source = join(tempRoot, 'source');
        const target = join(tempRoot, 'target');
        await ensureDir(source);
        await ensureDir(target);
        await outputFile(join(source, 'source-only.txt'), 'source');
        await outputJson(`${source}.meta`, createMeta('00000000-0000-4000-8000-000000000011'));
        await outputJson(join(source, 'source-only.txt.meta'), createMeta('00000000-0000-4000-8000-000000000012'));
        await outputFile(join(target, 'target-only.txt'), 'stale');
        await outputJson(`${target}.meta`, createMeta('00000000-0000-4000-8000-000000000013'));
        await outputJson(join(target, 'target-only.txt.meta'), createMeta('00000000-0000-4000-8000-000000000014'));

        const transaction = await copyAssetSource(source, target, { overwrite: true });
        await transaction.finalize();

        expect(existsSync(join(target, 'source-only.txt'))).toBe(true);
        expect(existsSync(join(target, 'target-only.txt'))).toBe(false);
        expect(existsSync(join(target, 'target-only.txt.meta'))).toBe(false);
    });

    it('restores the previous target when a completed copy is rolled back', async () => {
        const source = join(tempRoot, 'source.txt');
        const target = join(tempRoot, 'target.txt');
        const oldTargetUuid = '00000000-0000-4000-8000-000000000021';
        await outputFile(source, 'source-content');
        await outputJson(`${source}.meta`, createMeta('00000000-0000-4000-8000-000000000022'));
        await outputFile(target, 'target-content');
        await outputJson(`${target}.meta`, createMeta(oldTargetUuid));

        const transaction = await copyAssetSource(source, target, { overwrite: true });
        expect(await readFile(target, 'utf8')).toBe('source-content');

        await transaction.rollback();

        expect(await readFile(target, 'utf8')).toBe('target-content');
        expect((await readJson(`${target}.meta`)).uuid).toBe(oldTargetUuid);
    });

    it('does not mutate an existing target when staging metadata fails', async () => {
        const source = join(tempRoot, 'source.txt');
        const target = join(tempRoot, 'target.txt');
        const oldTargetUuid = '00000000-0000-4000-8000-000000000031';
        await outputFile(source, 'source-content');
        await outputJson(`${source}.meta`, createMeta('00000000-0000-4000-8000-000000000032'));
        await outputFile(target, 'target-content');
        await outputJson(`${target}.meta`, createMeta(oldTargetUuid));
        writeFile.mockRejectedValueOnce(new Error('disk full'));

        await expect(copyAssetSource(source, target, { overwrite: true })).rejects.toThrow('disk full');

        expect(await readFile(target, 'utf8')).toBe('target-content');
        expect((await readJson(`${target}.meta`)).uuid).toBe(oldTargetUuid);
    });

    it('does not decode binary instantiation assets as JSON while copying', async () => {
        const source = join(tempRoot, 'source.mesh');
        const target = join(tempRoot, 'target.mesh');
        await outputFile(source, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]));
        await outputJson(`${source}.meta`, createMeta('00000000-0000-4000-8000-000000000041'));

        const transaction = await copyAssetSource(source, target);
        await transaction.finalize();

        expect(providerReadFile).not.toHaveBeenCalledWith(source, 'utf8');
        expect(await readFile(target)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]));
    });

    it('reports backup cleanup failure instead of silently completing', async () => {
        const source = join(tempRoot, 'source.txt');
        const target = join(tempRoot, 'target.txt');
        await outputFile(source, 'source-content');
        await outputJson(`${source}.meta`, createMeta('00000000-0000-4000-8000-000000000051'));
        await outputFile(target, 'target-content');
        await outputJson(`${target}.meta`, createMeta('00000000-0000-4000-8000-000000000052'));

        const transaction = await copyAssetSource(source, target, { overwrite: true });
        deleteFile.mockRejectedValueOnce(new Error('cleanup denied'));

        await expect(transaction.finalize()).rejects.toThrow('cleanup denied');
        expect(await readFile(target, 'utf8')).toBe('source-content');
    });
});

function createMeta(uuid: string, userData: Record<string, unknown> = {}) {
    return {
        ver: '1.0.0',
        importer: 'unknown',
        imported: true,
        uuid,
        files: [],
        subMetas: {},
        userData,
    };
}
