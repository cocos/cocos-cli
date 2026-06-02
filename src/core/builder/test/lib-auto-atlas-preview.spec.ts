const previewPackResult = {
    atlasImagePaths: [
        'C:/project/temp/asset-db/assets/ab/abcdef0123456789/build1.0.1/texture-packerpreview/atlas.png',
    ],
    unpackedImages: [
        {
            imageUuid: 'image-not-packed',
            libraryPath: 'C:/project/library/imports/image-not-packed.png',
        },
    ],
    dirty: false,
    storeInfo: {
        pac: {
            uuid: 'abcdef0123456789',
            path: 'db://assets/atlas/auto-atlas.pac',
        },
        sprites: [
            {
                uuid: 'sprite-frame-1',
                imageUuid: 'image-1',
            },
        ],
        options: {
            mode: 'preview',
            maxWidth: 1024,
            maxHeight: 1024,
        },
    },
    atlases: [
        {
            imagePath: 'C:/project/temp/asset-db/assets/ab/abcdef0123456789/build1.0.1/texture-packerpreview/atlas.png',
            imageUuid: 'atlas-image-uuid',
            textureUuid: 'atlas-image-uuid@texture',
            name: 'auto-atlas-0',
            width: 512,
            height: 256,
        },
    ],
};

const packAutoAtlasMock = jest.fn(async () => previewPackResult);
const queryAutoAtlasFileCacheMock = jest.fn(async () => previewPackResult);

jest.mock('../worker/builder/asset-handler/texture-packer', () => ({
    packAutoAtlas: packAutoAtlasMock,
    queryAutoAtlasFileCache: queryAutoAtlasFileCacheMock,
}));

jest.mock('../manager/plugin', () => ({
    pluginManager: {},
}));

describe('lib/builder auto atlas preview APIs', () => {
    beforeEach(() => {
        packAutoAtlasMock.mockClear();
        queryAutoAtlasFileCacheMock.mockClear();
    });

    it('exposes packAutoAtlas through the Builder lib namespace', async () => {
        const builderLib = await import('../../../lib/builder/builder');
        const result = await builderLib.packAutoAtlas('abcdef0123456789', {
            maxWidth: 1024,
            maxHeight: 1024,
        });

        expect(packAutoAtlasMock).toHaveBeenCalledWith('abcdef0123456789', {
            maxWidth: 1024,
            maxHeight: 1024,
        });
        expect(result).toMatchSnapshot();
    });

    it('exposes queryAutoAtlasFileCache through the Builder lib namespace', async () => {
        const builderLib = await import('../../../lib/builder/builder');
        const result = await builderLib.queryAutoAtlasFileCache('abcdef0123456789');

        expect(queryAutoAtlasFileCacheMock).toHaveBeenCalledWith('abcdef0123456789');
        expect(result).toMatchSnapshot();
    });
});
