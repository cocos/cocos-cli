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

import { SceneEditor } from '../scene-process/service/editors/scene-editor';
import { PrefabEditor } from '../scene-process/service/editors/prefab-editor';

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
    it('scene close saves by default and can skip save', async () => {
        await expectCloseSaveCalls(new SceneEditor(), undefined, 1);
        await expectCloseSaveCalls(new SceneEditor(), { save: false }, 0);
    });

    it('prefab close saves by default and can skip save', async () => {
        await expectCloseSaveCalls(new PrefabEditor(), undefined, 1);
        await expectCloseSaveCalls(new PrefabEditor(), { save: false }, 0);
    });
});
