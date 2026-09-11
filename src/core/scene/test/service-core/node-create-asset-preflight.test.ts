import {
    MockNode,
    mockCreateNodeByAsset,
    mockGetRootNode,
    mockPrefabAsset,
    mockQueryCanvasRequiredByAsset,
    mockRpcRequest,
    resetNodeCreateMocks,
} from './node-create-test-harness';

interface IMutableAssetTarget {
    uuid: string;
    type: string;
}

const assetTargetDriftCases: Array<{
    label: string;
    mutate: (target: IMutableAssetTarget) => void;
}> = [
    {
        label: 'resolved asset UUID',
        mutate: target => { target.uuid = 'replacement-asset-uuid'; },
    },
    {
        label: 'resolved asset type',
        mutate: target => { target.type = 'cc.SpriteFrame'; },
    },
];

describe('NodeService asset creation preflight', () => {
    beforeEach(() => {
        resetNodeCreateMocks();
    });

    it.each(assetTargetDriftCases)('rejects a preflight token when the $label changes', async ({ mutate }) => {
        const target: IMutableAssetTarget = {
            uuid: 'asset-uuid',
            type: 'cc.Prefab',
        };
        mockGetRootNode.mockReturnValue(new MockNode('Root'));
        mockRpcRequest.mockImplementation(async (_service: string, method: string) => {
            if (method === 'queryAssetInfo') {
                return {
                    uuid: target.uuid,
                    type: target.type,
                    imported: true,
                    invalid: false,
                };
            }
            return undefined;
        });
        mockQueryCanvasRequiredByAsset.mockResolvedValue(false);

        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        service._createNode = jest.fn().mockResolvedValue({ path: '/Inserted' });
        const params = {
            path: '/',
            dbURL: 'db://assets/Asset.prefab',
        };
        const preflight = await service.preflightCreate(params);
        mutate(target);
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await expect(service.createByAsset({
            ...params,
            preflightToken: preflight.preflightToken,
        })).rejects.toThrow('target changed after preflight');

        consoleError.mockRestore();
        expect(service._createNode).not.toHaveBeenCalled();
    });

    it('keeps direct asset creation on the existing single-load path', async () => {
        mockGetRootNode.mockReturnValue(new MockNode('Root'));
        mockPrefabAsset();

        const { NodeService } = require('../../scene-process/service/node');
        await new NodeService().createByAsset({
            path: '/',
            dbURL: 'db://assets/Asset.prefab',
        });

        expect(mockQueryCanvasRequiredByAsset).not.toHaveBeenCalled();
        expect(mockRpcRequest).toHaveBeenCalledTimes(1);
        expect(mockRpcRequest).toHaveBeenCalledWith(
            'assetManager',
            'queryAssetInfo',
            ['db://assets/Asset.prefab'],
        );
        expect(mockCreateNodeByAsset).toHaveBeenCalledTimes(1);
    });

    it('keeps an explicit Canvas requirement authoritative when the asset does not require one', async () => {
        mockGetRootNode.mockReturnValue(new MockNode('Root'));
        mockPrefabAsset();
        mockQueryCanvasRequiredByAsset.mockResolvedValue(false);

        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        const params = {
            path: '/',
            dbURL: 'db://assets/Asset.prefab',
            canvasRequired: true,
        };
        const preflight = await service.preflightCreate(params);

        expect(preflight.canvasRequired).toBe(true);

        await service.createByAsset({
            ...params,
            preflightToken: preflight.preflightToken,
        });

        expect(mockCreateNodeByAsset).toHaveBeenCalledWith({
            uuid: 'asset-uuid',
            type: 'cc.Prefab',
            workMode: '2d',
            canvasRequired: true,
        });
    });

    it.each([
        { preflightCanvasRequired: false, actualCanvasRequired: true },
        { preflightCanvasRequired: true, actualCanvasRequired: false },
    ])(
        'destroys an unattached asset node when Canvas requirement changes from $preflightCanvasRequired to $actualCanvasRequired',
        async ({ preflightCanvasRequired, actualCanvasRequired }) => {
            const root = new MockNode('Root');
            const createdNode = new MockNode('AssetInstance');
            mockGetRootNode.mockReturnValue(root);
            mockPrefabAsset();
            mockQueryCanvasRequiredByAsset.mockResolvedValue(preflightCanvasRequired);
            mockCreateNodeByAsset.mockResolvedValue({ node: createdNode, canvasRequired: actualCanvasRequired });

            const { NodeService } = require('../../scene-process/service/node');
            const service = new NodeService();
            service._getOrCreateNodeByPath = jest.fn().mockResolvedValue(root);
            const params = {
                path: '/MissingParent',
                dbURL: 'db://assets/Asset.prefab',
            };
            const preflight = await service.preflightCreate(params);
            const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

            await expect(service.createByAsset({
                ...params,
                preflightToken: preflight.preflightToken,
            })).rejects.toThrow('Canvas requirement changed after preflight');

            consoleError.mockRestore();
            expect(createdNode.destroy).toHaveBeenCalledTimes(1);
            expect(createdNode.parent).toBeNull();
            expect(service._getOrCreateNodeByPath).not.toHaveBeenCalled();
            expect(mockQueryCanvasRequiredByAsset).toHaveBeenCalledTimes(1);
            expect(mockRpcRequest).toHaveBeenCalledTimes(2);
            expect(mockRpcRequest).toHaveBeenNthCalledWith(
                1,
                'assetManager',
                'queryAssetInfo',
                ['db://assets/Asset.prefab'],
            );
            expect(mockRpcRequest).toHaveBeenNthCalledWith(
                2,
                'assetManager',
                'queryAssetInfo',
                ['db://assets/Asset.prefab'],
            );
            expect(mockCreateNodeByAsset).toHaveBeenCalledTimes(1);
        },
    );
});
