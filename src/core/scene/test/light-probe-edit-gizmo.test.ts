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
    }
    return { Vec3, Quat: class {}, Color: class {}, LightProbeGroup: class {}, js: { getClassName: () => 'cc.LightProbeGroup' } };
});
jest.mock('../scene-process/service/gizmo/base/gizmo-base', () => ({
    __esModule: true,
    default: class {
        private value: unknown;
        constructor(value: unknown) { this.value = value; }
        get target() { return this.value; }
        set target(value: unknown) { this.value = value; }
        visible() { return (this as any)._shown === true; }
        onComponentChanged() {}
    },
}));
jest.mock('../scene-process/service/gizmo/base/gizmo-icon', () => ({ __esModule: true, default: class {} }));
jest.mock('../scene-process/service/gizmo/controller/box', () => ({ __esModule: true, default: class {} }));
jest.mock('../scene-process/service/gizmo/node/position-controller', () => ({ __esModule: true, default: class {} }));
jest.mock('../scene-process/service/gizmo/utils/controller-utils', () => ({ __esModule: true, default: {} }));
jest.mock('../scene-process/service/gizmo/utils/engine-utils', () => ({}));
jest.mock('../scene-process/service/gizmo/gizmo-defines', () => ({ registerGizmo: jest.fn() }));

import type { LightProbeGroup } from 'cc';
import { SelectGizmo, methods } from '../scene-process/service/gizmo/components/light-probe-group';

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
