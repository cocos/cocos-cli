/**
 * Undo/Redo 集成测试。
 *
 * 测试会启动真实 Cocos 引擎（由 scene-process global-setup 加载）和真实测试场景。
 * 所有交互都直接走 scene service RPC，不依赖 main-process proxy / MCP filter 层。
 *
 * 覆盖范围：
 *
 *   Command                   | Public RPC entry              | 是否覆盖
 *   --------------------------|-------------------------------|--------
 *   CreateNodeCommand         | Node.createByType             | 已覆盖
 *   AddComponentCommand       | Component.add                 | 已覆盖
 *   RemoveComponentCommand    | Component.remove              | 已覆盖
 *   RemoveNodeCommand         | Node.delete                   | 已覆盖
 *   snapshot setProperty      | Node.update                   | 已覆盖
 *   snapshot resetNode        | Node.reset (RPC)              | 已覆盖
 *   snapshot resetProperty    | Node.resetProperty (RPC)      | 已覆盖
 *   snapshot update null      | Node.updatePropertyFromNull   | 已覆盖
 *   snapshot resetComponent   | Component.reset               | 已覆盖
 *   snapshot subtree layer    | Node.setNodeAndChildrenLayer  | 已覆盖
 *   snapshot move children    | Node.moveArrayElement/reorder | 已覆盖
 *   snapshot reparent         | Node.setParent / cut+paste    | 已覆盖
 *   CreateNodeCommand         | Node.duplicate / copy+paste   | 已覆盖
 *   RemoveComponentCommand    | Node.removeArrayElement(__comps__) | 已覆盖
 *   snapshot node lock        | Node.changeNodeLock           | 已覆盖
 */

import {
    ICreateByNodeTypeParams,
    IDeleteNodeParams,
    IAddComponentOptions,
    IRemoveComponentOptions,
    IQueryComponentOptions,
    IQueryNodeParams,
    IUpdateNodeParams,
    NodeType,
    INodeInfo,
    ISetPropertyOptionsInfo,
} from '../common';
import { Rpc } from '../main-process/rpc';
import { sceneWorker } from '../main-process/scene-worker';
import { SceneTestEnv } from './scene-test-env';
import { readFileSync } from 'fs-extra';
import { assetManager } from '../../assets';
import { includes } from 'lodash';

function request<T = any>(service: string, method: string, args: any[] = []): Promise<T> {
    return (Rpc.getInstance() as any).request(service, method, args) as Promise<T>;
}

function toNodeInfo(dump: any): INodeInfo {
    return {
        nodeId: dump.uuid?.value ?? '',
        path: dump.path ?? '',
        name: dump.name?.value ?? '',
        properties: {
            position: dump.position?.value,
            rotation: dump.rotation?.value,
            scale: dump.scale?.value,
            mobility: dump.mobility?.value,
            layer: dump.layer?.value,
            active: dump.active?.value,
        },
        prefab: dump.__prefab__ ?? null,
    };
}

function toComponentInfo(dump: any): any {
    return {
        cid: dump.cid ?? '',
        path: dump.__component_path__ ?? '',
        uuid: dump.value?.uuid?.value ?? '',
        name: dump.value?.name?.value ?? '',
        type: dump.type,
        enabled: dump.value?.enabled?.value ?? true,
        properties: dump.value ?? {},
        prefab: dump.__compPrefab__ ?? null,
    };
}

// Undo/Redo 是 scene-process service 命名空间，不是 main-process / MCP 代理。
const Undo = {
    undo: () => request('Undo', 'undo'),
    redo: () => request('Redo', 'redo'),
    clearHistory: () => request('Undo', 'clearHistory'),
    isDirty: () => request<boolean>('Undo', 'isDirty'),
    canUndo: () => request<boolean>('Undo', 'canUndo'),
    canRedo: () => request<boolean>('Redo', 'canRedo'),
    markSaved: () => request('Undo', 'markSaved'),
    beginGroup: (options?: { label?: string }) => request('Undo', 'beginGroup', [options]),
    endGroup: (groupId: string) => request('Undo', 'endGroup', [groupId]),
    cancelGroup: (groupId: string) => request('Undo', 'cancelGroup', [groupId]),
    isGroupActive: () => request<boolean>('Undo', 'isGroupActive'),
    beginRecording: (uuids: string[], options?: { label?: string }) => request<string>('Undo', 'beginRecording', [uuids, options]),
    endRecording: (commandId: string) => request('Undo', 'endRecording', [commandId]),
    hasActiveRecording: (uuid?: string) => request<boolean>('Undo', 'hasActiveRecording', [uuid]),
};

const Node = {
    async createByType(params: ICreateByNodeTypeParams): Promise<INodeInfo | null> {
        const result = await request<any>('Node', 'createByType', [params]);
        return result ? toNodeInfo(result) : null;
    },
    delete: (params: IDeleteNodeParams) => request('Node', 'delete', [params]),
    async update(params: IUpdateNodeParams) {
        const nodeDump = await request<any>('Node', 'query', [{ path: params.path, includeChildren: false, includeComponents: false }]);
        if (!nodeDump) {
            throw new Error(`Node not found: ${params.path}`);
        }
        const properties = params.properties ?? {};
        for (const [key, value] of Object.entries(properties)) {
            const propDef = nodeDump[key];
            if (!propDef) {
                throw new Error(`Property '${key}' not found on node`);
            }
            await request('Node', 'setProperty', [{
                nodePath: params.path,
                path: key,
                dump: { ...propDef, value },
            }]);
        }
        let currentPath = params.path;
        if (params.name) {
            await request('Node', 'setProperty', [{
                nodePath: params.path,
                path: 'name',
                dump: { ...nodeDump.name, value: params.name },
            }]);
            const segments = currentPath.split('/');
            segments[segments.length - 1] = params.name;
            currentPath = segments.join('/');
        }
        return { path: currentPath };
    },
    async query(params?: IQueryNodeParams): Promise<INodeInfo | null> {
        const result = await request<any>('Node', 'query', [params]);
        return result ? toNodeInfo(result) : null;
    },
    queryNodeTree: (params: { path?: string }) => request<any>('Node', 'queryNodeTree', [params]),
    reset: (path: string) => request('Node', 'reset', [path]),
    resetProperty: (options: { nodePath: string; path: string }) => request('Node', 'resetProperty', [options]),
    updatePropertyFromNull: (options: { nodePath: string; path: string }) => request<boolean>('Node', 'updatePropertyFromNull', [options]),
    setProperty: (options: { nodePath: string; path: string; dump: any; record?: boolean }) => request('Node', 'setProperty', [options]),
    setNodeAndChildrenLayer: (options: { nodePath: string; path: string; dump: any; record?: boolean }) => request('Node', 'setNodeAndChildrenLayer', [options]),
    setParent: (params: { paths: string[]; parentPath: string; keepWorldTransform?: boolean }) => request<string[]>('Node', 'setParent', [params]),
    reorder: (params: { path: string; target: number; offset: number }) => request<boolean>('Node', 'reorder', [params]),
    copy: (params: { paths: string[] }) => request<string[]>('Node', 'copy', [params]),
    paste: (params: { parentPath?: string; keepWorldTransform?: boolean }) => request<string[]>('Node', 'paste', [params]),
    duplicate: (params: { paths: string[] }) => request<string[]>('Node', 'duplicate', [params]),
    cut: (params: { paths: string[] }) => request<string[]>('Node', 'cut', [params]),
    moveArrayElement: (params: { nodePath: string; path: string; target: number; offset: number }) => request<boolean>('Node', 'moveArrayElement', [params]),
    removeArrayElement: (params: { nodePath: string; path: string; index: number }) => request<boolean>('Node', 'removeArrayElement', [params]),
    changeNodeLock: (params: { paths: string[]; locked: boolean; loop?: boolean }) => request<void>('Node', 'changeNodeLock', [params]),
};

