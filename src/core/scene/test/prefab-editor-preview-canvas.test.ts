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
    },
}));

import { instantiate } from 'cc';
import { sceneUtils } from '../scene-process/service/scene/utils';
import { PrefabEditor } from '../scene-process/service/editors/prefab-editor';

async function openPrefabWith(prefabRoot: any, scene = new MockScene('virtual-scene')): Promise<MockScene> {
    (sceneUtils.runScene as jest.Mock).mockResolvedValue(scene);
    (sceneUtils.loadAny as jest.Mock).mockResolvedValue({});
    (instantiate as unknown as jest.Mock).mockReturnValue(prefabRoot);

    await new PrefabEditor().open({
        uuid: 'prefab-uuid',
        name: 'LabelPrefab',
        type: 'prefab',
        url: 'db://assets/LabelPrefab.prefab',
    } as never);

    return scene;
}

describe('PrefabEditor preview Canvas', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('hosts a UI prefab without its own Canvas under an editor-only Canvas when opened', async () => {
        const scene = new MockScene('virtual-scene');
        const previewCanvas = { name: 'should_hide_in_hierarchy' };
        const prefabRoot = {
            name: 'LabelPrefab',
            parent: null,
            getComponentInChildren: jest.fn((type: unknown) => type === MockCanvas ? null : null),
            getComponentsInChildren: jest.fn((type: unknown) => type === MockUITransform ? [{}] : []),
        };

        createShouldHideInHierarchyCanvasNode.mockResolvedValue(previewCanvas);

        await openPrefabWith(prefabRoot, scene);

        expect(createShouldHideInHierarchyCanvasNode).toHaveBeenCalledWith(scene);
        expect(prefabRoot.parent).toBe(previewCanvas);
    });

    it('does not create a preview Canvas when the prefab already owns one', async () => {
        const prefabRoot = {
            name: 'CanvasPrefab',
            parent: null,
            getComponentInChildren: jest.fn((type: unknown) => type === MockCanvas ? {} : null),
            getComponentsInChildren: jest.fn((type: unknown) => type === MockUITransform ? [{}] : []),
        };

        const scene = await openPrefabWith(prefabRoot);

        expect(createShouldHideInHierarchyCanvasNode).not.toHaveBeenCalled();
        expect(prefabRoot.parent).toBe(scene);
    });

    it('does not create a preview Canvas for prefabs without UI components', async () => {
        const prefabRoot = {
            name: 'MeshPrefab',
            parent: null,
            getComponentInChildren: jest.fn(() => null),
            getComponentsInChildren: jest.fn(() => []),
        };

        const scene = await openPrefabWith(prefabRoot);

        expect(createShouldHideInHierarchyCanvasNode).not.toHaveBeenCalled();
        expect(prefabRoot.parent).toBe(scene);
    });
});
