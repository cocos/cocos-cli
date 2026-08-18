const queryAssetProperty = jest.fn();

jest.mock('../../assets/manager/asset', () => ({
    __esModule: true,
    default: {
        queryAssetProperty: (...args: any[]) => queryAssetProperty(...args),
    },
}));

jest.mock('../worker/builder/manager/asset-library', () => ({
    __esModule: true,
    buildAssetLibrary: {
        init: jest.fn(),
        getAsset: jest.fn(),
    },
}));

jest.mock('../share/builder-config', () => ({
    __esModule: true,
    default: {},
}));

import { BuilderAssetCache } from '../worker/builder/manager/asset';

function asset(uuid: string, files: string[], subAssets: Record<string, any> = {}) {
    return {
        uuid,
        url: `db://assets/${uuid}`,
        invalid: false,
        _assetDB: {},
        meta: { files },
        subAssets,
    };
}

describe('BuilderAssetCache', () => {
    beforeEach(() => {
        queryAssetProperty.mockReset();
        queryAssetProperty.mockImplementation((value: { uuid: string }) => {
            if (value.uuid.endsWith('@prefab')) return 'cc.Prefab';
            if (value.uuid.endsWith('@material')) return 'cc.Material';
            return 'cc.FBX';
        });
    });

    it('includes imported FBX child assets required by scene-editor previews', () => {
        const fbx = asset('flower', [], {
            prefab: asset('flower@prefab', ['.json']),
            material: asset('flower@material', ['.json']),
        });
        const cache = new BuilderAssetCache();

        cache.addAsset(fbx as any);

        // The FBX root has no .json, while Creator previews its cc.Prefab child.
        expect(cache.assetUuids).toEqual(['flower@prefab', 'flower@material']);
    });

    it('does not add duplicates when an asset tree is visited more than once', () => {
        const fbx = asset('flower', [], {
            prefab: asset('flower@prefab', ['.json']),
        });
        const cache = new BuilderAssetCache();

        cache.addAsset(fbx as any);
        cache.addAsset(fbx as any);

        expect(cache.assetUuids).toEqual(['flower@prefab']);
    });
});
