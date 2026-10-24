const mockBuildUnit = jest.fn();
const mockCreateBuildUnit = jest.fn();
const mockStageUnit = jest.fn();
const mockStageFactory = jest.fn();

jest.mock('../index', () => ({
    buildUnit: mockBuildUnit,
    createBuildUnitTask: mockCreateBuildUnit,
    executeBuildStageUnit: mockStageUnit,
    createBuildStageFromArtifact: mockStageFactory,
}));
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
        expect(mockStageFactory).toHaveBeenCalledWith('stage', 'make', { platform: 'web-desktop', dest: '/build' });
    });
});

export {};
