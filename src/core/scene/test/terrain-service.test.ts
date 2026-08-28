const mockNodesByUuid = new Map<string, any>();
const mockEmit = jest.fn();
const mockQueryRegisteredService = jest.fn();
const mockLoadAny = jest.fn();
const mockServiceEventEmit = jest.fn();
const mockUndo = {
    push: jest.fn(),
    isApplying: jest.fn(() => false),
};
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

jest.mock('cc', () => {
    class Component {
        public node: any;
        public uuid = '';
    }

    class Terrain extends Component { }
    class TerrainAsset { }
    class TerrainLayer {
        public detailMap: any = null;
        public normalMap: any = null;
        public metallic = 0;
        public roughness = 1;
        public tileSize = 1;
    }
    class TerrainInfo {
        public tileSize = 1;
        public weightMapSize = 128;
        public lightMapSize = 128;
        public blockCount = [1, 1];
    }
    class Texture2D {
        constructor(public _uuid = '') { }
    }

    return { Component, Terrain, TerrainAsset, TerrainInfo, TerrainLayer, Texture2D, TERRAIN_MAX_LAYER_COUNT: 4 };
});

jest.mock('../scene-process/service/core', () => ({
    BaseService: class {
        emit(...args: unknown[]) {
            mockEmit(...args);
        }
    },
    register: () => () => undefined,
    queryRegisteredService: mockQueryRegisteredService,
}));

jest.mock('../scene-process/service/gizmo/utils/editor-node', () => ({
    getEditorNodeByUuid: (uuid: string) => mockNodesByUuid.get(uuid) ?? null,
    getEditorNodeByPath: () => null,
}));

jest.mock('../scene-process/service/node/node-create', () => ({
    loadAny: mockLoadAny,
}));

jest.mock('../scene-process/service/core/global-events', () => ({
    ServiceEvents: {
        emit: mockServiceEventEmit,
        on: jest.fn(),
    },
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request: jest.fn() }) },
}));

