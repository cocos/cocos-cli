import { TransformToolData, type TransformToolDataToolNameType, type TransformToolDataViewMode } from '../scene-process/service/gizmo/transform-tool';

const mockService = {
    Gizmo: {
        transformToolData: new TransformToolData(),
        get transformToolName() { return this.transformToolData.toolName; },
        set transformToolName(value: TransformToolDataToolNameType) { this.transformToolData.toolName = value; },
    },
    Engine: { repaintInEditMode: jest.fn() },
    Undo: { beginRecording: jest.fn(() => 'record'), endRecording: jest.fn(async (_id: string) => {}) },
};
jest.mock('../scene-process/service/core/decorator', () => ({ Service: mockService }));
jest.mock('../scene-process/service/core/global-events', () => ({ ServiceEvents: { broadcast: jest.fn() } }));
jest.mock('../scene-process/service/scene/light-probe-snapshot', () => ({ isLightProbeRestoreInProgress: jest.fn(() => false) }));
jest.mock('cc', () => {
    class Vec3 {
        public x: number;
        public y: number;
        public z: number;
        constructor(x: number | Vec3 = 0, y = 0, z = 0) {
            if (typeof x === 'object') {
                this.x = x.x;
                this.y = x.y;
                this.z = x.z;
            } else {
                this.x = x;
                this.y = y;
                this.z = z;
            }
        }
        static clone(point: Vec3) { return new Vec3(point.x, point.y, point.z); }
        static add(out: Vec3, a: Vec3, b: Vec3) { return out.set(a.x + b.x, a.y + b.y, a.z + b.z); }
        static subtract(out: Vec3, a: Vec3, b: Vec3) { return out.set(a.x - b.x, a.y - b.y, a.z - b.z); }
        static divide(out: Vec3, a: Vec3, b: Vec3) { return out.set(a.x / b.x, a.y / b.y, a.z / b.z); }
        static multiplyScalar(out: Vec3, a: Vec3, value: number) { return out.set(a.x * value, a.y * value, a.z * value); }
        set(x: number | Vec3, y = 0, z = 0) {
            if (typeof x === 'object') { this.x = x.x; this.y = x.y; this.z = x.z; }
            else { this.x = x; this.y = y; this.z = z; }
            return this;
        }
        toString() { return `${this.x},${this.y},${this.z}`; }
    }
    class Node {
        public children: Node[] = [];
        public name = '';
        public active = true;
        public isValid = true;
        private _parent: Node | null = null;
        public position = new Vec3();
        public scale = new Vec3(1, 1, 1);
        get parent() { return this._parent; }
        set parent(value: Node | null) {
            if (value === this._parent) return;
            if (this._parent) this._parent.children.splice(this._parent.children.indexOf(this), 1);
            this._parent = value;
            value?.children.push(this);
        }
        setPosition(value: Vec3) { this.position.set(value); }
        setScale(x: number, y: number, z: number) { this.scale.set(x, y, z); }
        setWorldPosition() {}
        setWorldRotation() {}
        setWorldScale() {}
        destroy = jest.fn(() => { this.isValid = false; });
        on = jest.fn();
        off = jest.fn();
    }
    return { Vec3, Node, Quat: class { static identity() {} }, Color: class {}, LightProbeGroup: class {}, js: { getClassName: () => 'cc.LightProbeGroup' } };
});
jest.mock('../scene-process/service/gizmo/base/gizmo-base', () => ({
    __esModule: true,
    default: class {
        private value: unknown;
        private _recorded = false;
        private _isControlBegin = false;
        constructor(value: unknown) { this.value = value; }
        get target() { return this.value; }
        set target(value: unknown) { this.value = value; }
        visible() { return (this as any)._shown === true; }
        onComponentChanged() {}
        getCompPropPath(property: string) { return property; }
        onControlUpdate() {
            if (this._isControlBegin) return;
            this._isControlBegin = true;
            this._recorded = true;
            mockService.Undo.beginRecording();
        }
        onControlEnd() {
            this._isControlBegin = false;
            return this.commitChanges();
        }
        async commitChanges() {
            if (!this._recorded) return;
            this._recorded = false;
            await mockService.Undo.endRecording('record');
        }
        destroy() {
            void this.commitChanges();
            (this as any).onDestroy?.();
            (this as any).onHide?.();
            this.value = null;
        }
    },
}));
jest.mock('../scene-process/service/gizmo/base/gizmo-icon', () => ({ __esModule: true, default: class {} }));
jest.mock('../scene-process/service/gizmo/controller/box', () => ({ __esModule: true, default: class {} }));
jest.mock('../scene-process/service/gizmo/node/position-controller', () => ({ __esModule: true, default: class {} }));
jest.mock('../scene-process/service/gizmo/utils/controller-utils', () => ({
    __esModule: true,
    default: { sphere: jest.fn(() => new (require('cc').Node)()), drawLines: jest.fn() },
}));
jest.mock('../scene-process/service/gizmo/utils/engine-utils', () => ({
    create3DNode: jest.fn(() => new (require('cc').Node)()),
    addMeshToNode: jest.fn(),
    getModel: jest.fn(() => ({ mesh: {} })),
    setMeshColor: jest.fn(),
}));
jest.mock('../scene-process/service/gizmo/gizmo-defines', () => ({ registerGizmo: jest.fn() }));

