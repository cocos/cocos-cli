const queryAssetInfo = jest.fn();

jest.mock('../index', () => ({
    assetDBManager: {},
    assetManager: {
        queryAssetInfo: (...args: any[]) => queryAssetInfo(...args),
    },
}));

import { queryAssetInfo as queryTransportAssetInfo } from '../../../lib/assets/assets';

describe('asset RPC serialization', () => {
    beforeEach(() => {
        queryAssetInfo.mockReset();
    });

    it('strips non-cloneable helper functions from queryAssetInfo results', async () => {
        queryAssetInfo.mockReturnValue({
            uuid: 'asset-uuid',
            importer: 'fbx',
            helper() {},
            nested: { callback() {} },
        });

        await expect(queryTransportAssetInfo('asset-uuid')).resolves.toEqual({
            uuid: 'asset-uuid',
            importer: 'fbx',
            nested: {},
        });
    });
});
