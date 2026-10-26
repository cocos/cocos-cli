import { NodeType, type IUndoRedoResult, type SerializedNodeData } from '../common';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { Rpc } from '../main-process/rpc';
import { SceneTestEnv } from './scene-test-env';

describe('Serialized node creation integration', () => {
    let sourceUrl: string;
    let targetUrl: string;

    const createNode = async (name: string, parent = '/') => {
        const node = await NodeProxy.createByType({ path: parent, name, nodeType: NodeType.EMPTY });
        if (!node) {
            throw new Error('Failed to create test node.');
        }
        return node;
    };
    const resetUndo = () => Rpc.getInstance().request('Undo', 'clearHistory', []);
    const nodeRequest = (method: string, args: object[] = []) => (Rpc.getInstance() as {
        request(service: string, method: string, args: object[]): Promise<unknown>;
    }).request('Node', method, args);

    beforeAll(async () => {
        const source = await EditorProxy.create({ type: 'scene', baseName: 'SerializedSource', targetDirectory: SceneTestEnv.targetDirectoryURL });
        const target = await EditorProxy.create({ type: 'scene', baseName: 'SerializedTarget', targetDirectory: SceneTestEnv.targetDirectoryURL });
        sourceUrl = source.assetUrl;
        targetUrl = target.assetUrl;
    });

    beforeEach(async () => {
        await EditorProxy.open({ urlOrUUID: sourceUrl });
        const tree = await NodeProxy.queryNodeTree({ path: '/' });
        if (tree?.children.length) {
            for (const child of tree.children) {
                await NodeProxy.delete({ path: child.path });
            }
        }
        await resetUndo();
    });

    afterAll(async () => {
        await EditorProxy.close({ urlOrUUID: sourceUrl });
        await EditorProxy.close({ urlOrUUID: targetUrl });
    });

    it('serializes parent/child selections once without changing clipboard, dirty state or Undo', async () => {
        const parent = await createNode('Parent');
        const child = await createNode('Child', parent.path);
        await nodeRequest('copy', [{ paths: [child.path] }]);
        const clipboard = await nodeRequest('queryClipboardState');
        await resetUndo();
        const before = await NodeProxy.queryNodeTree({ path: '/' });

        const data = await NodeProxy.serialize({ paths: [child.path, parent.path, parent.path] });

        expect(data.rootTransforms).toHaveLength(1);
        expect(await NodeProxy.queryNodeTree({ path: '/' })).toEqual(before);
        expect(await nodeRequest('queryClipboardState')).toEqual(clipboard);
        expect(await Rpc.getInstance().request('Undo', 'isDirty', [])).toBe(false);
        expect(await Rpc.getInstance().request('Undo', 'canUndo', [])).toBe(false);
    });

    it('creates after closing the source, supports repeated creation, and undoes the complete batch', async () => {
        const a = await createNode('A');
        const b = await createNode('B');
        const data = JSON.parse(JSON.stringify(await NodeProxy.serialize({ paths: [a.path, b.path] }))) as SerializedNodeData;
        await EditorProxy.close({ urlOrUUID: sourceUrl });
        await EditorProxy.open({ urlOrUUID: targetUrl });
        await resetUndo();

        const paths = await NodeProxy.createBySerializedData({ data, parentPath: '/' });
        const created = await Promise.all(paths.map(path => NodeProxy.query({ path })));
        expect(created.map(node => node?.nodeId)).not.toEqual([a.nodeId, b.nodeId]);

        expect((await Rpc.getInstance().request('Undo', 'undo', []) as IUndoRedoResult).success).toBe(true);
        expect(await Rpc.getInstance().request('Undo', 'canUndo', [])).toBe(false);
        expect(await Rpc.getInstance().request('Undo', 'isDirty', [])).toBe(false);
        expect(await Promise.all(paths.map(path => NodeProxy.query({ path })))).toEqual([null, null]);

        expect((await Rpc.getInstance().request('Redo', 'redo', []) as IUndoRedoResult).success).toBe(true);
        expect((await Promise.all(paths.map(path => NodeProxy.query({ path })))).map(node => node?.nodeId))
            .toEqual(created.map(node => node?.nodeId));

        const repeated = await NodeProxy.createBySerializedData({ data, parentPath: '/' });
        expect(repeated.every(path => !paths.includes(path))).toBe(true);
        const repeatedNodes = await Promise.all(repeated.map(path => NodeProxy.query({ path })));
        expect(new Set([...created, ...repeatedNodes].map(node => node?.nodeId)).size).toBe(4);
    });

    it('keeps local transforms by default and uses recorded world transforms when requested', async () => {
        const source = await createNode('SourceParent');
        await NodeProxy.update({ path: source.path, properties: { position: { x: 100, y: 0, z: 0 } } });
        const child = await createNode('Child', source.path);
        await NodeProxy.update({ path: child.path, properties: { position: { x: 5, y: 0, z: 0 } } });
        const target = await createNode('TargetParent');
        await NodeProxy.update({ path: target.path, properties: { position: { x: 20, y: 0, z: 0 } } });
        const data = await NodeProxy.serialize({ paths: [child.path] });
        const [local] = await NodeProxy.createBySerializedData({ data, parentPath: target.path });
        const [world] = await NodeProxy.createBySerializedData({ data, parentPath: target.path, keepWorldTransform: true, siblingIndex: 0 });
        expect((await NodeProxy.query({ path: local }))?.properties.position?.x).toBe(5);
        expect((await NodeProxy.query({ path: world }))?.properties.position?.x).toBe(85);
        expect((await NodeProxy.queryNodeTree({ path: target.path }))?.children.map(node => node.path)).toEqual([world, local]);
    });

    it('keeps references between roots through creation and Redo', async () => {
        const a = await NodeProxy.createByType({ path: '/', name: 'A', nodeType: NodeType.BUTTON });
        const b = await createNode('B');
        const data = await NodeProxy.serialize({ paths: [a!.path, b.path] });
        const graph = JSON.parse(data.serialized);
        const bIndex = graph.findIndex((entry: { _id?: string }) => entry._id === b.nodeId);
        const button = graph.find((entry: { __type__?: string }) => entry.__type__ === 'cc.Button');
        expect(bIndex).toBeGreaterThanOrEqual(0);
        expect(button).toBeDefined();
        button._target = { __id__: bIndex };
        data.serialized = JSON.stringify(graph);
        await resetUndo();
        const paths = await NodeProxy.createBySerializedData({ data, parentPath: '/' });
        const checkReference = async () => {
            const copiedData = await NodeProxy.serialize({ paths });
            const copiedGraph = JSON.parse(copiedData.serialized);
            const copiedButton = copiedGraph.find((entry: { __type__?: string }) => entry.__type__ === 'cc.Button');
            const copiedB = await NodeProxy.query({ path: paths[1] });
            expect(copiedGraph[copiedButton._target.__id__]._id).toBe(copiedB!.nodeId);
        };
        await checkReference();
        await Rpc.getInstance().request('Undo', 'undo', []);
        expect((await Rpc.getInstance().request('Redo', 'redo', []) as IUndoRedoResult).success).toBe(true);
        await checkReference();
    });

    it('clears external references by default and resolves them only in the target Runtime', async () => {
        const a = await NodeProxy.createByType({ path: '/', name: 'A', nodeType: NodeType.BUTTON });
        const b = await createNode('External');
        const data = await NodeProxy.serialize({ paths: [a!.path] });
        const graph = JSON.parse(data.serialized);
        const button = graph.find((entry: { __type__?: string }) => entry.__type__ === 'cc.Button');
        button._target = { $nodeReference: 'external-test-reference' };
        data.externalReferences.push({ id: 'external-test-reference', type: 'node', uuid: b.nodeId });
        data.serialized = JSON.stringify(graph);

        const resolved = await NodeProxy.createBySerializedData({ data, parentPath: '/', externalReferences: 'resolve' });
        const resolvedData = await NodeProxy.serialize({ paths: resolved });
        expect(resolvedData.externalReferences.some(reference => reference.uuid === b.nodeId)).toBe(true);
        const cleared = await NodeProxy.createBySerializedData({ data, parentPath: '/' });
        expect((await NodeProxy.serialize({ paths: cleared })).externalReferences).toEqual([]);
    });

    it('preserves a prefab association and component data through creation and Redo', async () => {
        const prefab = await NodeProxy.createByAsset({ path: '/', name: 'Prefab', dbURL: 'db://internal/default_prefab/ui/Button.prefab' });
        const data = await NodeProxy.serialize({ paths: [prefab!.path] });
        const [path] = await NodeProxy.createBySerializedData({ data, parentPath: '/' });
        const created = await NodeProxy.query({ path });
        expect(created!.prefab).toBeTruthy();
        expect(created!.prefab!.asset).toEqual(prefab!.prefab!.asset);
        const serialized = await NodeProxy.serialize({ paths: [path] });
        expect(serialized.serialized).toContain('cc.Button');
        await Rpc.getInstance().request('Undo', 'undo', []);
        expect((await Rpc.getInstance().request('Redo', 'redo', []) as IUndoRedoResult).success).toBe(true);
        expect((await NodeProxy.query({ path }))!.prefab!.asset).toEqual(prefab!.prefab!.asset);
    });

    it('rejects invalid versions, missing parents and invalid indices without Dirty or Undo', async () => {
        const node = await createNode('Source');
        const data = await NodeProxy.serialize({ paths: [node.path] });
        await resetUndo();
        const before = await NodeProxy.queryNodeTree({ path: '/' });
        await expect(NodeProxy.createBySerializedData({ data: { ...data, version: 99 } as unknown as SerializedNodeData, parentPath: '/' })).rejects.toThrow();
        await expect(NodeProxy.createBySerializedData({ data, parentPath: '/Missing' })).rejects.toThrow();
        await expect(NodeProxy.createBySerializedData({ data, parentPath: '/', siblingIndex: 999 })).rejects.toThrow();
        expect(await NodeProxy.queryNodeTree({ path: '/' })).toEqual(before);
        expect(await Rpc.getInstance().request('Undo', 'canUndo', [])).toBe(false);
        expect(await Rpc.getInstance().request('Undo', 'isDirty', [])).toBe(false);
    });
});
