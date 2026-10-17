import { deserialize } from 'cc';
import { readJSON } from 'fs-extra';
import assetDBManager from '../../assets/manager/asset-db';
import assetManager from '../../assets/manager/asset';
import { buildAssetLibrary } from '../worker/builder/manager/asset-library';

jest.mock('fs-extra', () => ({
    readJSON: jest.fn(),
    existsSync: jest.fn(() => false),
    outputJSON: jest.fn(async () => {}),
}));

jest.mock('cc', () => {
    class Asset {}
    class SceneAsset extends Asset {
        scene = { children: [] };
        constructor(public sourceData: { spriteFrame: string | null }) { super(); }
    }
    class Details {
        uuidList: string[] = [];
        reset() { this.uuidList = []; }
        assignAssetsBy(getter: (uuid: string) => unknown) { this.uuidList.forEach(getter); }
    }
    return {
        Asset, SceneAsset, EffectAsset: class {}, LightComponent: class {}, Node: class {},
        deserialize: Object.assign(jest.fn((data: { spriteFrame: string | null }, details: Details) => {
            if (data.spriteFrame) details.uuidList.push(data.spriteFrame);
            return new SceneAsset(data);
        }), { Details }),
    };
});

jest.mock('cc/editor/serialization', () => ({ CCON: class {} }));
jest.mock('../worker/builder/manager/cconb-utils', () => ({}));
jest.mock('../worker/builder/utils/cconb', () => ({ getCCONFormatAssetInLibrary: () => '' }));
jest.mock('../worker/builder/utils', () => ({
    recursively: (asset: unknown, visit: (asset: unknown) => void) => visit(asset),
}));
jest.mock('../worker/builder/utils/bundle', () => ({}));
jest.mock('../worker/builder/asset-handler/bundle/utils', () => ({}));
jest.mock('../../base/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('../../assets/manager/asset-db', () => ({
    __esModule: true,
    default: { assetDBMap: {} },
}));
jest.mock('../../assets/manager/asset', () => ({
    __esModule: true,
    default: {
        queryAssetProperty: jest.fn(() => 'cc.SceneAsset'),
        queryAssetMeta: jest.fn(),
        queryAssetUsers: jest.fn(),
    },
}));

describe('BuildAssetLibrary cache lifetime', () => {
    const sceneUuid = '93696410-9691-4bab-bbde-88ad24987fad';
    const photoUuid = '1c45b917-e02b-4c25-8f4a-d2b2eb7ff4b9@f9941';
    const defaultSpriteUuid = '57520716-48c8-4a19-8acf-41c9f8777fb0@f9941';
    const globalDescriptors = new Map(['cc', 'EditorExtends'].map(key => [
        key, Object.getOwnPropertyDescriptor(globalThis, key),
    ]));

    beforeEach(() => {
        jest.clearAllMocks();
        buildAssetLibrary.reset();
        jest.spyOn(console, 'debug').mockImplementation(() => {});
        const sceneAsset = {
            uuid: sceneUuid,
            url: 'db://assets/scene-2d.scene',
            source: 'project/assets/scene-2d.scene',
            library: `project/library/93/${sceneUuid}`,
            meta: { files: ['.json'] },
            _assetDB: { options: { temp: 'project/temp/asset-db/assets' } },
        };
        assetDBManager.assetDBMap = {
            assets: {
                uuid2asset: new Map<string, { uuid: string }>([
                    [sceneUuid, sceneAsset],
                    [photoUuid, { uuid: photoUuid }],
                    [defaultSpriteUuid, { uuid: defaultSpriteUuid }],
                ]),
            },
        } as any;
        Object.defineProperty(globalThis, 'cc', {
            configurable: true, value: { deserialize },
        });
        Object.defineProperty(globalThis, 'EditorExtends', {
            configurable: true,
            value: {
                serialize: { asAsset: (uuid: string) => ({ _uuid: uuid }) },
                serializeCompiled: (asset: { sourceData: unknown }) => asset.sourceData,
                MissingReporter: {
                    classInstance: { hasMissingClass: false, reset() {}, classFinder() {} },
                },
            },
        });
    });

    afterEach(() => {
        buildAssetLibrary.reset();
        jest.restoreAllMocks();
        for (const [key, descriptor] of globalDescriptors) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        }
    });

    it.each([
        ['removing the photo reference', null],
        ['replacing the photo with the default sprite', defaultSpriteUuid],
    ])('keeps bundle dependencies aligned with serialized scenes after %s and adding it back', async (_, middleSprite) => {
        const snapshots = [photoUuid, middleSprite, photoUuid];
        const results = [];
        for (const spriteFrame of snapshots) {
            (readJSON as jest.Mock).mockResolvedValue({ spriteFrame });
            await buildAssetLibrary.init();

            // Bundle collection happens before scene serialization in every build.
            const bundleDependencies = await buildAssetLibrary.getDependUuids(sceneUuid);
            const readsAfterCollection = (readJSON as jest.Mock).mock.calls.length;
            expect(await buildAssetLibrary.getDependUuids(sceneUuid)).toEqual(bundleDependencies);
            expect(readJSON).toHaveBeenCalledTimes(readsAfterCollection);

            const serialized = await buildAssetLibrary.getSerializedJSON(sceneUuid, { debug: true });
            results.push({ bundleDependencies, serializedReference: serialized.spriteFrame });
        }

        expect(results).toEqual(snapshots.map(spriteFrame => ({
            bundleDependencies: spriteFrame ? [spriteFrame] : [],
            serializedReference: spriteFrame,
        })));
    });

    it('refreshes metadata and reverse dependencies between builds while reusing them within a build', async () => {
        const queryMeta = assetManager.queryAssetMeta as jest.Mock;
        const queryUsers = assetManager.queryAssetUsers as jest.Mock;
        queryMeta.mockReturnValueOnce({ revision: 1 }).mockReturnValueOnce({ revision: 2 });
        queryUsers.mockResolvedValueOnce(['old-scene']).mockResolvedValueOnce(['new-scene']);

        for (const revision of [1, 2]) {
            await buildAssetLibrary.init();
            const expectedUsers = revision === 1 ? ['old-scene'] : ['new-scene'];
            expect(await buildAssetLibrary.getMeta(photoUuid)).toEqual({ revision });
            expect(await buildAssetLibrary.getMeta(photoUuid)).toEqual({ revision });
            expect(await buildAssetLibrary.queryAssetUsers(photoUuid)).toEqual(expectedUsers);
            expect(await buildAssetLibrary.queryAssetUsers(photoUuid)).toEqual(expectedUsers);
            expect(queryMeta).toHaveBeenCalledTimes(revision);
            expect(queryUsers).toHaveBeenCalledTimes(revision);
        }
    });
});
