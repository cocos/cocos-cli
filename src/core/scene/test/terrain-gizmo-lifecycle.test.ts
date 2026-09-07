const mockRepaintInEditMode = jest.fn();

jest.mock('cc', () => {
    class Component {
        public node: any = null;
    }

    class Terrain extends Component {
        public getBlocks() {
            return [];
        }
    }

    class TerrainInfo { }
    class TerrainLayer { }

    return {
        Component,
        Terrain,
        TerrainInfo,
        TerrainLayer,
        TERRAIN_MAX_LAYER_COUNT: 4,
    };
});

jest.mock('../scene-process/service/core/decorator', () => ({
    Service: {
        Camera: { getCamera: jest.fn(() => null) },
        Engine: { repaintInEditMode: mockRepaintInEditMode },
    },
}));

jest.mock('../scene-process/service/core/global-events', () => ({
    ServiceEvents: { emit: jest.fn() },
}));

jest.mock('../scene-process/service/node/node-create', () => ({
    loadAny: jest.fn(),
}));

jest.mock('../scene-process/service/gizmo/components/terrain/terrain-editor', () => ({
    TerrainEditor: class {
        private _terrain: any = null;

        setEditTerrain(terrain: any) {
            this._terrain = terrain;
        }

        getEditTerrain() {
            return this._terrain;
        }

        clearBrush = jest.fn();
        setCurrentLayer = jest.fn();
        updateBlockDepthOffset = jest.fn();
    },
}));

jest.mock('../scene-process/service/gizmo/components/terrain/terrain-brush', () => ({
    TerrainBrushType: { IMAGE: 1 },
    TerrainImageBrush: class { },
}));

import { Terrain } from 'cc';
import TerrainGizmo from '../scene-process/service/gizmo/components/terrain/gizmo-select';
import { TerrainEditorSelect } from '../scene-process/service/gizmo/components/terrain/terrain-editor-select';

describe('TerrainGizmo lifecycle', () => {
    it('rebinds its editor after target clear and pooled-gizmo reuse', () => {
        const terrain = new Terrain() as Terrain & { node: any };
        terrain.node = { on: jest.fn(), off: jest.fn() };
        const gizmo = new TerrainGizmo(null);

        gizmo.target = terrain;
        gizmo.show();
        expect(gizmo.editor.getEditTerrain()).toBe(terrain);

        // GizmoService removes a component gizmo by hiding it first, then clearing target.
        gizmo.hide();
        gizmo.target = null;
        expect((gizmo as any)._isEditorInit).toBe(false);
        expect(gizmo.editor.getEditTerrain()).toBeNull();

        // A later selection reuses this hidden instance and must attach the new target.
        gizmo.target = terrain;
        gizmo.show();

        expect(gizmo.editor.getEditTerrain()).toBe(terrain);
        expect((gizmo as any)._isEditorInit).toBe(true);
    });

    it('returns a defensive binary snapshot for the selected block weight map', () => {
        const source = new Uint8Array([255, 0, 0, 0, 128, 127, 0, 0]);
        const gizmo = new TerrainGizmo(null);
        (gizmo as any)._editor = {
            getMode: () => ({
                getCurrentBlockIndex: () => [1, 2],
                getCurrentWeightData: () => ({ width: 2, height: 1, data: source }),
                getCurrentBlockLayerSlots: () => [
                    { layerIndex: 3, detailMapUuid: 'detail-a' },
                    null,
                    { layerIndex: 7, detailMapUuid: null },
                    null,
                ],
            }),
        };

        const block = gizmo.readTerrainBlock();

        expect(block).toEqual({
            index: { x: 1, y: 2 },
            layers: [
                { layerIndex: 3, detailMapUuid: 'detail-a' },
                null,
                { layerIndex: 7, detailMapUuid: null },
                null,
            ],
            weight: { width: 2, height: 1, data: new Uint8Array(source) },
        });
        expect(block?.weight?.data).not.toBe(source);

        block?.weight?.data.fill(0);
        expect(source).toEqual(new Uint8Array([255, 0, 0, 0, 128, 127, 0, 0]));
    });

    it('reads Block layer detail maps from the current Terrain state instead of the selection cache', () => {
        const terrain = {
            getLayer: jest.fn(() => ({ detailMap: { uuid: 'detail-current' } })),
        };
        const select = Object.create(TerrainEditorSelect.prototype) as TerrainEditorSelect;
        (select as any)._selectBlock = {
            layers: [2],
            getTerrain: () => terrain,
        };
        (select as any)._layerList = [{ _uuid: 'detail-stale' }];

        expect(select.getCurrentBlockLayerSlots()).toEqual([
            { layerIndex: 2, detailMapUuid: 'detail-current' },
        ]);
        expect(terrain.getLayer).toHaveBeenCalledWith(2);
    });
});
