const mockBuildUnit = jest.fn();
const mockCreateBuildUnit = jest.fn();
const mockStageUnit = jest.fn();
const mockStageFactory = jest.fn();

jest.mock('../index', () => ({
    build: mockBuildUnit,
    createBuildTask: mockCreateBuildUnit,
    executeBuildStageTask: mockStageUnit,
    createBuildStageTask: mockStageFactory,
}));
const mockLegacyStages = { make: jest.fn(), run: jest.fn(), upload: jest.fn(), publish: jest.fn() };
jest.mock('../../launcher', () => ({ __esModule: true, default: mockLegacyStages }));
jest.mock('../manager/plugin', () => ({ pluginManager: {} }));

describe('Builder library primitives', () => {
    beforeEach(() => jest.clearAllMocks());

    it('uses atomic operations rather than the command/MCP workflow adapters', async () => {
        const library = await import('../../../lib/builder/builder');
        const options = { platform: 'web-desktop', nextStages: ['make'] };
        const result = { code: 0, dest: '/build', custom: {} };
        mockBuildUnit.mockResolvedValue(result);
        mockCreateBuildUnit.mockResolvedValue({ id: 'unit' });
        mockStageUnit.mockResolvedValue(result);
        mockStageFactory.mockResolvedValue({ id: 'stage' });

        expect(await library.build('web-desktop', options)).toEqual(result);
        expect(await library.createBuildTask('web-desktop', options)).toEqual({ id: 'unit' });
        expect(await library.executeBuildStageTask('unit', 'make', { platform: 'web-desktop', dest: '/build' })).toEqual(result);
        expect(await library.createBuildStageTask('stage', 'make', { platform: 'web-desktop', dest: '/build' })).toEqual({ id: 'stage' });
        expect(mockBuildUnit).toHaveBeenCalledWith('web-desktop', options);
        expect(mockCreateBuildUnit).toHaveBeenCalledWith('web-desktop', options);
        expect(mockStageUnit).toHaveBeenCalledWith('unit', 'make', { platform: 'web-desktop', dest: '/build' }, undefined);
        expect(mockStageFactory).toHaveBeenCalledWith('stage', 'make', { platform: 'web-desktop', dest: '/build' }, undefined);
        expect(library).not.toHaveProperty('createBuildUnitTask');
        expect(library).not.toHaveProperty('buildWorkflow');
    });
    it.each(['make', 'run', 'upload', 'publish'] as const)('%s preserves the original Launcher behavior', async stage => {
        const library = await import('../../../lib/builder/builder');
        const result = { code: 34, reason: 'legacy stage result', custom: { stageResults: {} } };
        mockLegacyStages[stage].mockResolvedValue(result);
        expect(await library[stage]('openpaas', '/build')).toBe(result);
        expect(mockLegacyStages[stage]).toHaveBeenCalledWith('openpaas', '/build', ...(stage === 'upload' ? [undefined] : []));
        expect(mockStageUnit).not.toHaveBeenCalled();
    });

    it('preserves the legacy upload access token argument', async () => {
        const library = await import('../../../lib/builder/builder');
        await library.upload('openpaas', '/build', 'access-token');
        expect(mockLegacyStages.upload).toHaveBeenCalledWith('openpaas', '/build', 'access-token');
    });

    it('preserves Launcher rejection without retrying or converting it to a result', async () => {
        const library = await import('../../../lib/builder/builder');
        const error = new Error('legacy failure');
        mockLegacyStages.make.mockRejectedValueOnce(error);
        await expect(library.make('openpaas', '/build')).rejects.toBe(error);
        expect(mockLegacyStages.make).toHaveBeenCalledTimes(1);
    });
});

export {};
