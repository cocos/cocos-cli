jest.mock('../../assets', () => ({ assetManager: {} }));
const mockRequest = jest.fn();
const mockReplace = jest.fn();
const mockReload = jest.fn();
jest.mock('cc', () => ({ assetManager: { assets: { remove: jest.fn() } } }));
jest.mock('../scene-process/rpc', () => ({ Rpc: { getInstance: () => ({ request: mockRequest }) } }));
jest.mock('../scene-process/service/core/decorator', () => ({ queryRegisteredService: () => ({ isDirty: () => true }) }));
jest.mock('../scene-process/service/core', () => ({ queryRegisteredService: () => ({ reloadWithinPrefabEdit: mockReload }) }));
jest.mock('../scene-process/service/undo/commands/prefab-command-utils', () => ({ replacePrefabNodeSnapshot: mockReplace }));
jest.mock('../scene-process/service/undo/commands/node-structure-command-utils', () => ({
    createNodeCommandMeta: (type: string, label: string) => ({ id: 'apply', type, label, scope: {}, timestamp: 0 }),
    failure: (_meta: unknown, reason: string) => ({ success: false, reason }),
}));

import { ReloadResult } from '../common';
import { PrefabWriteCoordinator } from '../main-process/prefab-write-coordinator';
import { PrefabWriteHost } from '../main-process/prefab-write-host';
import { prefabWriteSession } from '../scene-process/service/prefab/write-session';
import { PrefabApplyCommand } from '../scene-process/service/undo/commands/prefab-apply-command';
import { SceneUndoManager } from '../scene-process/service/undo/scene-undo-manager';

describe('Prefab Apply history publication failures', () => {
    let disk: string;
    let manager: SceneUndoManager;
    let failRead: boolean;
    let host: PrefabWriteHost;

    beforeEach(async () => {
        disk = 'applied';
        failRead = false;
        host = new PrefabWriteHost(new PrefabWriteCoordinator({
            read: async () => {
                if (failRead) throw new Error('source read failed');
                return Buffer.from(disk);
            },
            write: async (_uuid, content) => { disk = content; },
        }));
        mockRequest.mockReset().mockImplementation(async (module: string, method: string, args: unknown[]) => {
            if (module === 'assetManager') return method === 'queryAssetInfo' ? { uuid: 'asset', type: 'cc.Prefab' } : [];
            return (host as unknown as Record<string, (...values: unknown[]) => unknown>)[method](...args);
        });
        mockReplace.mockReset().mockResolvedValue({ success: true });
        mockReload.mockReset().mockResolvedValue(ReloadResult.SUCCESS);
        await prefabWriteSession.open('scene', 1);
        const baseline = await prefabWriteSession.readSource('asset');
        prefabWriteSession.loaded(baseline);
        manager = new SceneUndoManager();
        manager.push(new PrefabApplyCommand('prefab:apply', 'Apply', {} as never, {} as never,
            'asset', 'db://assets/asset.prefab', 'before', 'applied', baseline.fingerprint));
    });

    afterEach(async () => {
        await prefabWriteSession.close();
        jest.restoreAllMocks();
    });

    it('reports committed when the post-publication source read fails, without moving the undo cursor', async () => {
        const commit = host.commit.bind(host);
        jest.spyOn(host, 'commit').mockImplementation(async options => {
            const result = await commit(options);
            failRead = true;
            return result;
        });
        const result = await prefabWriteSession.edit(() => manager.undo(), true);
        expect(disk).toBe('before');
        expect(result).toMatchObject({ success: false, error: { commitState: 'committed', assetUuid: 'asset' } });
        expect(manager.canUndo()).toBe(true);
        expect(mockReplace).not.toHaveBeenCalled();
    });

    it('normalizes a plain reconstruction error after publication', async () => {
        mockReplace.mockRejectedValue(new Error('snapshot restore failed'));
        const result = await prefabWriteSession.edit(() => manager.undo(), true);
        expect(disk).toBe('before');
        expect(result).toMatchObject({ success: false, error: {
            code: 'PREFAB_WRITE_FAILED', commitState: 'committed', message: 'snapshot restore failed', assetUuid: 'asset',
        } });
        expect(manager.canUndo()).toBe(true);
        await expect(prefabWriteSession.acquire()).rejects.toMatchObject({ code: 'PREFAB_SESSION_CHANGED' });
    });

    it('preserves a pre-publication source conflict', async () => {
        disk = 'external';
        await expect(prefabWriteSession.edit(() => manager.undo(), true)).resolves.toMatchObject({ success: false,
            error: { code: 'PREFAB_SOURCE_CHANGED', commitState: 'not-committed' },
        });
        expect(disk).toBe('external');
        expect(mockReplace).not.toHaveBeenCalled();
        expect(manager.canUndo()).toBe(true);
    });
});
