const mockExecuteBuildStageTask = jest.fn();

jest.mock('../index', () => ({
    build: jest.fn(),
    queryDefaultBuildConfigByPlatform: jest.fn(),
    executeBuildStageTask: mockExecuteBuildStageTask,
}));

describe('BuilderApi publish', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('executes publish stage and returns successful publish result', async () => {
        const { BuilderApi } = await import('../../../api/builder/builder');
        const publishResult = {
            code: 0,
            dest: 'project://build/openpaas',
            custom: {
                publish: {
                    success: true,
                    packageId: 'pkg-1',
                },
            },
        };
        mockExecuteBuildStageTask.mockResolvedValueOnce(publishResult);

        const result = await new BuilderApi().publish('openpaas', 'build/openpaas');

        expect(mockExecuteBuildStageTask).toHaveBeenCalledWith('openpaas', 'publish', {
            dest: 'build/openpaas',
            platform: 'openpaas',
        });
        expect(result).toEqual({
            code: 200,
            data: publishResult,
        });
    });

    it('returns failure when publish stage fails', async () => {
        const { BuilderApi } = await import('../../../api/builder/builder');
        mockExecuteBuildStageTask.mockResolvedValueOnce({
            code: 34,
            reason: 'publish failed',
        });

        const result = await new BuilderApi().publish('openpaas', 'build/openpaas');

        expect(result).toEqual({
            code: 500,
            data: {
                code: 34,
                reason: 'publish failed',
            },
            reason: 'publish failed',
        });
    });
});

export {};
