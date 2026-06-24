const mockQuerySerializedData = jest.fn();
const mockSaveSerializedData = jest.fn();

jest.mock('../src/api/decorator/decorator.js', () => ({
    description: () => jest.fn(),
    param: () => jest.fn(),
    result: () => jest.fn(),
    title: () => jest.fn(),
    tool: () => jest.fn(),
}), { virtual: true });

jest.mock('../src/core/assets', () => ({
    assetDBManager: {},
    assetManager: {
        querySerializedData: (...args: unknown[]) => mockQuerySerializedData(...args),
        saveSerializedData: (...args: unknown[]) => mockSaveSerializedData(...args),
    },
}));

import { AssetsApi } from '../src/api/assets/assets';
import { COMMON_STATUS } from '../src/api/base/schema-base';

describe('assets serialized data api', () => {
    beforeEach(() => {
        mockQuerySerializedData.mockReset();
        mockSaveSerializedData.mockReset();
    });

    it('delegates querySerializedData to assetManager', async () => {
        const result = {
            uuid: 'test-uuid',
            url: 'db://assets/test.pmtl',
            type: 'cc.PhysicsMaterial',
            importer: 'physics-material',
            dump: {},
        };
        mockQuerySerializedData.mockResolvedValue(result);

        await expect(new AssetsApi().querySerializedData('test-uuid')).resolves.toEqual({
            code: COMMON_STATUS.SUCCESS,
            data: result,
        });
        expect(mockQuerySerializedData).toHaveBeenCalledWith('test-uuid');
    });

    it('delegates saveSerializedData to assetManager', async () => {
        const result = {
            uuid: 'test-uuid',
            url: 'db://assets/test.pmtl',
            type: 'cc.PhysicsMaterial',
            importer: 'physics-material',
            dump: {},
        };
        const patch = { friction: { value: 0.25 } };
        mockSaveSerializedData.mockResolvedValue(result);

        await expect(new AssetsApi().saveSerializedData('test-uuid', patch)).resolves.toEqual({
            code: COMMON_STATUS.SUCCESS,
            data: result,
        });
        expect(mockSaveSerializedData).toHaveBeenCalledWith('test-uuid', patch);
    });
});