import { LightProbeGroup, Node, Vec3 } from 'cc';
import { SelectGizmo, methods } from '../scene-process/service/gizmo/components/light-probe-group';
import { create3DNode, addMeshToNode, setMeshColor } from '../scene-process/service/gizmo/utils/engine-utils';
import { NodeEventType } from '../common/node';
import { beginLightProbeTransformEdit } from '../scene-process/service/scene/light-probe-transform';
import { isLightProbeRestoreInProgress } from '../scene-process/service/scene/light-probe-snapshot';

function target(uuid: string, count: number): LightProbeGroup {
    return { isValid: true, enabledInHierarchy: true, node: { uuid },
        probes: Array.from({ length: count }, (_, x) => ({ x, y: 0, z: 0 })) } as unknown as LightProbeGroup;
}

const created: InstanceType<typeof SelectGizmo>[] = [];
function group(uuid: string, count: number) {
    const gizmo = new SelectGizmo(target(uuid, count));
    const refreshTargetState = () => {
        const state = gizmo as any;
        if (state._boundTarget !== gizmo.target) {
            state._selected.clear();
            state._boundTarget = gizmo.target;
        }
        state._probeIndexByName.clear();
        for (let index = 0; index < (gizmo.target?.probes.length ?? 0); index++) {
            state._probeIndexByName.set(`LightProbeSphere_${index}`, index);
        }
    };
    jest.spyOn(gizmo, 'createController').mockImplementation(() => {
        Object.assign(gizmo, { _controller: { hide: jest.fn(), shape: { destroy: jest.fn() } } });
    });
    jest.spyOn(gizmo, 'updateControllerData').mockImplementation(refreshTargetState);
    jest.spyOn(gizmo as any, '_rebuildDots').mockImplementation(refreshTargetState);
    jest.spyOn(gizmo as any, '_rebuildWireframe').mockImplementation(() => {});
    jest.spyOn(gizmo as any, '_updateProbeControllerTransform').mockImplementation(() => {});
    gizmo.init();
    gizmo.onShow();
    created.push(gizmo);
    return gizmo;
}

beforeEach(() => {
    mockService.Gizmo.transformToolData = new TransformToolData();
    jest.mocked(isLightProbeRestoreInProgress).mockReturnValue(false);
});

afterEach(() => {
    for (const gizmo of created.splice(0)) { gizmo.onHide(); gizmo.onDestroy(); }
    methods.changeEditMode('none');
    jest.clearAllMocks();
});