const Component = {
    async add(params: IAddComponentOptions) {
        const result = await request<any>('Component', 'add', [params]);
        return toComponentInfo(result);
    },
    remove: (params: IRemoveComponentOptions) => request<boolean>('Component', 'remove', [params]),
    async query(params: IQueryComponentOptions) {
        const result = await request<any>('Component', 'query', [params]);
        return result ? toComponentInfo(result) : null;
    },
    async setProperty(params: ISetPropertyOptionsInfo): Promise<boolean> {
        const nodePath = params.componentPath.split('/').slice(0, -1).join('/');
        const compDump = await request<any>('Component', 'query', [params.componentPath]);
        const nodeTree = await request<any>('Node', 'queryNodeTree', [{ path: nodePath }]);
        const compUuid = compDump.value?.uuid?.value;
        const compIndex = nodeTree.components.findIndex((comp: any) => comp.value === compUuid);
        if (compIndex < 0) {
            throw new Error(`Component index not found: ${params.componentPath}`);
        }

        for (const [key, value] of Object.entries(params.properties)) {
            const propDef = compDump.value?.[key];
            if (!propDef) {
                throw new Error(`Property '${key}' not found on component`);
            }
            let dumpValue: any = value;
            if (propDef.isArray && propDef.elementTypeData && Array.isArray(value)) {
                dumpValue = value.map((item, index) => ({
                    ...propDef.elementTypeData,
                    name: String(index),
                    value: item,
                }));
            }
            await request('Component', 'setProperty', [{
                nodePath,
                path: `__comps__.${compIndex}.${key}`,
                dump: { ...propDef, value: dumpValue },
                record: params.record,
            }]);
        }
        return true;
    },
    reset: (params: { path: string }) => request<boolean>('Component', 'reset', [params]),
};

const Prefab = {
    createPrefabFromNode: (params: { nodePath: string; dbURL: string; overwrite?: boolean }) => request<any>('Prefab', 'createPrefabFromNode', [params]),
    applyPrefabChanges: (params: { nodePath: string }) => request<boolean>('Prefab', 'applyPrefabChanges', [params]),
    getPrefabInfo: (params: { nodePath: string }) => request<any>('Prefab', 'getPrefabInfo', [params]),
    isPrefabInstance: (params: { nodePath: string }) => request<boolean>('Prefab', 'isPrefabInstance', [params]),
    revertToPrefab: (params: { nodePath: string }) => request<boolean>('Prefab', 'revertToPrefab', [params]),
    unpackPrefabInstance: (params: { nodePath: string; recursive?: boolean }) => request<any>('Prefab', 'unpackPrefabInstance', [params]),
    unlinkPrefab: (params: { nodePath: string; removeNested?: boolean }) => request<boolean>('Prefab', 'unlinkPrefab', [params]),
};

const Editor = {
    open: (params: any) => request('Editor', 'open', [params]),
    close: (params: any) => request('Editor', 'close', [params]),
    save: (params: any) => request('Editor', 'save', [params]),
    reload: (params: any) => request('Editor', 'reload', [params]),
    create: (params: any) => request('Editor', 'create', [params]),
    queryCurrent: () => request('Editor', 'queryCurrent'),
};

async function queryNodeDump(path: string): Promise<any> {
    return (Rpc.getInstance() as any).request('Node', 'query', [{ path, includeChildren: false, includeComponents: true }]);
}

async function queryNode(path: string): Promise<INodeInfo | null> {
    const params: IQueryNodeParams = { path, includeChildren: false, includeComponents: false };
    return Node.query(params);
}

async function queryComp(path: string) {
    const params: IQueryComponentOptions = { path };
    try {
        return await Component.query(params);
    } catch {
        // scene-process 找不到组件时会抛错，而不是返回 null；这里统一当成“不存在”。
        return null;
    }
}

async function safeDelete(path: string) {
    try {
        const node = await queryNode(path);
        if (node) {
            const params: IDeleteNodeParams = { path, keepWorldTransform: false };
            await Node.delete(params);
        }
    } catch {
        // 尽力清理，清理失败不影响测试主流程。
    }
}

async function setNodeProperty(path: string, propPath: string, value: any, record = true): Promise<boolean> {
    const nodeDump: any = await queryNodeDump(path);
    if (!nodeDump?.[propPath]) {
        throw new Error(`Node property not found: ${path}.${propPath}`);
    }
    return Node.setProperty({
        nodePath: path,
        path: propPath,
        dump: { ...nodeDump[propPath], value },
        record,
    });
}

async function readAssetContent(dbURL: string): Promise<string> {
    const info = await assetManager.queryAssetInfo(dbURL);
    if (!info?.file) {
        throw new Error(`Asset file not found: ${dbURL}`);
    }
    return readFileSync(info.file, 'utf-8');
}

async function readPrefabRootScale(dbURL: string): Promise<{ x: number; y: number; z: number }> {
    const content = await readAssetContent(dbURL);
    const data = JSON.parse(content);
    const rootNode = Array.isArray(data)
        ? data.find((item) => item?.__type__ === 'cc.Node' && item?._lscale)
        : null;
    if (!rootNode?._lscale) {
        throw new Error(`Prefab root scale not found: ${dbURL}`);
    }
    return {
        x: rootNode._lscale.x,
        y: rootNode._lscale.y,
        z: rootNode._lscale.z,
    };
}

async function childNames(path: string): Promise<string[]> {
    const tree = await Node.queryNodeTree({ path });
    return tree?.children.map((child: any) => child.name) ?? [];
}

async function queryNodeLocked(path: string): Promise<boolean> {
    const tree = await Node.queryNodeTree({ path });
    return Boolean(tree?.locked);
}

async function expectPrefabInstance(path: string, expected: boolean, label: string): Promise<void> {
    const actual = await Prefab.isPrefabInstance({ nodePath: path });
    if (actual !== expected) {
        throw new Error(`${label}: expected isPrefabInstance(${path}) to be ${expected}, got ${actual}`);
    }
}

async function componentTypes(path: string): Promise<string[]> {
    const dump = await queryNodeDump(path);
    return (dump.__comps__ ?? []).map((comp: any) => comp.type);
}

