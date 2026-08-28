const mockInsertLOD = jest.fn();
const mockEraseLOD = jest.fn();
const mockQueryLODGroupRelativeHeight = jest.fn();

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
            insertLOD: (...args: unknown[]) => mockInsertLOD(...args),
            eraseLOD: (...args: unknown[]) => mockEraseLOD(...args),
            queryLODGroupRelativeHeight: (...args: unknown[]) => mockQueryLODGroupRelativeHeight(...args),
        },
    },
}));

import { ComponentApi } from '../src/api/scene/component';
import {
    SchemaEraseLODOptions,
    SchemaInsertLODOptions,
    SchemaLODGroupLevelsResult,
    SchemaLODGroupRelativeHeightResult,
    SchemaQueryLODGroupRelativeHeightOptions,
} from '../src/api/scene/component-schema';
import { HTTP_STATUS } from '../src/api/base/schema-base';

describe('LODGroup MCP API', () => {
    beforeEach(() => {
        mockInsertLOD.mockReset();
        mockEraseLOD.mockReset();
        mockQueryLODGroupRelativeHeight.mockReset();
    });

    it('validates insert, erase, query, and result schemas', () => {
        expect(SchemaInsertLODOptions.parse({
            path: 'Root/LOD/cc.LODGroup',
            index: 1,
            screenUsagePercentage: 0.25,
            record: false,
        })).toEqual({
            path: 'Root/LOD/cc.LODGroup',
            index: 1,
            screenUsagePercentage: 0.25,
            record: false,
        });
        expect(() => SchemaInsertLODOptions.parse({
            path: 'Root/LOD/cc.LODGroup',
            index: 1,
            screenUsagePercentage: 0,
        })).toThrow();
        expect(SchemaInsertLODOptions.parse({
            path: 'Root/LOD/cc.LODGroup',
            index: 1,
            screenUsagePercentage: 1,
        }).screenUsagePercentage).toBe(1);
        expect(() => SchemaInsertLODOptions.parse({
            path: 'Root/LOD/cc.LODGroup',
            index: 1,
            screenUsagePercentage: 1.01,
        })).toThrow();
        expect(() => SchemaInsertLODOptions.parse({
            path: 'Root/LOD/cc.LODGroup',
            index: 1.5,
        })).toThrow();
        expect(SchemaEraseLODOptions.parse({
            path: 'Root/LOD/cc.LODGroup',
            index: 0,
        })).toEqual({
            path: 'Root/LOD/cc.LODGroup',
            index: 0,
        });
        expect(SchemaQueryLODGroupRelativeHeightOptions.parse({
            path: 'Root/LOD/cc.LODGroup',
        })).toEqual({
            path: 'Root/LOD/cc.LODGroup',
        });
        expect(SchemaLODGroupLevelsResult.parse({
            lodCount: 2,
            screenUsagePercentages: [0.25, 0.01],
        })).toEqual({
            lodCount: 2,
            screenUsagePercentages: [0.25, 0.01],
        });
        expect(SchemaLODGroupRelativeHeightResult.parse(1.5)).toBe(1.5);
    });

    it('forwards insert and returns the updated LOD state', async () => {
        const options = { path: 'Root/LOD/cc.LODGroup', index: 1, record: false };
        const lodState = { lodCount: 2, screenUsagePercentages: [0.25, 0.01] };
        mockInsertLOD.mockResolvedValue(lodState);

        const result = await new ComponentApi().insertLOD(options);

        expect(mockInsertLOD).toHaveBeenCalledWith(options);
        expect(result).toEqual({ code: HTTP_STATUS.OK, data: lodState });
    });

    it('forwards erase and returns the updated LOD state', async () => {
        const options = { path: 'Root/LOD/cc.LODGroup', index: 1, record: false };
        const lodState = { lodCount: 1, screenUsagePercentages: [0.25] };
        mockEraseLOD.mockResolvedValue(lodState);

        const result = await new ComponentApi().eraseLOD(options);

        expect(mockEraseLOD).toHaveBeenCalledWith(options);
        expect(result).toEqual({ code: HTTP_STATUS.OK, data: lodState });
    });

    it('forwards the relative-height query without clamping', async () => {
        const options = { path: 'Root/LOD/cc.LODGroup' };
        mockQueryLODGroupRelativeHeight.mockResolvedValue(1.5);

        const result = await new ComponentApi().queryLODGroupRelativeHeight(options);

        expect(mockQueryLODGroupRelativeHeight).toHaveBeenCalledWith(options);
        expect(result).toEqual({ code: HTTP_STATUS.OK, data: 1.5 });
    });

    it('maps invalid LOD operation errors to client errors', async () => {
        mockInsertLOD.mockRejectedValue(new Error('Parameter error: screenUsagePercentage must be in (0, 1]: 0'));

        const result = await new ComponentApi().insertLOD({
            path: 'Root/LOD/cc.LODGroup',
            index: 1,
            screenUsagePercentage: 0.25,
        });

        expect(result.code).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(result.reason).toContain('screenUsagePercentage');

        mockEraseLOD.mockRejectedValue(new Error('Parameter error: LODGroup must contain at least 1 LOD level'));
        const eraseResult = await new ComponentApi().eraseLOD({
            path: 'Root/LOD/cc.LODGroup',
            index: 0,
        });

        expect(eraseResult.code).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(eraseResult.reason).toContain('at least 1 LOD level');
    });
});