import { Terrain, Texture2D } from 'cc';
import type {
    IPublicTerrainService,
    ITerrainEditorState,
    ITerrainTarget,
    TerrainBlockReadResult,
    TerrainReadResult,
} from '../common/terrain';
import { TerrainService } from '../scene-process/service/terrain';

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function createFixture(nodeUuid = 'node-a', componentUuid = 'terrain-a') {
    const terrain = new Terrain() as Terrain & { node: any; uuid: string };
    terrain.uuid = componentUuid;

    const node = { uuid: nodeUuid, components: [terrain] };
    terrain.node = node;
    mockNodesByUuid.set(nodeUuid, node);

    const state: ITerrainEditorState = {
        manage: { tileSize: 2, weightMapSize: 64, lightMapSize: 32, blockCount: [2, 3] },
        layers: [
            { detailMapUuid: 'detail-a', normalMapUuid: 'normal-a', metallic: 0.2, roughness: 0.7, tileSize: 4 },
            null,
            null,
            null,
        ],
        mode: 'manage',
        currentLayer: 0,
        sculpt: {
            tool: 'bulge',
            brush: { kind: 'image', imageUuid: 'sculpt-brush', radius: 3, strength: 5, rotation: 15, setHeight: 9 },
        },
        paint: {
            brush: { kind: 'circle', imageUuid: null, radius: 6, strength: 4, rotation: 0, setHeight: 0 },
        },
    };

    const block = {
        index: { x: 1, y: 2 },
        layers: ['detail-a', null, 'detail-c', null],
        weight: { width: 2, height: 1, data: [255, 0, 0, 0, 128, 127, 0, 0] },
    };

    Object.assign(terrain as any, {
        _asset: {},
        rebuild: jest.fn((info: any) => {
            state.manage = {
                tileSize: info.tileSize,
                weightMapSize: info.weightMapSize,
                lightMapSize: info.lightMapSize,
                blockCount: [info.blockCount[0], info.blockCount[1]],
            };
        }),
        getLayer: jest.fn((index: number) => {
            const layer = state.layers[index];
            if (!layer) return null;
            return {
                get detailMap() { return layer.detailMapUuid ? new Texture2D(layer.detailMapUuid) : null; },
                set detailMap(value: any) { layer.detailMapUuid = value?._uuid ?? null; },
                get normalMap() { return layer.normalMapUuid ? new Texture2D(layer.normalMapUuid) : null; },
                set normalMap(value: any) { layer.normalMapUuid = value?._uuid ?? null; },
                get metallic() { return layer.metallic; },
                set metallic(value: number) { layer.metallic = value; },
                get roughness() { return layer.roughness; },
                set roughness(value: number) { layer.roughness = value; },
                get tileSize() { return layer.tileSize; },
                set tileSize(value: number) { layer.tileSize = value; },
            };
        }),
        setLayer: jest.fn((index: number, layer: any) => {
            state.layers[index] = {
                detailMapUuid: layer.detailMap?._uuid ?? null,
                normalMapUuid: layer.normalMap?._uuid ?? null,
                metallic: layer.metallic,
                roughness: layer.roughness,
                tileSize: layer.tileSize,
            };
        }),
        removeLayer: jest.fn((index: number) => {
            state.layers[index] = null;
        }),
        addLayer: jest.fn((layer: any) => {
            const index = state.layers.findIndex((item) => item === null);
            if (index < 0) return -1;
            state.layers[index] = {
                detailMapUuid: layer.detailMap?._uuid ?? null,
                normalMapUuid: layer.normalMap?._uuid ?? null,
                metallic: layer.metallic,
                roughness: layer.roughness,
                tileSize: layer.tileSize,
            };
            return index;
        }),
        exportLayerListToAsset: jest.fn(),
    });

    const gizmo = {
        target: terrain,
        readTerrainState: jest.fn(() => clone(state)),
        setTerrainMode: jest.fn((mode: ITerrainEditorState['mode']) => {
            state.mode = mode;
        }),
        setTerrainCurrentLayer: jest.fn((currentLayer: number) => {
            state.currentLayer = currentLayer;
        }),
        updateTerrainSculptSession: jest.fn((patch: any) => {
            if (patch.tool) state.sculpt.tool = patch.tool;
            if (patch.brush) Object.assign(state.sculpt.brush, patch.brush);
        }),
        setSculptBrushTexture: jest.fn((texture: Texture2D | null) => {
            state.sculpt.brush.imageUuid = texture?._uuid ?? null;
            state.sculpt.brush.kind = texture ? 'image' : 'circle';
        }),
        setPaintBrushTexture: jest.fn((texture: Texture2D | null) => {
            state.paint.brush.imageUuid = texture?._uuid ?? null;
            state.paint.brush.kind = texture ? 'image' : 'circle';
        }),
        updateTerrainPaintSession: jest.fn((patch: any) => {
            if (patch.brush) Object.assign(state.paint.brush, patch.brush);
        }),
        readTerrainBlock: jest.fn(() => clone(block)),
    };

    return {
        terrain,
        node,
        state,
        gizmo,
        target: { nodeUuid, componentUuid } satisfies ITerrainTarget,
    };
}


