import { enrichMissingDependencyError } from '../scene-process/service/error-utils';

describe('enrichMissingDependencyError', () => {
    const OWNER = 'db://assets/my_scene.scene';
    const UUID = '12345678-abcd-1234-abcd-1234567890ab';
    const SUB_UUID = `${UUID}@b47c0`;

    it('extracts uuid from download-failed message', async () => {
        const errInfo = `download failed: http://localhost:1234/${UUID}.json`;
        const msg = await enrichMissingDependencyError(errInfo, OWNER);
        expect(msg).toContain(UUID);
        expect(msg).toContain(OWNER);
        expect(msg).toContain('missing');
    });

    it('extracts uuid with @sub-asset suffix', async () => {
        const errInfo = `download failed: http://localhost:1234/${SUB_UUID}.json`;
        const msg = await enrichMissingDependencyError(errInfo, OWNER);
        expect(msg).toContain(SUB_UUID);
    });

    it('includes asset url when queryAssetInfo resolves for full uuid', async () => {
        const errInfo = `download failed: http://localhost:1234/${SUB_UUID}.json`;
        const query = jest.fn().mockResolvedValue({ url: 'db://assets/SK_Foo.fbx@b47c0' });
        const msg = await enrichMissingDependencyError(errInfo, OWNER, query);
        expect(query).toHaveBeenCalledWith(SUB_UUID);
        expect(msg).toContain('"db://assets/SK_Foo.fbx@b47c0"');
        expect(msg).toContain(SUB_UUID);
    });

    it('falls back to parent uuid when sub-asset query returns null', async () => {
        const errInfo = `download failed: http://localhost:1234/${SUB_UUID}.json`;
        const query = jest.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ url: 'db://assets/SK_Foo.fbx' });
        const msg = await enrichMissingDependencyError(errInfo, OWNER, query);
        expect(query).toHaveBeenCalledWith(SUB_UUID);
        expect(query).toHaveBeenCalledWith(UUID);
        expect(msg).toContain('"db://assets/SK_Foo.fbx@b47c0"');
        expect(msg).toContain(SUB_UUID);
    });

    it('shows sub-asset name when querySubAssetName resolves', async () => {
        const errInfo = `download failed: http://localhost:1234/${SUB_UUID}.json`;
        const queryInfo = jest.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ url: 'db://assets/scene.gltf' });
        const querySubName = jest.fn().mockResolvedValue('fox1_fox_material_0.mesh');
        const msg = await enrichMissingDependencyError(errInfo, OWNER, queryInfo, querySubName);
        expect(querySubName).toHaveBeenCalledWith(UUID, 'b47c0');
        expect(msg).toContain('"db://assets/scene.gltf/fox1_fox_material_0.mesh"');
        expect(msg).toContain(SUB_UUID);
    });

    it('falls back to @subId when querySubAssetName returns null', async () => {
        const errInfo = `download failed: http://localhost:1234/${SUB_UUID}.json`;
        const queryInfo = jest.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ url: 'db://assets/scene.gltf' });
        const querySubName = jest.fn().mockResolvedValue(null);
        const msg = await enrichMissingDependencyError(errInfo, OWNER, queryInfo, querySubName);
        expect(msg).toContain('"db://assets/scene.gltf@b47c0"');
    });

    it('shows sub-asset name alone when parent url is unavailable', async () => {
        const errInfo = `download failed: http://localhost:1234/${SUB_UUID}.json`;
        const queryInfo = jest.fn().mockResolvedValue(null);
        const querySubName = jest.fn().mockResolvedValue('Walk.animation');
        const msg = await enrichMissingDependencyError(errInfo, OWNER, queryInfo, querySubName);
        expect(msg).toContain('"Walk.animation"');
        expect(msg).toContain(SUB_UUID);
    });

    it('handles querySubAssetName throwing gracefully', async () => {
        const errInfo = `download failed: http://localhost:1234/${SUB_UUID}.json`;
        const queryInfo = jest.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ url: 'db://assets/scene.gltf' });
        const querySubName = jest.fn().mockRejectedValue(new Error('meta not found'));
        const msg = await enrichMissingDependencyError(errInfo, OWNER, queryInfo, querySubName);
        expect(msg).toContain('"db://assets/scene.gltf@b47c0"');
    });

    it('falls back to uuid-only when both queries return null', async () => {
        const errInfo = `download failed: http://localhost:1234/${UUID}.json`;
        const query = jest.fn().mockResolvedValue(null);
        const msg = await enrichMissingDependencyError(errInfo, OWNER, query);
        expect(msg).toContain(UUID);
    });

    it('falls back to uuid-only when queryAssetInfo throws', async () => {
        const errInfo = `download failed: http://localhost:1234/${UUID}.json`;
        const query = jest.fn().mockRejectedValue(new Error('db not ready'));
        const msg = await enrichMissingDependencyError(errInfo, OWNER, query);
        expect(msg).toContain(UUID);
    });

    it('preserves original error detail when regex does not match', async () => {
        const errInfo = 'some unexpected error format';
        const msg = await enrichMissingDependencyError(errInfo, OWNER);
        expect(msg).toContain('Detail: some unexpected error format');
        expect(msg).toContain(OWNER);
    });

    it('handles empty error message', async () => {
        const msg = await enrichMissingDependencyError('', OWNER);
        expect(msg).toContain('Detail:');
        expect(msg).toContain(OWNER);
    });
});
