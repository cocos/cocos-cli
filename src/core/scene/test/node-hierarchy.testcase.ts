import {
    type ICreateByNodeTypeParams,
    type IQueryNodeTreeParams,
    type INodeInfo,
    type ISetParentParams,
    type IReorderParams,
    type ICopyParams,
    type IPasteParams,
    type IDuplicateParams,
    type ICutParams,
    type IClipboardState,
    NodeType,
} from '../common';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { Rpc } from '../main-process/rpc';
import { SceneTestEnv } from './scene-test-env';

const rpcRequest = (method: string, args?: any[]) =>
    (Rpc.getInstance() as any).request('Node', method, args);

function setParent(params: ISetParentParams): Promise<string[]> {
    return rpcRequest('setParent', [params]);
}

function reorder(params: IReorderParams): Promise<boolean> {
    return rpcRequest('reorder', [params]);
}

function copy(params: ICopyParams): Promise<string[]> {
    return rpcRequest('copy', [params]);
}

function paste(params: IPasteParams): Promise<string[]> {
    return rpcRequest('paste', [params]);
}

function duplicate(params: IDuplicateParams): Promise<string[]> {
    return rpcRequest('duplicate', [params]);
}

function cut(params: ICutParams): Promise<string[]> {
    return rpcRequest('cut', [params]);
}

function queryClipboardState(): Promise<IClipboardState> {
    return rpcRequest('queryClipboardState');
}

async function getChildNames(parentPath: string): Promise<string[]> {
    const tree = await NodeProxy.queryNodeTree({ path: parentPath } as IQueryNodeTreeParams);
    if (!tree) return [];
    return tree.children.map((c: any) => c.name);
}

