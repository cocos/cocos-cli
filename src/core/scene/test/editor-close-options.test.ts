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
        serialize: jest.fn(),
    },
}));

jest.mock('../scene-process/service/prefab/prefab-editor-utils', () => ({
    editorPrefabUtils: {
        serialize: jest.fn(),
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

import { SceneEditor } from '../scene-process/service/editors/scene-editor';
import { PrefabEditor } from '../scene-process/service/editors/prefab-editor';
import { sceneUtils } from '../scene-process/service/scene/utils';
import { editorPrefabUtils } from '../scene-process/service/prefab/prefab-editor-utils';

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
    });

    it('scene close saves by default and can skip save', async () => {
        await expectCloseSaveCalls(new SceneEditor(), undefined, 1);
        await expectCloseSaveCalls(new SceneEditor(), { save: false }, 0);
    });

    it('prefab close saves by default and can skip save', async () => {
        await expectCloseSaveCalls(new PrefabEditor(), undefined, 1);
        await expectCloseSaveCalls(new PrefabEditor(), { save: false }, 0);
    });

    it('scene and prefab saveTo write serialized content to the target asset', async () => {
        const targetScene = { uuid: 'target-scene-uuid', url: 'db://assets/recovered.scene', type: 'scene', name: 'recovered' };
        const targetPrefab = { uuid: 'target-prefab-uuid', url: 'db://assets/recovered.prefab', type: 'prefab', name: 'recovered' };
        const sceneEditor = new SceneEditor();
        const prefabEditor = new PrefabEditor();
        setOpen(sceneEditor);
        setOpen(prefabEditor);
        (sceneUtils.serialize as jest.Mock).mockReturnValue('serialized-scene');
        (editorPrefabUtils.serialize as jest.Mock).mockReturnValue('serialized-prefab');
        mockRpcRequest.mockResolvedValueOnce(targetScene).mockResolvedValueOnce(targetPrefab);

        await sceneEditor.saveTo(targetScene as never);
        await prefabEditor.saveTo(targetPrefab as never);

        expect(mockRpcRequest).toHaveBeenNthCalledWith(1, 'assetManager', 'saveAsset', [targetScene.uuid, 'serialized-scene']);
        expect(mockRpcRequest).toHaveBeenNthCalledWith(2, 'assetManager', 'saveAsset', [targetPrefab.uuid, 'serialized-prefab']);
        expect((sceneEditor as any).entity.identifier.assetUuid).toBe(targetScene.uuid);
        expect((prefabEditor as any).entity.identifier.assetUuid).toBe(targetPrefab.uuid);
    });

    it('saveTo rejects an unexpected saved UUID without changing the editor identifier', async () => {
        const editor = new SceneEditor();
        setOpen(editor);
        (sceneUtils.serialize as jest.Mock).mockReturnValue('serialized-scene');
        mockRpcRequest.mockResolvedValueOnce({ uuid: 'unexpected-uuid', url: 'db://assets/unexpected.scene', type: 'scene', name: 'unexpected' });

        await expect(editor.saveTo({ uuid: 'target-scene-uuid' } as never)).rejects.toThrow('保存目标资源标识不一致');

        expect((editor as any).entity.identifier.assetUuid).toBe('asset-uuid');
    });
});
