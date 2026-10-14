jest.mock('cc', () => ({
    Scene: class Scene {
        name: string;
        constructor(name = '') {
            this.name = name;
        }
    },
    SceneAsset: class SceneAsset { },
    Component: class Component { },
    Node: class Node { },
    Prefab: class Prefab {
        static _utils: { applyTargetOverrides: jest.Mock } = { applyTargetOverrides: jest.fn() };
    },
    find: jest.fn(),
    instantiate: jest.fn(),
}));

jest.mock('../scene-process/service/scene/utils', () => ({
    sceneUtils: {
        generateNodeDump: jest.fn(),
        loadAny: jest.fn(),
        runScene: jest.fn(async () => undefined),
        runSceneImmediateByJson: jest.fn(),
        serialize: jest.fn(),
    },
}));

jest.mock('../scene-process/service/prefab/prefab-editor-utils', () => ({
    editorPrefabUtils: {
        serialize: jest.fn(),
        rebindPrefabAsset: jest.fn((root: any, asset: any) => {
            if (root?._prefab) root._prefab.asset = asset;
            root?.walk?.((node: any) => {
                const info = node?._prefab;
                if (node !== root && info && !info.instance && info.root === root) info.asset = asset;
            });
        }),
        storePrefabUUID: jest.fn(),
        restorePrefabUUID: jest.fn(),
        generateSceneAsset: jest.fn(),
        removePrefabInstanceRoots: jest.fn(),
    },
}));

const mockRpcRequest = jest.fn();
jest.mock('../scene-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request: mockRpcRequest }) },
}));

import { Prefab } from 'cc';
import { SceneEditor } from '../scene-process/service/editors/scene-editor';
import { PrefabEditor } from '../scene-process/service/editors/prefab-editor';
import { sceneUtils } from '../scene-process/service/scene/utils';
import { editorPrefabUtils } from '../scene-process/service/prefab/prefab-editor-utils';
import { deletedLightmapAssets } from '../scene-process/service/baking/lightfx/deleted-lightmap-assets';

type CloseableEditor = SceneEditor | PrefabEditor;

function setOpen(editor: CloseableEditor): void {
    editor.setCurrentOpen({
        instance: {},
        identifier: {
            assetType: 'scene',
            assetName: 'asset',
            assetUuid: 'asset-uuid',
            assetUrl: 'db://assets/asset.scene',
        },
    } as never);
}

async function expectCloseSaveCalls(editor: CloseableEditor, options: { save?: boolean } | undefined, expectedCalls: number): Promise<void> {
    setOpen(editor);
    const save = jest.spyOn(editor, 'save').mockResolvedValue({} as never);

    await editor.close(options);

    expect(save).toHaveBeenCalledTimes(expectedCalls);
}