describe('Node 层级操作测试', () => {

    beforeAll(async () => {
        await EditorProxy.open({ urlOrUUID: SceneTestEnv.sceneURL });
    });

    afterAll(async () => {
        await EditorProxy.close({ urlOrUUID: SceneTestEnv.sceneURL });
    });

    describe('1. setParent - 移动节点到新父节点', () => {
        let parentA: INodeInfo | null = null;
        let parentB: INodeInfo | null = null;
        let child: INodeInfo | null = null;

        beforeAll(async () => {
            parentA = await NodeProxy.createByType({ path: '/', name: 'ParentA', nodeType: NodeType.EMPTY });
            parentB = await NodeProxy.createByType({ path: '/', name: 'ParentB', nodeType: NodeType.EMPTY });
            child = await NodeProxy.createByType({ path: parentA!.path, name: 'MovableChild', nodeType: NodeType.EMPTY });
        });

        afterAll(async () => {
            await NodeProxy.delete({ path: parentA!.path, keepWorldTransform: false }).catch(() => {});
            await NodeProxy.delete({ path: parentB!.path, keepWorldTransform: false }).catch(() => {});
        });

        it('将子节点从 ParentA 移到 ParentB', async () => {
            const result = await setParent({
                paths: [child!.path],
                parentPath: parentB!.path,
            });
            expect(Array.isArray(result)).toBe(true);

            const childrenB = await getChildNames(parentB!.path);
            expect(childrenB).toContain('MovableChild');

            const childrenA = await getChildNames(parentA!.path);
            expect(childrenA).not.toContain('MovableChild');

            child!.path = `${parentB!.path}/MovableChild`;
        });

        it('移动多个节点', async () => {
            const c1 = await NodeProxy.createByType({ path: parentB!.path, name: 'Multi1', nodeType: NodeType.EMPTY });
            const c2 = await NodeProxy.createByType({ path: parentB!.path, name: 'Multi2', nodeType: NodeType.EMPTY });

            const result = await setParent({
                paths: [c1!.path, c2!.path],
                parentPath: parentA!.path,
            });
            expect(Array.isArray(result)).toBe(true);

            const childrenA = await getChildNames(parentA!.path);
            expect(childrenA).toContain('Multi1');
            expect(childrenA).toContain('Multi2');
        });
    });

    describe('2. reorder - 节点排序', () => {
        let parent: INodeInfo | null = null;

        beforeAll(async () => {
            parent = await NodeProxy.createByType({ path: '/', name: 'ReorderParent', nodeType: NodeType.EMPTY });
            await NodeProxy.createByType({ path: parent!.path, name: 'Child_0', nodeType: NodeType.EMPTY });
            await NodeProxy.createByType({ path: parent!.path, name: 'Child_1', nodeType: NodeType.EMPTY });
            await NodeProxy.createByType({ path: parent!.path, name: 'Child_2', nodeType: NodeType.EMPTY });
        });

        afterAll(async () => {
            await NodeProxy.delete({ path: parent!.path, keepWorldTransform: false }).catch(() => {});
        });

        it('将第一个子节点移到最后', async () => {
            const result = await reorder({ path: parent!.path, target: 0, offset: 2 });
            expect(result).toBe(true);

            const children = await getChildNames(parent!.path);
            expect(children[0]).toBe('Child_1');
            expect(children[1]).toBe('Child_2');
            expect(children[2]).toBe('Child_0');
        });

        it('将最后一个子节点移到第一个', async () => {
            const result = await reorder({ path: parent!.path, target: 2, offset: -2 });
            expect(result).toBe(true);

            const children = await getChildNames(parent!.path);
            expect(children[0]).toBe('Child_0');
        });
    });

    describe('3. copy / paste - 复制粘贴', () => {
        let parent: INodeInfo | null = null;
        let original: INodeInfo | null = null;

        beforeAll(async () => {
            parent = await NodeProxy.createByType({ path: '/', name: 'CopyParent', nodeType: NodeType.EMPTY });
            original = await NodeProxy.createByType({ path: parent!.path, name: 'Original', nodeType: NodeType.EMPTY });
        });

        afterAll(async () => {
            await NodeProxy.delete({ path: parent!.path, keepWorldTransform: false }).catch(() => {});
        });

        it('copy 返回被复制节点的 uuid 列表', async () => {
            const result = await copy({ paths: [original!.path] });
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(1);
        });

        it('paste 到同一父节点下，新节点自动重命名', async () => {
            await copy({ paths: [original!.path] });
            const result = await paste({ parentPath: parent!.path });
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);

            const children = await getChildNames(parent!.path);
            expect(children).toContain('Original');
            expect(children.length).toBeGreaterThanOrEqual(2);
        });

        it('paste 到不同父节点下', async () => {
            const otherParent = await NodeProxy.createByType({ path: '/', name: 'PasteTarget', nodeType: NodeType.EMPTY });
            await copy({ paths: [original!.path] });
            const result = await paste({ parentPath: otherParent!.path });
            expect(Array.isArray(result)).toBe(true);

            const children = await getChildNames(otherParent!.path);
            expect(children).toContain('Original');

            await NodeProxy.delete({ path: otherParent!.path, keepWorldTransform: false });
        });

        it('paste 不指定父节点，粘贴到根节点', async () => {
            await copy({ paths: [original!.path] });
            const result = await paste({});
            expect(Array.isArray(result)).toBe(true);

            const rootChildren = await getChildNames('/');
            expect(rootChildren).toContain('Original');

            // 清理粘贴到根的节点
            const pastedNodes = rootChildren.filter(n => n === 'Original' || n.startsWith('Original_'));
            for (const name of pastedNodes) {
                await NodeProxy.delete({ path: name, keepWorldTransform: false }).catch(() => {});
            }
        });

        it('copy 多个节点并 paste', async () => {
            const node2 = await NodeProxy.createByType({ path: parent!.path, name: 'Original2', nodeType: NodeType.EMPTY });
            await copy({ paths: [original!.path, node2!.path] });
            const result = await paste({ parentPath: parent!.path });
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(2);
        });
    });

    describe('4. duplicate - 原地复制', () => {
        let parent: INodeInfo | null = null;
        let original: INodeInfo | null = null;

        beforeAll(async () => {
            parent = await NodeProxy.createByType({ path: '/', name: 'DupParent', nodeType: NodeType.EMPTY });
            original = await NodeProxy.createByType({ path: parent!.path, name: 'DupOriginal', nodeType: NodeType.EMPTY });
        });

        afterAll(async () => {
            await NodeProxy.delete({ path: parent!.path, keepWorldTransform: false }).catch(() => {});
        });

        it('duplicate 在同一父节点下创建副本', async () => {
            const result = await duplicate({ paths: [original!.path] });
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(1);

            const children = await getChildNames(parent!.path);
            expect(children.length).toBeGreaterThanOrEqual(2);
        });

        it('duplicate 多个节点', async () => {
            const node2 = await NodeProxy.createByType({ path: parent!.path, name: 'DupOriginal2', nodeType: NodeType.EMPTY });
            const beforeChildren = await getChildNames(parent!.path);

            const result = await duplicate({ paths: [original!.path, node2!.path] });
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(2);

            const afterChildren = await getChildNames(parent!.path);
            expect(afterChildren.length).toBe(beforeChildren.length + 2);
        });
    });

    describe('5. cut / paste - 剪切粘贴', () => {
        let parent: INodeInfo | null = null;
        let target: INodeInfo | null = null;
        let cutNode: INodeInfo | null = null;

        beforeAll(async () => {
            parent = await NodeProxy.createByType({ path: '/', name: 'CutParent', nodeType: NodeType.EMPTY });
            target = await NodeProxy.createByType({ path: '/', name: 'CutTarget', nodeType: NodeType.EMPTY });
            cutNode = await NodeProxy.createByType({ path: parent!.path, name: 'CutChild', nodeType: NodeType.EMPTY });
        });

        afterAll(async () => {
            await NodeProxy.delete({ path: parent!.path, keepWorldTransform: false }).catch(() => {});
            await NodeProxy.delete({ path: target!.path, keepWorldTransform: false }).catch(() => {});
        });

        it('cut 返回被剪切节点的 uuid 列表', async () => {
            const result = await cut({ paths: [cutNode!.path] });
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(1);
        });

        it('cut + paste 将节点移动到目标父节点', async () => {
            // cut 已在上一个 test 执行，直接 paste
            const result = await paste({ parentPath: target!.path });
            expect(Array.isArray(result)).toBe(true);

            const targetChildren = await getChildNames(target!.path);
            expect(targetChildren).toContain('CutChild');

            const sourceChildren = await getChildNames(parent!.path);
            expect(sourceChildren).not.toContain('CutChild');
        });

        it('cut 同层级节点后 paste as child 会移动到目标节点下', async () => {
            const suffix = Date.now().toString(36);
            const parentName = `CutSiblingTarget_${suffix}`;
            const childName = `CutSiblingChild_${suffix}`;
            const siblingTarget = await NodeProxy.createByType({ path: '/', name: parentName, nodeType: NodeType.EMPTY });
            const siblingChild = await NodeProxy.createByType({ path: '/', name: childName, nodeType: NodeType.EMPTY });

            try {
                await cut({ paths: [siblingChild!.path] });
                const result = await paste({ parentPath: siblingTarget!.path });
                expect(result).toContain(`${siblingTarget!.path}/${childName}`);

                const targetChildren = await getChildNames(siblingTarget!.path);
                expect(targetChildren).toContain(childName);

                const rootChildren = await getChildNames('/');
                expect(rootChildren).toContain(parentName);
                expect(rootChildren).not.toContain(childName);
            } finally {
                await NodeProxy.delete({ path: siblingTarget!.path, keepWorldTransform: false }).catch(() => {});
                await NodeProxy.delete({ path: siblingChild!.path, keepWorldTransform: false }).catch(() => {});
                await NodeProxy.delete({ path: `${siblingTarget!.path}/${childName}`, keepWorldTransform: false }).catch(() => {});
            }
        });

        it('cut 多个节点并 paste', async () => {
            const c1 = await NodeProxy.createByType({ path: parent!.path, name: 'CutMulti1', nodeType: NodeType.EMPTY });
            const c2 = await NodeProxy.createByType({ path: parent!.path, name: 'CutMulti2', nodeType: NodeType.EMPTY });

            const cutResult = await cut({ paths: [c1!.path, c2!.path] });
            expect(cutResult.length).toBe(2);

            const pasteResult = await paste({ parentPath: target!.path });
            expect(Array.isArray(pasteResult)).toBe(true);

            const targetChildren = await getChildNames(target!.path);
            expect(targetChildren).toContain('CutMulti1');
            expect(targetChildren).toContain('CutMulti2');
        });

        it('连续 cut 两次不 paste，只有最后一次 cut 的节点被移动', async () => {
            const first = await NodeProxy.createByType({ path: parent!.path, name: 'CutFirst', nodeType: NodeType.EMPTY });
            const second = await NodeProxy.createByType({ path: parent!.path, name: 'CutSecond', nodeType: NodeType.EMPTY });

            await cut({ paths: [first!.path] });
            await cut({ paths: [second!.path] });

            await paste({ parentPath: target!.path });

            // 第二次 cut 的节点应移动到 target
            const targetChildren = await getChildNames(target!.path);
            expect(targetChildren).toContain('CutSecond');

            // 第一次 cut 的节点应留在原位
            const sourceChildren = await getChildNames(parent!.path);
            expect(sourceChildren).toContain('CutFirst');

            // 清理
            await NodeProxy.delete({ path: `${parent!.path}/CutFirst`, keepWorldTransform: false }).catch(() => {});
        });

        it('cut 后再 copy，paste 应执行 copy 而非 cut', async () => {
            const cutNode2 = await NodeProxy.createByType({ path: parent!.path, name: 'CutThenCopy', nodeType: NodeType.EMPTY });
            const copySource = await NodeProxy.createByType({ path: parent!.path, name: 'CopySource', nodeType: NodeType.EMPTY });

            await cut({ paths: [cutNode2!.path] });
            await copy({ paths: [copySource!.path] });

            await paste({ parentPath: target!.path });

            // copy 的节点应被粘贴到 target（创建副本）
            const targetChildren = await getChildNames(target!.path);
            expect(targetChildren).toContain('CopySource');

            // cut 的节点应留在原位（cut 被 copy 覆盖）
            const sourceChildren = await getChildNames(parent!.path);
            expect(sourceChildren).toContain('CutThenCopy');

            // 清理
            await NodeProxy.delete({ path: `${parent!.path}/CutThenCopy`, keepWorldTransform: false }).catch(() => {});
            await NodeProxy.delete({ path: `${parent!.path}/CopySource`, keepWorldTransform: false }).catch(() => {});
        });
    });

    describe('6. queryClipboardState - 剪贴板状态查询', () => {
        let parent: INodeInfo | null = null;
        let nodeA: INodeInfo | null = null;
        let nodeB: INodeInfo | null = null;

        beforeAll(async () => {
            parent = await NodeProxy.createByType({ path: '/', name: 'ClipParent', nodeType: NodeType.EMPTY });
            nodeA = await NodeProxy.createByType({ path: parent!.path, name: 'ClipA', nodeType: NodeType.EMPTY });
            nodeB = await NodeProxy.createByType({ path: parent!.path, name: 'ClipB', nodeType: NodeType.EMPTY });
        });

        afterAll(async () => {
            await NodeProxy.delete({ path: parent!.path, keepWorldTransform: false }).catch(() => {});
        });

        it('queryClipboardState 返回有效状态', async () => {
            const state = await queryClipboardState();
            expect(['none', 'copy', 'cut']).toContain(state.type);
            expect(Array.isArray(state.paths)).toBe(true);
        });

        it('copy 后状态为 copy', async () => {
            await copy({ paths: [nodeA!.path] });
            const state = await queryClipboardState();
            expect(state.type).toBe('copy');
            expect(state.paths.length).toBe(1);
        });

        it('cut 后状态为 cut', async () => {
            await cut({ paths: [nodeB!.path] });
            const state = await queryClipboardState();
            expect(state.type).toBe('cut');
            expect(state.paths.length).toBe(1);
        });

        it('cut 后再 copy，状态变为 copy', async () => {
            await cut({ paths: [nodeA!.path] });
            let state = await queryClipboardState();
            expect(state.type).toBe('cut');

            await copy({ paths: [nodeB!.path] });
            state = await queryClipboardState();
            expect(state.type).toBe('copy');
        });

        it('cut + paste 后 cut 状态清除', async () => {
            await cut({ paths: [nodeA!.path] });
            let state = await queryClipboardState();
            expect(state.type).toBe('cut');

            await paste({ parentPath: parent!.path });
            state = await queryClipboardState();
            expect(state.type).not.toBe('cut');
        });

        it('连续 cut 两次，状态只保留最后一次', async () => {
            await cut({ paths: [nodeA!.path] });
            await cut({ paths: [nodeB!.path] });
            const state = await queryClipboardState();
            expect(state.type).toBe('cut');
            expect(state.paths.length).toBe(1);

            // 清理：paste 掉 cut 的节点
            await paste({ parentPath: parent!.path });
        });
    });
});
