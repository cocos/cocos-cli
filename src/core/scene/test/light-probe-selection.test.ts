import { ProbeSelection } from '../scene-process/service/gizmo/components/light-probe-group/selection';
import type { ISceneMouseEvent } from '../scene-process/service/operation/types';

const mockRaycastGizmos = jest.fn();
const mockService = {
    Gizmo: {
        gizmoRootNode: {},
        queryLightProbeEditMode: jest.fn(() => true),
        execGizmoMethods: jest.fn(),
        regionSelectLightProbes: jest.fn(),
        unselectAllLightProbes: jest.fn(),
    },
    Camera: { controller: { isMoving: () => false } },
    Engine: { repaintInEditMode: jest.fn() },
};

jest.mock('../scene-process/service/core/decorator', () => ({ Service: mockService }));
jest.mock('cc', () => ({
    Vec3: class Vec3 { clone() { return new Vec3(); } },
    Event: class { constructor(public type: string) {} },
    Layers: { Enum: { IGNORE_RAYCAST: 0 } },
}));
jest.mock('../scene-process/service/gizmo/utils/engine-utils', () => ({
    getRaycastResults: (...args: unknown[]) => mockRaycastGizmos(...args),
}));
jest.mock('../scene-process/service/gizmo/utils/node-utils', () => ({}));
jest.mock('../scene-process/service/gizmo/utils/selection-utils', () => ({}));
jest.mock('../scene-process/service/gizmo/utils/editor-node', () => ({}));

import GizmoOperation from '../scene-process/service/gizmo/gizmo-operation';

describe('ProbeSelection', () => {
    it('does not carry selection across pooled targets, including equally sized groups', () => {
        const selection = new ProbeSelection();
        const first = {};
        selection.bind(first, 32);
        selection.all();
        expect(selection.indices.size).toBe(32);
        selection.bind({}, 32);
        expect([...selection.indices]).toEqual([]);
        selection.all();
        selection.bind(null, 0);
        expect([...selection.indices]).toEqual([]);
        selection.bind(first, 32);
        expect([...selection.indices]).toEqual([]);
    });

    it('retains selection during a same-target move but drops invalid indices after regeneration', () => {
        const selection = new ProbeSelection();
        const owner = {};
        selection.bind(owner, 4);
        selection.all();
        selection.bind(owner, 4);
        expect([...selection.indices]).toEqual([0, 1, 2, 3]);
        selection.bind(owner, 2);
        expect([...selection.indices]).toEqual([]);
    });

    it('uses the original additive selection on every frame and drops transient rectangle hits', () => {
        const selection = new ProbeSelection();
        selection.bind({}, 5);
        selection.indices.add(0);
        selection.beginRegion();
        selection.region([1, 2, 3], true);
        expect([...selection.indices]).toEqual([0, 1, 2, 3]);
        selection.region([2], true);
        expect([...selection.indices]).toEqual([0, 2]);
        selection.region([], true);
        expect([...selection.indices]).toEqual([0]);
        selection.endRegion();
        selection.region([4], true);
        expect([...selection.indices]).toEqual([0, 4]);
    });

    it('replacement selection ignores both the baseline and invalid indices', () => {
        const selection = new ProbeSelection();
        selection.bind({}, 4);
        selection.all();
        selection.beginRegion();
        selection.region([-1, 2, 9], false);
        expect([...selection.indices]).toEqual([2]);
        selection.region([], false);
        expect([...selection.indices]).toEqual([]);
    });
});

describe('probe region gesture lifecycle', () => {
    let previousCC: unknown;

    beforeEach(() => {
        jest.clearAllMocks();
        mockService.Gizmo.queryLightProbeEditMode.mockReturnValue(true);
        mockRaycastGizmos.mockReturnValue([]);
        previousCC = (globalThis as any).cc;
        (globalThis as any).cc = { game: { canvas: { height: 720 } } };
    });

    afterEach(() => {
        (globalThis as any).cc = previousCC;
    });

    function mouse(x: number, y: number): ISceneMouseEvent {
        return { x, y, leftButton: true, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false } as ISceneMouseEvent;
    }

    function beginRegion(operation: GizmoOperation, hit: 'wireframe' | 'blank'): void {
        mockRaycastGizmos.mockReturnValue(hit === 'wireframe' ? [{ node: { emit: jest.fn() } }] : []);
        operation.onMouseDown(mouse(10, 600));
        operation.onMouseMove(mouse(30, 580));
        expect(mockService.Gizmo.regionSelectLightProbes).toHaveBeenCalledTimes(1);
    }

    function expectNextHandleDrag(operation: GizmoOperation): void {
        const emitted: string[] = [];
        const handle = {
            emit(type: string, event: { propagationStopped: boolean }) {
                emitted.push(type);
                event.propagationStopped = true;
            },
        };
        mockRaycastGizmos.mockReturnValue([{ node: handle }]);
        mockService.Gizmo.regionSelectLightProbes.mockClear();
        operation.onMouseDown(mouse(80, 500));
        operation.onMouseMove(mouse(100, 480));
        operation.onMouseUp(mouse(100, 480));

        expect(emitted).toEqual(['mouseDown', 'mouseMove', 'mouseUp']);
        expect(mockService.Gizmo.regionSelectLightProbes).not.toHaveBeenCalled();
    }

    it.each(['wireframe', 'blank'] as const)('releases a completed %s box before the next consumed handle drag', hit => {
        const operation = new GizmoOperation();
        beginRegion(operation, hit);

        operation.onMouseUp(mouse(30, 580));

        expectNextHandleDrag(operation);
    });

    it.each(['wireframe', 'blank'] as const)('clear cancels an in-progress %s box before another handle drag', hit => {
        const operation = new GizmoOperation();
        beginRegion(operation, hit);

        operation.clear();

        expectNextHandleDrag(operation);
    });

    it('leaves ordinary Gizmo dispatch intact after exiting probe mode during a box gesture', () => {
        const operation = new GizmoOperation();
        beginRegion(operation, 'wireframe');

        mockService.Gizmo.queryLightProbeEditMode.mockReturnValue(false);
        operation.onMouseMove(mouse(40, 570));
        operation.onMouseUp(mouse(40, 570));

        expectNextHandleDrag(operation);
    });

    it('starts a fresh handle gesture if the previous probe mouse-up was lost', () => {
        const operation = new GizmoOperation();
        beginRegion(operation, 'wireframe');

        expectNextHandleDrag(operation);
    });

    it('stops an interrupted box when movement reports that the left button was released', () => {
        const operation = new GizmoOperation();
        beginRegion(operation, 'wireframe');

        operation.onMouseMove({ ...mouse(40, 570), leftButton: false });

        expect(mockService.Gizmo.regionSelectLightProbes).toHaveBeenCalledTimes(1);
        expectNextHandleDrag(operation);
    });

    it('forwards ordinary consumed handle events when probe editing is disabled', () => {
        mockService.Gizmo.queryLightProbeEditMode.mockReturnValue(false);

        expectNextHandleDrag(new GizmoOperation());
    });
});
