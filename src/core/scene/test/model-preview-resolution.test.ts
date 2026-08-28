const request = jest.fn();

jest.mock('../scene-process/service/preview/interactive-preview', () => ({
    InteractivePreview: class {},
    getBoundaryOfMeshNodes: jest.fn(),
}));

jest.mock('cc', () => ({
    DirectionalLight: class {},
    Scene: class {},
    Node: class {},
    Prefab: class {},
    instantiate: jest.fn(),
}), { virtual: true });

jest.mock('../scene-process/service/core/decorator', () => ({
    Service: {},
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: {
        getInstance: jest.fn(() => ({ request })),
    },
}));

jest.mock('../scene-process/service/preview/asset-reload', () => ({
    loadPreviewAsset: jest.fn(),
    removePreviewAssetCache: jest.fn(),
}));

import { ModelPreview } from '../scene-process/service/preview/model-preview';

describe('ModelPreview FBX resolution', () => {
    const resolvePrefabUuid = (uuid: string) =>
        (ModelPreview.prototype as any).resolvePrefabUuid.call({}, uuid);

    beforeEach(() => {
        request.mockReset();
    });

    it('uses the generated Prefab child UUID, matching Creator FBX preview routing', async () => {
        request.mockResolvedValue({
            uuid: 'fbx-root',
            type: 'cc.Asset',
            subAssets: {
                mesh: { uuid: 'fbx-root@mesh', type: 'cc.Mesh' },
                prefab: { uuid: 'fbx-root@prefab', type: 'cc.Prefab', importer: 'gltf-scene' },
            },
        });

        await expect(resolvePrefabUuid('fbx-root')).resolves.toBe('fbx-root@prefab');
        expect(request).toHaveBeenCalledWith('assetManager', 'queryAssetInfo', ['fbx-root', ['subAssets']]);
    });

    it('does not fall back to the FBX root UUID when its Prefab child is unavailable', async () => {
        request.mockResolvedValue({ uuid: 'fbx-root', type: 'cc.Asset', subAssets: {} });

        await expect(resolvePrefabUuid('fbx-root')).resolves.toBeNull();
    });
});
