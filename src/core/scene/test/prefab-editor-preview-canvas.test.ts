const createShouldHideInHierarchyCanvasNode = jest.fn();

class MockCanvas { }
class MockUITransform { }

class MockScene {
    name: string;
    children: any[] = [];

    constructor(name = '') {
        this.name = name;
    }

    addChild(node: any): void {
        this.children.push(node);
        node.parent = this;
    }
}

jest.mock('cc', () => ({
    Canvas: MockCanvas,
    UITransform: MockUITransform,
    Scene: MockScene,
    Node: class Node { },
    Prefab: class Prefab {
        static _utils: { applyTargetOverrides: jest.Mock } = { applyTargetOverrides: jest.fn() };
    },
    find: jest.fn(),
    instantiate: jest.fn(),
}));

jest.mock('../scene-process/service/scene/utils', () => ({
    sceneUtils: {
        generateNodeDump: jest.fn(async () => ({})),
        loadAny: jest.fn(),
        runScene: jest.fn(),
        runSceneImmediateByJson: jest.fn(),
    },
}));

jest.mock('../scene-process/service/node/node-create', () => ({
    createShouldHideInHierarchyCanvasNode,
}));

jest.mock('../scene-process/service/prefab/prefab-editor-utils', () => ({
    editorPrefabUtils: {
        serialize: jest.fn(),
        storePrefabUUID: jest.fn(),
        restorePrefabUUID: jest.fn(),
        generateSceneAsset: jest.fn(),
        removePrefabInstanceRoots: jest.fn(),
        preparePrefabRootForEditing: jest.fn((node: any) => {
            if (node?._prefab) {
                node._prefab.instance = undefined;
            }
        }),
    },
}));

import { find, instantiate } from 'cc';
import { sceneUtils } from '../scene-process/service/scene/utils';
import { PrefabEditor } from '../scene-process/service/editors/prefab-editor';

function createPrefabRoot(name: string, options?: { hasCanvas?: boolean; hasUI?: boolean; nestedChild?: any }) {
    return {
        name,
        uuid: `${name}-uuid`,
        parent: null,
        children: options?.nestedChild ? [options.nestedChild] : [],
        _prefab: { fileId: `${name}-file-id`, instance: { fileId: `${name}-instance-file-id` } },
        getComponentInChildren: jest.fn((type: unknown) => type === MockCanvas && options?.hasCanvas ? {} : null),
        getComponentsInChildren: jest.fn((type: unknown) => type === MockUITransform && options?.hasUI !== false ? [{}] : []),
    };
}

async function openPrefabWith(prefabRoot: any, scene = new MockScene('virtual-scene')): Promise<{ editor: PrefabEditor; scene: MockScene; }> {
    (sceneUtils.runScene as jest.Mock).mockResolvedValue(scene);
    (sceneUtils.loadAny as jest.Mock).mockResolvedValue({});
    (instantiate as unknown as jest.Mock).mockReturnValue(prefabRoot);
    const editor = new PrefabEditor();

    await editor.open({
        uuid: 'prefab-uuid',
        name: 'LabelPrefab',
        type: 'prefab',
        url: 'db://assets/LabelPrefab.prefab',
    } as never);

    return { editor, scene };
}

describe('PrefabEditor preview Canvas', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (globalThis as any).EditorExtends = {
            serialize: jest.fn(() => ({ json: 'scene-asset' })),
            Node: {
                getNode: jest.fn(),
            },
        };
    });

    afterEach(() => {
        delete (globalThis as any).EditorExtends;
    });

    it('hosts a UI prefab without its own Canvas under an editor-only Canvas when opened', async () => {
        const scene = new MockScene('virtual-scene');
        const previewCanvas = { name: 'should_hide_in_hierarchy' };
        const prefabRoot = createPrefabRoot('LabelPrefab');

        createShouldHideInHierarchyCanvasNode.mockResolvedValue(previewCanvas);

        await openPrefabWith(prefabRoot, scene);

        expect(createShouldHideInHierarchyCanvasNode).toHaveBeenCalledWith(scene);
        expect(prefabRoot.parent).toBe(previewCanvas);
    });

    it('does not create a preview Canvas when the prefab already owns one', async () => {
        const prefabRoot = createPrefabRoot('CanvasPrefab', { hasCanvas: true });

        const { scene } = await openPrefabWith(prefabRoot);

        expect(createShouldHideInHierarchyCanvasNode).not.toHaveBeenCalled();
        expect(prefabRoot.parent).toBe(scene);
    });

    it('does not create a preview Canvas for prefabs without UI components', async () => {
        const prefabRoot = createPrefabRoot('MeshPrefab', { hasUI: false });

        const { scene } = await openPrefabWith(prefabRoot);

        expect(createShouldHideInHierarchyCanvasNode).not.toHaveBeenCalled();
        expect(prefabRoot.parent).toBe(scene);
    });

    it('clears root prefab instance but keeps nested child instance when opened', async () => {
        const nestedChild = createPrefabRoot('NestedChild');
        const prefabRoot = createPrefabRoot('RootPrefab', { nestedChild });

        await openPrefabWith(prefabRoot);

        expect(prefabRoot._prefab.instance).toBeUndefined();
        expect(nestedChild._prefab.instance).toEqual({ fileId: 'NestedChild-instance-file-id' });
    });

    it('clears reloaded root prefab instance but keeps nested child instance after reload', async () => {
        const nestedChild = createPrefabRoot('NestedChild');
        const openedRoot = createPrefabRoot('RootPrefab', { nestedChild });
        const { editor } = await openPrefabWith(openedRoot);
        const reloadedNestedChild = createPrefabRoot('ReloadedNestedChild');
        const reloadedRoot = createPrefabRoot('RootPrefab', { nestedChild: reloadedNestedChild });
        const reloadedScene = new MockScene('reloaded-scene');

        (sceneUtils.runSceneImmediateByJson as jest.Mock).mockResolvedValue(reloadedScene);
        ((globalThis as any).EditorExtends.Node.getNode as jest.Mock).mockReturnValue(reloadedRoot);
        (find as unknown as jest.Mock).mockReturnValue(null);

        await editor.reload();

        expect(reloadedRoot._prefab.instance).toBeUndefined();
        expect(reloadedNestedChild._prefab.instance).toEqual({ fileId: 'ReloadedNestedChild-instance-file-id' });
    });
});
