const mockQueryPropertySchema = jest.fn();

jest.mock('../src/core/assets', () => ({
    assetDBManager: {},
    assetManager: {
        queryPropertySchema: (...args: unknown[]) => mockQueryPropertySchema(...args),
    },
}));

jest.mock('../src/api/decorator/decorator.js', () => jest.requireActual('../src/api/decorator/decorator'), { virtual: true });

import { COMMON_STATUS } from '../src/api/base/schema-base';
import { AssetsApi } from '../src/api/assets/assets';
import { toolRegistry } from '../src/api/decorator/decorator.js';

describe('assets-query-property-schema api', () => {
    beforeEach(() => {
        mockQueryPropertySchema.mockReset();
    });

    it('registers an MCP tool with importer parameter', () => {
        const tool = toolRegistry.get('assets-query-property-schema');

        expect(tool).toBeDefined();
        expect(tool?.meta.paramSchemas.map((param) => param.name)).toEqual(['importer']);
    });

    it('delegates to assetManager.queryPropertySchema', async () => {
        const schema = {
            type: {
                title: 'Import Type',
                type: 'string',
                default: 'sprite-frame',
                enum: ['raw', 'sprite-frame'],
                enumDescriptions: ['Raw', 'Sprite Frame'],
            },
        };
        mockQueryPropertySchema.mockResolvedValue(schema);

        const result = await new AssetsApi().queryPropertySchema('image');

        expect(result).toEqual({
            code: COMMON_STATUS.SUCCESS,
            data: schema,
        });
        expect(mockQueryPropertySchema).toHaveBeenCalledWith('image');
    });

    it('returns 404 when the importer is unknown', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        mockQueryPropertySchema.mockRejectedValue(new Error('Asset handler not found: missing'));

        const result = await new AssetsApi().queryPropertySchema('missing');

        consoleErrorSpy.mockRestore();
        expect(result.code).toBe(COMMON_STATUS.NOT_FOUND);
        expect(result.data).toEqual({});
        expect(result.reason).toBe('Asset handler not found: missing');
    });
});
