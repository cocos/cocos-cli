const mockRequest = jest.fn();
jest.mock('../main-process/rpc', () => ({
    Rpc: {
        getInstance: () => ({ request: mockRequest }),
    },
}));

import { NodeProxy } from '../main-process/proxy/node-proxy';

function makeDump(uuid?: string) {
    return {
        uuid: uuid !== undefined ? { value: uuid } : undefined,
        name: { value: 'OldName', type: 'string' },
    };
}

beforeEach(() => mockRequest.mockReset());

describe('NodeProxy.update 重命名路径解析', () => {
    it('重命名成功且 getPathByUuid 返回有效路径', async () => {
        mockRequest
            .mockResolvedValueOnce(makeDump('uuid-1'))
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce('Canvas/Enemy_001');

        const result = await NodeProxy.update({ path: 'Canvas/Enemy', name: 'Enemy' });
        expect(result.path).toBe('Canvas/Enemy_001');
        expect(mockRequest).toHaveBeenCalledWith('Node', 'getPathByUuid', ['uuid-1']);
    });

    it('nodeDump 无 uuid 时抛错而非静默回退旧路径', async () => {
        mockRequest
            .mockResolvedValueOnce(makeDump(undefined))
            .mockResolvedValueOnce(undefined);

        await expect(
            NodeProxy.update({ path: 'Canvas/Enemy', name: 'NewName' }),
        ).rejects.toThrow('has no uuid');
    });

    it('getPathByUuid 返回空时抛错而非静默回退旧路径', async () => {
        mockRequest
            .mockResolvedValueOnce(makeDump('uuid-2'))
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(null);

        await expect(
            NodeProxy.update({ path: 'Canvas/Enemy', name: 'NewName' }),
        ).rejects.toThrow('Cannot resolve path');
    });

    it('不传 name 时不触发路径解析，直接返回原路径', async () => {
        mockRequest.mockResolvedValueOnce({
            ...makeDump('uuid-3'),
            active: { value: true, type: 'boolean' },
        }).mockResolvedValueOnce(undefined);

        const result = await NodeProxy.update({ path: 'Canvas/Enemy', properties: { active: false } });
        expect(result.path).toBe('Canvas/Enemy');
        expect(mockRequest).toHaveBeenCalledTimes(2);
    });

});