async function componentIndex(path: string, type: string): Promise<number> {
    const types = await componentTypes(path);
    const index = types.indexOf(type);
    if (index === -1) {
        throw new Error(`Component type not found: ${path}/${type}`);
    }
    return index;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function collectDirtyEvents(run: () => Promise<void>): Promise<boolean[]> {
    const dirtyEvents: boolean[] = [];
    const handler = (dirty: boolean) => dirtyEvents.push(dirty);
    sceneWorker.on('dirty:changed', handler);
    try {
        await run();
        await delay(30);
    } finally {
        sceneWorker.off('dirty:changed', handler);
    }
    return dirtyEvents;
}

async function ensureSceneOpen(): Promise<void> {
    const current = await Editor.queryCurrent();
    if (!current) {
        await Editor.open({ urlOrUUID: SceneTestEnv.sceneURL });
    }
}

function expectUndoSuccess(result: any) {
    if (!result?.success) {
        throw new Error(`Undo/Redo command failed: ${JSON.stringify(result)}`);
    }
    expect(result.success).toBe(true);
}

describe('Undo/Redo 集成测试', () => {
    beforeAll(async () => {
        try {
            await Editor.open({ urlOrUUID: SceneTestEnv.sceneURL });
        } catch (_error) {
            await Editor.create({
                type: 'scene',
                baseName: SceneTestEnv.sceneName,
                targetDirectory: SceneTestEnv.targetDirectoryURL,
            });
            await Editor.open({ urlOrUUID: SceneTestEnv.sceneURL });
        }
    });

    afterAll(async () => {
        await Editor.close({});
    });

    beforeEach(async () => {
        await Undo.clearHistory();
    });

    // ========================================================================
    // 创建节点命令
    // ========================================================================
    describe('CreateNode', () => {
        const path = 'UndoCreateNode';

        beforeEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        it('createByType pushes onto undo stack, undo removes the node, redo restores it', async () => {
            const params: ICreateByNodeTypeParams = { path, nodeType: NodeType.EMPTY };
            const created = await Node.createByType(params);
            expect(created).not.toBeNull();
            expect(await queryNode(path)).not.toBeNull();
            expect(await Undo.canUndo()).toBe(true);
            expect(await Undo.canRedo()).toBe(false);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect(await queryNode(path)).toBeNull();
            expect(await Undo.canUndo()).toBe(false);
            expect(await Undo.canRedo()).toBe(true);

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect(await queryNode(path)).not.toBeNull();
            expect(await Undo.canUndo()).toBe(true);
            expect(await Undo.canRedo()).toBe(false);
        });
    });

    // ========================================================================
    // 添加组件命令
    // ========================================================================
    describe('AddComponent', () => {
        const path = 'UndoAddComp';
        const compPath = `${path}/cc.Label`;

        beforeEach(async () => {
            await safeDelete(path);
            await Node.createByType({ path, nodeType: NodeType.EMPTY });
            // 清空历史，让测试只观察添加组件这一步。
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        it('add pushes onto undo stack, undo removes the component, redo re-adds it', async () => {
            const addParams: IAddComponentOptions = { nodePath: path, component: 'cc.Label' };
            const added = await Component.add(addParams);
            expect(added).toBeDefined();
            expect(await queryComp(compPath)).not.toBeNull();
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect(await queryComp(compPath)).toBeNull();

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect(await queryComp(compPath)).not.toBeNull();
        });

        it('undo removes components automatically added by requireComponent', async () => {
            const addParams: IAddComponentOptions = { nodePath: path, component: 'cc.LabelOutline' };
            const added = await Component.add(addParams);
            expect(added).toBeDefined();

            expect(await componentTypes(path)).toEqual(expect.arrayContaining(['cc.Label', 'cc.LabelOutline']));

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            const typesAfterUndo = await componentTypes(path);
            expect(typesAfterUndo).not.toContain('cc.Label');
            expect(typesAfterUndo).not.toContain('cc.LabelOutline');

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect(await componentTypes(path)).toEqual(expect.arrayContaining(['cc.Label', 'cc.LabelOutline']));
        });
    });

    // ========================================================================
    // 删除组件命令
    // ========================================================================
    describe('RemoveComponent', () => {
        const path = 'UndoRemoveComp';
        const compPath = `${path}/cc.Label`;

        beforeEach(async () => {
            await safeDelete(path);
            await Node.createByType({ path, nodeType: NodeType.EMPTY });
            await Component.add({ nodePath: path, component: 'cc.Label' });
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        it('remove pushes onto undo stack, undo re-adds the component, redo removes again', async () => {
            const removeParams: IRemoveComponentOptions = { path: compPath };
            const ok = await Component.remove(removeParams);
            expect(ok).toBe(true);
            expect(await queryComp(compPath)).toBeNull();
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect(await queryComp(compPath)).not.toBeNull();

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect(await queryComp(compPath)).toBeNull();
        });
    });

    describe('Component setProperty (snapshot)', () => {
        const path = 'UndoComponentSetProperty';
        const compPath = `${path}/cc.Label`;

        beforeEach(async () => {
            await safeDelete(path);
            await Node.createByType({ path, nodeType: NodeType.EMPTY });
            await Component.add({ nodePath: path, component: 'cc.Label' });
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        it('setProperty pushes onto undo stack, undo restores original value, redo reapplies', async () => {
            const options: ISetPropertyOptionsInfo = {
                componentPath: compPath,
                properties: { string: 'undo-redo-label' },
            };

            expect((await queryComp(compPath))!.properties.string.value).toBe('label');
            expect(await Component.setProperty(options)).toBe(true);
            expect((await queryComp(compPath))!.properties.string.value).toBe('undo-redo-label');
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect((await queryComp(compPath))!.properties.string.value).toBe('label');

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect((await queryComp(compPath))!.properties.string.value).toBe('undo-redo-label');
        });
    });

    describe('Duplicate component paths', () => {
        const path = 'UndoDuplicateComp';
        const firstPath = `${path}/cc.Layout`;
        const secondPath = `${path}/cc.Layout_001`;

        beforeEach(async () => {
            await safeDelete(path);
            await Node.createByType({ path, nodeType: NodeType.EMPTY });
            await Component.add({ nodePath: path, component: 'cc.Layout' });
            await Component.add({ nodePath: path, component: 'cc.Layout' });
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        it('remove undo/redo targets the intended duplicate component by path and index', async () => {
            expect(await queryComp(firstPath)).not.toBeNull();
            expect(await queryComp(secondPath)).not.toBeNull();

            expect(await Component.remove({ path: secondPath })).toBe(true);
            expect(await queryComp(firstPath)).not.toBeNull();
            expect(await queryComp(secondPath)).toBeNull();

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect(await queryComp(firstPath)).not.toBeNull();
            expect(await queryComp(secondPath)).not.toBeNull();

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect(await queryComp(firstPath)).not.toBeNull();
            expect(await queryComp(secondPath)).toBeNull();
        });
    });

    // ========================================================================
    // 删除节点命令：Node.delete 现在会走 nodeMgr.removeNode
    // ========================================================================
    describe('RemoveNode (delete)', () => {
        const path = 'UndoRemoveNode';

        beforeEach(async () => {
            await safeDelete(path);
            await Node.createByType({ path, nodeType: NodeType.EMPTY });
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        it('delete pushes onto undo stack, undo restores the node, redo removes again', async () => {
            expect(await queryNode(path)).not.toBeNull();

            const ok = await Node.delete({ path, keepWorldTransform: false });
            expect(ok).not.toBeNull();
            expect(await queryNode(path)).toBeNull();
            expect(await Undo.canUndo()).toBe(true);
            expect(await Undo.canRedo()).toBe(false);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect(await queryNode(path)).not.toBeNull();
            expect(await Undo.canUndo()).toBe(false);
            expect(await Undo.canRedo()).toBe(true);

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect(await queryNode(path)).toBeNull();
            expect(await Undo.canUndo()).toBe(true);
            expect(await Undo.canRedo()).toBe(false);
        });
    });

    // ========================================================================
    // 基于快照：通过 Node.update 设置属性
    // ========================================================================
    describe('setProperty (snapshot)', () => {
        const path = 'UndoSetProp';

        beforeEach(async () => {
            await Node.createByType({ path, nodeType: NodeType.EMPTY });
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        it('update position, undo restores original position, redo reapplies', async () => {
            const before = await queryNode(path);
            const origPos = before!.properties.position;

            const updateParams: IUpdateNodeParams = { path, properties: { position: { x: 100, y: 200, z: 0 } } };
            const result = await Node.update(updateParams);
            expect(result).toBeDefined();

            const afterUpdate = await queryNode(path);
            expect(afterUpdate!.properties.position).toEqual({ x: 100, y: 200, z: 0 });
            expect(await Undo.canUndo()).toBe(true);

            await Undo.undo();
            const afterUndo = await queryNode(path);
            expect(afterUndo!.properties.position).toEqual(origPos);

            await Undo.redo();
            const afterRedo = await queryNode(path);
            expect(afterRedo!.properties.position).toEqual({ x: 100, y: 200, z: 0 });
        });

        it('update scale, undo restores original scale, redo reapplies', async () => {
            const before = await queryNode(path);
            const origScale = before!.properties.scale;

            await Node.update({ path, properties: { scale: { x: 2, y: 3, z: 1 } } });
            const afterUpdate = await queryNode(path);
            expect(afterUpdate!.properties.scale).toEqual({ x: 2, y: 3, z: 1 });

            await Undo.undo();
            expect((await queryNode(path))!.properties.scale).toEqual(origScale);

            await Undo.redo();
            expect((await queryNode(path))!.properties.scale).toEqual({ x: 2, y: 3, z: 1 });
        });

        it('update name, undo restores original name, redo reapplies', async () => {
            const updateParams: IUpdateNodeParams = { path, name: 'RenamedNode' };
            await Node.update(updateParams);
            const renamedPath = `${path.slice(0, path.lastIndexOf('/') + 1)}RenamedNode`;
            expect(await queryNode(renamedPath)).not.toBeNull();

            await Undo.undo();
            expect(await queryNode(path)).not.toBeNull();
            expect((await queryNode(path))!.name).toBe(path.split('/').pop());

            await Undo.redo();
            expect(await queryNode(renamedPath)).not.toBeNull();
        });
    });

    // ========================================================================
    // 基于快照：resetNode 会重置 position/rotation/scale/mobility
    // ========================================================================
    describe('resetNode (snapshot)', () => {
        const path = 'UndoResetNode';
        const newPos = { x: 100, y: 100, z: 100 };

        beforeEach(async () => {
            await Node.createByType({ path, nodeType: NodeType.EMPTY });
            await Node.update({ path, properties: { position: newPos } });
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        it('reset restores default position, undo brings back custom, redo resets again', async () => {
            // 确认已设置非默认 position。
            expect((await queryNode(path))!.properties.position).toEqual(newPos);

            await Node.reset(path);
            const afterReset = await queryNode(path);
            expect(afterReset!.properties.position).toEqual({ x: 0, y: 0, z: 0 });
            expect(await Undo.canUndo()).toBe(true);

            await Undo.undo();
            expect((await queryNode(path))!.properties.position).toEqual(newPos);

            await Undo.redo();
            expect((await queryNode(path))!.properties.position).toEqual({ x: 0, y: 0, z: 0 });
        });
    });

    // ========================================================================
    // 基于快照：resetProperty 重置单个属性
    // ========================================================================
    describe('resetProperty (snapshot)', () => {
        const path = 'UndoResetProp';

        beforeEach(async () => {
            await Node.createByType({ path, nodeType: NodeType.EMPTY });
            await Node.update({ path, properties: { scale: { x: 5, y: 5, z: 5 } } });
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        it('resetProperty scale resets to 1, undo restores custom, redo resets again', async () => {
            expect((await queryNode(path))!.properties.scale).toEqual({ x: 5, y: 5, z: 5 });

            await Node.resetProperty({ nodePath: path, path: 'scale' });
            const afterReset = await queryNode(path);
            expect(afterReset!.properties.scale).toEqual({ x: 1, y: 1, z: 1 });
            expect(await Undo.canUndo()).toBe(true);

            await Undo.undo();
            expect((await queryNode(path))!.properties.scale).toEqual({ x: 5, y: 5, z: 5 });

            await Undo.redo();
            expect((await queryNode(path))!.properties.scale).toEqual({ x: 1, y: 1, z: 1 });
        });
    });

    // ========================================================================
    // 基于快照：updatePropertyFromNull
    // ========================================================================
    describe('updatePropertyFromNull (snapshot)', () => {
        const path = 'UndoUpdatePropertyFromNull';

        beforeEach(async () => {
            await Node.createByType({ path, nodeType: NodeType.EMPTY });
            await setNodeProperty(path, 'scale', { x: 3, y: 4, z: 5 }, false);
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        it('updatePropertyFromNull pushes onto undo stack, undo restores original value, redo reapplies', async () => {
            expect((await queryNode(path))!.properties.scale).toEqual({ x: 3, y: 4, z: 5 });

            const result = await Node.updatePropertyFromNull({ nodePath: path, path: 'scale' });
            expect(result).toBe(true);
            expect((await queryNode(path))!.properties.scale).toEqual({ x: 1, y: 1, z: 1 });
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect((await queryNode(path))!.properties.scale).toEqual({ x: 3, y: 4, z: 5 });

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect((await queryNode(path))!.properties.scale).toEqual({ x: 1, y: 1, z: 1 });
        });
    });

    // ========================================================================
    // 组件 reset（快照）
    // ========================================================================
    describe('Component reset (snapshot)', () => {
        const path = 'UndoResetComponentNode';
        const compPath = `${path}/cc.Label`;

        beforeEach(async () => {
            await Node.createByType({ path, nodeType: NodeType.EMPTY });
            await Component.add({ nodePath: path, component: 'cc.Label' });
            await Component.setProperty({
                componentPath: compPath,
                properties: { string: 'modified-before-reset' },
            });
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        it('reset pushes onto undo stack, undo restores previous component values, redo resets again', async () => {
            expect((await queryComp(compPath))!.properties.string.value).toBe('modified-before-reset');

            const resetResult = await Component.reset({ path: compPath });
            expect(resetResult).toBe(true);
            expect((await queryComp(compPath))!.properties.string.value).toBe('label');
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect((await queryComp(compPath))!.properties.string.value).toBe('modified-before-reset');

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect((await queryComp(compPath))!.properties.string.value).toBe('label');
        });
    });

    // ========================================================================
    // 递归 layer 与层级顺序操作
    // ========================================================================
    describe('Node tree mutations (snapshot)', () => {
        const parentPath = 'UndoTreeMutationParent';
        const targetParentPath = 'UndoTreeMutationTargetParent';
        const childA = `${parentPath}/LayerChildA`;
        const childB = `${parentPath}/LayerChildB`;
        const childC = `${parentPath}/LayerChildC`;
        const labelPath = `${childA}/cc.Label`;

        beforeEach(async () => {
            await Node.createByType({ path: '/', name: parentPath, nodeType: NodeType.EMPTY });
            await Node.createByType({ path: parentPath, name: 'LayerChildA', nodeType: NodeType.EMPTY });
            await Node.createByType({ path: parentPath, name: 'LayerChildB', nodeType: NodeType.EMPTY });
            await Node.createByType({ path: parentPath, name: 'LayerChildC', nodeType: NodeType.EMPTY });
            await Node.createByType({ path: '/', name: targetParentPath, nodeType: NodeType.EMPTY });
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(parentPath);
            await safeDelete(targetParentPath);
            await Undo.clearHistory();
        });

        it('setNodeAndChildrenLayer pushes one command for the whole subtree', async () => {
            const parentBefore = await queryNodeDump(parentPath);
            const childBefore = await queryNodeDump(childA);
            const targetLayer = 1 << 25;

            await Node.setNodeAndChildrenLayer({
                nodePath: parentPath,
                path: 'layer',
                dump: { ...parentBefore.layer, value: targetLayer },
            });

            expect((await queryNodeDump(parentPath)).layer.value).toBe(targetLayer);
            expect((await queryNodeDump(childA)).layer.value).toBe(targetLayer);
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect((await queryNodeDump(parentPath)).layer.value).toBe(parentBefore.layer.value);
            expect((await queryNodeDump(childA)).layer.value).toBe(childBefore.layer.value);

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect((await queryNodeDump(parentPath)).layer.value).toBe(targetLayer);
            expect((await queryNodeDump(childA)).layer.value).toBe(targetLayer);
        });

        it('moveArrayElement reorders hierarchy children and supports undo/redo', async () => {
            expect(await childNames(parentPath)).toEqual(['LayerChildA', 'LayerChildB', 'LayerChildC']);

            const moved = await Node.moveArrayElement({ nodePath: parentPath, path: 'children', target: 2, offset: -2 });
            expect(moved).toBe(true);
            expect(await childNames(parentPath)).toEqual(['LayerChildC', 'LayerChildA', 'LayerChildB']);
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect(await childNames(parentPath)).toEqual(['LayerChildA', 'LayerChildB', 'LayerChildC']);

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect(await childNames(parentPath)).toEqual(['LayerChildC', 'LayerChildA', 'LayerChildB']);
        });

        it('reorder supports undo/redo with the params API', async () => {
            expect(await childNames(parentPath)).toEqual(['LayerChildA', 'LayerChildB', 'LayerChildC']);

            expect(await Node.reorder({ path: parentPath, target: 0, offset: 2 })).toBe(true);
            expect(await childNames(parentPath)).toEqual(['LayerChildB', 'LayerChildC', 'LayerChildA']);
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect(await childNames(parentPath)).toEqual(['LayerChildA', 'LayerChildB', 'LayerChildC']);

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect(await childNames(parentPath)).toEqual(['LayerChildB', 'LayerChildC', 'LayerChildA']);
        });

        it('setParent moves nodes across parents and supports undo/redo', async () => {
            expect(await childNames(parentPath)).toEqual(['LayerChildA', 'LayerChildB', 'LayerChildC']);
            expect(await childNames(targetParentPath)).toEqual([]);

            const movedPaths = await Node.setParent({ paths: [childB], parentPath: targetParentPath });
            expect(movedPaths).toEqual([`${targetParentPath}/LayerChildB`]);
            expect(await childNames(parentPath)).toEqual(['LayerChildA', 'LayerChildC']);
            expect(await childNames(targetParentPath)).toEqual(['LayerChildB']);
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect(await childNames(parentPath)).toEqual(['LayerChildA', 'LayerChildB', 'LayerChildC']);
            expect(await childNames(targetParentPath)).toEqual([]);

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect(await childNames(parentPath)).toEqual(['LayerChildA', 'LayerChildC']);
            expect(await childNames(targetParentPath)).toEqual(['LayerChildB']);
        });

        it('duplicate creates nodes and supports undo/redo', async () => {
            const [duplicatedPath] = await Node.duplicate({ paths: [childA] });
            expect(duplicatedPath).toBeTruthy();
            expect(await queryNode(duplicatedPath)).not.toBeNull();
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect(await queryNode(duplicatedPath)).toBeNull();

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect(await queryNode(duplicatedPath)).not.toBeNull();
        });

        it('copy paste creates nodes and supports undo/redo', async () => {
            expect(await Node.copy({ paths: [childA] })).toEqual([childA]);

            const [pastedPath] = await Node.paste({ parentPath });
            expect(pastedPath).toBeTruthy();
            expect(await queryNode(pastedPath)).not.toBeNull();
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect(await queryNode(pastedPath)).toBeNull();

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect(await queryNode(pastedPath)).not.toBeNull();
        });

        it('cut paste moves nodes and supports undo/redo', async () => {
            expect(await Node.cut({ paths: [childC] })).toEqual([childC]);

            const [movedPath] = await Node.paste({ parentPath: targetParentPath });
            expect(movedPath).toBe(`${targetParentPath}/LayerChildC`);
            expect(await childNames(parentPath)).toEqual(['LayerChildA', 'LayerChildB']);
            expect(await childNames(targetParentPath)).toEqual(['LayerChildC']);
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect(await childNames(parentPath)).toEqual(['LayerChildA', 'LayerChildB', 'LayerChildC']);
            expect(await childNames(targetParentPath)).toEqual([]);

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect(await childNames(parentPath)).toEqual(['LayerChildA', 'LayerChildB']);
            expect(await childNames(targetParentPath)).toEqual(['LayerChildC']);
        });

        it('changeNodeLock supports undo/redo', async () => {
            expect((await queryNodeDump(childA)).locked.value).toBe(false);

            await Node.changeNodeLock({ paths: [childA], locked: true });
            expect((await queryNodeDump(childA)).locked.value).toBe(true);
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect((await queryNodeDump(childA)).locked.value).toBe(false);

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect((await queryNodeDump(childA)).locked.value).toBe(true);
        });

        it('moveArrayElement reorders components and supports undo/redo', async () => {
            await Component.add({ nodePath: childA, component: 'cc.Label' });
            await Component.add({ nodePath: childA, component: 'cc.Button' });
            expect((await componentTypes(childA)).filter(type => type === 'cc.Label' || type === 'cc.Button')).toEqual(['cc.Label', 'cc.Button']);
            await Undo.clearHistory();

            const labelIndex = await componentIndex(childA, 'cc.Label');
            const buttonIndex = await componentIndex(childA, 'cc.Button');
            expect(await Node.moveArrayElement({ nodePath: childA, path: '__comps__', target: labelIndex, offset: buttonIndex - labelIndex })).toBe(true);
            expect((await componentTypes(childA)).filter(type => type === 'cc.Label' || type === 'cc.Button')).toEqual(['cc.Button', 'cc.Label']);
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect((await componentTypes(childA)).filter(type => type === 'cc.Label' || type === 'cc.Button')).toEqual(['cc.Label', 'cc.Button']);

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect((await componentTypes(childA)).filter(type => type === 'cc.Label' || type === 'cc.Button')).toEqual(['cc.Button', 'cc.Label']);
        });

        it('removeArrayElement removes components and supports undo/redo', async () => {
            await Component.add({ nodePath: childA, component: 'cc.Label' });
            expect(await queryComp(labelPath)).not.toBeNull();
            await Undo.clearHistory();

            expect(await Node.removeArrayElement({ nodePath: childA, path: '__comps__', index: await componentIndex(childA, 'cc.Label') })).toBe(true);
            expect(await queryComp(labelPath)).toBeNull();
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect(await queryComp(labelPath)).not.toBeNull();

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect(await queryComp(labelPath)).toBeNull();
        });
    });

    // ========================================================================
    // 多步骤：自定义命令与快照混合
    // ========================================================================
    describe('Multi-step stack', () => {
        const path = 'UndoMultiStep';
        const newPos = { x: 99, y: 88, z: 0 };

        beforeEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        it('createNode → setProperty → undo setProperty → undo create → redo create → redo setProperty', async () => {
            // 第一步：创建节点
            await Node.createByType({ path, nodeType: NodeType.EMPTY });
            expect(await queryNode(path)).not.toBeNull();

            // 第二步：修改 position
            await Node.update({ path, properties: { position: newPos } });
            expect((await queryNode(path))!.properties.position).toEqual(newPos);
            expect(await Undo.canUndo()).toBe(true);

            // 第三步：撤销 position 修改
            const undoSetPropertyResult = await Undo.undo();
            expectUndoSuccess(undoSetPropertyResult);
            expect((await queryNode(path))!.properties.position).toEqual({ x: 0, y: 0, z: 0 });
            expect(await Undo.canUndo()).toBe(true);

            // 第四步：撤销节点创建，节点消失
            const undoCreateResult = await Undo.undo();
            expectUndoSuccess(undoCreateResult);
            expect(await queryNode(path)).toBeNull();
            expect(await Undo.canUndo()).toBe(false);

            // 第五步：重做节点创建，节点恢复
            const redoCreateResult = await Undo.redo();
            expectUndoSuccess(redoCreateResult);
            expect(await queryNode(path)).not.toBeNull();
            expect(await Undo.canUndo()).toBe(true);

            // 第六步：重做 position 修改
            const redoSetPropertyResult = await Undo.redo();
            expectUndoSuccess(redoSetPropertyResult);
            expect((await queryNode(path))!.properties.position).toEqual(newPos);
            expect(await Undo.canRedo()).toBe(false);
        });
    });

    describe('Group', () => {
        const firstPath = 'UndoGroupA';
        const secondPath = 'UndoGroupB';
        const firstPosition = { x: 12, y: 34, z: 0 };
        const secondScale = { x: 2, y: 3, z: 1 };

        beforeEach(async () => {
            await safeDelete(firstPath);
            await safeDelete(secondPath);
            await Node.createByType({ path: firstPath, nodeType: NodeType.EMPTY });
            await Node.createByType({ path: secondPath, nodeType: NodeType.EMPTY });
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(firstPath);
            await safeDelete(secondPath);
            await Undo.clearHistory();
        });

        it('beginGroup + two updates + endGroup undo and redo as one command', async () => {
            const groupId = await Undo.beginGroup({ label: 'Move Selection' });
            expect(await Undo.isGroupActive()).toBe(true);

            await Node.update({ path: firstPath, properties: { position: firstPosition } });
            await Node.update({ path: secondPath, properties: { scale: secondScale } });

            const endResult = await Undo.endGroup(groupId);
            expectUndoSuccess(endResult);
            expect(await Undo.isGroupActive()).toBe(false);
            expect(await Undo.canUndo()).toBe(true);
            expect(await Undo.canRedo()).toBe(false);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect((await queryNode(firstPath))!.properties.position).toEqual({ x: 0, y: 0, z: 0 });
            expect((await queryNode(secondPath))!.properties.scale).toEqual({ x: 1, y: 1, z: 1 });
            expect(await Undo.canUndo()).toBe(false);
            expect(await Undo.canRedo()).toBe(true);

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect((await queryNode(firstPath))!.properties.position).toEqual(firstPosition);
            expect((await queryNode(secondPath))!.properties.scale).toEqual(secondScale);
            expect(await Undo.canRedo()).toBe(false);
        });

        it('cancelGroup keeps scene mutations but discards undo history', async () => {
            const groupId = await Undo.beginGroup({ label: 'Discarded Group' });
            await Node.update({ path: firstPath, properties: { position: firstPosition } });

            const cancelResult = await Undo.cancelGroup(groupId);
            expectUndoSuccess(cancelResult);
            expect(await Undo.isGroupActive()).toBe(false);
            expect((await queryNode(firstPath))!.properties.position).toEqual(firstPosition);
            expect(await Undo.canUndo()).toBe(false);
            expect(await Undo.canRedo()).toBe(false);
        });
    });

    describe('Recording', () => {
        const path = 'UndoRecordingNode';
        const otherPath = 'UndoRecordingOther';
        const firstPosition = { x: 20, y: 0, z: 0 };
        const finalPosition = { x: 40, y: 8, z: 0 };
        const otherPosition = { x: 9, y: 9, z: 0 };

        beforeEach(async () => {
            await safeDelete(path);
            await safeDelete(otherPath);
            await Node.createByType({ path, nodeType: NodeType.EMPTY });
            await Node.createByType({ path: otherPath, nodeType: NodeType.EMPTY });
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(path);
            await safeDelete(otherPath);
            await Undo.clearHistory();
        });

        it('beginRecording + multiple updates produces one undo command', async () => {
            const uuid = (await queryNode(path))!.nodeId;
            const recordingId = await Undo.beginRecording([uuid], { label: 'Drag Node' });
            expect(await Undo.hasActiveRecording(uuid)).toBe(true);

            await Node.update({ path, properties: { position: firstPosition } });
            await Node.update({ path, properties: { position: finalPosition } });
            await Undo.endRecording(recordingId);

            expect(await Undo.hasActiveRecording(uuid)).toBe(false);
            expect((await queryNode(path))!.properties.position).toEqual(finalPosition);
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect((await queryNode(path))!.properties.position).toEqual({ x: 0, y: 0, z: 0 });
            expect(await Undo.canUndo()).toBe(false);
            expect(await Undo.canRedo()).toBe(true);

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect((await queryNode(path))!.properties.position).toEqual(finalPosition);
            expect(await Undo.canRedo()).toBe(false);
        });

        it('recording captures only requested uuids', async () => {
            const uuid = (await queryNode(path))!.nodeId;
            const recordingId = await Undo.beginRecording([uuid], { label: 'Scoped Drag' });

            await setNodeProperty(path, 'position', finalPosition, false);
            await setNodeProperty(otherPath, 'position', otherPosition, false);
            await Undo.endRecording(recordingId);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect((await queryNode(path))!.properties.position).toEqual({ x: 0, y: 0, z: 0 });
            expect((await queryNode(otherPath))!.properties.position).toEqual(otherPosition);
        });

        it('recording captures node lock changes', async () => {
            const uuid = (await queryNode(path))!.nodeId;
            const recordingId = await Undo.beginRecording([uuid], { label: 'Lock Node' });

            await Node.changeNodeLock({ paths: [path], locked: true });
            await Undo.endRecording(recordingId);

            expect(await queryNodeLocked(path)).toBe(true);
            expect(await Undo.canUndo()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect(await queryNodeLocked(path)).toBe(false);

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect(await queryNodeLocked(path)).toBe(true);
        });
    });

    // ========================================================================
    // 栈状态测试：不依赖节点查询
    // ========================================================================
    describe('Stack state', () => {
        const path = 'UndoStackState';

        beforeEach(async () => {
            await Node.createByType({ path, nodeType: NodeType.EMPTY });
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        it('canUndo/canRedo flip correctly after operations', async () => {
            expect(await Undo.canUndo()).toBe(false);
            expect(await Undo.canRedo()).toBe(false);

            await Node.update({ path, properties: { position: { x: 10, y: 20, z: 0 } } });
            expect(await Undo.canUndo()).toBe(true);
            expect(await Undo.canRedo()).toBe(false);

            await Undo.undo();
            expect(await Undo.canUndo()).toBe(false);
            expect(await Undo.canRedo()).toBe(true);

            await Undo.redo();
            expect(await Undo.canUndo()).toBe(true);
            expect(await Undo.canRedo()).toBe(false);
        });

        it('new operation after undo clears the redo stack', async () => {
            await Node.update({ path, properties: { position: { x: 1, y: 0, z: 0 } } });
            expect(await Undo.canRedo()).toBe(false);

            await Undo.undo();
            expect(await Undo.canRedo()).toBe(true);

            // undo 后发生新的修改，会清掉 redo 分支。
            await Node.update({ path, properties: { position: { x: 2, y: 0, z: 0 } } });
            expect(await Undo.canRedo()).toBe(false);
        });

        it('clearHistory clears the stack', async () => {
            await Node.update({ path, properties: { position: { x: 10, y: 20, z: 0 } } });
            expect(await Undo.canUndo()).toBe(true);

            await Undo.clearHistory();
            expect(await Undo.canUndo()).toBe(false);
            expect(await Undo.canRedo()).toBe(false);
            expect(await Undo.isDirty()).toBe(false);
        });
    });

    // ========================================================================
    // 基于真实录制验证 isDirty / markSaved / canUndo / canRedo
    // ========================================================================
    describe('isDirty / markSaved on real recordings', () => {
        const path = 'UndoDirtyNode';

        beforeEach(async () => {
            await Node.createByType({ path, nodeType: NodeType.EMPTY });
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await safeDelete(path);
            await Undo.clearHistory();
        });

        it('isDirty flips true after a recorded operation and back to false after markSaved', async () => {
            expect(await Undo.isDirty()).toBe(false);

            await Node.update({ path, properties: { position: { x: 10, y: 20, z: 0 } } });
            expect(await Undo.isDirty()).toBe(true);

            await Undo.markSaved();
            expect(await Undo.isDirty()).toBe(false);

            // undo 到已保存位置之前，当前内容会偏离已保存状态。
            await Undo.undo();
            expect(await Undo.isDirty()).toBe(true);

            // redo 回到已保存位置后，状态重新变为 clean。
            await Undo.redo();
            expect(await Undo.isDirty()).toBe(false);
        });

        it('undoing back to the original saved baseline makes dirty false', async () => {
            expect(await Undo.isDirty()).toBe(false);

            await Node.update({ path, properties: { position: { x: 12, y: 0, z: 0 } } });
            expect(await Undo.isDirty()).toBe(true);

            await Undo.undo();
            expect(await Undo.isDirty()).toBe(false);
        });

        it('isDirty false on empty stack', async () => {
            expect(await Undo.isDirty()).toBe(false);
            expect(await Undo.canUndo()).toBe(false);
        });
    });

    describe('Prefab dirty/undo contract', () => {
        const createPath = 'UndoPrefabCreate';
        const applyPath = 'UndoPrefabApply';
        const unpackPath = 'UndoPrefabUnpack';
        const unlinkPath = 'UndoPrefabUnlink';
        const revertPath = 'UndoPrefabRevert';
        const createURL = `${SceneTestEnv.targetDirectoryURL}/UndoPrefabCreate.prefab`;
        const applyURL = `${SceneTestEnv.targetDirectoryURL}/UndoPrefabApply.prefab`;
        const unpackURL = `${SceneTestEnv.targetDirectoryURL}/UndoPrefabUnpack.prefab`;
        const unlinkURL = `${SceneTestEnv.targetDirectoryURL}/UndoPrefabUnlink.prefab`;
        const revertURL = `${SceneTestEnv.targetDirectoryURL}/UndoPrefabRevert.prefab`;

        afterEach(async () => {
            await safeDelete(createPath);
            await safeDelete(applyPath);
            await safeDelete(unpackPath);
            await safeDelete(unlinkPath);
            await safeDelete(revertPath);
            await Undo.clearHistory();
        });

        it('createPrefabFromNode marks the scene dirty through undo orchestration', async () => {
            await Node.createByType({ path: createPath, nodeType: NodeType.EMPTY });
            await Undo.clearHistory();

            const dirtyEvents = await collectDirtyEvents(async () => {
                await Prefab.createPrefabFromNode({
                    nodePath: createPath,
                    dbURL: createURL,
                    overwrite: true,
                });
            });

            expect(dirtyEvents).toEqual([true]);
            expect(await Undo.isDirty()).toBe(true);
            expect(await Undo.canUndo()).toBe(true);
        });

        it('applyPrefabChanges marks dirty without clearing undo history', async () => {
            await Node.createByType({ path: applyPath, nodeType: NodeType.EMPTY });
            await Prefab.createPrefabFromNode({
                nodePath: applyPath,
                dbURL: applyURL,
                overwrite: true,
            });
            await setNodeProperty(applyPath, 'scale', { x: 2, y: 2, z: 2 });
            await Undo.clearHistory();

            const dirtyEvents = await collectDirtyEvents(async () => {
                const result = await Prefab.applyPrefabChanges({ nodePath: applyPath });
                expect(result).toBe(true);
            });

            expect(dirtyEvents).toEqual([true]);
            expect(await Undo.isDirty()).toBe(true);
            expect(await Undo.canUndo()).toBe(true);
        });

        it('applyPrefabChanges undo and redo restore prefab asset content', async () => {
            await Node.createByType({ path: applyPath, nodeType: NodeType.EMPTY });
            await Prefab.createPrefabFromNode({
                nodePath: applyPath,
                dbURL: applyURL,
                overwrite: true,
            });
            const beforeApplyScale = await readPrefabRootScale(applyURL);
            await setNodeProperty(applyPath, 'scale', { x: 3, y: 3, z: 3 });
            await Undo.clearHistory();

            const result = await Prefab.applyPrefabChanges({ nodePath: applyPath });
            expect(result).toBe(true);
            const afterApplyScale = await readPrefabRootScale(applyURL);
            expect(afterApplyScale).toEqual({ x: 3, y: 3, z: 3 });
            expect(await Undo.isDirty()).toBe(true);

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            expect(await readPrefabRootScale(applyURL)).toEqual(beforeApplyScale);
            expect(await Undo.isDirty()).toBe(false);

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            expect(await readPrefabRootScale(applyURL)).toEqual(afterApplyScale);
            expect(await Undo.isDirty()).toBe(true);
        });

        it('unpackPrefabInstance marks dirty, can undo back to a prefab instance, and can redo', async () => {
            await Node.createByType({ path: unpackPath, nodeType: NodeType.EMPTY });
            await Prefab.createPrefabFromNode({
                nodePath: unpackPath,
                dbURL: unpackURL,
                overwrite: true,
            });
            expect(await Prefab.getPrefabInfo({ nodePath: unpackPath })).toBeTruthy();
            await Undo.clearHistory();

            const dirtyEvents = await collectDirtyEvents(async () => {
                await Prefab.unpackPrefabInstance({
                    nodePath: unpackPath,
                    recursive: true,
                });
            });

            expect(dirtyEvents).toEqual([true]);
            expect(await Undo.isDirty()).toBe(true);
            expect(await Undo.canUndo()).toBe(true);
            await expectPrefabInstance(unpackPath, false, 'after unpack');

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            await expectPrefabInstance(unpackPath, true, 'after undo');
            expect(await Undo.isDirty()).toBe(false);

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            await expectPrefabInstance(unpackPath, false, 'after redo');
            expect(await Undo.isDirty()).toBe(true);
        });

        it('unlinkPrefab marks dirty, can undo back to a prefab instance, and can redo', async () => {
            await Node.createByType({ path: unlinkPath, nodeType: NodeType.EMPTY });
            await Prefab.createPrefabFromNode({
                nodePath: unlinkPath,
                dbURL: unlinkURL,
                overwrite: true,
            });
            await expectPrefabInstance(unlinkPath, true, 'before unlink');
            await Undo.clearHistory();

            const dirtyEvents = await collectDirtyEvents(async () => {
                const result = await Prefab.unlinkPrefab({
                    nodePath: unlinkPath,
                    removeNested: true,
                });
                expect(result).toBe(true);
            });

            expect(dirtyEvents).toEqual([true]);
            expect(await Undo.isDirty()).toBe(true);
            expect(await Undo.canUndo()).toBe(true);
            await expectPrefabInstance(unlinkPath, false, 'after unlink');

            const undoResult = await Undo.undo();
            expectUndoSuccess(undoResult);
            await expectPrefabInstance(unlinkPath, true, 'after undo');
            expect(await Undo.isDirty()).toBe(false);

            const redoResult = await Undo.redo();
            expectUndoSuccess(redoResult);
            await expectPrefabInstance(unlinkPath, false, 'after redo');
            expect(await Undo.isDirty()).toBe(true);
        });

        it('revertToPrefab marks dirty without clearing undo history', async () => {
            await Node.createByType({ path: revertPath, nodeType: NodeType.EMPTY });
            await Prefab.createPrefabFromNode({
                nodePath: revertPath,
                dbURL: revertURL,
                overwrite: true,
            });
            await setNodeProperty(revertPath, 'scale', { x: 4, y: 4, z: 4 });
            await Undo.clearHistory();

            const dirtyEvents = await collectDirtyEvents(async () => {
                await Prefab.revertToPrefab({ nodePath: revertPath });
            });

            expect(dirtyEvents).toEqual([true]);
            expect(await Undo.isDirty()).toBe(true);
            expect(await Undo.canUndo()).toBe(true);
            const reverted = await queryNode(revertPath);
            expect(reverted?.properties.scale).toEqual({ x: 1, y: 1, z: 1 });
        });
    });

    describe('Lifecycle', () => {
        const path = 'UndoLifecycleNode';
        const movedPosition = { x: 7, y: 8, z: 0 };

        beforeEach(async () => {
            await ensureSceneOpen();
            await safeDelete(path);
            await Node.createByType({ path, nodeType: NodeType.EMPTY });
            await Undo.clearHistory();
        });

        afterEach(async () => {
            await ensureSceneOpen();
            await safeDelete(path);
            await Undo.clearHistory();
        });

        it('open clears history for the current editor resource', async () => {
            await Node.update({ path, properties: { position: movedPosition } });
            expect(await Undo.canUndo()).toBe(true);
            expect(await Undo.isDirty()).toBe(true);

            await Editor.open({ urlOrUUID: SceneTestEnv.sceneURL });

            expect(await Undo.canUndo()).toBe(false);
            expect(await Undo.canRedo()).toBe(false);
            expect(await Undo.isDirty()).toBe(false);
        });

        it('reload clears history for stale scene objects', async () => {
            await Node.update({ path, properties: { position: movedPosition } });
            expect(await Undo.canUndo()).toBe(true);

            await Editor.reload({});

            expect(await Undo.canUndo()).toBe(false);
            expect(await Undo.canRedo()).toBe(false);
            expect(await Undo.isDirty()).toBe(false);
        });

        it('close clears history', async () => {
            await Node.update({ path, properties: { position: movedPosition } });
            expect(await Undo.canUndo()).toBe(true);

            await Editor.close({});

            expect(await Undo.canUndo()).toBe(false);
            expect(await Undo.canRedo()).toBe(false);
            expect(await Undo.isDirty()).toBe(false);
        });

        it('save marks the current history cursor as clean', async () => {
            await Node.update({ path, properties: { position: movedPosition } });
            expect(await Undo.isDirty()).toBe(true);

            await Editor.save({});

            expect(await Undo.isDirty()).toBe(false);
            expect(await Undo.canUndo()).toBe(true);
        });

        it('dirty:changed fires only when dirty state flips', async () => {
            const dirtyEvents: boolean[] = [];
            const handler = (dirty: boolean) => dirtyEvents.push(dirty);
            sceneWorker.on('dirty:changed', handler);
            try {
                await Node.update({ path, properties: { position: movedPosition } });
                await delay(30);
                expect(dirtyEvents).toEqual([true]);

                await Node.update({ path, properties: { scale: { x: 2, y: 2, z: 1 } } });
                await delay(30);
                expect(dirtyEvents).toEqual([true]);

                await Undo.markSaved();
                await delay(30);
                expect(dirtyEvents).toEqual([true, false]);
            } finally {
                sceneWorker.off('dirty:changed', handler);
            }
        });

        it('clearHistory broadcasts undo:changed when it clears stack state', async () => {
            const undoEvents: unknown[] = [];
            const handler = (...args: unknown[]) => undoEvents.push(args);
            sceneWorker.on('undo:changed', handler);
            try {
                await Node.update({ path, properties: { position: movedPosition } });
                await delay(30);
                undoEvents.length = 0;

                await Undo.clearHistory();
                await delay(30);

                expect(await Undo.canUndo()).toBe(false);
                expect(await Undo.canRedo()).toBe(false);
                expect(undoEvents).toHaveLength(1);
            } finally {
                sceneWorker.off('undo:changed', handler);
            }
        });
    });
});