describe('TerrainService target-safe public capability', () => {
    beforeEach(() => {
        mockNodesByUuid.clear();
        mockEmit.mockReset();
        mockQueryRegisteredService.mockReset();
        mockLoadAny.mockReset();
        mockServiceEventEmit.mockReset();
        mockUndo.push.mockReset();
        mockUndo.isApplying.mockReset();
        mockUndo.isApplying.mockReturnValue(false);
        mockConsoleWarn.mockReset();
    });

    it('publishes only typed target-safe reads and editor-session commands', () => {
        const assertPublicTerrainInterface = (service: IPublicTerrainService) => {
            const target: ITerrainTarget = { nodeUuid: 'node', componentUuid: 'terrain' };
            const read: TerrainReadResult = service.read(target);
            const block: TerrainBlockReadResult = service.readBlock(target);
            service.setMode(target, 'sculpt');
            service.setCurrentLayer(target, 0);
            service.setSculptSession(target, { tool: 'set-height', brush: { radius: 8, setHeight: 12 } });
            const brush = service.setSculptBrushAsset(target, 'brush');
            const paintBrush = service.setPaintBrushAsset(target, 'brush');
            service.setPaintSession(target, { brush: { strength: 7 } });
            const manage = service.saveManage(target, { tileSize: 1, weightMapSize: 128, lightMapSize: 128, blockCount: [1, 1] });
            const add = service.addLayer(target, {
                detailMapUuid: 'detail', normalMapUuid: null, metallic: 0, roughness: 1, tileSize: 1,
            });
            const update = service.updateLayer(target, 0, { roughness: 0.5 });
            const remove = service.removeLayer(target, 0);
            return { read, block, brush, paintBrush, manage, add, update, remove };
        };

        expect(assertPublicTerrainInterface).toBeDefined();
    });

    it('returns one complete, JSON-safe hydration snapshot only for the explicitly selected Terrain', () => {
        const fixture = createFixture();
        const other = createFixture('node-b', 'terrain-b');
        const gizmoService = { getComponentGizmo: jest.fn((component) => component === fixture.terrain ? fixture.gizmo : other.gizmo) };
        mockQueryRegisteredService.mockReturnValue(gizmoService);

        const service = new TerrainService();
        service.select(fixture.target.nodeUuid);

        expect(service.read(fixture.target)).toEqual({
            target: fixture.target,
            valid: true,
            ...fixture.state,
        });
        expect(service.read(other.target)).toEqual({ target: other.target, valid: false });
        expect(service.read({ nodeUuid: fixture.target.nodeUuid, componentUuid: other.target.componentUuid })).toEqual({
            target: { nodeUuid: fixture.target.nodeUuid, componentUuid: other.target.componentUuid },
            valid: false,
        });
        expect(gizmoService.getComponentGizmo).toHaveBeenCalledTimes(1);
    });

    it('updates only the explicit target editor session, returns its canonical state, and emits invalidation', () => {
        const fixture = createFixture();
        mockQueryRegisteredService.mockReturnValue({ getComponentGizmo: () => fixture.gizmo });
        const service = new TerrainService();
        service.select(fixture.target.nodeUuid);

        expect(service.setMode(fixture.target, 'paint')).toMatchObject({ valid: true, mode: 'paint' });
        expect(service.setCurrentLayer(fixture.target, 0)).toMatchObject({ valid: true, currentLayer: 0 });
        expect(service.setSculptSession(fixture.target, {
            tool: 'set-height',
            brush: { radius: 8, strength: 6, rotation: 30, setHeight: 12 },
        })).toMatchObject({
            valid: true,
            sculpt: { tool: 'set-height', brush: { radius: 8, strength: 6, rotation: 30, setHeight: 12 } },
        });
        expect(service.setPaintSession(fixture.target, { brush: { strength: 7 } })).toMatchObject({
            valid: true,
            paint: { brush: { kind: 'circle', strength: 7 } },
        });

        expect(fixture.gizmo.setTerrainMode).toHaveBeenCalledWith('paint');
        expect(fixture.gizmo.setTerrainCurrentLayer).toHaveBeenCalledWith(0);
        expect(fixture.gizmo.updateTerrainSculptSession).toHaveBeenCalledWith({
            tool: 'set-height',
            brush: { radius: 8, strength: 6, rotation: 30, setHeight: 12 },
        });
        expect(fixture.gizmo.updateTerrainPaintSession).toHaveBeenCalledWith({ brush: { strength: 7 } });
        expect(mockEmit).toHaveBeenCalledWith('terrain:session-changed', fixture.target);
    });

    it('assigns or clears only the explicit target Sculpt image brush and emits invalidation', async () => {
        const fixture = createFixture();
        const other = createFixture('node-b', 'terrain-b');
        mockQueryRegisteredService.mockReturnValue({
            getComponentGizmo: (component: Terrain) => component === fixture.terrain ? fixture.gizmo : other.gizmo,
        });
        mockLoadAny.mockImplementation(async (uuid: string) => new Texture2D(uuid));
        const service = new TerrainService();
        service.select(fixture.target.nodeUuid);

        await expect(service.setSculptBrushAsset(fixture.target, 'new-brush')).resolves.toMatchObject({
            valid: true,
            sculpt: { brush: { kind: 'image', imageUuid: 'new-brush' } },
        });
        await expect(service.setSculptBrushAsset(fixture.target, null)).resolves.toMatchObject({
            valid: true,
            sculpt: { brush: { kind: 'circle', imageUuid: null } },
        });
        await expect(service.setSculptBrushAsset(other.target, 'other-brush')).resolves.toEqual({
            target: other.target,
            valid: false,
        });

        expect(fixture.gizmo.setSculptBrushTexture).toHaveBeenNthCalledWith(1, expect.objectContaining({ _uuid: 'new-brush' }));
        expect(fixture.gizmo.setSculptBrushTexture).toHaveBeenNthCalledWith(2, null);
        expect(other.gizmo.setSculptBrushTexture).not.toHaveBeenCalled();
        expect(mockEmit).toHaveBeenCalledWith('terrain:session-changed', fixture.target);
        expect((fixture.terrain as any).isTerrainChange).not.toBe(true);
    });

    it('assigns or clears only the explicit target Paint image brush and emits invalidation', async () => {
        const fixture = createFixture();
        const other = createFixture('node-b', 'terrain-b');
        mockQueryRegisteredService.mockReturnValue({
            getComponentGizmo: (component: Terrain) => component === fixture.terrain ? fixture.gizmo : other.gizmo,
        });
        mockLoadAny.mockImplementation(async (uuid: string) => new Texture2D(uuid));
        const service = new TerrainService();
        service.select(fixture.target.nodeUuid);

        await expect(service.setPaintBrushAsset(fixture.target, 'paint-brush')).resolves.toMatchObject({
            valid: true,
            paint: { brush: { kind: 'image', imageUuid: 'paint-brush' } },
        });
        await expect(service.setPaintBrushAsset(fixture.target, null)).resolves.toMatchObject({
            valid: true,
            paint: { brush: { kind: 'circle', imageUuid: null } },
        });
        await expect(service.setPaintBrushAsset(other.target, 'other-brush')).resolves.toEqual({
            target: other.target,
            valid: false,
        });

        expect(fixture.gizmo.setPaintBrushTexture).toHaveBeenNthCalledWith(1, expect.objectContaining({ _uuid: 'paint-brush' }));
        expect(fixture.gizmo.setPaintBrushTexture).toHaveBeenNthCalledWith(2, null);
        expect(other.gizmo.setPaintBrushTexture).not.toHaveBeenCalled();
        expect(mockEmit).toHaveBeenCalledWith('terrain:session-changed', fixture.target);
        expect((fixture.terrain as any).isTerrainChange).not.toBe(true);
    });

    it('rejects failed or incompatible Sculpt brush assets without mutating the session', async () => {
        const fixture = createFixture();
        mockQueryRegisteredService.mockReturnValue({ getComponentGizmo: () => fixture.gizmo });
        const service = new TerrainService();
        service.select(fixture.target.nodeUuid);
        const before = clone(fixture.state);
        const error = new Error('asset database unavailable');

        mockLoadAny.mockRejectedValueOnce(error);
        await expect(service.setSculptBrushAsset(fixture.target, 'missing-brush')).resolves.toEqual({
            target: fixture.target,
            valid: true,
            ...before,
        });
        expect(mockConsoleWarn).toHaveBeenCalledWith('[Terrain] load sculpt brush texture failed: missing-brush', error);
        expect(fixture.gizmo.setSculptBrushTexture).not.toHaveBeenCalled();
        expect(mockEmit).not.toHaveBeenCalled();

        mockLoadAny.mockResolvedValueOnce({ _uuid: 'not-a-texture' });
        await expect(service.setSculptBrushAsset(fixture.target, 'not-a-texture')).resolves.toEqual({
            target: fixture.target,
            valid: true,
            ...before,
        });
        expect(fixture.gizmo.setSculptBrushTexture).not.toHaveBeenCalled();
        expect(mockEmit).not.toHaveBeenCalled();
    });

    it('rejects a Sculpt brush request when its target becomes stale during asset loading', async () => {
        const fixture = createFixture();
        mockQueryRegisteredService.mockReturnValue({ getComponentGizmo: () => fixture.gizmo });
        let finishLoad: ((texture: Texture2D) => void) | undefined;
        mockLoadAny.mockImplementation(() => new Promise<Texture2D>((resolve) => {
            finishLoad = resolve;
        }));
        const service = new TerrainService();
        service.select(fixture.target.nodeUuid);
        const before = clone(fixture.state);

        const pending = service.setSculptBrushAsset(fixture.target, 'delayed-brush');
        service.onSelectionClear();
        finishLoad?.(new Texture2D('delayed-brush'));

        await expect(pending).resolves.toEqual({ target: fixture.target, valid: false });
        expect(fixture.state).toEqual(before);
        expect(fixture.gizmo.setSculptBrushTexture).not.toHaveBeenCalled();
        expect(mockEmit).not.toHaveBeenCalled();
    });

    it('reads the currently selected block without exposing the gizmo or mutating Terrain state', () => {
        const fixture = createFixture();
        mockQueryRegisteredService.mockReturnValue({ getComponentGizmo: () => fixture.gizmo });
        const service = new TerrainService();
        service.select(fixture.target.nodeUuid);

        expect(service.readBlock(fixture.target)).toEqual({
            target: fixture.target,
            valid: true,
            block: {
                index: { x: 1, y: 2 },
                layers: ['detail-a', null, 'detail-c', null],
                weight: { width: 2, height: 1, data: [255, 0, 0, 0, 128, 127, 0, 0] },
            },
        });
        expect(fixture.gizmo.readTerrainBlock).toHaveBeenCalledTimes(1);
    });

    it('invalidates stale targets after selection clear, component removal, reload close, disposal, and node replacement', () => {
        const fixture = createFixture();
        mockQueryRegisteredService.mockReturnValue({ getComponentGizmo: () => fixture.gizmo });
        const service = new TerrainService();
        service.select(fixture.target.nodeUuid);

        service.onSelectionClear();
        expect(service.read(fixture.target)).toEqual({ target: fixture.target, valid: false });

        service.select(fixture.target.nodeUuid);
        service.onComponentRemoved(fixture.terrain);
        expect(service.read(fixture.target)).toEqual({ target: fixture.target, valid: false });

        // ServiceManager maps the internal reload-close event to onEditorClosed.
        service.select(fixture.target.nodeUuid);
        service.onEditorClosed();
        expect(service.read(fixture.target)).toEqual({ target: fixture.target, valid: false });

        service.select(fixture.target.nodeUuid);
        service.onEditorDisposed();
        expect(service.read(fixture.target)).toEqual({ target: fixture.target, valid: false });

        service.select(fixture.target.nodeUuid);
        fixture.node.components = [Object.assign(new Terrain(), { uuid: 'replacement-terrain', node: fixture.node })];
        expect(service.read(fixture.target)).toEqual({ target: fixture.target, valid: false });
    });

    it('rejects every authoring command before it touches a missing, non-Terrain, or mismatched target', async () => {
        const fixture = createFixture();
        const nonTerrainNode: { uuid: string; components: Array<{ uuid: string; node?: any }> } = {
            uuid: 'node-non-terrain', components: [{ uuid: 'component-non-terrain' }],
        };
        nonTerrainNode.components[0].node = nonTerrainNode;
        mockNodesByUuid.set(nonTerrainNode.uuid, nonTerrainNode);
        mockQueryRegisteredService.mockImplementation((name: string) => {
            if (name === 'Gizmo') return { getComponentGizmo: () => fixture.gizmo };
            if (name === 'Undo') return mockUndo;
            return null;
        });
        const service = new TerrainService();
        service.select(fixture.target.nodeUuid);
        const before = clone(fixture.state);
        const missing: ITerrainTarget = { nodeUuid: 'missing-node', componentUuid: 'missing-terrain' };
        const nonTerrain: ITerrainTarget = { nodeUuid: nonTerrainNode.uuid, componentUuid: 'component-non-terrain' };
        const mismatched: ITerrainTarget = { nodeUuid: fixture.target.nodeUuid, componentUuid: 'wrong-terrain' };
        const layer = { detailMapUuid: 'detail-rejected', normalMapUuid: null, metallic: 0, roughness: 1, tileSize: 1 };

        await expect(service.saveManage(missing, fixture.state.manage)).resolves.toEqual({ target: missing, valid: false });
        await expect(service.addLayer(nonTerrain, layer)).resolves.toEqual({ target: nonTerrain, valid: false });
        await expect(service.removeLayer(mismatched, 0)).resolves.toEqual({ target: mismatched, valid: false });
        await expect(service.updateLayer(missing, 0, { roughness: 0.5 })).resolves.toEqual({ target: missing, valid: false });

        expect(fixture.state).toEqual(before);
        expect(mockLoadAny).not.toHaveBeenCalled();
        expect(mockUndo.push).not.toHaveBeenCalled();
    });

    it('leaves authoring state untouched when the CLI Undo service is unavailable', async () => {
        const fixture = createFixture();
        mockQueryRegisteredService.mockImplementation((name: string) => name === 'Gizmo'
            ? { getComponentGizmo: () => fixture.gizmo }
            : null);
        const service = new TerrainService();
        service.select(fixture.target.nodeUuid);
        const before = clone(fixture.state);
        const layer = { detailMapUuid: 'detail-without-undo', normalMapUuid: null, metallic: 0, roughness: 1, tileSize: 1 };

        await expect(service.saveManage(fixture.target, { ...fixture.state.manage, tileSize: 3 })).resolves.toEqual({
            target: fixture.target,
            valid: true,
            ...before,
        });
        await expect(service.addLayer(fixture.target, layer)).resolves.toEqual({ target: fixture.target, valid: true, ...before });
        await expect(service.removeLayer(fixture.target, 0)).resolves.toEqual({ target: fixture.target, valid: true, ...before });
        await expect(service.updateLayer(fixture.target, 0, { roughness: 0.5 })).resolves.toEqual({ target: fixture.target, valid: true, ...before });

        expect(fixture.state).toEqual(before);
        expect(mockLoadAny).not.toHaveBeenCalled();
    });

    it('reports a texture-load error while leaving the explicit Terrain unchanged', async () => {
        const fixture = createFixture();
        mockQueryRegisteredService.mockImplementation((name: string) => {
            if (name === 'Gizmo') return { getComponentGizmo: () => fixture.gizmo };
            if (name === 'Undo') return mockUndo;
            return null;
        });
        const error = new Error('asset database unavailable');
        mockLoadAny.mockRejectedValue(error);

        const service = new TerrainService();
        service.select(fixture.target.nodeUuid);
        const before = clone(fixture.state);
        await expect(service.addLayer(fixture.target, {
            detailMapUuid: 'detail-load-error', normalMapUuid: null, metallic: 0, roughness: 1, tileSize: 1,
        })).resolves.toEqual({ target: fixture.target, valid: true, ...before });

        expect(mockConsoleWarn).toHaveBeenCalledWith('[Terrain] load layer texture failed: detail-load-error', error);
        expect(fixture.state).toEqual(before);
        expect(mockUndo.push).not.toHaveBeenCalled();
    });

    it('rejects a target invalidated while a layer texture is loading', async () => {
        const fixture = createFixture();
        mockQueryRegisteredService.mockImplementation((name: string) => {
            if (name === 'Gizmo') return { getComponentGizmo: () => fixture.gizmo };
            if (name === 'Undo') return mockUndo;
            return null;
        });
        let finishLoad: ((texture: Texture2D) => void) | undefined;
        mockLoadAny.mockImplementation(() => new Promise<Texture2D>((resolve) => {
            finishLoad = resolve;
        }));

        const service = new TerrainService();
        service.select(fixture.target.nodeUuid);
        const before = clone(fixture.state);
        const pending = service.addLayer(fixture.target, {
            detailMapUuid: 'detail-delayed', normalMapUuid: null, metallic: 0, roughness: 1, tileSize: 1,
        });
        service.onSelectionClear();
        finishLoad?.(new Texture2D('detail-delayed'));

        await expect(pending).resolves.toEqual({ target: fixture.target, valid: false });
        expect(fixture.state).toEqual(before);
        expect(mockUndo.push).not.toHaveBeenCalled();
    });

    it('commits target-safe Manage and layer mutations as one authoritative Undo command each', async () => {
        const fixture = createFixture();
        const other = createFixture('node-b', 'terrain-b');
        const gizmoService = {
            getComponentGizmo: jest.fn((component) => component === fixture.terrain ? fixture.gizmo : other.gizmo),
        };
        const engine = { repaintInEditMode: jest.fn() };
        mockQueryRegisteredService.mockImplementation((name: string) => {
            if (name === 'Gizmo') return gizmoService;
            if (name === 'Undo') return mockUndo;
            if (name === 'Engine') return engine;
            return null;
        });
        mockLoadAny.mockImplementation(async (uuid: string) => new Texture2D(uuid));

        const service = new TerrainService();
        service.select(fixture.target.nodeUuid);
        const initialManage = clone(fixture.state.manage);
        const initialLayers = clone(fixture.state.layers);

        const managed = await service.saveManage(fixture.target, {
            tileSize: 3,
            weightMapSize: 128,
            lightMapSize: 64,
            blockCount: [4, 2],
        });
        expect(managed).toMatchObject({
            valid: true,
            manage: { tileSize: 3, weightMapSize: 128, lightMapSize: 64, blockCount: [4, 2] },
        });

        const added = await service.addLayer(fixture.target, {
            detailMapUuid: 'detail-b',
            normalMapUuid: 'normal-b',
            metallic: 0.4,
            roughness: 0.6,
            tileSize: 8,
        });
        expect(added).toMatchObject({ valid: true });
        expect((added as any).layers[0]).toMatchObject({ detailMapUuid: 'detail-a' });
        expect((added as any).layers[1]).toMatchObject({ detailMapUuid: 'detail-b', normalMapUuid: 'normal-b' });

        const updated = await service.updateLayer(fixture.target, 1, {
            detailMapUuid: 'detail-c',
            roughness: 0.25,
        });
        expect(updated).toMatchObject({ valid: true });
        expect((updated as any).layers[0]).toMatchObject({ detailMapUuid: 'detail-a' });
        expect((updated as any).layers[1]).toMatchObject({ detailMapUuid: 'detail-c', roughness: 0.25 });

        const removed = await service.removeLayer(fixture.target, 1);
        expect(removed).toMatchObject({ valid: true });
        expect((removed as any).layers[0]).toMatchObject({ detailMapUuid: 'detail-a' });
        expect((removed as any).layers[1]).toBeNull();

        // Current-layer selection is a session control, not an asset mutation or an Undo entry.
        service.setCurrentLayer(fixture.target, 0);
        expect(mockUndo.push).toHaveBeenCalledTimes(4);
        expect(mockUndo.push.mock.calls.map(([command]) => command.meta.type)).toEqual([
            'terrain:save-manage',
            'terrain:add-layer',
            'terrain:update-layer',
            'terrain:remove-layer',
        ]);
        expect(mockUndo.push.mock.calls.every(([command]) => command.meta.scope.editorType === 'scene')).toBe(true);
        expect((fixture.terrain as any).exportLayerListToAsset).toHaveBeenCalled();
        expect(mockServiceEventEmit).toHaveBeenCalledWith('node:change', fixture.node, { type: 'component-changed' });
        expect(engine.repaintInEditMode).toHaveBeenCalledTimes(4);

        const [manageCommand, addCommand, updateCommand, removeCommand] = mockUndo.push.mock.calls.map(([command]) => command);
        expect(mockEmit).toHaveBeenCalledWith('terrain:changed', fixture.terrain);
        await manageCommand.undo();
        expect(fixture.state.manage).toEqual(initialManage);
        await manageCommand.redo();
        expect(fixture.state.manage).toEqual({ tileSize: 3, weightMapSize: 128, lightMapSize: 64, blockCount: [4, 2] });

        const assetSyncCallsBeforeLayerUndo = (fixture.terrain as any).exportLayerListToAsset.mock.calls.length;
        await addCommand.undo();
        expect(fixture.state.layers).toEqual(initialLayers);
        expect((fixture.terrain as any).exportLayerListToAsset).toHaveBeenCalledTimes(assetSyncCallsBeforeLayerUndo + 1);
        await addCommand.redo();
        expect(fixture.state.layers[1]).toMatchObject({ detailMapUuid: 'detail-b', normalMapUuid: 'normal-b' });
        expect((fixture.terrain as any).exportLayerListToAsset).toHaveBeenCalledTimes(assetSyncCallsBeforeLayerUndo + 2);
        expect(mockEmit).toHaveBeenCalledWith('terrain:changed', fixture.terrain);

        await updateCommand.undo();
        expect(fixture.state.layers[1]).toMatchObject({ detailMapUuid: 'detail-b', roughness: 0.6 });
        await updateCommand.redo();
        expect(fixture.state.layers[1]).toMatchObject({ detailMapUuid: 'detail-c', roughness: 0.25 });

        await removeCommand.undo();
        expect(fixture.state.layers[1]).toMatchObject({ detailMapUuid: 'detail-c', roughness: 0.25 });
        await removeCommand.redo();
        expect(fixture.state.layers[1]).toBeNull();

        const beforeRejectedDrop = clone(fixture.state);
        mockLoadAny.mockResolvedValueOnce({ _uuid: 'not-a-texture' });
        expect(await service.addLayer(fixture.target, {
            detailMapUuid: 'not-a-texture', normalMapUuid: null, metallic: 0, roughness: 1, tileSize: 1,
        })).toEqual({ target: fixture.target, valid: true, ...beforeRejectedDrop });
        expect(mockUndo.push).toHaveBeenCalledTimes(4);

        expect(await service.updateLayer(other.target, 0, { roughness: 0.5 })).toEqual({ target: other.target, valid: false });
        const textureLoadsBeforeRejectedTarget = mockLoadAny.mock.calls.length;
        expect(await service.addLayer(other.target, {
            detailMapUuid: 'detail-on-stale-target', normalMapUuid: null, metallic: 0, roughness: 1, tileSize: 1,
        })).toEqual({ target: other.target, valid: false });
        expect(mockLoadAny).toHaveBeenCalledTimes(textureLoadsBeforeRejectedTarget);
        expect(mockUndo.push).toHaveBeenCalledTimes(4);
        expect(other.state).not.toEqual(fixture.state);
    });

});