describe('Probe editing pooled Gizmos', () => {
    it.each<[TransformToolDataToolNameType, TransformToolDataViewMode]>([
        ['position', 'select'],
        ['rotation', 'select'],
        ['scale', 'select'],
        ['rect', 'select'],
        ['view', 'select'],
        ['view', 'view'],
    ])('uses probe selection and restores the original %s/%s tool state', (toolName, viewMode) => {
        group('a', 4);
        const tool = mockService.Gizmo.transformToolData;
        tool.toolName = toolName;
        tool.viewMode = viewMode;

        methods.changeEditMode('vertex');
        const during = { toolName: tool.toolName, viewMode: tool.viewMode };
        // Repeating the current mode must not replace the original tool snapshot.
        methods.changeEditMode('vertex');
        methods.changeEditMode('none');

        expect({ during, after: { toolName: tool.toolName, viewMode: tool.viewMode } }).toEqual({
            during: { toolName: 'view', viewMode: 'select' },
            after: { toolName, viewMode },
        });
    });

    it('restores browsing when switching to box mode and when the last probe group hides', () => {
        const gizmo = group('a', 4);
        const tool = mockService.Gizmo.transformToolData;
        tool.toolName = 'view';
        tool.viewMode = 'view';

        methods.changeEditMode('vertex');
        methods.changeEditMode('box');
        const box = { mode: methods.getEditMode(), toolName: tool.toolName, viewMode: tool.viewMode };
        methods.changeEditMode('vertex');
        gizmo.onHide();

        expect({ box, hidden: { mode: methods.getEditMode(), toolName: tool.toolName, viewMode: tool.viewMode } }).toEqual({
            box: { mode: 'box', toolName: 'view', viewMode: 'view' },
            hidden: { mode: 'none', toolName: 'view', viewMode: 'view' },
        });
    });

    it('counts only visible valid groups and clears a reused target with the same probe count', () => {
        const first = group('a', 32);
        const second = group('b', 32);
        methods.changeEditMode('vertex');
        methods.selectAllProbes();
        expect(methods.getSelectedProbeCount()).toBe(64);
        first.onHide();
        methods.selectAllProbes();
        expect([methods.getSelectedProbeCount(), (first as any)._selected.size]).toEqual([32, 0]);
        first.target = target('c', 32);
        first.onShow();
        expect(methods.getSelectedProbeCount()).toBe(32);
        second.onHide();
        methods.selectAllProbes();
        expect([methods.getSelectedProbeCount(), (second as any)._selected.size]).toEqual([32, 0]);
    });

    it('does not count disabled targets and returns to normal tools after the last group hides', () => {
        const gizmo = group('a', 4);
        methods.changeEditMode('vertex');
        methods.selectAllProbes();
        Object.assign(gizmo.target!, { enabledInHierarchy: false });
        expect(methods.getSelectedProbeCount()).toBe(0);
        gizmo.onHide();
        expect([methods.getEditMode(), mockService.Gizmo.transformToolName]).toEqual(['none', 'position']);
    });

    it('duplicates selected probes but never a hidden group and waits for the recording', async () => {
        const hidden = group('hidden', 4);
        const active = group('active', 4);
        methods.changeEditMode('vertex');
        methods.selectAllProbes();
        hidden.onHide();
        let settle!: () => void;
        mockService.Undo.endRecording.mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }));
        let finished = false;
        const operation = methods.duplicateSelectedProbes().then(count => { finished = true; return count; });
        await Promise.resolve();
        expect([hidden.target!.probes.length, active.target!.probes.length, finished]).toEqual([4, 8, false]);
        expect(mockService.Undo.beginRecording).toHaveBeenCalledWith(['active']);
        settle();
        expect(await operation).toBe(4);
        expect([...(active as any)._selected]).toEqual([
            'LightProbeSphere_4',
            'LightProbeSphere_5',
            'LightProbeSphere_6',
            'LightProbeSphere_7',
        ]);
        expect(await methods.deleteSelectedProbes()).toBe(4);
        expect([active.target!.probes.length, methods.getSelectedProbeCount()]).toEqual([4, 0]);
    });
});