describe('Editor close options', () => {
    beforeEach(() => {
        mockRpcRequest.mockReset();
        (sceneUtils.loadAny as jest.Mock).mockReset().mockImplementation(async (uuid: string) => {
            const asset = new Prefab();
            (asset as any)._uuid = uuid;
            return asset;
        });
    });

    it('scene close saves by default and can skip save', async () => {
        await expectCloseSaveCalls(new SceneEditor(), undefined, 1);
        await expectCloseSaveCalls(new SceneEditor(), { save: false }, 0);
    });

    it('scene reload carries deleted Lightmap protection to the replacement Scene', async () => {
        const editor = new SceneEditor();
        setOpen(editor);
        const scene = editor.getRootNode()!;
        const replacement = {};
        (sceneUtils.runSceneImmediateByJson as jest.Mock).mockResolvedValue(replacement);
        (sceneUtils.generateNodeDump as jest.Mock).mockReturnValue({});
        deletedLightmapAssets.begin(scene, ['deleted-texture'])(['deleted-texture']);

        await editor.reload();

        expect(editor.getRootNode()).toBe(replacement);
        expect(deletedLightmapAssets.filter(replacement, { __uuid__: 'deleted-texture' }, 'serialized')).toBeNull();
        expect(deletedLightmapAssets.filter({}, { __uuid__: 'deleted-texture' }, 'serialized'))
            .toEqual({ __uuid__: 'deleted-texture' });
    });

    it('prefab close saves by default and can skip save', async () => {
        await expectCloseSaveCalls(new PrefabEditor(), undefined, 1);
        await expectCloseSaveCalls(new PrefabEditor(), { save: false }, 0);
    });

    it('scene and prefab saveAs write serialized content without changing the opened editor identity', async () => {
        const targetScene = { uuid: 'target-scene-uuid', url: 'db://assets/copied.scene', type: 'scene', name: 'copied' };
        const targetPrefab = { uuid: 'target-prefab-uuid', url: 'db://assets/copied.prefab', type: 'prefab', name: 'copied' };
        const sceneEditor = new SceneEditor();
        const prefabEditor = new PrefabEditor();
        setOpen(sceneEditor);
        setOpen(prefabEditor);
        (sceneUtils.serialize as jest.Mock).mockReturnValue('serialized-scene');
        (editorPrefabUtils.serialize as jest.Mock).mockReturnValue('serialized-prefab');
        mockRpcRequest
            .mockResolvedValueOnce(targetScene)
            .mockResolvedValueOnce(targetPrefab);

        await sceneEditor.saveAs(targetScene as never);
        await prefabEditor.saveAs(targetPrefab as never);

        expect(mockRpcRequest).toHaveBeenNthCalledWith(1, 'assetManager', 'saveAsset', [targetScene.uuid, 'serialized-scene']);
        expect(mockRpcRequest).toHaveBeenNthCalledWith(2, 'assetManager', 'saveAsset', [targetPrefab.uuid, 'serialized-prefab']);
        expect((sceneEditor as any).entity.identifier.assetUuid).toBe('asset-uuid');
        expect((prefabEditor as any).entity.identifier.assetUuid).toBe('asset-uuid');
    });

    it('saveAs rejects an unexpected saved UUID without changing the editor identifier', async () => {
        const editor = new SceneEditor();
        setOpen(editor);
        (sceneUtils.serialize as jest.Mock).mockReturnValue('serialized-scene');
        mockRpcRequest.mockResolvedValueOnce({ uuid: 'unexpected-uuid', url: 'db://assets/unexpected.scene', type: 'scene', name: 'unexpected' });

        await expect(editor.saveAs({ uuid: 'target-scene-uuid' } as never)).rejects.toThrow('保存目标资源标识不一致');

        expect((editor as any).entity.identifier.assetUuid).toBe('asset-uuid');
    });

    it('Prefab saveAs preserves the opened Prefab root and editor identity', async () => {
        const targetInfo = { uuid: 'target-prefab-uuid', url: 'db://assets/copied.prefab', type: 'prefab', name: 'copied' };
        const sourceAsset = { _uuid: 'source-prefab-uuid' };
        const nestedAsset = { _uuid: 'nested-prefab-uuid' };
        const root: any = {
            _prefab: { asset: sourceAsset, root: null, instance: undefined },
            walk(callback: (node: unknown) => void) {
                callback(this);
                callback(ownedChild);
                callback(nestedRoot);
            },
        };
        root._prefab.root = root;
        const ownedChild: any = { _prefab: { asset: sourceAsset, root, instance: undefined } };
        const nestedRoot: any = { _prefab: { asset: nestedAsset, root: null, instance: {} } };
        nestedRoot._prefab.root = nestedRoot;
        const editor = new PrefabEditor();
        editor.setCurrentOpen({
            instance: root,
            identifier: {
                assetType: 'prefab',
                assetName: 'source',
                assetUuid: sourceAsset._uuid,
                assetUrl: 'db://assets/source.prefab',
            },
        } as never);
        (editorPrefabUtils.serialize as jest.Mock).mockReturnValue('serialized-prefab');
        mockRpcRequest.mockResolvedValue(targetInfo);

        await editor.saveAs(targetInfo as never);

        expect(mockRpcRequest).toHaveBeenCalledWith('assetManager', 'saveAsset', [targetInfo.uuid, 'serialized-prefab']);
        expect(root._prefab.asset).toBe(sourceAsset);
        expect(ownedChild._prefab.asset).toBe(sourceAsset);
        expect(nestedRoot._prefab.asset).toBe(nestedAsset);
        expect((editor as any).entity.identifier.assetUuid).toBe(sourceAsset._uuid);
    });

});

