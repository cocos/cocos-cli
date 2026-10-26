const mockRecalculateLODGroupBounds = jest.fn();

jest.mock('../src/api/decorator/decorator.js', () => ({
    description: () => jest.fn(),
    param: () => jest.fn(),
    result: () => jest.fn(),
    title: () => jest.fn(),
    tool: () => jest.fn(),
}), { virtual: true });

jest.mock('../src/core/scene', () => ({
    Scene: {
        Component: {
            recalculateLODGroupBounds: (...args: unknown[]) => mockRecalculateLODGroupBounds(...args),
        },
    },
}));

import { ComponentApi } from '../src/api/scene/component';
import {
    SchemaLODGroupBoundsResult,
    SchemaRecalculateLODGroupBoundsOptions,
} from '../src/api/scene/component-schema';
import { HTTP_STATUS } from '../src/api/base/schema-base';

describe('LODGroup bounds MCP API', () => {
    beforeEach(() => {
        mockRecalculateLODGroupBounds.mockReset();
    });

    it('validates the dedicated input and result schemas', () => {
        expect(SchemaRecalculateLODGroupBoundsOptions.parse({
            path: 'Root/LOD/cc.LODGroup',
            record: false,
        })).toEqual({
            path: 'Root/LOD/cc.LODGroup',
            record: false,
        });
        expect(() => SchemaRecalculateLODGroupBoundsOptions.parse({ path: '' })).toThrow();
        expect(SchemaLODGroupBoundsResult.parse({
            localBoundaryCenter: { x: 1, y: 2, z: 3 },
            objectSize: 4,
        })).toEqual({
            localBoundaryCenter: { x: 1, y: 2, z: 3 },
            objectSize: 4,
        });
    });

    it('forwards to the public scene API and returns the recalculated bounds', async () => {
        const options = { path: 'Root/LOD/cc.LODGroup', record: false };
        const bounds = {
            localBoundaryCenter: { x: 1, y: 2, z: 3 },
            objectSize: 8,
        };
        mockRecalculateLODGroupBounds.mockResolvedValue(bounds);

        const result = await new ComponentApi().recalculateLODGroupBounds(options);

        expect(mockRecalculateLODGroupBounds).toHaveBeenCalledWith(options);
        expect(result).toEqual({ code: HTTP_STATUS.OK, data: bounds });
    });

    it('maps an invalid component type to 400', async () => {
        mockRecalculateLODGroupBounds.mockRejectedValue(
            new Error('Parameter error: component is not cc.LODGroup: Root/cc.Label'),
        );

        const result = await new ComponentApi().recalculateLODGroupBounds({
            path: 'Root/cc.Label',
        });

        expect(result.code).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(result.reason).toContain('component is not cc.LODGroup');
    });

    it('maps a missing component to 404', async () => {
        mockRecalculateLODGroupBounds.mockRejectedValue(
            new Error('LODGroup component not found: Root/LOD/cc.LODGroup'),
        );

        const result = await new ComponentApi().recalculateLODGroupBounds({
            path: 'Root/LOD/cc.LODGroup',
        });

        expect(result.code).toBe(HTTP_STATUS.NOT_FOUND);
    });
});
