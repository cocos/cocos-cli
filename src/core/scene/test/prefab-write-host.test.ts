import { mkdtemp, readFile, remove, writeFile } from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import type { PrefabWriteResult } from '../common/prefab-write';

const mockQueryAssetInfo = jest.fn();
const mockSaveAsset = jest.fn();
jest.mock('../../assets', () => ({ assetManager: {
    queryAssetInfo: (uuid: string) => mockQueryAssetInfo(uuid),
    saveAsset: (uuid: string, content: string) => mockSaveAsset(uuid, content),
} }));

import { AssetDBPrefabSourceStore, PrefabWriteHost } from '../main-process/prefab-write-host';
import { PrefabWriteCoordinator } from '../main-process/prefab-write-coordinator';

function value<T>(result: PrefabWriteResult<T>): T {
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.value;
}

describe('Prefab write Host Adapter', () => {
    let directory: string;
    let source: string;
    let host: PrefabWriteHost;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'prefab-write-host-'));
        source = join(directory, 'Node.prefab');
        await writeFile(source, 'old-content');
        mockQueryAssetInfo.mockReset().mockImplementation(uuid => ({ uuid, type: 'cc.Prefab', source: 'db://assets/Node.prefab', file: source }));
        mockSaveAsset.mockReset().mockImplementation(async (uuid, content) => {
            await writeFile(source, content);
            return { uuid };
        });
        host = new PrefabWriteHost(new PrefabWriteCoordinator(new AssetDBPrefabSourceStore()));
    });

    afterEach(async () => {
        await host.reset();
        await remove(directory);
    });

    const register = (runtimeId: string, prefabUuid?: string, dirty = false) => host.registerRuntime({
        runtime: { runtimeId, generation: 1 }, prefabUuid, editVersion: 0, state: { status: 'ready', dirty },
    });

    it('reads actual source bytes and persists through Asset DB by UUID', async () => {
        const registration = value(await register('scene'));
        const lease = value(await host.beginEdit({ registration, expectedEditVersion: 0 }));
        const baseline = value(await host.readSource('prefab-a'));
        const receipt = value(await host.commit({ source: lease, assetUuid: 'prefab-a', expectedFingerprint: baseline.fingerprint, content: 'new-content' }));
        expect([receipt.before.content, receipt.after.content, await readFile(source, 'utf8')])
            .toEqual(['old-content', 'new-content', 'new-content']);
        expect(mockSaveAsset).toHaveBeenCalledWith('prefab-a', 'new-content');
    });

    it('returns a JSON-safe domain error without exposing ownership tokens', async () => {
        const registration = value(await register('scene'));
        const lease = value(await host.beginEdit({ registration, expectedEditVersion: 0 }));
        const target = value(await register('prefab-editor', 'prefab-a', true));
        const baseline = value(await host.readSource('prefab-a'));
        const response = await host.commit({ source: lease, assetUuid: 'prefab-a', expectedFingerprint: baseline.fingerprint, content: 'new-content' });
        expect(JSON.parse(JSON.stringify(response))).toEqual({
            ok: false,
            error: {
                code: 'PREFAB_DOCUMENT_DIRTY',
                message: 'The Prefab has another unsaved working copy.',
                commitState: 'not-committed',
                assetUuid: 'prefab-a',
                runtime: { runtimeId: target.runtimeId, generation: target.generation },
            },
        });
        expect(mockSaveAsset).not.toHaveBeenCalled();
    });

    it('re-resolves a moved resource and hashes external disk changes', async () => {
        const first = value(await host.readSource('prefab-a'));
        source = join(directory, 'Moved.prefab');
        await writeFile(source, 'external-change');
        const next = value(await host.readSource('prefab-a'));
        expect(next.content).toBe('external-change');
        expect(next.fingerprint).not.toBe(first.fingerprint);
    });

    it.each(['missing', 'wrong-type', 'sub-asset'] as const)('refuses a %s source', async kind => {
        if (kind === 'missing') mockQueryAssetInfo.mockReturnValue(null);
        if (kind === 'wrong-type') mockQueryAssetInfo.mockReturnValue({ uuid: 'prefab-a', type: 'cc.SceneAsset', source });
        const result = await host.readSource(kind === 'sub-asset' ? 'prefab-a@child' : 'prefab-a');
        expect(result).toMatchObject({ ok: false, error: { code: 'PREFAB_SOURCE_UNAVAILABLE', commitState: 'not-committed' } });
        expect(mockSaveAsset).not.toHaveBeenCalled();
    });

    it('does not misreport an import rejection as an uncommitted write', async () => {
        const registration = value(await register('scene'));
        const lease = value(await host.beginEdit({ registration, expectedEditVersion: 0 }));
        const baseline = value(await host.readSource('prefab-a'));
        mockSaveAsset.mockImplementationOnce(async (_uuid, content) => {
            await writeFile(source, content);
            throw new Error('Import failed after save');
        });
        await expect(host.commit({ source: lease, assetUuid: 'prefab-a', expectedFingerprint: baseline.fingerprint, content: 'new-content' }))
            .resolves.toMatchObject({ ok: false, error: { code: 'PREFAB_WRITE_FAILED', commitState: 'unknown' } });
        expect(await readFile(source, 'utf8')).toBe('new-content');
    });
});
