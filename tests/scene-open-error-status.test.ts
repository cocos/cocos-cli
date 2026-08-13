const mockSceneOpen = jest.fn();

jest.mock('../src/api/decorator/decorator.js', () => ({
    description: () => jest.fn(),
    param: () => jest.fn(),
    result: () => jest.fn(),
    title: () => jest.fn(),
    tool: () => jest.fn(),
}), { virtual: true });

jest.mock('../src/core/scene', () => ({
    NodeType: {
        EMPTY: 'Node',
        SPRITE: 'Sprite',
    },
    Scene: {
        open: (...args: unknown[]) => mockSceneOpen(...args),
    },
}));

import { SceneApi } from '../src/api/scene/scene';
import { COMMON_STATUS } from '../src/api/base/schema-base';

describe('scene-open error status', () => {
    beforeEach(() => {
        mockSceneOpen.mockReset();
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns 400 for known invalid scene or prefab content', async () => {
        mockSceneOpen.mockRejectedValue(new Error('Invalid scene/prefab asset content: invalid JSON'));

        const result = await new SceneApi().open({
            dbURLOrUUID: 'db://assets/broken.prefab',
            includeChildren: true,
            includeComponents: false,
        });

        expect(result.code).toBe(COMMON_STATUS.BAD_REQUEST);
        expect(result.reason).toContain('Invalid scene/prefab asset content');
    });

    it('keeps unknown internal failures as 500', async () => {
        mockSceneOpen.mockRejectedValue(new TypeError("Cannot read properties of undefined (reading '0')"));

        const result = await new SceneApi().open({
            dbURLOrUUID: 'db://assets/broken.prefab',
            includeChildren: true,
            includeComponents: false,
        });

        expect(result.code).toBe(COMMON_STATUS.FAIL);
        expect(result.reason).toContain('Cannot read properties');
    });

    it('returns 404 with the missing prefab uuid', async () => {
        const missingUuid = '12345678-abcd-1234-abcd-1234567890ab';
        mockSceneOpen.mockRejectedValue(new Error(
            `The asset db://assets/scene-with-deleted-prefab.scene cannot be loaded because a dependent asset is missing: ${missingUuid}`
        ));

        const result = await new SceneApi().open({
            dbURLOrUUID: 'db://assets/scene-with-deleted-prefab.scene',
            includeChildren: true,
            includeComponents: false,
        });

        expect(result.code).toBe(COMMON_STATUS.NOT_FOUND);
        expect(result.reason).toContain(missingUuid);
    });
});
