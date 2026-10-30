const mockPreflightMove = jest.fn();
const mockMove = jest.fn();

jest.mock('../src/core/assets', () => ({
    assetDBManager: {},
    assetManager: {
        preflightMoveAsset: (...args: unknown[]) => mockPreflightMove(...args),
        moveAsset: (...args: unknown[]) => mockMove(...args),
    },
}));
jest.mock('../src/api/decorator/decorator.js', () => jest.requireActual('../src/api/decorator/decorator'), {
    virtual: true,
});

import { AssetsApi } from '../src/api/assets/assets';
import { SchemaAssetMoveOptions, SchemaAssetMovePreflightResult } from '../src/api/assets/schema';
import { COMMON_STATUS } from '../src/api/base/schema-base';
import { toolRegistry } from '../src/api/decorator/decorator.js';
import * as assets from '../src/lib/assets/assets';

describe('asset move public contracts', () => {
    beforeEach(() => {
        mockPreflightMove.mockReset();
        mockMove.mockReset();
    });

    it('exposes preflight facts through the lib and tool without starting a move', async () => {
        const facts = { action: 'move', preflightToken: 'one-use-token' };
        mockPreflightMove.mockResolvedValue(facts);
        const source = 'db://assets/source.txt';
        const target = 'db://assets/destination/source.txt';

        await expect(assets.preflightMoveAsset(source, target)).resolves.toEqual(facts);
        await expect(new AssetsApi().preflightMoveAsset(source, target)).resolves.toEqual({
            code: COMMON_STATUS.SUCCESS,
            data: facts,
        });
        expect(SchemaAssetMovePreflightResult.parse(facts)).toEqual(facts);
        expect(
            toolRegistry
                .get('assets-preflight-move-asset')
                ?.meta.paramSchemas.map(({ name, index }) => ({ name, index })),
        ).toEqual(
            expect.arrayContaining([
                { name: 'source', index: 0 },
                { name: 'target', index: 1 },
            ]),
        );
        expect(mockMove).not.toHaveBeenCalled();
    });

    it('preserves the token through schema parsing and submission and returns final resource data', async () => {
        const result = { uuid: 'source-uuid', url: 'db://assets/destination/source-001.txt' };
        mockMove.mockResolvedValue(result);
        const options = SchemaAssetMoveOptions.parse({ preflightToken: 'one-use-token', rename: true });

        await expect(
            new AssetsApi().moveAsset('db://assets/source.txt', 'db://assets/destination/source.txt', options),
        ).resolves.toEqual({ code: COMMON_STATUS.SUCCESS, data: result });
        expect(mockMove).toHaveBeenCalledWith('db://assets/source.txt', 'db://assets/destination/source.txt', {
            preflightToken: 'one-use-token',
            rename: true,
        });
        expect(SchemaAssetMoveOptions.safeParse({ preflightToken: '' }).success).toBe(false);
    });

    it('reports a failed observation as failure rather than an empty conflict list', async () => {
        mockPreflightMove.mockRejectedValue(new Error('Asset DB is not active'));
        await expect(new AssetsApi().preflightMoveAsset('source', 'target')).resolves.toEqual({
            code: COMMON_STATUS.FAIL,
            reason: 'Asset DB is not active',
        });
        expect(mockMove).not.toHaveBeenCalled();
    });
});
