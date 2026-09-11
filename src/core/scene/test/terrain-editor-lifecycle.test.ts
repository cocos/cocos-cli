const mockRepaintInEditMode = jest.fn();

type MockModeName = 'manage' | 'sculpt' | 'paint' | 'select';
interface MockMode {
    activate: jest.Mock;
    deactivate: jest.Mock;
    update: jest.Mock;
    refreshPreview: jest.Mock;
}

const mockModeInstances: Record<MockModeName, MockMode[]> = {
    manage: [],
    sculpt: [],
    paint: [],
    select: [],
};

function mockCreateMode(name: MockModeName) {
    return class {
        public activate = jest.fn();
        public deactivate = jest.fn();
        public update = jest.fn();
        public refreshPreview = jest.fn();

        constructor() {
            mockModeInstances[name].push(this);
        }
    };
}

jest.mock('cc', () => {
    class Camera {}
    class Terrain {}
    class Vec3 {
        public set() { return this; }
        public normalize() { return this; }
        public static subtract(out: Vec3) { return out; }
    }

    return { Camera, Terrain, Vec3 };
});

jest.mock('../scene-process/service/core/decorator', () => ({
    Service: { Engine: { repaintInEditMode: mockRepaintInEditMode } },
}));

jest.mock('../scene-process/service/gizmo/utils/controller-utils', () => ({
    __esModule: true,
    default: { getCameraDistanceFactor: jest.fn(() => 1) },
}));

jest.mock('../scene-process/service/gizmo/components/terrain/terrain-brush', () => ({
    TerrainBrush: { updateBrushDepthOffset: jest.fn() },
}));

jest.mock('../scene-process/service/gizmo/components/terrain/terrain-editor-manage', () => ({
    TerrainEditorManage: mockCreateMode('manage'),
}));

jest.mock('../scene-process/service/gizmo/components/terrain/terrain-editor-sculpt', () => ({
    TerrainEditorSculpt: mockCreateMode('sculpt'),
}));

jest.mock('../scene-process/service/gizmo/components/terrain/terrain-editor-paint', () => {
    const MockMode = mockCreateMode('paint');
    return {
        TerrainEditorPaint: class extends MockMode {
            private _currentLayer = -1;

            public setCurrentLayer(layer: number) {
                this._currentLayer = layer;
            }

            public getCurrentLayer() {
                return this._currentLayer;
            }

            public deactivate = jest.fn(() => {
                this._currentLayer = -1;
            });
        },
    };
});

jest.mock('../scene-process/service/gizmo/components/terrain/terrain-editor-select', () => ({
    TerrainEditorSelect: mockCreateMode('select'),
}));

import type { Terrain } from 'cc';
import { TerrainEditor } from '../scene-process/service/gizmo/components/terrain/terrain-editor';
import { TerrainEditorModeType } from '../scene-process/service/gizmo/components/terrain/terrain-editor-mode';
import type TerrainGizmo from '../scene-process/service/gizmo/components/terrain/gizmo-select';

describe('TerrainEditor mode lifecycle', () => {
    beforeEach(() => {
        for (const instances of Object.values(mockModeInstances)) instances.length = 0;
        mockRepaintInEditMode.mockReset();
    });

    it('activates attached modes once and keeps hover and redundant mode changes non-destructive', () => {
        const block = { setBrushMaterial: jest.fn() };
        const terrain = { getBlocks: () => [block] } as unknown as Terrain;
        const editor = new TerrainEditor(null, {} as TerrainGizmo);
        const manage = mockModeInstances.manage[0];
        const paint = mockModeInstances.paint[0];
        const select = mockModeInstances.select[0];

        expect(manage.activate).not.toHaveBeenCalled();
        editor.setEditTerrain(terrain);
        expect(manage.activate).toHaveBeenCalledTimes(1);

        editor.setMode(TerrainEditorModeType.PAINT);
        expect(manage.deactivate).toHaveBeenCalledTimes(1);
        expect(paint.activate).toHaveBeenCalledTimes(1);
        expect(paint.deactivate).not.toHaveBeenCalled();
        expect(block.setBrushMaterial).toHaveBeenCalledWith(null);

        editor.setCurrentLayer(2);
        editor.onHoverOut();
        expect(editor.getCurrentLayer()).toBe(2);
        expect(paint.deactivate).not.toHaveBeenCalled();

        editor.setMode(TerrainEditorModeType.PAINT);
        expect(paint.activate).toHaveBeenCalledTimes(1);
        expect(paint.deactivate).not.toHaveBeenCalled();

        editor.update(0.25, true);
        expect(paint.update).toHaveBeenCalledWith(terrain, 0.25, true);

        editor.setMode(TerrainEditorModeType.SELECT);
        expect(paint.deactivate).toHaveBeenCalledTimes(1);
        expect(select.activate).toHaveBeenCalledTimes(1);

        editor.setMode(TerrainEditorModeType.SELECT);
        expect(select.activate).toHaveBeenCalledTimes(1);
        expect(select.deactivate).not.toHaveBeenCalled();

        editor.setEditTerrain(null);
        expect(select.deactivate).toHaveBeenCalledTimes(1);
        expect(editor.getEditTerrain()).toBeNull();
    });

    it('does not invoke mode lifecycle hooks while detached', () => {
        const terrain = { getBlocks: () => [] } as unknown as Terrain;
        const editor = new TerrainEditor(null, {} as TerrainGizmo);
        const manage = mockModeInstances.manage[0];
        const paint = mockModeInstances.paint[0];
        const select = mockModeInstances.select[0];

        editor.setMode(TerrainEditorModeType.PAINT);
        expect(manage.deactivate).not.toHaveBeenCalled();
        expect(paint.activate).not.toHaveBeenCalled();

        editor.setEditTerrain(terrain);
        expect(paint.activate).toHaveBeenCalledTimes(1);

        editor.setEditTerrain(null);
        expect(paint.deactivate).toHaveBeenCalledTimes(1);

        editor.setMode(TerrainEditorModeType.SELECT);
        expect(paint.deactivate).toHaveBeenCalledTimes(1);
        expect(select.activate).not.toHaveBeenCalled();
    });
});
