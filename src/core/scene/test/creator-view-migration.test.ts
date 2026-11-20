import path from 'path';
import fse from 'fs-extra';
import { migrateCreatorSceneView } from '../creator-view-migration';
import type { IBaseConfiguration } from '../../configuration';

jest.mock('fs-extra', () => ({ pathExists: jest.fn(), readJSON: jest.fn() }));

describe('Creator scene view migration', () => {
    const front = { rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: 2 };
    let local: Record<string, any>;
    let config: IBaseConfiguration;

    beforeEach(() => {
        jest.clearAllMocks();
        local = {};
        config = {
            getAll: () => local,
            getDefaultConfig: () => ({ camera: { fov: 45 }, gizmo: { is2D: false, originAxis2D: {} } }),
            set: jest.fn(async (key, value, scope) => {
                expect(scope).toBe('local');
                local[key] = value;
                return true;
            }),
        } as unknown as IBaseConfiguration;
        (fse.pathExists as jest.Mock).mockResolvedValue(true);
        (fse.readJSON as jest.Mock).mockResolvedValue({
            camera: { fov: 60, near2D: 1 },
            'gizmos-infos': { is2D: true, originAxis2D: { x_visible: true, y_visible: false, z_visible: false } },
            'camera-infos': { front },
            'camera-uuids': ['front'],
            'snap-configs': { rotation: 15 },
        });
    });

    it('imports personal view state and converts Creator axis fields', async () => {
        await migrateCreatorSceneView(config, '/project/profiles/cocos.config.json');
        expect(fse.readJSON).toHaveBeenCalledWith(path.join('/project/profiles', 'v2', 'packages', 'scene.json'));
        expect(local.gizmo).toEqual({ is2D: true, originAxis2D: { x: true, y: false, z: false }, snapConfigs: { rotation: 15 } });
        expect(local.camera).toEqual({ fov: 60, near2D: 1 });
        expect(local['camera-infos']).toEqual({ front });
        expect(local['camera-uuids']).toEqual(['front']);
        expect(local.creatorViewMigrationVersion).toBe(1);
    });

    it('preserves CLI preferences and complete existing poses while adding missing scenes', async () => {
        local = { gizmo: { is2D: false, originAxis2D: { x: false } }, 'camera-infos': { front: { scale: 3 }, other: { scale: 4 } } };
        await migrateCreatorSceneView(config, '/project/profiles/cocos.config.json');
        expect(local.gizmo.is2D).toBe(false);
        expect(local.gizmo.originAxis2D).toEqual({ x: false, y: false, z: false });
        expect(local['camera-infos'].front).toEqual({ scale: 3 });
        expect(local['camera-infos'].other).toEqual({ scale: 4 });
    });

    it('does not restore deleted views after migration has completed', async () => {
        await migrateCreatorSceneView(config, '/project/profiles/cocos.config.json');
        local['camera-infos'] = {};
        await migrateCreatorSceneView(config, '/project/profiles/cocos.config.json');
        expect(local['camera-infos']).toEqual({});
        expect(fse.readJSON).toHaveBeenCalledTimes(1);
    });

    it('adds Creator scenes alongside existing CLI scenes', async () => {
        local = { 'camera-infos': { other: { scale: 4 } }, 'camera-uuids': ['other'] };
        await migrateCreatorSceneView(config, '/project/profiles/cocos.config.json');
        expect(local['camera-infos']).toEqual({ front, other: { scale: 4 } });
        expect(local['camera-uuids']).toEqual(['front', 'other']);
    });

    it('leaves new projects on defaults when no Creator profile exists', async () => {
        (fse.pathExists as jest.Mock).mockResolvedValue(false);
        await migrateCreatorSceneView(config, '/project/profiles/cocos.config.json');
        expect(config.set).not.toHaveBeenCalled();
    });

    it('imports the empty-2d project template without inventing scene poses', async () => {
        (fse.readJSON as jest.Mock).mockResolvedValue({ 'gizmos-infos': { is2D: true } });
        await migrateCreatorSceneView(config, '/project/profiles/cocos.config.json');
        expect(local.gizmo).toEqual({ is2D: true });
        expect(local['camera-infos']).toBeUndefined();
    });

    it('keeps CLI view history at the recent end of the merged list', async () => {
        local = { 'camera-infos': { front, other: { scale: 4 } }, 'camera-uuids': ['other', 'front'] };
        await migrateCreatorSceneView(config, '/project/profiles/cocos.config.json');
        expect(local['camera-uuids']).toEqual(['other', 'front']);
    });

    it('does not mark unreadable profiles as migrated', async () => {
        (fse.readJSON as jest.Mock).mockRejectedValue(new Error('Invalid JSON'));
        await expect(migrateCreatorSceneView(config, '/project/profiles/cocos.config.json')).rejects.toThrow('Invalid JSON');
        expect(config.set).not.toHaveBeenCalled();
    });

    it.each([null, [], 'invalid'])('ignores a malformed profile root: %p', async (profile) => {
        (fse.readJSON as jest.Mock).mockResolvedValue(profile);
        await migrateCreatorSceneView(config, '/project/profiles/cocos.config.json');
        expect(config.set).not.toHaveBeenCalled();
    });

    it('does not access profiles before the local configuration path is available', async () => {
        await migrateCreatorSceneView(config, '');
        expect(fse.pathExists).not.toHaveBeenCalled();
        expect(config.set).not.toHaveBeenCalled();
    });
});
