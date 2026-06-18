const mockExecuteBuildStageTask = jest.fn();

jest.mock('../index', () => ({
    build: jest.fn(),
    queryDefaultBuildConfigByPlatform: jest.fn(),
    executeBuildStageTask: mockExecuteBuildStageTask,
}));

describe('BuilderApi upload', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('executes upload stage and returns successful upload result', async () => {
        const { BuilderApi } = await import('../../../api/builder/builder');
        const uploadResult = {
            code: 0,
            dest: 'project://build/openpaas',
            custom: {
                upload: {
                    success: true,
                    packageId: 'pkg-1',
                },
            },
        };
        mockExecuteBuildStageTask.mockResolvedValueOnce(uploadResult);

        const result = await new BuilderApi().upload('openpaas', 'build/openpaas');

        expect(mockExecuteBuildStageTask).toHaveBeenCalledWith('openpaas', 'upload', {
            dest: 'build/openpaas',
            platform: 'openpaas',
            packages: undefined,
        });
        expect(result).toEqual({
            code: 200,
            data: uploadResult,
        });
    });

    it('passes accessToken to upload stage package options', async () => {
        const { BuilderApi } = await import('../../../api/builder/builder');
        mockExecuteBuildStageTask.mockResolvedValueOnce({
            code: 0,
            dest: 'project://build/openpaas',
            custom: {},
        });

        await new BuilderApi().upload('openpaas', 'build/openpaas', 'token-1');

        expect(mockExecuteBuildStageTask).toHaveBeenCalledWith('openpaas', 'upload', {
            dest: 'build/openpaas',
            platform: 'openpaas',
            packages: {
                openpaas: {
                    accessToken: 'token-1',
                },
            },
        });
    });

    it('returns failure when upload stage fails', async () => {
        const { BuilderApi } = await import('../../../api/builder/builder');
        mockExecuteBuildStageTask.mockResolvedValueOnce({
            code: 34,
            reason: 'upload failed',
        });

        const result = await new BuilderApi().upload('openpaas', 'build/openpaas');

        expect(result).toEqual({
            code: 500,
            data: {
                code: 34,
                reason: 'upload failed',
            },
            reason: 'upload failed',
        });
    });
});
