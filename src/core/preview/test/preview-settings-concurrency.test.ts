const mockAssetDBManager = { ready: true };
const mockAssetManager = {
    queryAssetInfo: jest.fn(() => undefined),
    queryAssetInfos: jest.fn(() => [{ uuid: 'scene-uuid' }]),
};
const mockGetPreviewSettings = jest.fn();

jest.mock('../../assets', () => ({
    assetDBManager: mockAssetDBManager,
    assetManager: mockAssetManager,
}));

jest.mock('../../builder', () => ({
    getPreviewSettings: mockGetPreviewSettings,
    queryDefaultBuildConfigByPlatform: jest.fn(async () => ({ includeModules: [] })),
}));

jest.mock('../../builder/share/common-options-validator', () => ({
    fillIncludeModulesFromProjectConfig: jest.fn(async () => undefined),
}));

import {
    getCachedPreviewSettings,
    getCachedSceneEditorSettings,
    invalidatePreviewSettings,
} from '../preview-settings';

const result = { settings: { engine: { builtinAssets: ['builtin'] }, rendering: {} } } as any;

function nextTurn(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

describe('preview settings generation concurrency', () => {
    beforeEach(() => {
        mockAssetDBManager.ready = true;
        mockAssetManager.queryAssetInfo.mockClear();
        mockAssetManager.queryAssetInfos.mockClear();
        mockGetPreviewSettings.mockReset();
        invalidatePreviewSettings();
    });

    it('coalesces requests for the same settings key', async () => {
        let resolveGeneration!: () => void;
        mockGetPreviewSettings.mockImplementation(async () => {
            await new Promise<void>((resolve) => {
                resolveGeneration = resolve;
            });
            return result;
        });

        const first = getCachedPreviewSettings();
        const second = getCachedPreviewSettings();
        await nextTurn();

        expect(mockGetPreviewSettings).toHaveBeenCalledTimes(1);
        resolveGeneration();
        await expect(Promise.all([first, second])).resolves.toEqual([result, result]);
    });

    it('serializes different preview settings keys', async () => {
        const resolvers: Array<() => void> = [];
        let active = 0;
        let maxActive = 0;
        mockGetPreviewSettings.mockImplementation(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise<void>((resolve) => {
                resolvers.push(resolve);
            });
            active--;
            return result;
        });

        const game = getCachedPreviewSettings();
        const sceneEditor = getCachedSceneEditorSettings();
        await nextTurn();
        expect(resolvers).toHaveLength(1);
        resolvers.shift()!();
        await nextTurn();
        expect(resolvers).toHaveLength(1);
        resolvers.shift()!();

        await expect(Promise.all([game, sceneEditor])).resolves.toEqual([result, result]);
        expect(maxActive).toBe(1);
    });
});
