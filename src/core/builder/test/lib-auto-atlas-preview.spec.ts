const pacUuid = '8c34f9fe-8120-4901-8201-5dedb4439693';
const nestedPacUuid = 'c1d5901d-542d-4316-ad85-066d763d473b';
const atlasImagePath = `project/temp/asset-db/assets/${pacUuid.slice(0, 2)}/${pacUuid}/build1.0.1/texture-packerpreview/atlas.png`;

function makePreviewPackResult(options: {
    uuid?: string;
    dirty: boolean;
    maxWidth?: number;
    maxHeight?: number;
    unpackedImages?: number;
    spriteNames?: string[];
}) {
    const uuid = options.uuid || pacUuid;
    const spriteNames = options.spriteNames || ['sheep_0', 'sheep_1', 'sheep_2', 'sheep_3'];
    const imagePath = `project/temp/asset-db/assets/${uuid.slice(0, 2)}/${uuid}/build1.0.1/texture-packerpreview/atlas.png`;

    return {
        atlasImagePaths: [imagePath],
        unpackedImages: Array.from({ length: options.unpackedImages ?? 1 }, (_, index) => ({
            imageUuid: `image-not-packed-${index}`,
            libraryPath: `project/library/imports/image-not-packed-${index}.png`,
        })),
        dirty: options.dirty,
        storeInfo: {
            pac: {
                uuid,
                path: uuid === nestedPacUuid ? 'db://assets/sheep-subPackage/sheep.pac' : 'db://assets/atlas/auto-atlas.pac',
            },
            sprites: spriteNames.map((name, index) => ({
                uuid: `${name}-sprite-frame-${index}`,
                name,
                imageUuid: `${name}-image-${index}`,
            })),
            options: {
                mode: 'preview',
                maxWidth: options.maxWidth ?? 1024,
                maxHeight: options.maxHeight ?? 1024,
            },
        },
        atlases: [
            {
                imagePath,
                imageUuid: 'atlas-image-uuid',
                textureUuid: 'atlas-image-uuid@texture',
                name: 'auto-atlas-0',
                width: 512,
                height: 256,
            },
        ],
    };
}

const packAutoAtlasMock = jest.fn(async (uuid: string, option?: { maxWidth?: number; maxHeight?: number }) => {
    if (uuid === nestedPacUuid) {
        return makePreviewPackResult({
            uuid,
            dirty: true,
            spriteNames: ['sheep_0', 'sheep_1', 'sheep_2', 'sheep_3'],
        });
    }

    const cacheKey = `${uuid}:${option?.maxWidth ?? 1024}:${option?.maxHeight ?? 1024}`;
    const dirty = !previewCache.has(cacheKey);
    const unpackedImages = option?.maxWidth === 160 ? 2 : 1;
    const result = makePreviewPackResult({
        uuid,
        dirty,
        maxWidth: option?.maxWidth,
        maxHeight: option?.maxHeight,
        unpackedImages,
    });
    previewCache.set(cacheKey, makePreviewPackResult({
        uuid,
        dirty: false,
        maxWidth: option?.maxWidth,
        maxHeight: option?.maxHeight,
        unpackedImages,
    }));
    return result;
});

const queryAutoAtlasFileCacheMock = jest.fn(async (uuid: string) => {
    return previewCache.get(`${uuid}:1024:1024`) || null;
});

const previewCache = new Map<string, ReturnType<typeof makePreviewPackResult>>();

jest.mock('../worker/builder/asset-handler/texture-packer', () => ({
    packAutoAtlas: packAutoAtlasMock,
    queryAutoAtlasFileCache: queryAutoAtlasFileCacheMock,
}));

jest.mock('../manager/plugin', () => ({
    pluginManager: {},
}));

describe('lib/builder auto atlas preview APIs', () => {
    beforeEach(() => {
        previewCache.clear();
        packAutoAtlasMock.mockClear();
        queryAutoAtlasFileCacheMock.mockClear();
    });

    async function getBuilderLib() {
        return import('../../../lib/builder/builder');
    }

    it('returns null when querying preview cache before packing', async () => {
        const builderLib = await getBuilderLib();

        const result = await builderLib.queryAutoAtlasFileCache(pacUuid);

        expect(queryAutoAtlasFileCacheMock).toHaveBeenCalledWith(pacUuid);
        expect(result).toBeNull();
    });

    it('packs auto atlas preview and marks first preview as dirty', async () => {
        const builderLib = await getBuilderLib();

        const result = await builderLib.packAutoAtlas(pacUuid);

        expect(packAutoAtlasMock).toHaveBeenCalledWith(pacUuid, undefined);
        expect(result).toMatchObject({
            atlasImagePaths: [atlasImagePath],
            dirty: true,
        });
        expect(result?.unpackedImages).toHaveLength(1);
        expect(result).toEqual(makePreviewPackResult({
            uuid: pacUuid,
            dirty: true,
        }));
    });

    it('returns generated cache after packing preview', async () => {
        const builderLib = await getBuilderLib();

        await builderLib.packAutoAtlas(pacUuid);
        const result = await builderLib.queryAutoAtlasFileCache(pacUuid);

        expect(result).toMatchObject({
            atlasImagePaths: [atlasImagePath],
            dirty: false,
        });
        expect(result).toEqual(makePreviewPackResult({
            uuid: pacUuid,
            dirty: false,
        }));
    });

    it('marks repeated preview query as clean when cache exists', async () => {
        const builderLib = await getBuilderLib();

        await builderLib.packAutoAtlas(pacUuid);
        const result = await builderLib.packAutoAtlas(pacUuid);

        expect(result?.dirty).toBe(false);
    });

    it('keeps sprites from sibling folders and filters nested atlas sprites', async () => {
        const builderLib = await getBuilderLib();

        const result = await builderLib.packAutoAtlas(nestedPacUuid);

        expect(result?.storeInfo.sprites).toHaveLength(4);
        expect(result?.storeInfo.sprites.every((sprite) => sprite.name.startsWith('sheep_'))).toBe(true);
        expect(result).toEqual(makePreviewPackResult({
            uuid: nestedPacUuid,
            dirty: true,
            spriteNames: ['sheep_0', 'sheep_1', 'sheep_2', 'sheep_3'],
        }));
    });

    it('passes custom pack options and marks first custom preview as dirty', async () => {
        const builderLib = await getBuilderLib();

        const result = await builderLib.packAutoAtlas(pacUuid, {
            maxWidth: 160,
            maxHeight: 1024,
        });

        expect(packAutoAtlasMock).toHaveBeenCalledWith(pacUuid, {
            maxWidth: 160,
            maxHeight: 1024,
        });
        expect(result?.dirty).toBe(true);
        expect(result?.unpackedImages).toHaveLength(2);
        expect(result).toEqual(makePreviewPackResult({
            uuid: pacUuid,
            dirty: true,
            maxWidth: 160,
            maxHeight: 1024,
            unpackedImages: 2,
        }));
    });

    it('marks repeated custom preview query as clean', async () => {
        const builderLib = await getBuilderLib();
        const option = {
            maxWidth: 160,
            maxHeight: 1024,
        };

        await builderLib.packAutoAtlas(pacUuid, option);
        const result = await builderLib.packAutoAtlas(pacUuid, option);

        expect(result?.dirty).toBe(false);
    });
});
