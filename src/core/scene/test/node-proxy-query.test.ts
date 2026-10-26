const mockRequest = jest.fn();
jest.mock('../main-process/rpc', () => ({
    Rpc: {
        getInstance: () => ({ request: mockRequest }),
    },
}));

import { NodeProxy } from '../main-process/proxy/node-proxy';

beforeEach(() => mockRequest.mockReset().mockResolvedValue(null));

describe('NodeProxy.query projection options', () => {
    it.each([false, true, undefined])('forwards includeLightProbeData=%s to the scene process', async (includeLightProbeData) => {
        await NodeProxy.query({
            path: '/',
            includeChildren: true,
            includeComponents: true,
            includeLightProbeData,
        });

        expect(mockRequest).toHaveBeenCalledWith('Node', 'query', [{
            path: '/',
            includeChildren: true,
            includeComponents: true,
            includeLightProbeData,
        }]);
    });

    it('preserves query defaults when no options are supplied', async () => {
        await expect(NodeProxy.query()).resolves.toBeNull();

        expect(mockRequest).toHaveBeenCalledWith('Node', 'query', [{
            path: '',
            includeChildren: false,
            includeComponents: false,
            includeLightProbeData: undefined,
        }]);
    });
});
