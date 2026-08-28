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
});
