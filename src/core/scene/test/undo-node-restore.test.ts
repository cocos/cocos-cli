import {
    restoreComponentSnapshotDump,
    restoreNodeSnapshotDump,
} from '../scene-process/service/undo/commands/command-utils-shared';
import {
    NODE_SNAPSHOT_RESTORE_PROPERTY_PATHS,
    COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS,
} from '../scene-process/service/dump/restore-policy';
import { deletedLightmapAssets } from '../scene-process/service/baking/lightfx/deleted-lightmap-assets';

// 模拟 dump 模块，让 restoreNodeSnapshotDump / restoreComponentSnapshotDump
// 可以调用 dumpUtil 方法，同时避免加载依赖真实引擎环境的 dump 模块。
const mockRestoreNodeSnapshotProperties = jest.fn();
const mockRestoreComponentSnapshotProperties = jest.fn();

jest.mock('../scene-process/service/dump', () => ({
    __esModule: true,
    default: {
        restoreNodeSnapshotProperties: mockRestoreNodeSnapshotProperties,
        restoreComponentSnapshotProperties: mockRestoreComponentSnapshotProperties,
    },
}));

describe('restoreNodeSnapshotDump', () => {
    beforeEach(() => {
        mockRestoreNodeSnapshotProperties.mockReset();
    });

    it('restores name via callback, delegates editable properties to dump, restores locked', async () => {
        const node = { uuid: 'node-1', name: 'Before' };
        const updatedNames: Array<[string, string]> = [];
        const restoredLocks: boolean[] = [];
        const dump = {
            path: '/Before',
            name: { value: 'After' },
            active: { value: false },
            layer: { value: 1 },
            mobility: { value: 2 },
            position: { value: { x: 1, y: 2, z: 3 } },
            rotation: { value: { x: 4, y: 5, z: 6 } },
            scale: { value: { x: 7, y: 8, z: 9 } },
            locked: { value: true },
            uuid: { value: 'other-node' },
            parent: { value: { uuid: 'parent' } },
            children: [{ value: { uuid: 'child' } }],
            __comps__: [{ value: { uuid: 'component' } }],
            __type__: 'cc.Node',
        };

        await restoreNodeSnapshotDump(node as any, dump, {
            updateNodeName: (uuid: string, name: string) => {
                updatedNames.push([uuid, name]);
            },
            restoreNodeLocked: (_node: unknown, locked: boolean) => {
                restoredLocks.push(locked);
            },
        });

        // name 由 undo 层回调处理。
        expect(updatedNames).toEqual([['node-1', 'After']]);
        // 可编辑属性交给 dump 层恢复。
        expect(mockRestoreNodeSnapshotProperties).toHaveBeenCalledWith(node, dump);
        // locked 由 undo 层回调处理。
        expect(restoredLocks).toEqual([true]);
    });
});

describe('restoreComponentSnapshotDump', () => {
    beforeEach(() => {
        mockRestoreComponentSnapshotProperties.mockReset();
    });

    it('filters deleted references at the actual component restore boundary without changing other properties', async () => {
        const scene = {}, component = { node: { scene }, onRestore: jest.fn() };
        const dump = { value: { enabled: { value: true }, texture: { type: 'cc.Texture2D', value: { uuid: 'deleted@6c48a' } } } };
        deletedLightmapAssets.begin(scene, ['deleted'])(['deleted']);
        await restoreComponentSnapshotDump(component as any, dump);
        expect(mockRestoreComponentSnapshotProperties).toHaveBeenCalledWith(component, {
            value: { enabled: { value: true }, texture: { type: 'cc.Texture2D', value: { uuid: '' } } },
        });
        expect(dump.value.texture.value.uuid).toBe('deleted@6c48a');
    });

    it.each(['cc.LightProbeGroup', 'CustomProbeGroup'])('rebinds restored %s probe arrays without rebuilding global data', async type => {
        const old = [1, 2, 3, 4, 5];
        const restored = [1, 2, 3, 4];
        const info = { syncData: jest.fn(), update: jest.fn() };
        const component = { isValid: true, enabledInHierarchy: true, probes: old, node: { scene: { globals: { lightProbeInfo: info } } } };
        mockRestoreComponentSnapshotProperties.mockImplementationOnce(async () => { component.probes = restored; });
        await restoreComponentSnapshotDump(component as any, { type, extends: ['cc.LightProbeGroup'], value: { _probes: {} } });
        expect(info.syncData).toHaveBeenCalledWith(component.node, restored);
        expect(info.update).not.toHaveBeenCalled();
    });

    it('refreshes Terrain block bindings after properties and the engine lifecycle have restored', async () => {
        const events: string[] = [];
        const restoredInfo = { texture: 'restored-texture' };
        const block = { _updateLightmap: jest.fn(() => events.push('bind')) };
        const component = {
            _lightmapInfos: [] as unknown[],
            onRestore: () => { events.push('lifecycle'); },
            getBlocks: () => [block],
        };
        mockRestoreComponentSnapshotProperties.mockImplementationOnce(async () => {
            events.push('properties');
            component._lightmapInfos = [restoredInfo];
        });
        await restoreComponentSnapshotDump(component as any, { type: 'cc.Terrain', value: { _lightmapInfos: {} } });
        expect(events).toEqual(['properties', 'lifecycle', 'bind']);
        expect(block._updateLightmap).toHaveBeenCalledWith(restoredInfo);
    });

    it('delegates property restoration to dump and calls onRestore lifecycle', async () => {
        const component = {
            onRestore: jest.fn(),
        };
        const dump = {
            value: {
                uuid: { value: 'component-1' },
                node: { value: { uuid: 'node-1' } },
                __scriptAsset: { value: { uuid: 'script-1' } },
                __eventTargets: { value: [] },
                enabled: { value: true },
                string: { value: 'hello' },
            },
        };

        await restoreComponentSnapshotDump(component as any, dump);

        // 属性交给 dump 层恢复。
        expect(mockRestoreComponentSnapshotProperties).toHaveBeenCalledWith(component, dump);
        // onRestore 是 undo 层负责触发的生命周期。
        expect(component.onRestore).toHaveBeenCalledTimes(1);
    });
});

describe('Snapshot restore policy (dump layer constants)', () => {
    it('NODE_SNAPSHOT_RESTORE_PROPERTY_PATHS matches encodeNode editable properties', () => {
        expect([...NODE_SNAPSHOT_RESTORE_PROPERTY_PATHS]).toEqual([
            'active', 'layer', 'mobility', 'position', 'rotation', 'scale',
        ]);
    });

    it('COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS matches component identity fields', () => {
        expect([...COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS]).toEqual([
            'uuid', 'node', '__scriptAsset', '__eventTargets',
        ]);
    });
});
