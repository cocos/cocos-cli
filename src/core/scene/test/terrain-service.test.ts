const mockNodesByUuid = new Map<string, any>();
const mockEmit = jest.fn();
const mockQueryRegisteredService = jest.fn();

jest.mock('cc', () => {
    class Component {
        public node: any;
        public uuid = '';
    }

    class Terrain extends Component { }
    class TerrainAsset { }

    return { Component, Terrain, TerrainAsset };
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
    loadAny: jest.fn(),
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request: jest.fn() }) },
}));

import { Terrain } from 'cc';
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
    });

    it('publishes only typed target-safe reads and editor-session commands', () => {
        const assertPublicTerrainInterface = (service: IPublicTerrainService) => {
            const target: ITerrainTarget = { nodeUuid: 'node', componentUuid: 'terrain' };
            const read: TerrainReadResult = service.read(target);
            const block: TerrainBlockReadResult = service.readBlock(target);
            service.setMode(target, 'sculpt');
            service.setCurrentLayer(target, 0);
            service.setSculptSession(target, { tool: 'set-height', brush: { radius: 8, setHeight: 12 } });
            service.setPaintSession(target, { brush: { kind: 'circle', strength: 7 } });
            return { read, block };
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
        expect(service.setPaintSession(fixture.target, { brush: { kind: 'image', strength: 7 } })).toMatchObject({
            valid: true,
            paint: { brush: { kind: 'image', strength: 7 } },
        });

        expect(fixture.gizmo.setTerrainMode).toHaveBeenCalledWith('paint');
        expect(fixture.gizmo.setTerrainCurrentLayer).toHaveBeenCalledWith(0);
        expect(fixture.gizmo.updateTerrainSculptSession).toHaveBeenCalledWith({
            tool: 'set-height',
            brush: { radius: 8, strength: 6, rotation: 30, setHeight: 12 },
        });
        expect(fixture.gizmo.updateTerrainPaintSession).toHaveBeenCalledWith({ brush: { kind: 'image', strength: 7 } });
        expect(mockEmit).toHaveBeenCalledWith('terrain:session-changed', fixture.target);
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
});