describe('Probe editing hot paths', () => {
    function drawableGroup(count: number) {
        const probeTarget = Object.assign(new LightProbeGroup(), target('drawn', count));
        Object.assign(probeTarget.node, {
            worldPosition: new Vec3(),
            getWorldPosition: () => new Vec3(),
            scene: { globals: { lightProbeInfo: { showProbe: true, showWireframe: false, lightProbeSphereVolume: 1 } } },
        });
        const gizmo = new SelectGizmo(probeTarget);
        const state = gizmo as any;
        Object.assign(state, {
            _isInitialized: true,
            _shown: true,
            _dotsRoot: new Node(),
            _controller: { hide: jest.fn() },
        });
        created.push(gizmo);
        return { gizmo, state, probeTarget };
    }

    it('reuses all 1000 sphere nodes, meshes and handlers on position and display-size changes', () => {
        const { state, probeTarget } = drawableGroup(1000);
        state._vertexEditMode = true;
        state._rebuildDots(true);
        const spheres = [...state._dotsRoot.children] as Node[];
        const createdCount = jest.mocked(create3DNode).mock.calls.length;
        const meshCount = jest.mocked(addMeshToNode).mock.calls.length;
        probeTarget.probes[0].x = 50;
        state._getLightProbeInfo().lightProbeSphereVolume = 3;

        state._rebuildDots(true);

        expect(state._dotsRoot.children).toEqual(spheres);
        expect(jest.mocked(create3DNode).mock.calls).toHaveLength(createdCount);
        expect(jest.mocked(addMeshToNode).mock.calls).toHaveLength(meshCount);
        expect(spheres[0].position.x).toBe(50);
        expect(spheres[0].scale.x).toBeCloseTo(0.18);
        expect(state._probeMouseHandlers.size).toBe(1000);
        expect(spheres[0].on).toHaveBeenCalledTimes(3);
        expect(spheres[0].destroy).not.toHaveBeenCalled();
    });

    it('destroys only removed spheres and allocates only added spheres', () => {
        const { state, probeTarget } = drawableGroup(4);
        state._vertexEditMode = true;
        state._rebuildDots(true);
        const spheres = [...state._dotsRoot.children] as Node[];
        state._selected.add('LightProbeSphere_3');
        probeTarget.probes = probeTarget.probes.slice(0, 2);
        state._rebuildDots(true);

        expect(state._dotsRoot.children).toEqual(spheres.slice(0, 2));
        expect(spheres[2].destroy).toHaveBeenCalledTimes(1);
        expect(spheres[3].destroy).toHaveBeenCalledTimes(1);
        expect(spheres[2].off).toHaveBeenCalledTimes(3);
        expect(state._selected.size).toBe(0);
        expect(state._probeMouseHandlers.size).toBe(2);
        probeTarget.probes = [...probeTarget.probes, new Vec3(10, 20, 30)];
        jest.mocked(create3DNode).mockClear();
        state._rebuildDots(true);
        expect(create3DNode).toHaveBeenCalledTimes(1);
        expect(state._dotsRoot.children.slice(0, 2)).toEqual(spheres.slice(0, 2));
        expect(state._dotsRoot.children[2].position).toEqual(new Vec3(10, 20, 30));
    });

    it('records a vertex drag once and leaves hidden wireframes untouched', () => {
        const { gizmo, state, probeTarget } = drawableGroup(1);
        state._vertexEditMode = true;
        state._rebuildDots(true);
        state._selected.add('LightProbeSphere_0');
        probeTarget.onProbeChanged = jest.fn();
        const rebuild = jest.spyOn(state, '_rebuildWireframe').mockImplementation(() => {});
        jest.spyOn(state, '_updateProbeControllerTransform').mockImplementation(() => {});

        state._onProbeCtrlDown({});
        expect(mockService.Undo.beginRecording).toHaveBeenCalledTimes(1);
        expect(state._dragWirePositions).toEqual([]);
        state._onProbeCtrlUp({});
        expect(mockService.Undo.endRecording).toHaveBeenCalledTimes(1);
        expect(rebuild).toHaveBeenCalledTimes(1);
        expect(probeTarget.onProbeChanged).toHaveBeenCalledTimes(1);
        expect(gizmo.getSelectedProbeIndices()).toEqual([0]);
    });

    it('does not re-tetrahedralize restored engine data and leaves unchanged frames alone', () => {
        const { gizmo, state, probeTarget } = drawableGroup(1000);
        probeTarget.onProbeChanged = jest.fn();
        const refresh = jest.spyOn(gizmo, 'updateControllerData');
        gizmo.onNodeChanged({ type: NodeEventType.LIGHT_PROBE_CHANGED });
        expect(probeTarget.onProbeChanged).not.toHaveBeenCalled();
        expect(refresh).toHaveBeenCalledTimes(1);
        const spheres = [...state._dotsRoot.children];
        for (let i = 0; i < 60; i++) gizmo.onUpdate();
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(state._dotsRoot.children).toEqual(spheres);
        gizmo.onHide();
        const fingerprint = jest.spyOn(state, '_computeInfoSig');
        gizmo.onUpdate();
        expect(fingerprint).not.toHaveBeenCalled();
    });

    it('updates a moved group once but does not repeat an engine or Undo position update', () => {
        const { gizmo, probeTarget } = drawableGroup(4);
        probeTarget.onProbeChanged = jest.fn();
        gizmo.onNodeChanged({ type: NodeEventType.LIGHT_PROBE_CHANGED });
        Object.assign(probeTarget.node.worldPosition, { x: 10 });

        gizmo.onNodeChanged();
        gizmo.onNodeChanged();
        gizmo.onUpdate();

        expect(probeTarget.onProbeChanged).toHaveBeenCalledTimes(1);
        expect(probeTarget.onProbeChanged).toHaveBeenCalledWith(false, false);
        probeTarget.probes[0].x = 3;
        Object.assign(probeTarget.node.worldPosition, { x: 20 });
        gizmo.onNodeChanged({ type: NodeEventType.LIGHT_PROBE_CHANGED });
        gizmo.onNodeChanged();
        expect(probeTarget.onProbeChanged).toHaveBeenCalledTimes(1);
    });

    it('keeps whole-node drag previews without resyncing the engine or rewriting 1000 spheres', () => {
        const { gizmo, state, probeTarget } = drawableGroup(1000);
        const scene = probeTarget.node.scene;
        Object.assign(scene, { isValid: true });
        Object.assign(probeTarget, { isValid: true, enabledInHierarchy: true });
        Object.assign(probeTarget.node, { isValid: true, getComponentsInChildren: () => [probeTarget] });
        Object.assign(scene.globals.lightProbeInfo, { data: { probes: probeTarget.probes, tetrahedrons: [] } });
        probeTarget.onProbeChanged = jest.fn();
        gizmo.onNodeChanged({ type: NodeEventType.LIGHT_PROBE_CHANGED });
        const spheres = [...state._dotsRoot.children];
        jest.mocked(setMeshColor).mockClear();
        const finish = beginLightProbeTransformEdit([probeTarget.node]);
        expect(finish).toBeDefined();
        try {
            for (let step = 1; step <= 20; step++) {
                Object.assign(probeTarget.node.worldPosition, { x: step });
                // Ancestor transforms may reach the component only onUpdate;
                // direct transforms also send onNodeChanged in the same frame.
                gizmo.onUpdate();
                gizmo.onNodeChanged({ type: NodeEventType.TRANSFORM_CHANGED });
            }
            expect(probeTarget.onProbeChanged).not.toHaveBeenCalled();
            expect(setMeshColor).not.toHaveBeenCalled();
            expect(state._dotsRoot.children).toEqual(spheres);
        } finally { finish!(); }
        gizmo.onNodeChanged({ type: NodeEventType.LIGHT_PROBE_BAKING_CHANGED });
        gizmo.onUpdate();
        expect(probeTarget.onProbeChanged).not.toHaveBeenCalled();
    });

    it('does not re-tetrahedralize when its Gizmo is first shown during raw Undo restoration', () => {
        const { gizmo, probeTarget } = drawableGroup(1000);
        probeTarget.onProbeChanged = jest.fn();
        jest.mocked(isLightProbeRestoreInProgress).mockReturnValue(true);

        gizmo.onShow();
        gizmo.onNodeChanged();

        expect(probeTarget.onProbeChanged).not.toHaveBeenCalled();
        jest.mocked(isLightProbeRestoreInProgress).mockReturnValue(false);
        gizmo.onNodeChanged({ type: NodeEventType.LIGHT_PROBE_CHANGED });
        gizmo.onNodeChanged();
        gizmo.onUpdate();
        expect(probeTarget.onProbeChanged).not.toHaveBeenCalled();
    });

    it('regenerates the box once on release without delayed node rebuilds', () => {
        jest.useFakeTimers();
        try {
            const { gizmo, state, probeTarget } = drawableGroup(1000);
            Object.assign(state._controller, { updated: true });
            state._boxDragging = true;
            probeTarget.generateLightProbes = jest.fn();
            const regenerate = jest.spyOn(gizmo, 'generateLightProbes');
            const rebuild = jest.spyOn(state, '_rebuildDots');

            gizmo.onControllerMouseUp();
            jest.runAllTimers();

            expect(regenerate).toHaveBeenCalledTimes(1);
            expect(probeTarget.generateLightProbes).toHaveBeenCalledTimes(1);
            expect(rebuild).toHaveBeenCalledTimes(1);
            expect(state._boxDragging).toBe(false);
            gizmo.onUpdate();
            expect(rebuild).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });

    it('moves the box preview without component dumps or probe updates until release', () => {
        const { gizmo, state, probeTarget } = drawableGroup(1000);
        probeTarget.minPos = new Vec3(-1, -1, -1);
        probeTarget.maxPos = new Vec3(1, 1, 1);
        probeTarget.onProbeChanged = jest.fn();
        probeTarget.generateLightProbes = jest.fn();
        Object.assign(state._controller, {
            updated: true,
            getDeltaSize: () => new Vec3(2, 0, 0),
            updateSize: jest.fn(),
        });
        const notify = jest.spyOn(state, 'onComponentChanged');
        const refresh = jest.spyOn(gizmo, 'updateControllerData');

        gizmo.onControllerMouseDown();
        for (let i = 0; i < 10; i++) {
            gizmo.onControllerMouseMove({ handleName: 'x' });
            gizmo.onNodeChanged();
            gizmo.onUpdate();
        }

        expect(probeTarget.maxPos).toEqual(new Vec3(2, 1, 1));
        expect(notify).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
        expect(probeTarget.onProbeChanged).not.toHaveBeenCalled();
        expect(probeTarget.generateLightProbes).not.toHaveBeenCalled();
        expect(mockService.Engine.repaintInEditMode).toHaveBeenCalledTimes(10);
        gizmo.onControllerMouseUp();
        expect(notify).toHaveBeenCalledTimes(1);
        expect(probeTarget.generateLightProbes).toHaveBeenCalledTimes(1);
    });

    it.each(['hide', 'exit', 'destroy', 'replace'] as const)('finishes a vertex gesture once before %s', action => {
        const { gizmo, state, probeTarget } = drawableGroup(4);
        state._vertexEditMode = true;
        state._rebuildDots(true);
        state._selected.add('LightProbeSphere_0');
        probeTarget.onProbeChanged = jest.fn();
        jest.spyOn(state, '_updateProbeControllerTransform').mockImplementation(() => {});
        state._onProbeCtrlDown({});
        probeTarget.probes[0].x = 10;

        if (action === 'hide') gizmo.onHide();
        else if (action === 'exit') gizmo.lightProbeEditModeChanged(false);
        else if (action === 'destroy') gizmo.destroy();
        else gizmo.target = target('replacement', 4);
        state._onProbeCtrlUp({});

        expect(probeTarget.onProbeChanged).toHaveBeenCalledTimes(1);
        expect(probeTarget.probes[0].x).toBe(10);
        expect(mockService.Undo.beginRecording).toHaveBeenCalledTimes(1);
        expect(mockService.Undo.endRecording).toHaveBeenCalledTimes(1);
        expect(state._ctrlDragging).toBe(false);
    });

    it.each(['hide', 'exit', 'destroy'] as const)('finishes a changed box once before %s', action => {
        const { gizmo, state, probeTarget } = drawableGroup(4);
        probeTarget.minPos = new Vec3(-1, -1, -1);
        probeTarget.maxPos = new Vec3(1, 1, 1);
        probeTarget.generateLightProbes = jest.fn();
        Object.assign(state._controller, {
            updated: true,
            getDeltaSize: () => new Vec3(2, 0, 0),
            updateSize: jest.fn(),
        });
        gizmo.onControllerMouseDown();
        gizmo.onControllerMouseMove({ handleName: 'x' });

        if (action === 'hide') gizmo.onHide();
        else if (action === 'exit') gizmo.boundingBoxEditModeChanged(false);
        else gizmo.destroy();
        gizmo.onControllerMouseUp();

        expect(probeTarget.generateLightProbes).toHaveBeenCalledTimes(1);
        expect(mockService.Undo.beginRecording).toHaveBeenCalledTimes(1);
        expect(mockService.Undo.endRecording).toHaveBeenCalledTimes(1);
        expect(state._boxDragging).toBe(false);
    });

    it.each(['vertex', 'box'] as const)('ends %s Undo but never regenerates a destroyed target', mode => {
        const { gizmo, state, probeTarget } = drawableGroup(4);
        probeTarget.onProbeChanged = jest.fn();
        probeTarget.generateLightProbes = jest.fn();
        if (mode === 'vertex') {
            state._vertexEditMode = true;
            state._rebuildDots(true);
            state._selected.add('LightProbeSphere_0');
            state._onProbeCtrlDown({});
        } else {
            state._boxDragging = true;
            state._controller.updated = true;
            gizmo.onControlUpdate('minPos');
        }
        Object.assign(probeTarget, { isValid: false });

        gizmo.destroy();

        expect(probeTarget.onProbeChanged).not.toHaveBeenCalled();
        expect(probeTarget.generateLightProbes).not.toHaveBeenCalled();
        expect(mockService.Undo.endRecording).toHaveBeenCalledTimes(1);
        expect(state._ctrlDragging).toBe(false);
        expect(state._boxDragging).toBe(false);
    });
});
