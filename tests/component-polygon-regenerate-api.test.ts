const mockRegeneratePolygon2DPoints = jest.fn();

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
            regeneratePolygon2DPoints: (...args: unknown[]) => mockRegeneratePolygon2DPoints(...args),
        },
    },
}));

import { ComponentApi } from '../src/api/scene/component';
import {
    SchemaRegeneratePolygon2DPointsOptions,
    SchemaRegeneratePolygon2DPointsResult,
} from '../src/api/scene/component-schema';
import { HTTP_STATUS } from '../src/api/base/schema-base';

describe('PolygonCollider2D regeneration MCP API', () => {
    beforeEach(() => {
        mockRegeneratePolygon2DPoints.mockReset();
    });

    it('validates the dedicated input and result schemas', () => {
        expect(SchemaRegeneratePolygon2DPointsOptions.parse({
            path: 'Canvas/Polygon/cc.PolygonCollider2D',
            record: false,
        })).toEqual({
            path: 'Canvas/Polygon/cc.PolygonCollider2D',
            record: false,
        });
        expect(() => SchemaRegeneratePolygon2DPointsOptions.parse({ path: '' })).toThrow();

        expect(SchemaRegeneratePolygon2DPointsResult.parse({
            path: 'Canvas/Polygon/cc.PolygonCollider2D',
            changed: true,
            pointCount: 4,
            source: 'rect-fallback',
        })).toEqual({
            path: 'Canvas/Polygon/cc.PolygonCollider2D',
            changed: true,
            pointCount: 4,
            source: 'rect-fallback',
        });
        expect(() => SchemaRegeneratePolygon2DPointsResult.parse({
            path: 'Canvas/Polygon/cc.PolygonCollider2D',
            changed: true,
            pointCount: 2,
            source: 'unknown',
        })).toThrow();
    });

    it('forwards to the public scene API and returns the regeneration result', async () => {
        const options = { path: 'Canvas/Polygon/cc.PolygonCollider2D', record: false };
        const regenerationResult = {
            path: options.path,
            changed: true,
            pointCount: 8,
            source: 'sprite-alpha' as const,
        };
        mockRegeneratePolygon2DPoints.mockResolvedValue(regenerationResult);

        const result = await new ComponentApi().regeneratePolygon2DPoints(options);

        expect(mockRegeneratePolygon2DPoints).toHaveBeenCalledWith(options);
        expect(result).toEqual({ code: HTTP_STATUS.OK, data: regenerationResult });
    });

    it('maps an invalid component type to 400', async () => {
        mockRegeneratePolygon2DPoints.mockRejectedValue(
            new Error('Parameter error: component is not cc.PolygonCollider2D: Canvas/Polygon/cc.Label'),
        );

        const result = await new ComponentApi().regeneratePolygon2DPoints({
            path: 'Canvas/Polygon/cc.Label',
        });

        expect(result.code).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(result.reason).toContain('component is not cc.PolygonCollider2D');
    });

    it('maps a missing component to 404', async () => {
        mockRegeneratePolygon2DPoints.mockRejectedValue(
            new Error('PolygonCollider2D component not found: Canvas/Polygon/cc.PolygonCollider2D'),
        );

        const result = await new ComponentApi().regeneratePolygon2DPoints({
            path: 'Canvas/Polygon/cc.PolygonCollider2D',
        });

        expect(result.code).toBe(HTTP_STATUS.NOT_FOUND);
    });

    it('maps image processing failures to 500', async () => {
        mockRegeneratePolygon2DPoints.mockRejectedValue(new Error('Failed to read source image pixels'));

        const result = await new ComponentApi().regeneratePolygon2DPoints({
            path: 'Canvas/Polygon/cc.PolygonCollider2D',
        });

        expect(result.code).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    });
});
