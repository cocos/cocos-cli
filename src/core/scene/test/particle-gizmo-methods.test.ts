const mockEmit = jest.fn();
jest.mock('../scene-process/service/core/global-events', () => ({ ServiceEvents: { emit: (...args: unknown[]) => mockEmit(...args) } }));

const mockQueryRegisteredService = jest.fn();
const mockRegisterGizmo = jest.fn();

jest.mock('cc', () => ({
    ParticleSystem: class ParticleSystem {},
    js: { getClassName: () => 'cc.ParticleSystem' },
}));

jest.mock('../scene-process/service/core/decorator', () => ({
    queryRegisteredService: (...args: unknown[]) => mockQueryRegisteredService(...args),
}));

jest.mock('../scene-process/service/gizmo/gizmo-defines', () => ({
    registerGizmo: (...args: unknown[]) => mockRegisterGizmo(...args),
}));

jest.mock('../scene-process/service/gizmo/utils/engine-utils', () => ({}));
jest.mock('../scene-process/service/gizmo/base/gizmo-base', () => ({
    __esModule: true,
    default: class {},
}));
jest.mock('../scene-process/service/gizmo/base/gizmo-icon', () => ({
    __esModule: true,
    default: class {},
}));

import { methods, SelectGizmo } from '../scene-process/service/gizmo/components/particle-system';

function createGizmo(nodeUuid: string) {
    let visible = false;
    return {
        target: { uuid: `${nodeUuid}-component`, node: { uuid: nodeUuid } },
        showBoundingBox: jest.fn((value: boolean) => { visible = value; }),
        isShowBoundingBox: jest.fn(() => visible),
    };
}

describe('粒子旧 Gizmo 包围盒方法', () => {
    let target: ReturnType<typeof createGizmo>;
    let other: ReturnType<typeof createGizmo>;
    const forEachInstanceList = jest.fn();

    beforeEach(() => {
        target = createGizmo('target-node');
        other = createGizmo('other-node');
        forEachInstanceList.mockReset();
        forEachInstanceList.mockImplementation((_type, _name, visit) => {
            [target, other, { target: null }].forEach(visit);
        });
        mockQueryRegisteredService.mockReset();
        mockQueryRegisteredService.mockReturnValue({ forEachInstanceList });
    });

    it('注册的旧入口按节点 UUID 显隐并回读，不影响其他粒子', () => {
        expect(mockRegisterGizmo).toHaveBeenCalledWith('cc.ParticleSystem', expect.objectContaining({ methods }));

        methods.showBoundingBox('target-node', true);
        expect(methods.isShowBoundingBox('target-node')).toBe(true);
        expect(methods.isShowBoundingBox('other-node')).toBe(false);
        methods.showBoundingBox('target-node', false);
        expect(methods.isShowBoundingBox('target-node')).toBe(false);
        expect(other.showBoundingBox).not.toHaveBeenCalled();
        expect(mockQueryRegisteredService).toHaveBeenCalledWith('Gizmo');
        expect(forEachInstanceList).toHaveBeenCalledWith('component', 'cc.ParticleSystem', expect.any(Function));
    });

    it.each(['target-node-component', 'missing-node'])('不将非节点 UUID %s 匹配为目标', (uuid) => {
        methods.showBoundingBox(uuid, true);

        expect(methods.isShowBoundingBox(uuid)).toBeUndefined();
        expect(target.showBoundingBox).not.toHaveBeenCalled();
        expect(other.showBoundingBox).not.toHaveBeenCalled();
    });

    it('没有已创建的 Gizmo 时不抛错、不创建实例，查询仍返回空结果', () => {
        forEachInstanceList.mockImplementation(() => {});

        expect(() => methods.showBoundingBox('target-node', true)).not.toThrow();
        expect(methods.isShowBoundingBox('target-node')).toBeUndefined();
        expect(target.showBoundingBox).not.toHaveBeenCalled();
    });

    it('Gizmo 服务尚未注册时保持安全空操作', () => {
        mockQueryRegisteredService.mockReturnValue(null);

        expect(() => methods.showBoundingBox('target-node', true)).not.toThrow();
        expect(methods.isShowBoundingBox('target-node')).toBeUndefined();
        expect(forEachInstanceList).not.toHaveBeenCalled();
    });
});


describe('粒子包围盒临时显隐事件', () => {
    beforeEach(() => { mockEmit.mockClear(); });

    function createLiveGizmo() {
        return {
            target: { uuid: 'particle-component', node: { uuid: 'particle-node' }, _isShowBB: false },
            updateBBControllerData: jest.fn(),
            showBoundingBox: SelectGizmo.prototype.showBoundingBox,
        };
    }

    it('组件入口只在实际变化时发送临时事件，不发送属性或 dirty 事件', () => {
        const gizmo = createLiveGizmo();
        gizmo.showBoundingBox(true);
        gizmo.showBoundingBox(true);
        gizmo.showBoundingBox(false);
        expect(mockEmit.mock.calls).toEqual([
            ['gizmo:particle-bounds-visibility-changed', { componentUuid: 'particle-component', visible: true }],
            ['gizmo:particle-bounds-visibility-changed', { componentUuid: 'particle-component', visible: false }],
        ]);
        expect(gizmo.updateBBControllerData).toHaveBeenCalledTimes(3);
    });

    it('旧节点 UUID 入口通过同一实例方法发送事件', () => {
        const gizmo = createLiveGizmo();
        mockQueryRegisteredService.mockReturnValue({ forEachInstanceList: (_type: string, _name: string, visit: (item: typeof gizmo) => void) => visit(gizmo) });
        methods.showBoundingBox('particle-node', true);
        expect(mockEmit.mock.calls).toEqual([['gizmo:particle-bounds-visibility-changed', { componentUuid: 'particle-component', visible: true }]]);
    });

    it('目标已销毁时不发通知', () => {
        const gizmo = { target: null, showBoundingBox: SelectGizmo.prototype.showBoundingBox };
        gizmo.showBoundingBox(true);
        expect(mockEmit).not.toHaveBeenCalled();
    });
});
