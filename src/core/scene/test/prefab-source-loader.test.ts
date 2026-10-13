const mockBaselines = new Map<string, { assetUuid: string; content: string; fingerprint: string }>();
let mockDisk = 'original';
const mockRemove = jest.fn();
jest.mock('cc', () => ({ assetManager: { assets: { remove: mockRemove } } }));
jest.mock('../scene-process/rpc', () => ({ Rpc: { getInstance: () => ({
    request: async (_module: string, method: string, [uuid]: string[]) => method === 'queryAssetInfo' ? { uuid, type: 'cc.Prefab' } : [],
}) } }));
jest.mock('../scene-process/service/prefab/write-session', () => ({ prefabWriteSession: {
    active: true,
    readSource: async (uuid: string) => ({ assetUuid: uuid, content: mockDisk, fingerprint: mockDisk }),
    knownBaseline: (uuid: string) => mockBaselines.get(uuid),
    loaded: (source: { assetUuid: string; content: string; fingerprint: string }) => mockBaselines.set(source.assetUuid, source),
} }));

import { loadWithPrefabSources } from '../scene-process/service/prefab/source-loader';

describe('Prefab source loading baseline', () => {
    beforeEach(() => {
        mockBaselines.clear();
        mockBaselines.set('asset', { assetUuid: 'asset', content: 'original', fingerprint: 'original' });
        mockDisk = 'original';
        mockRemove.mockClear();
    });

    it('refuses to bless old instances by loading a newer asset beside them', async () => {
        mockDisk = 'new';
        const load = jest.fn();
        await expect(loadWithPrefabSources(['asset'], load)).rejects.toMatchObject({ code: 'PREFAB_SOURCE_CHANGED' });
        expect([load.mock.calls.length, mockRemove.mock.calls.length, mockBaselines.get('asset')?.content]).toEqual([0, 0, 'original']);
    });

    it('allows Undo relinking inside a full replacement without advancing its baseline early', async () => {
        mockDisk = 'new';
        await loadWithPrefabSources(['asset'], async () => {
            await loadWithPrefabSources(['asset'], async () => 'relinked');
            expect(mockBaselines.get('asset')?.content).toBe('original');
        }, true);
        expect(mockBaselines.get('asset')?.content).toBe('new');
    });

    it('retains the old baseline when the outer restore fails after successful relinking', async () => {
        mockDisk = 'new';
        await expect(loadWithPrefabSources(['asset'], async () => {
            await loadWithPrefabSources(['asset'], async () => 'relinked');
            throw new Error('tree restore failed');
        }, true)).rejects.toThrow('tree restore failed');
        expect(mockBaselines.get('asset')?.content).toBe('original');
    });

    it('rejects an external source change during loading', async () => {
        await expect(loadWithPrefabSources(['asset'], async () => { mockDisk = 'external'; }, true)).rejects.toMatchObject({ code: 'PREFAB_SOURCE_CHANGED' });
        expect(mockBaselines.get('asset')?.content).toBe('original');
    });
});