describe('SceneEditor source revision lifecycle', () => {
    const sourceAsset = { uuid: 'scene', name: 'source', type: 'cc.SceneAsset', url: 'db://assets/source.scene' };
    const copyAsset = { uuid: 'copy', name: 'copy', type: 'cc.SceneAsset', url: 'db://assets/copy.scene' };
    let disk: Map<string, string>;
    let current: string;

    beforeEach(() => {
        disk = new Map([[sourceAsset.uuid, 'original'], [copyAsset.uuid, 'copy original']]);
        current = 'edited';
        (sceneUtils.loadAny as jest.Mock).mockReset().mockResolvedValue({});
        (sceneUtils.runScene as jest.Mock).mockReset().mockResolvedValue({});
        (sceneUtils.runSceneImmediateByJson as jest.Mock).mockReset().mockResolvedValue({});
        (sceneUtils.generateNodeDump as jest.Mock).mockReset().mockReturnValue({});
        (sceneUtils.serialize as jest.Mock).mockReset().mockImplementation(() => current);
        mockRpcRequest.mockReset().mockImplementation(async (_module: string, method: string, args: string[]) => {
            const [uuid, source, content] = args;
            if (method === 'querySceneSource') return disk.get(uuid);
            if (method === 'saveSceneSource') {
                if (disk.get(uuid) !== source) throw new Error('Scene source changed on disk');
                const importedSource = content + ':imported';
                disk.set(uuid, importedSource);
                return { asset: { uuid }, source: importedSource };
            }
            if (method === 'saveAsset') {
                disk.set(uuid, source);
                return { uuid };
            }
            throw new Error('Unexpected RPC: ' + method);
        });
    });

    it('advances the source revision after each successful save, including importer changes', async () => {
        const editor = new SceneEditor();
        await editor.open(sourceAsset as never);
        await editor.save();
        current = 'second edit';
        await editor.save();
        expect(mockRpcRequest).toHaveBeenNthCalledWith(2, 'assetManager', 'saveSceneSource', ['scene', 'original', 'edited']);
        expect(mockRpcRequest).toHaveBeenNthCalledWith(3, 'assetManager', 'saveSceneSource', ['scene', 'edited:imported', 'second edit']);
        expect(disk.get('scene')).toBe('second edit:imported');
    });

    it('keeps the prior revision when saving fails', async () => {
        const editor = new SceneEditor();
        await editor.open(sourceAsset as never);
        mockRpcRequest.mockRejectedValueOnce(new Error('save failed'));
        await expect(editor.save()).rejects.toThrow('save failed');
        await editor.save();
        expect(mockRpcRequest).toHaveBeenLastCalledWith('assetManager', 'saveSceneSource', ['scene', 'original', 'edited']);
    });

    it('keeps the prior revision when the save returns the wrong asset UUID', async () => {
        const editor = new SceneEditor();
        await editor.open(sourceAsset as never);
        mockRpcRequest.mockResolvedValueOnce({ asset: { uuid: 'wrong' }, source: 'wrong revision' });
        await expect(editor.save()).rejects.toThrow('保存目标资源标识不一致');
        await editor.save();
        expect(mockRpcRequest).toHaveBeenLastCalledWith('assetManager', 'saveSceneSource', ['scene', 'original', 'edited']);
    });

    it('does not adopt an external source change on same-scene open or in-memory reload', async () => {
        const editor = new SceneEditor();
        await editor.open(sourceAsset as never);
        disk.set('scene', 'external edit');
        await editor.open(sourceAsset as never);
        await editor.reload();
        await expect(editor.save()).rejects.toThrow('changed on disk');
        expect(mockRpcRequest.mock.calls.filter(([, method]) => method === 'querySceneSource')).toHaveLength(1);
        expect(disk.get('scene')).toBe('external edit');
    });

    it('preserves the open editor when default close is refused by a source conflict', async () => {
        const editor = new SceneEditor();
        await editor.open(sourceAsset as never);
        const instance = editor.getRootNode();
        disk.set('scene', 'external edit');
        await expect(editor.close()).rejects.toThrow('changed on disk');
        expect(editor.getRootNode()).toBe(instance);
        expect(disk.get('scene')).toBe('external edit');
    });

    it('records a fresh revision after closing without save and reopening', async () => {
        const editor = new SceneEditor();
        await editor.open(sourceAsset as never);
        await editor.close({ save: false });
        disk.set('scene', 'external edit');
        await editor.open(sourceAsset as never);
        await editor.save();
        expect(mockRpcRequest).toHaveBeenLastCalledWith('assetManager', 'saveSceneSource', ['scene', 'external edit', 'edited']);
    });

    it('keeps Save As to a different target independent of the opened source revision', async () => {
        const editor = new SceneEditor();
        await editor.open(sourceAsset as never);
        disk.set('scene', 'external edit');
        await editor.saveAs(copyAsset as never);
        expect(mockRpcRequest).toHaveBeenLastCalledWith('assetManager', 'saveAsset', ['copy', 'edited']);
        expect(disk.get('copy')).toBe('edited');
        await expect(editor.save()).rejects.toThrow('changed on disk');
        expect(mockRpcRequest).toHaveBeenLastCalledWith('assetManager', 'saveSceneSource', ['scene', 'original', 'edited']);
    });

    it('checks the revision when Save As targets the opened scene itself', async () => {
        const editor = new SceneEditor();
        await editor.open(sourceAsset as never);
        disk.set('scene', 'external edit');
        await expect(editor.saveAs(sourceAsset as never)).rejects.toThrow('changed on disk');
        expect(disk.get('scene')).toBe('external edit');
    });

    it('refuses to save the current scene if no source revision was established', async () => {
        const editor = new SceneEditor();
        setOpen(editor);
        await expect(editor.save()).rejects.toThrow('no source revision');
        expect(mockRpcRequest).not.toHaveBeenCalled();
    });
});
