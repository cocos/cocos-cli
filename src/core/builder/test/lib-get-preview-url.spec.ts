const getPreviewUrlMock = jest.fn(async (dest: string, platform?: string) => {
    const outputName = dest.replace(/\\/g, '/').split('/').pop();
    return `http://localhost:9527/build/${platform}/${outputName}/index.html`;
});

jest.mock('../platforms/web-common/utils', () => ({
    getPreviewUrl: getPreviewUrlMock,
}));

jest.mock('../manager/plugin', () => ({
    pluginManager: {},
}));

describe('lib/builder getPreviewUrl API', () => {
    beforeEach(() => {
        getPreviewUrlMock.mockClear();
    });

    async function getBuilderLib() {
        return import('../../../lib/builder/builder');
    }

    it('delegates preview URL resolution to web common utilities', async () => {
        const builderLib = await getBuilderLib();

        const result = await builderLib.getPreviewUrl('project://build/web-mobile', 'web-mobile');

        expect(getPreviewUrlMock).toHaveBeenCalledTimes(1);
        expect(getPreviewUrlMock).toHaveBeenCalledWith('project://build/web-mobile', 'web-mobile');
        expect(result).toBe('http://localhost:9527/build/web-mobile/web-mobile/index.html');
    });

    it('propagates preview URL resolution errors', async () => {
        getPreviewUrlMock.mockRejectedValueOnce(new Error('Build path not found'));
        const builderLib = await getBuilderLib();

        await expect(builderLib.getPreviewUrl('project://missing', 'web-mobile')).rejects.toThrow('Build path not found');
    });
});
