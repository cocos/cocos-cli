import { NodeType } from '../../common';
import {
    createAnchoredTree,
    MockNode,
    mockGetRootNode,
    mockNodeAtPath,
    mockPrefabAsset,
    resetNodeCreateMocks,
} from './node-create-test-harness';

type CreateKind = 'type' | 'asset';
type InsertSide = 'before' | 'after';

const placementCases: Array<{
    kind: CreateKind;
    insertSide: InsertSide;
    createdName: string;
}> = [
    { kind: 'type', insertSide: 'before', createdName: 'Inserted' },
    { kind: 'type', insertSide: 'after', createdName: 'Inserted' },
    { kind: 'asset', insertSide: 'before', createdName: 'AssetInstance' },
    { kind: 'asset', insertSide: 'after', createdName: 'AssetInstance' },
];

describe('NodeService anchored creation', () => {
    beforeEach(() => {
        resetNodeCreateMocks();
    });

    it.each(placementCases)(
        'inserts a node created by $kind $insertSide the sibling anchor',
        async ({ kind, insertSide, createdName }) => {
            const { root, parent, anchor } = createAnchoredTree('Parent');
            mockGetRootNode.mockReturnValue(root);
            mockNodeAtPath('/Parent/Anchor', anchor);
            if (kind === 'asset') {
                mockPrefabAsset();
            }

            const { NodeService } = require('../../scene-process/service/node');
            const service = new NodeService();
            if (kind === 'type') {
                await service.createByType({
                    path: '/Parent/Anchor',
                    insertSide,
                    name: createdName,
                    nodeType: NodeType.EMPTY,
                });
            } else {
                await service.createByAsset({
                    path: '/Parent/Anchor',
                    insertSide,
                    dbURL: 'db://assets/Asset.prefab',
                });
            }

            expect(parent.children.map(child => child.name)).toEqual(
                insertSide === 'before'
                    ? ['Before', createdName, 'Anchor', 'After']
                    : ['Before', 'Anchor', createdName, 'After'],
            );
            expect(anchor.children).toEqual([]);
        },
    );

    it('keeps direct-parent append behavior for type and asset creation without an insertion side', async () => {
        const root = new MockNode('Root');
        const parent = new MockNode('Parent');
        const existing = new MockNode('Existing');
        root.addChild(parent);
        parent.addChild(existing);
        mockGetRootNode.mockReturnValue(root);
        mockNodeAtPath('/Parent', parent);
        mockPrefabAsset();

        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        await service.createByType({ path: '/Parent', name: 'TypeInstance', nodeType: NodeType.EMPTY });
        await service.createByAsset({ path: '/Parent', dbURL: 'db://assets/Asset.prefab' });

        expect(parent.children.map(child => child.name)).toEqual(['Existing', 'TypeInstance', 'AssetInstance']);
    });

    it('rejects a missing sibling anchor without materializing a fallback path', async () => {
        const root = new MockNode('Root');
        mockGetRootNode.mockReturnValue(root);
        const { NodeService } = require('../../scene-process/service/node');
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await expect(
            new NodeService().createByType({
                path: '/MissingAnchor',
                insertSide: 'before',
                nodeType: NodeType.EMPTY,
            }),
        ).rejects.toThrow('anchor');

        consoleError.mockRestore();
        expect(root.children).toEqual([]);
    });

    it('binds the insertion side to the preflight token', async () => {
        const { root, anchor } = createAnchoredTree('Parent');
        mockGetRootNode.mockReturnValue(root);
        mockNodeAtPath('/Parent/Anchor', anchor);

        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        service._createNode = jest.fn().mockResolvedValue({ path: '/Parent/Inserted' });
        const preflight = await service.preflightCreate({
            path: '/Parent/Anchor',
            insertSide: 'before',
            nodeType: NodeType.EMPTY,
            prefabCanvasHandling: 'create-canvas',
        });
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await expect(
            service.createByType({
                path: '/Parent/Anchor',
                insertSide: 'after',
                nodeType: NodeType.EMPTY,
                prefabCanvasHandling: 'add-root-ui-transform',
                preflightToken: preflight.preflightToken,
            }),
        ).rejects.toThrow('does not match the request');

        consoleError.mockRestore();
        expect(service._createNode).not.toHaveBeenCalled();
    });

    it('rejects a preflight token when the anchored node was replaced at the same path', async () => {
        const { root, parent, anchor: originalAnchor } = createAnchoredTree('Parent');
        mockGetRootNode.mockReturnValue(root);
        let anchor = originalAnchor;
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) =>
            path === '/Parent/Anchor' ? anchor : null,
        );

        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        service._createNode = jest.fn().mockResolvedValue({ path: '/Parent/Inserted' });
        const preflight = await service.preflightCreate({
            path: '/Parent/Anchor',
            insertSide: 'before',
            nodeType: NodeType.EMPTY,
        });
        anchor = new MockNode('ReplacementAnchor');
        parent.addChild(anchor);
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await expect(
            service.createByType({
                path: '/Parent/Anchor',
                insertSide: 'before',
                nodeType: NodeType.EMPTY,
                preflightToken: preflight.preflightToken,
            }),
        ).rejects.toThrow('stale anchor');

        consoleError.mockRestore();
        expect(service._createNode).not.toHaveBeenCalled();
    });
});
