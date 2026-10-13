jest.mock('../../assets', () => ({ assetManager: {} }));
const mockRequest = jest.fn();
const mockNode = {
    uuid: 'node', isValid: true,
    _prefab: { asset: { _uuid: 'asset' }, instance: { removedComponents: [{ localID: ['component'] }], propertyOverrides: ['unrelated'] } },
};
const mockAssetRoot = { _prefab: {}, components: ['component', 'other'] };
const mockDestroyCached = jest.fn();
const mockRemoveCache = jest.fn();
const mockReload = jest.fn();
const mockCapture = jest.fn(() => ({ uuid: mockNode.uuid, path: 'Root', serializedJson: JSON.stringify(mockNode._prefab.instance) }));
let mockManager: import('../scene-process/service/undo/scene-undo-manager').SceneUndoManager;

jest.mock('cc', () => ({
    Node: class {}, Scene: class {}, Component: class {}, Prefab: { _utils: {} },
    assetManager: { assets: { remove: jest.fn() } },
}));
jest.mock('../scene-process/rpc', () => ({ Rpc: { getInstance: () => ({ request: mockRequest }) } }));
jest.mock('../scene-process/service/dump', () => ({}));
jest.mock('../scene-process/service/prefab/node', () => ({ nodeOperation: {} }));
jest.mock('../scene-process/service/scene/utils', () => ({ sceneUtils: {} }));
jest.mock('../scene-process/service/prefab/write-candidate', () => ({
    withPrefabCandidate: (source: typeof mockAssetRoot, prepare: (candidate: typeof mockAssetRoot) => unknown) =>
        prepare({ _prefab: {}, components: [...source.components] }),
}));
jest.mock('../scene-process/service/undo/commands/node-structure-command-utils', () => ({
    captureNodeStructureSnapshot: mockCapture,
    createNodeCommandMeta: (type: string, label: string) => ({ id: 'apply', type, label, scope: {}, timestamp: 0 }),
    failure: (_meta: unknown, reason: string) => ({ success: false, reason }),
}));
jest.mock('../scene-process/service/undo/commands/prefab-command-utils', () => ({
    replacePrefabNodeSnapshot: async (_remove: unknown, restore: { serializedJson: string }) => {
        mockNode._prefab.instance = JSON.parse(restore.serializedJson);
        return { success: true };
    },
}));
jest.mock('../scene-process/service/core', () => ({
    BaseService: class {}, register: () => () => {}, ServiceEvents: {},
    Service: { Undo: {
        push: (command: import('../common').IUndoCommand) => mockManager.push(command),
        isApplying: () => mockManager.isApplying(),
    } },
    queryRegisteredService: () => ({ reloadWithinPrefabEdit: mockReload }),
}));
jest.mock('../scene-process/service/core/decorator', () => ({ queryRegisteredService: () => ({ isDirty: () => true }) }));
jest.mock('../scene-process/service/prefab/utils', () => ({ prefabUtils: {
    getOutMostPrefabInstanceInfo: () => ({ outMostPrefabInstanceNode: mockNode, targetPath: ['root'] }),
    getPrefab: (node: typeof mockNode) => node._prefab,
    isSubAsset: () => false,
    getPrefabAssetNodeInstance: () => mockAssetRoot,
    getTarget: ([id]: string[], root: typeof mockAssetRoot) => ({
        _destroyImmediate: () => {
            if (root === mockAssetRoot) mockDestroyCached();
            root.components = root.components.filter(component => component !== id);
        },
    }),
    generatePrefabDataFromNode: (root: typeof mockAssetRoot) => ({ prefabData: JSON.stringify(root.components) }),
    fireBeforeChangeMsg: () => {}, fireChangeMsg: () => {},
    deleteRemovedComponent: (instance: typeof mockNode._prefab.instance, path: string[]) => {
        instance.removedComponents = instance.removedComponents.filter(target => target.localID.join('/') !== path.join('/'));
    },
    removePrefabAssetNodeInstanceCache: mockRemoveCache,
} }));

