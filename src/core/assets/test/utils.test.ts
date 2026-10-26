export {};

const mockQueryUUID = jest.fn();
const mockQueryAsset = jest.fn();
const mockNameToId = jest.fn((name: string) => `${name}-hash`);

jest.mock('@cocos/asset-db', () => ({
    Asset: class {},
    VirtualAsset: class {},
    queryUUID: (...args: any[]) => mockQueryUUID(...args),
    queryAsset: (...args: any[]) => mockQueryAsset(...args),
    queryPath: jest.fn(),
    Utils: {
        nameToId: (name: string) => mockNameToId(name),
    },
}));

jest.mock('../manager/filesystem', () => ({
    removeAssetSource: jest.fn(),
}));

type TestAsset = {
    uuid: string;
    meta: { name: string };
    _name: string;
    subAssets: Record<string, TestAsset>;
    isDirectory(): boolean;
};

const ROOT_URL = 'db://assets/Character_Soldier_anima-003.fbx';
const ROOT_UUID = 'root-uuid';

function createAsset(name: string, uuid: string, subAssets: Record<string, TestAsset> = {}, directory = false): TestAsset {
    return {
        uuid,
        meta: { name },
        _name: name,
        subAssets,
        isDirectory: () => directory,
    };
}

function useRootAsset(root: TestAsset): void {
    mockQueryUUID.mockImplementation((value: string) => value === ROOT_URL ? ROOT_UUID : '');
    mockQueryAsset.mockImplementation((value: string) => value === ROOT_URL ? root : null);
}

describe('url2uuid', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockNameToId.mockImplementation((name: string) => `${name}-hash`);
    });

    it('keeps the name hash fast path when the mapped child name matches', () => {
        const childName = 'preview.prefab';
        const childId = `${childName}-hash`;
        useRootAsset(createAsset('Character_Soldier_anima-003.fbx', ROOT_UUID, {
            [childId]: createAsset(childName, `${ROOT_UUID}@${childId}`),
        }));

        const { url2uuid } = require('../utils') as typeof import('../utils');

        expect(url2uuid(`${ROOT_URL}/${childName}`)).toBe(`${ROOT_UUID}@${childId}`);
    });

    it('uses the actual child ID when a renamed child keeps its previous ID', () => {
        const childName = 'Character_Soldier_anima-003.prefab';
        mockNameToId.mockImplementation((name: string) => name === childName ? '68437' : `${name}-hash`);
        useRootAsset(createAsset('Character_Soldier_anima-003.fbx', ROOT_UUID, {
            c6110: createAsset(childName, `${ROOT_UUID}@c6110`),
        }));

        const { url2uuid } = require('../utils') as typeof import('../utils');

        expect(url2uuid(`${ROOT_URL}/${childName}`)).toBe(`${ROOT_UUID}@c6110`);
    });

    it('resolves actual IDs through nested virtual assets', () => {
        const sceneName = 'Character_Soldier_anima-003.prefab';
        const clipName = 'idle.animation';
        const clip = createAsset(clipName, `${ROOT_UUID}@c6110@legacy-clip`);
        const scene = createAsset(sceneName, `${ROOT_UUID}@c6110`, {
            'legacy-clip': clip,
        });
        useRootAsset(createAsset('Character_Soldier_anima-003.fbx', ROOT_UUID, {
            c6110: scene,
        }));

        const { url2uuid } = require('../utils') as typeof import('../utils');

        expect(url2uuid(`${ROOT_URL}/${sceneName}/${clipName}`)).toBe(`${ROOT_UUID}@c6110@legacy-clip`);
    });

    it('finds a collision-expanded child ID when the base hash belongs to another name', () => {
        const childName = 'target.material';
        const childId = `${childName}-hash-1`;
        useRootAsset(createAsset('Character_Soldier_anima-003.fbx', ROOT_UUID, {
            [`${childName}-hash`]: createAsset('other.material', `${ROOT_UUID}@${childName}-hash`),
            [childId]: createAsset(childName, `${ROOT_UUID}@${childId}`),
        }));

        const { url2uuid } = require('../utils') as typeof import('../utils');

        expect(url2uuid(`${ROOT_URL}/${childName}`)).toBe(`${ROOT_UUID}@${childId}`);
    });

    it('keeps the name hash fallback when the child is not available', () => {
        const childName = 'missing.prefab';
        useRootAsset(createAsset('Character_Soldier_anima-003.fbx', ROOT_UUID));

        const { url2uuid } = require('../utils') as typeof import('../utils');

        expect(url2uuid(`${ROOT_URL}/${childName}`)).toBe(`${ROOT_UUID}@${childName}-hash`);
    });

    it('does not append a sub-asset ID to a directory', () => {
        useRootAsset(createAsset('folder', ROOT_UUID, {}, true));

        const { url2uuid } = require('../utils') as typeof import('../utils');

        expect(url2uuid(`${ROOT_URL}/preview.prefab`)).toBe('');
    });
});
