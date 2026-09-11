import { NodeType } from '../../common';
import {
    createAnchoredTree,
    MockCanvas,
    MockNode,
    MockUITransform,
    mockCreateShouldHideInHierarchyCanvasNode,
    mockGetCurrentEditorType,
    mockGetRootNode,
    mockGetUICanvasNode,
    mockGetUITransformParentNode,
    mockInstantiate,
    mockLoadAny,
    mockNodeAtPath,
    mockPrefabAsset,
    mockQueryCanvasRequiredByAsset,
    mockRemovePrefabInfoFromNode,
    mockRpcRequest,
    mockScene,
    resetNodeCreateMocks,
} from './node-create-test-harness';

describe('NodeService Canvas requirement handling', () => {
    beforeEach(() => {
        resetNodeCreateMocks();
    });

    it('keeps empty nodes plain unless Canvas is explicitly requested', async () => {
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        service._createNode = jest.fn().mockResolvedValue({ path: '/Node' });

        await service.createByType({ path: '/', nodeType: NodeType.EMPTY, workMode: '2d' });

        expect(service._createNode).toHaveBeenCalledWith(null, false, true, expect.objectContaining({
            nodeType: NodeType.EMPTY,
            workMode: '2d',
        }));
    });

    it('honors explicit Canvas requests when creating empty nodes', async () => {
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        service._createNode = jest.fn().mockResolvedValue({ path: '/Node' });

        await service.createByType({ path: '/', nodeType: NodeType.EMPTY, workMode: '2d', canvasRequired: true });

        expect(service._createNode).toHaveBeenCalledWith(null, true, true, expect.objectContaining({
            nodeType: NodeType.EMPTY,
            workMode: '2d',
            canvasRequired: true,
        }));
    });

    it('does not create a Canvas when prefab handling is cancelled or omitted', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const parent = new MockNode('PrefabRoot');
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();

        await expect(service.checkCanvasRequired('2d', true, parent, undefined)).resolves.toBe(parent);

        expect(mockLoadAny).not.toHaveBeenCalled();
        expect(mockInstantiate).not.toHaveBeenCalled();
        expect(mockCreateShouldHideInHierarchyCanvasNode).not.toHaveBeenCalled();
    });

    it('creates a Canvas parent when the host selects the create-canvas prefab branch', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const parent = new MockNode('PrefabRoot');
        const canvas = new MockNode('Canvas');
        mockInstantiate.mockReturnValue(canvas);
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();

        await expect(service.checkCanvasRequired('2d', true, parent, undefined, 'create-canvas')).resolves.toBe(canvas);

        expect(mockLoadAny).toHaveBeenCalledTimes(1);
        expect(mockInstantiate).toHaveBeenCalledTimes(1);
        expect(mockRemovePrefabInfoFromNode).toHaveBeenCalledWith(canvas);
        expect(parent.addChild).toHaveBeenCalledWith(canvas);
    });

    it('adds UITransform to the prefab root when the host selects that prefab branch', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const scene = new MockNode('Scene');
        const root = new MockNode('PrefabRoot');
        const parent = new MockNode('ChildParent');
        const previewCanvas = new MockNode('PreviewCanvas');
        root.parent = scene;
        mockGetRootNode.mockReturnValue(root);
        mockCreateShouldHideInHierarchyCanvasNode.mockResolvedValue(previewCanvas);
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();

        await expect(service.checkCanvasRequired('2d', true, parent, undefined, 'add-root-ui-transform')).resolves.toBe(parent);

        expect(root.addComponent).toHaveBeenCalledWith('cc.UITransform');
        expect(mockCreateShouldHideInHierarchyCanvasNode).toHaveBeenCalledWith(mockScene, '2d');
        expect(root.parent).toBe(previewCanvas);
        expect(mockLoadAny).not.toHaveBeenCalled();
    });

    it('reuses an existing UITransform parent in prefab mode before using host handling', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const parent = new MockNode('ChildParent');
        const uiParent = new MockNode('UIParent');
        mockGetUITransformParentNode.mockReturnValue(uiParent);
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();

        await expect(service.checkCanvasRequired('2d', true, parent, undefined, 'create-canvas')).resolves.toBe(parent);

        expect(mockLoadAny).not.toHaveBeenCalled();
        expect(mockInstantiate).not.toHaveBeenCalled();
    });

    it('asks the host to choose prefab Canvas handling only when creation needs it', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const root = new MockNode('PrefabRoot');
        mockGetRootNode.mockReturnValue(root);
        const { NodeService } = require('../../scene-process/service/node');

        await expect(new NodeService().preflightCreate({
            path: '/',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        })).resolves.toMatchObject({
            action: 'choose-prefab-canvas-handling',
            canvasRequired: true,
            canvasPath: null,
            uiTransformPath: null,
            preflightToken: expect.any(String),
        });
    });

    it('resolves an existing Prefab root path before predicting missing path materialization', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const root = new MockNode('Node');
        mockGetRootNode.mockReturnValue(root);
        (global as any).EditorExtends.Node.getNodeByPath.mockReturnValue(root);
        const { NodeService } = require('../../scene-process/service/node');

        await expect(new NodeService().preflightCreate({
            path: 'Node',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        })).resolves.toMatchObject({
            action: 'choose-prefab-canvas-handling',
            canvasRequired: true,
            canvasPath: null,
            uiTransformPath: null,
            preflightToken: expect.any(String),
        });
    });

    it('returns existing UI context paths when creation can proceed directly', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const root = new MockNode('PrefabRoot');
        root.components.push(new MockUITransform());
        mockGetRootNode.mockReturnValue(root);
        mockGetUITransformParentNode.mockReturnValue(root);
        const { NodeService } = require('../../scene-process/service/node');

        await expect(new NodeService().preflightCreate({
            path: '/',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        })).resolves.toMatchObject({
            action: 'create',
            canvasRequired: true,
            canvasPath: null,
            uiTransformPath: '/PrefabRoot',
            preflightToken: expect.any(String),
        });
    });

    it('returns the reusable Canvas path when Canvas context exists', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const root = new MockNode('PrefabRoot');
        root.components.push(new MockCanvas());
        mockGetRootNode.mockReturnValue(root);
        mockGetUICanvasNode.mockReturnValue(root);
        const { NodeService } = require('../../scene-process/service/node');

        await expect(new NodeService().preflightCreate({
            path: '/',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        })).resolves.toMatchObject({
            action: 'create',
            canvasRequired: true,
            canvasPath: '/PrefabRoot',
            uiTransformPath: null,
            preflightToken: expect.any(String),
        });
    });

    it('reports the same Canvas node used by the creation context', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const root = new MockNode('PrefabRoot');
        const canvasContext = new MockNode('ReusableCanvas');
        mockGetRootNode.mockReturnValue(root);
        mockGetUICanvasNode.mockReturnValue(canvasContext);
        const { NodeService } = require('../../scene-process/service/node');

        await expect(new NodeService().preflightCreate({
            path: '/',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        })).resolves.toMatchObject({
            action: 'create',
            canvasRequired: true,
            canvasPath: '/ReusableCanvas',
            uiTransformPath: null,
            preflightToken: expect.any(String),
        });
    });

    it('does not prompt when a missing ordinary parent path will create UITransform', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const root = new MockNode('PrefabRoot');
        mockGetRootNode.mockReturnValue(root);
        const { NodeService } = require('../../scene-process/service/node');

        await expect(new NodeService().preflightCreate({
            path: '/PrefabRoot/NewParent',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        })).resolves.toMatchObject({
            action: 'create',
            canvasRequired: true,
            canvasPath: null,
            uiTransformPath: null,
            preflightToken: expect.any(String),
        });
    });

    it('derives Canvas requirements from assets during preflight', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        mockGetRootNode.mockReturnValue(new MockNode('PrefabRoot'));
        mockRpcRequest.mockImplementation((_service: string, method: string) => {
            if (method === 'queryAssetInfo') {
                return {
                    uuid: 'asset-uuid',
                    type: 'cc.BitmapFont',
                    imported: true,
                    invalid: false,
                };
            }
            return null;
        });
        mockQueryCanvasRequiredByAsset.mockResolvedValue(true);
        const { NodeService } = require('../../scene-process/service/node');

        await expect(new NodeService().preflightCreate({
            path: '/',
            dbURL: 'db://assets/font.fnt',
            workMode: '2d',
        })).resolves.toMatchObject({
            action: 'choose-prefab-canvas-handling',
            canvasRequired: true,
            canvasPath: null,
            uiTransformPath: null,
            preflightToken: expect.any(String),
        });
        expect(mockQueryCanvasRequiredByAsset).toHaveBeenCalledWith({
            uuid: 'asset-uuid',
            type: 'cc.BitmapFont',
            workMode: '2d',
        });
    });

    it('rejects a stale direct-create preflight token when prefab Canvas handling becomes required', async () => {
        const root = new MockNode('PrefabRoot');
        mockGetRootNode.mockReturnValue(root);
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        service._createNode = jest.fn().mockResolvedValue({ path: '/Node' });

        const preflight = await service.preflightCreate({
            path: '/',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        });
        expect(preflight.action).toBe('create');

        mockGetCurrentEditorType.mockReturnValue('prefab');
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(service.createByType({
            path: '/',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
            preflightToken: preflight.preflightToken,
        })).rejects.toThrow('Canvas context changed after preflight');
        consoleError.mockRestore();
        expect(service._createNode).not.toHaveBeenCalled();
    });

    it('preflights Canvas handling from the anchored sibling parent', async () => {
        const root = new MockNode('Root');
        const canvas = new MockNode('Canvas');
        const anchor = new MockNode('Anchor');
        root.addChild(canvas);
        canvas.addChild(anchor);
        mockGetRootNode.mockReturnValue(root);
        mockGetUICanvasNode.mockImplementation((node: MockNode) => node === canvas ? canvas : null);
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
            path === '/Canvas/Anchor' ? anchor : null
        ));

        const { NodeService } = require('../../scene-process/service/node');
        await expect(new NodeService().preflightCreate({
            path: '/Canvas/Anchor',
            insertSide: 'before',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        } as any)).resolves.toMatchObject({
            action: 'create',
            canvasRequired: true,
            canvasPath: '/Canvas',
        });
    });

    it.each(['before', 'after'] as const)(
        'creates a Canvas wrapper at the anchored %s entry position when none exists',
        async insertSide => {
            const { root, anchor } = createAnchoredTree();
            mockGetRootNode.mockReturnValue(root);
            mockPrefabAsset('Button');
            mockNodeAtPath('/Anchor', anchor);

            const { NodeService } = require('../../scene-process/service/node');
            const service = new NodeService();
            const params = {
                path: '/Anchor',
                insertSide,
                nodeType: NodeType.BUTTON,
                workMode: '2d',
                canvasRequired: true,
            } as const;
            const preflight = await service.preflightCreate(params);

            expect(preflight).toMatchObject({
                action: 'create',
                canvasRequired: true,
                canvasPath: null,
            });

            await expect(service.createByType({
                ...params,
                preflightToken: preflight.preflightToken,
            } as any)).resolves.toMatchObject({ path: expect.any(String) });

            expect(root.children.map(child => child.name)).toEqual(
                insertSide === 'before'
                    ? ['Before', 'Canvas', 'Anchor', 'After']
                    : ['Before', 'Anchor', 'Canvas', 'After'],
            );
            const canvas = root.children.find(child => child.name === 'Canvas');
            expect(canvas?.children.map(child => child.name)).toEqual(['Button']);
            expect(anchor.children).toEqual([]);
        },
    );

    it.each(['before', 'after'] as const)(
        'creates an asset-required Canvas wrapper at the anchored %s entry position when none exists',
        async insertSide => {
            const { root, anchor } = createAnchoredTree();
            mockGetRootNode.mockReturnValue(root);
            mockPrefabAsset('AssetInstance', true);
            mockQueryCanvasRequiredByAsset.mockResolvedValue(true);
            mockNodeAtPath('/Anchor', anchor);

            const { NodeService } = require('../../scene-process/service/node');
            const service = new NodeService();
            const params = {
                path: '/Anchor',
                insertSide,
                dbURL: 'db://assets/Asset.prefab',
                workMode: '2d',
            } as const;
            const preflight = await service.preflightCreate(params);

            await expect(service.createByAsset({
                ...params,
                preflightToken: preflight.preflightToken,
            } as any)).resolves.toMatchObject({ path: expect.any(String) });

            expect(root.children.map(child => child.name)).toEqual(
                insertSide === 'before'
                    ? ['Before', 'Canvas', 'Anchor', 'After']
                    : ['Before', 'Anchor', 'Canvas', 'After'],
            );
            const canvas = root.children.find(child => child.name === 'Canvas');
            expect(canvas?.children.map(child => child.name)).toEqual(['AssetInstance']);
        },
    );

    it('does not attach a new Canvas when the anchor becomes stale during Canvas loading', async () => {
        const { root, anchor } = createAnchoredTree();
        const replacementParent = new MockNode('ReplacementParent');
        mockGetRootNode.mockReturnValue(root);
        mockPrefabAsset('Button');
        let resolveCanvasAsset: (asset: object) => void;
        mockLoadAny.mockImplementation(() => new Promise<object>(resolve => {
            resolveCanvasAsset = resolve;
        }));
        mockNodeAtPath('/Anchor', anchor);

        const { NodeService } = require('../../scene-process/service/node');
        const creation = new NodeService().createByType({
            path: '/Anchor',
            insertSide: 'before',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
            canvasRequired: true,
        } as any);
        await new Promise<void>(resolve => setImmediate(resolve));
        anchor.setParent(replacementParent);
        resolveCanvasAsset!({});

        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(creation).rejects.toThrow('stale');
        consoleError.mockRestore();
        expect(root.children.map(child => child.name)).toEqual(['Before', 'After']);
        expect(root.children.some(child => child.name === 'Canvas')).toBe(false);
    });

    it.each(['before', 'after'] as const)(
        'places a Prefab Canvas wrapper at the anchored %s entry position after the host chooses create-canvas',
        async insertSide => {
            const { root, anchor } = createAnchoredTree(undefined, 'PrefabRoot');
            mockGetCurrentEditorType.mockReturnValue('prefab');
            mockGetRootNode.mockReturnValue(root);
            mockPrefabAsset('Button');
            mockNodeAtPath('/Anchor', anchor);

            const { NodeService } = require('../../scene-process/service/node');
            const service = new NodeService();
            const params = {
                path: '/Anchor',
                insertSide,
                nodeType: NodeType.BUTTON,
                workMode: '2d',
                canvasRequired: true,
            } as const;
            const preflight = await service.preflightCreate(params);

            expect(preflight).toMatchObject({
                action: 'choose-prefab-canvas-handling',
                canvasRequired: true,
            });

            await expect(service.createByType({
                ...params,
                preflightToken: preflight.preflightToken,
                prefabCanvasHandling: 'create-canvas',
            } as any)).resolves.toMatchObject({ path: expect.any(String) });

            expect(root.children.map(child => child.name)).toEqual(
                insertSide === 'before'
                    ? ['Before', 'Canvas', 'Anchor', 'After']
                    : ['Before', 'Anchor', 'Canvas', 'After'],
            );
            const canvas = root.children.find(child => child.name === 'Canvas');
            expect(canvas?.children.map(child => child.name)).toEqual(['Button']);
        },
    );

    it('keeps the captured anchor when add-root-ui-transform reparents the Prefab root', async () => {
        const { root, anchor } = createAnchoredTree(undefined, 'PrefabRoot');
        const host = new MockNode('SceneHost');
        const previewCanvas = new MockNode('PreviewCanvas');
        root.parent = host;
        mockGetCurrentEditorType.mockReturnValue('prefab');
        mockGetRootNode.mockReturnValue(root);
        mockPrefabAsset('Button');
        let anchorPathIsResolvable = true;
        mockCreateShouldHideInHierarchyCanvasNode.mockImplementation(async () => {
            anchorPathIsResolvable = false;
            return previewCanvas;
        });
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
            path === '/Anchor' && anchorPathIsResolvable ? anchor : null
        ));

        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        const params = {
            path: '/Anchor',
            insertSide: 'before',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
            canvasRequired: true,
        } as const;
        const preflight = await service.preflightCreate(params);

        await expect(service.createByType({
            ...params,
            preflightToken: preflight.preflightToken,
            prefabCanvasHandling: 'add-root-ui-transform',
        } as any)).resolves.toMatchObject({ path: expect.any(String) });

        expect(root.children.map(child => child.name)).toEqual(['Before', 'Button', 'Anchor', 'After']);
        expect(root.components.some(component => component instanceof MockUITransform)).toBe(true);
    });

    it.each(['before', 'after'] as const)(
        'keeps an anchored %s create beside its anchor inside an existing Canvas ancestor',
        async insertSide => {
            const { root, parent: container, anchor } = createAnchoredTree('Container');
            const canvas = new MockNode('Canvas');
            container.setParent(canvas);
            root.addChild(canvas);
            mockGetRootNode.mockReturnValue(root);
            // getUICanvasNode returns the requested node when one of its ancestors is a Canvas.
            mockGetUICanvasNode.mockImplementation((node: MockNode) =>
                node === container ? container : null,
            );
            mockPrefabAsset('Button');
            mockNodeAtPath('/Canvas/Container/Anchor', anchor);

            const { NodeService } = require('../../scene-process/service/node');
            const service = new NodeService();
            const params = {
                path: '/Canvas/Container/Anchor',
                insertSide,
                nodeType: NodeType.BUTTON,
                workMode: '2d',
            } as const;
            const preflight = await service.preflightCreate(params);

            await expect(service.createByType({
                ...params,
                preflightToken: preflight.preflightToken,
            } as any)).resolves.toMatchObject({ path: expect.any(String) });

            expect(container.children.map(child => child.name)).toEqual(
                insertSide === 'before'
                    ? ['Before', 'Button', 'Anchor', 'After']
                    : ['Before', 'Anchor', 'Button', 'After'],
            );
            expect(anchor.children).toEqual([]);
        },
    );

    it('reuses an existing Canvas child instead of creating a second wrapper', async () => {
        const { root, parent, anchor } = createAnchoredTree('Parent');
        const canvas = new MockNode('Canvas');
        parent.addChild(canvas);
        mockGetRootNode.mockReturnValue(root);
        mockGetUICanvasNode.mockImplementation((node: MockNode) => node === parent ? canvas : null);
        mockPrefabAsset('Button');
        mockNodeAtPath('/Parent/Anchor', anchor);

        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        const params = {
            path: '/Parent/Anchor',
            insertSide: 'before',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        } as const;
        const preflight = await service.preflightCreate(params);

        await expect(service.createByType({
            ...params,
            preflightToken: preflight.preflightToken,
        } as any)).resolves.toMatchObject({ path: expect.any(String) });

        expect(parent.children.map(child => child.name)).toEqual(['Before', 'Anchor', 'After', 'Canvas']);
        expect(canvas.children.map(child => child.name)).toEqual(['Button']);
        expect(mockInstantiate).not.toHaveBeenCalled();
    });

});
