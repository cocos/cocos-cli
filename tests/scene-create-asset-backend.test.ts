const mockCreateAssetByType = jest.fn();
const mockSceneCreate = jest.fn();

jest.mock('../src/api/decorator/decorator.js', () => ({
    description: () => jest.fn(),
    param: () => jest.fn(),
    result: () => jest.fn(),
    title: () => jest.fn(),
    tool: () => jest.fn(),
}), { virtual: true });

jest.mock('../src/core/assets', () => ({
    assetManager: {
        createAssetByType: (...args: unknown[]) => mockCreateAssetByType(...args),
    },
}));

jest.mock('../src/core/scene', () => ({
    NodeType: {
        EMPTY: 'Node',
        SPRITE: 'Sprite',
    },
    SCENE_TEMPLATE_TYPE: ['2d', '3d'],
    Scene: {
        create: (...args: unknown[]) => mockSceneCreate(...args),
    },
}));

import { SceneApi } from '../src/api/scene/scene';
import { COMMON_STATUS } from '../src/api/base/schema-base';

describe('scene-create AssetManager backend', () => {
    beforeEach(() => {
        mockCreateAssetByType.mockReset();
        mockSceneCreate.mockReset();
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('creates the scene through AssetManager and maps the legacy identifier result', async () => {
        mockCreateAssetByType.mockResolvedValue({
            name: 'Main.scene',
            uuid: 'scene-uuid',
            url: 'db://assets/scenes/Main.scene',
            type: 'cc.SceneAsset',
        });

        const result = await new SceneApi().createScene({
            baseName: 'Main',
            dbURL: 'db://assets/scenes',
            templateType: '3d',
        });

        expect(mockCreateAssetByType).toHaveBeenCalledWith(
            'scene',
            'db://assets/scenes',
            'Main',
            { templateName: '3d' },
        );
        expect(result).toEqual({
            code: COMMON_STATUS.SUCCESS,
            data: {
                assetName: 'Main.scene',
                assetUuid: 'scene-uuid',
                assetUrl: 'db://assets/scenes/Main.scene',
                assetType: 'cc.SceneAsset',
            },
        });
        expect(mockSceneCreate).not.toHaveBeenCalled();
    });

    it('uses the 2d template by default and still performs zero Scene RPCs', async () => {
        mockCreateAssetByType.mockResolvedValue({
            name: 'Default.scene',
            uuid: 'default-scene-uuid',
            url: 'db://assets/Default.scene',
            type: 'cc.SceneAsset',
        });

        const result = await new SceneApi().createScene({
            baseName: 'Default',
            dbURL: 'db://assets',
        });

        expect(result.code).toBe(COMMON_STATUS.SUCCESS);
        expect(mockCreateAssetByType).toHaveBeenCalledWith(
            'scene',
            'db://assets',
            'Default',
            { templateName: '2d' },
        );
        expect(mockSceneCreate).not.toHaveBeenCalled();
    });

    it('returns the existing scene-create failure contract without falling back to Scene RPC', async () => {
        mockCreateAssetByType.mockRejectedValue(new Error('asset creation failed'));

        const result = await new SceneApi().createScene({
            baseName: 'Broken',
            dbURL: 'db://assets',
        });

        expect(result).toEqual({
            code: COMMON_STATUS.FAIL,
            reason: 'asset creation failed',
        });
        expect(mockSceneCreate).not.toHaveBeenCalled();
    });
});