import { ReloadResult } from '../common';
import { PrefabWriteCoordinator } from '../main-process/prefab-write-coordinator';
import { PrefabWriteHost } from '../main-process/prefab-write-host';
import { PrefabWriteRuntime } from '../scene-process/service/prefab/write-runtime';
import { prefabWriteSession } from '../scene-process/service/prefab/write-session';
import { SceneUndoManager } from '../scene-process/service/undo/scene-undo-manager';
import { PrefabApplyCommand } from '../scene-process/service/undo/commands/prefab-apply-command';
const globals = globalThis as unknown as { EditorExtends: typeof EditorExtends };
const previousEditorExtends = globals.EditorExtends;
globals.EditorExtends = { Node: { getNode: () => mockNode, getNodePath: () => 'Root' } } as unknown as typeof EditorExtends;
const { PrefabService } = require('../scene-process/service/prefab') as typeof import('../scene-process/service/prefab');

describe('Removed component Apply source protection', () => {
    let disk: string;
    let target: PrefabWriteRuntime;
    let targetDirty: boolean;
    let host: PrefabWriteHost;
    const original = JSON.stringify(['component', 'other']);
    const applied = JSON.stringify(['other']);
    const apply = () => new PrefabService().applyRemovedComponent('node', 'component');
    const undo = () => prefabWriteSession.edit(() => mockManager.undo(), true);
    const redo = () => prefabWriteSession.edit(() => mockManager.redo(), true);
    afterAll(() => { globals.EditorExtends = previousEditorExtends; });

    beforeEach(async () => {
        disk = original;
        targetDirty = true;
        host = new PrefabWriteHost(new PrefabWriteCoordinator({
            read: async () => Buffer.from(disk), write: async (_uuid, content) => { disk = content; },
        }));
        mockManager = new SceneUndoManager();
        mockNode._prefab.instance = { removedComponents: [{ localID: ['component'] }], propertyOverrides: ['unrelated'] };
        mockAssetRoot.components = ['component', 'other'];
        mockDestroyCached.mockClear();
        mockRemoveCache.mockReset();
        mockCapture.mockClear();
        mockReload.mockReset().mockImplementation(async () => {
            prefabWriteSession.loaded(await prefabWriteSession.readSource('asset'));
            return ReloadResult.SUCCESS;
        });
        mockRequest.mockReset().mockImplementation(async (module: string, method: string, args: unknown[]) => {
            if (module === 'assetManager') {
                // Retain the legacy write Adapter so a bypass is caught by the assertions below.
                if (method === 'createAsset') disk = (args[0] as { content: string }).content;
                if (method === 'queryAssetDependencies') return [];
                return { uuid: 'asset', type: 'cc.Prefab', source: 'db://assets/asset.prefab' };
            }
            return (host as unknown as Record<string, (...values: unknown[]) => unknown>)[method](...args);
        });
        target = new PrefabWriteRuntime(host, () => targetDirty);
        await target.open('target', 1, 'asset');
        await prefabWriteSession.open('scene', 1);
        prefabWriteSession.loaded(await prefabWriteSession.readSource('asset'));
    });

    afterEach(async () => {
        await prefabWriteSession.close();
        await target.close();
        jest.restoreAllMocks();
    });

    const cleanTarget = async () => {
        targetDirty = false;
        await target.edit(async () => {});
    };

    function expectUntouched() {
        expect(mockNode._prefab.instance).toEqual({ removedComponents: [{ localID: ['component'] }], propertyOverrides: ['unrelated'] });
        expect(mockAssetRoot.components).toEqual(['component', 'other']);
        expect(mockDestroyCached).not.toHaveBeenCalled();
        expect(mockRemoveCache).not.toHaveBeenCalled();
        expect(mockReload).not.toHaveBeenCalled();
        expect(mockManager.canUndo()).toBe(false);
    }

    it('rejects a dirty target before changing the source, cached component, or live overrides', async () => {
        await expect(apply()).rejects.toMatchObject({ code: 'PREFAB_DOCUMENT_DIRTY', commitState: 'not-committed' });
        expect(disk).toBe(original);
        expectUntouched();
    });

    it('rejects a stale source without consuming the removal override', async () => {
        await cleanTarget();
        disk = 'external';
        await expect(apply()).rejects.toMatchObject({ code: 'PREFAB_SOURCE_CHANGED', commitState: 'not-committed' });
        expect(disk).toBe('external');
        expectUntouched();
    });

    it('retains the working copy when publication fails', async () => {
        await cleanTarget();
        jest.spyOn(host, 'commit').mockResolvedValue({ ok: false, error: {
            code: 'PREFAB_WRITE_FAILED', commitState: 'unknown', message: 'import failed', assetUuid: 'asset',
        } });
        await expect(apply()).rejects.toMatchObject({ code: 'PREFAB_WRITE_FAILED', commitState: 'unknown' });
        expectUntouched();
    });

    it('publishes only the selected removal and restores source and overrides through Undo/Redo', async () => {
        await cleanTarget();
        await apply();
        expect(disk).toBe(applied);
        expect(mockNode._prefab.instance).toEqual({ removedComponents: [], propertyOverrides: ['unrelated'] });
        expect(mockAssetRoot.components).toEqual(['component', 'other']);
        expect(mockDestroyCached).not.toHaveBeenCalled();
        expect(mockRemoveCache).toHaveBeenCalledTimes(1);
        expect(mockManager.getHistoryForTesting()[0]).toBeInstanceOf(PrefabApplyCommand);
        await expect(undo()).resolves.toMatchObject({ success: true });
        expect(disk).toBe(original);
        expect(mockNode._prefab.instance.removedComponents).toEqual([{ localID: ['component'] }]);
        await expect(redo()).resolves.toMatchObject({ success: true });
        expect(disk).toBe(applied);
        expect(mockNode._prefab.instance.removedComponents).toEqual([]);
    });

    it('rejects Undo and Redo against an intervening source publication without moving the cursor', async () => {
        await cleanTarget();
        await apply();
        disk = 'external';
        await expect(undo()).resolves.toMatchObject({ success: false, error: { code: 'PREFAB_SOURCE_CHANGED' } });
        expect(mockManager.canUndo()).toBe(true);
        expect(disk).toBe('external');
        disk = applied;
        await expect(undo()).resolves.toMatchObject({ success: true });
        disk = 'external again';
        await expect(redo()).resolves.toMatchObject({ success: false, error: { code: 'PREFAB_SOURCE_CHANGED' } });
        expect(mockManager.canRedo()).toBe(true);
        expect(disk).toBe('external again');
    });

    it('keeps other component removals as unapplied instance overrides', async () => {
        await cleanTarget();
        mockNode._prefab.instance.removedComponents.push({ localID: ['other'] });
        await apply();
        expect(disk).toBe(applied);
        expect(mockNode._prefab.instance.removedComponents).toEqual([{ localID: ['other'] }]);
        await expect(undo()).resolves.toMatchObject({ success: true });
        expect(mockNode._prefab.instance.removedComponents).toEqual([{ localID: ['component'] }, { localID: ['other'] }]);
    });

    it('reports committed and blocks further editing when source-runtime reload fails', async () => {
        await cleanTarget();
        mockReload.mockResolvedValue(ReloadResult.FAILED);
        await expect(apply()).rejects.toMatchObject({ code: 'PREFAB_WRITE_FAILED', commitState: 'committed' });
        expect(disk).toBe(applied);
        expect(mockManager.canUndo()).toBe(false);
        await expect(prefabWriteSession.acquire()).rejects.toMatchObject({ code: 'PREFAB_SESSION_CHANGED' });
    });
});
