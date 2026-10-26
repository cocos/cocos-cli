const mockBuild = jest.fn();

jest.mock('../index', () => ({
    build: mockBuild,
    createBuildTemplate: jest.fn(),
    queryDefaultBuildConfigByPlatform: jest.fn(),
    executeBuildStageTask: jest.fn(),
}));

describe('BuilderApi build', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('marks the build as initiated by the API module', async () => {
        const { BuilderApi } = await import('../../../api/builder/builder');
        const buildResult = {
            code: 0,
            dest: 'project://build/openpaas',
            custom: {},
        };
        const options = {
            outputName: 'openpaas',
        } as any;
        mockBuild.mockResolvedValueOnce(buildResult);

        const result = await new BuilderApi().build('openpaas', options);

        expect(mockBuild).toHaveBeenCalledWith('openpaas', {
            ...options,
            isApiBuild: true,
        });
        expect(options).not.toHaveProperty('isApiBuild');
        expect(result).toEqual({
            code: 200,
            data: buildResult,
        });
    });

    it('sets the API marker when build options are omitted', async () => {
        const { BuilderApi } = await import('../../../api/builder/builder');
        mockBuild.mockResolvedValueOnce({
            code: 0,
            dest: 'project://build/openpaas',
            custom: {},
        });

        await new BuilderApi().build('openpaas');

        expect(mockBuild).toHaveBeenCalledWith('openpaas', {
            isApiBuild: true,
        });
    });
});

export {};
