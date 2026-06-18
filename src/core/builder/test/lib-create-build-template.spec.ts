const createBuildTemplateMock = jest.fn(async (_nameOrPlatform: string) => undefined);

jest.mock('../index', () => ({
    createBuildTemplate: createBuildTemplateMock,
}));

jest.mock('../manager/plugin', () => ({
    pluginManager: {},
}));

describe('lib/builder createBuildTemplate API', () => {
    beforeEach(() => {
        createBuildTemplateMock.mockClear();
    });

    async function getBuilderLib() {
        return import('../../../lib/builder/builder');
    }

    it('delegates build template creation to core builder', async () => {
        const builderLib = await getBuilderLib();

        await builderLib.createBuildTemplate('wechatgame');

        expect(createBuildTemplateMock).toHaveBeenCalledTimes(1);
        expect(createBuildTemplateMock).toHaveBeenCalledWith('wechatgame');
    });
});
