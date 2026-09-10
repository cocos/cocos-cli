const mockService = {
    Gizmo: { transformToolName: 'position', transformToolData: { viewMode: 'select' } },
    Engine: { repaintInEditMode: jest.fn() },
    Undo: { beginRecording: jest.fn(() => 'record'), endRecording: jest.fn(async (_id: string) => {}) },
};
jest.mock('../scene-process/service/core/decorator', () => ({ Service: mockService }));
jest.mock('../scene-process/service/core/global-events', () => ({ ServiceEvents: { broadcast: jest.fn() } }));
jest.mock('cc', () => {
    class Vec3 {
        constructor(public x = 0, public y = 0, public z = 0) {}
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
    jest.spyOn(gizmo, 'createController').mockImplementation(() => {
        Object.assign(gizmo, { _controller: { hide: jest.fn(), shape: { destroy: jest.fn() } } });
    });
    jest.spyOn(gizmo, 'updateControllerData').mockImplementation(() => {
        gizmo.selection.bind(gizmo.target, gizmo.target?.probes.length ?? 0);
    });
    jest.spyOn(gizmo, 'refreshSelection').mockImplementation(() => {});
    jest.spyOn(gizmo, 'probesChanged').mockImplementation(() => gizmo.updateControllerData());
    gizmo.init();
    gizmo.onShow();
    created.push(gizmo);
    return gizmo;
}

afterEach(() => {
    for (const gizmo of created.splice(0)) { gizmo.onHide(); gizmo.onDestroy(); }
    jest.clearAllMocks();
});

describe('Probe editing pooled Gizmos', () => {
    it('counts only visible valid groups and clears a reused target with the same probe count', () => {
        const first = group('a', 32);
        const second = group('b', 32);
        methods.changeEditMode('vertex');
        methods.selectAllProbes();
        expect(methods.getSelectedProbeCount()).toBe(64);
        first.onHide();
        methods.selectAllProbes();
        expect([methods.getSelectedProbeCount(), first.selection.indices.size]).toEqual([32, 0]);
        first.target = target('c', 32);
        first.onShow();
        expect(methods.getSelectedProbeCount()).toBe(32);
        second.onHide();
        methods.selectAllProbes();
        expect([methods.getSelectedProbeCount(), second.selection.indices.size]).toEqual([32, 0]);
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
        expect([...active.selection.indices]).toEqual([4, 5, 6, 7]);
        expect(await methods.deleteSelectedProbes()).toBe(4);
        expect([active.target!.probes.length, methods.getSelectedProbeCount()]).toEqual([4, 0]);
    });
});
