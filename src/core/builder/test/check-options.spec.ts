const mockQueryAsset = jest.fn();
const mockQueryAssets = jest.fn();

jest.mock('../../assets/manager/asset', () => ({
    __esModule: true,
    default: { queryAsset: mockQueryAsset, queryAssets: mockQueryAssets },
}));
jest.mock('../../engine', () => ({ Engine: {} }));

import { checkStartScene } from '../share/common-options-validator';

describe('check-options', () => {
    beforeEach(() => {
        mockQueryAsset.mockReset();
        mockQueryAssets.mockReset().mockReturnValue([]);
        mockQueryAsset.mockImplementation((id: string) =>
            ['f895c111-fd50-4ed6-b07c-f514972cfbd1', 'db://assets/scene-2d.scene'].includes(id)
                ? { url: 'db://assets/scene-2d.scene' } : undefined);
    });
    
    describe('check-start-scene', () => {
        it('check-start-scene by uuid', () => {
            const startScene = 'f895c111-fd50-4ed6-b07c-f514972cfbd1';
            const result = checkStartScene(startScene);
            expect(result).toBe(true);
        });
        it('check-start-scene by url', async () => {
            const startScene = 'db://assets/scene-2d.scene';
            const result = checkStartScene(startScene);
            expect(result).toBe(true);
        });
        it('check-start-scene by invalid uuid', () => {
            const startScene = '123';
            const result = checkStartScene(startScene);
            expect(result).toBeInstanceOf(Error);
        });
        it('check-start-scene by invalid url', () => {
            const startScene = 'db://assets/scene-2d.scene1';
            const result = checkStartScene(startScene);
            expect(result).toBeInstanceOf(Error);
        });
        it('rejects a scene inside a bundle', () => {
            mockQueryAssets.mockReturnValue([{ url: 'db://assets' }]);
            expect(checkStartScene('db://assets/scene-2d.scene')).toBeInstanceOf(Error);
            expect(mockQueryAssets).toHaveBeenCalledWith({ isBundle: true });
        });
        it('does not treat a matching path prefix as a containing bundle', () => {
            mockQueryAssets.mockReturnValue([{ url: 'db://assets/scene' }]);
            expect(checkStartScene('db://assets/scene-2d.scene')).toBe(true);
        });
    });
});
