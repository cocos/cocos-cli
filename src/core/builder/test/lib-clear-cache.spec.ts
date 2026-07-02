const clearCacheMock = jest.fn(async (scope: 'project' | 'global' | 'all') => ({
    scope,
    cleared: [],
}));

jest.mock('../index', () => ({
    clearCache: clearCacheMock,
}));

jest.mock('../manager/plugin', () => ({
    pluginManager: {},
}));

describe('lib/builder clearCache API', () => {
    beforeEach(() => {
        clearCacheMock.mockClear();
    });

    async function getBuilderLib() {
        return import('../../../lib/builder/builder');
    }

    it('delegates cache cleanup to core builder', async () => {
        const builderLib = await getBuilderLib();

        const result = await builderLib.clearCache('project');

        expect(clearCacheMock).toHaveBeenCalledTimes(1);
        expect(clearCacheMock).toHaveBeenCalledWith('project');
        expect(result).toEqual({
            scope: 'project',
            cleared: [],
        });
    });
});
