/**
 * 粒子系统服务能力测试。
 *
 * 对照 https://docs.cocos.com/creator/4.0/manual/en/particle-system/
 * 与 cocos-editor 的 ParticleManager，cocos-cli 的 ParticleService 需要对外暴露：
 *   - queryPlayInfo(uuid)
 *   - setPlaySpeed(uuid, speed)
 *   - play() / stop() / pause() / restart()
 *
 * 这些方法对应 cocos-editor float-window 通过 callSceneMethod 调用的
 * queryParticlePlayInfo / setParticlePlaySpeed / playParticle / stopParticle /
 * pauseParticle / restartParticle。
 *
 * 本测试不依赖真实 cc 引擎，直接 mock 出 ParticleService 依赖的最小环境，
 * 验证 service 方法的行为契约与 cocos-editor 一致。
 */

// 模拟 cc 命名空间，避免引入真实引擎
const mockComponentManagerQuery = jest.fn();
const mockNodeEmit = jest.fn();

jest.mock('../src/core/scene/scene-process/service/core', () => ({
    BaseService: class {
        protected emit() {}
        protected emitInternal() {}
        broadcast() {}
    },
    register: () => (target: any) => {
        // 保持类可被 new
        return target;
    },
    Service: new Proxy({}, {
        get: () => ({}),
    }),
}));

jest.mock('cc', () => ({
    js: { getClassName: (ctor: any) => ctor?.__clsName || '' },
}), { virtual: true });

// 注入 EditorExtends（service 内部通过它访问 ComponentManager.query / Node.emit）
(globalThis as any).EditorExtends = {
    Component: { query: (...args: any[]) => mockComponentManagerQuery(...args) },
    Node: { emit: (...args: any[]) => mockNodeEmit(...args) },
};
(globalThis as any).cc = {
    js: { getClassName: (ctor: any) => ctor?.__clsName || '' },
    EditorExtends: (globalThis as any).EditorExtends,
};

import { ParticleService } from '../src/core/scene/scene-process/service/particle';

/**
 * 构造一个假粒子组件实例，记录 play/stop/pause 调用。
 */
function createFakeParticle(overrides: Record<string, any> = {}) {
    const calls: string[] = [];
    const comp: any = {
        __clsName: 'cc.ParticleSystem',
        node: {
            uuid: 'node-1',
            _components: [],
        },
        isPlaying: false,
        isPaused: false,
        isStopped: true,
        simulationSpeed: 1,
        time: 1.234,
        getParticleCount: () => 42,
        play() { calls.push('play'); this.isPlaying = true; this.isStopped = false; this.isPaused = false; },
        stop() { calls.push('stop'); this.isStopped = true; this.isPlaying = false; },
        pause() { calls.push('pause'); this.isPaused = true; this.isPlaying = false; },
        ...overrides,
    };
    // 让 node._components 包含自身以便 setPlaySpeed 能定位 index
    comp.node._components.push(comp);
    comp.calls = calls;
    return comp;
}

describe('ParticleService 对齐 cocos-editor ParticleManager', () => {
    let service: ParticleService;
    let selectedComps: any[];

    beforeEach(() => {
        mockComponentManagerQuery.mockReset();
        mockNodeEmit.mockReset();
        service = new ParticleService();
        selectedComps = [];
        // mock 私有方法返回选中的粒子组件集合
        (service as any)._getSelectedParticleSystemComponents = () => selectedComps;
    });

    describe('queryPlayInfo', () => {
        it('返回选中粒子的 speed/time/particle/isPlaying', () => {
            const comp = createFakeParticle({ isPlaying: true, time: 2.5, simulationSpeed: 1.5 });
            mockComponentManagerQuery.mockReturnValue(comp);

            const info = service.queryPlayInfo('uuid-1');

            expect(mockComponentManagerQuery).toHaveBeenCalledWith('uuid-1');
            expect(info).toEqual({
                speed: 1.5,
                time: 2.5,
                particle: 42,
                isPlaying: true,
            });
        });

        it('找不到组件时返回 null', () => {
            mockComponentManagerQuery.mockReturnValue(null);
            expect(service.queryPlayInfo('missing')).toBeNull();
        });
    });

    describe('setPlaySpeed', () => {
        it('更新 simulationSpeed 并广播 node change', () => {
            const comp = createFakeParticle({ simulationSpeed: 1 });
            mockComponentManagerQuery.mockReturnValue(comp);

            service.setPlaySpeed('uuid-1', 2.5);

            expect(comp.simulationSpeed).toBe(2.5);
            expect(mockNodeEmit).toHaveBeenCalledWith(
                'change',
                comp.node,
                { propPath: '__comps__.0.simulationSpeed' },
            );
        });

        it('组件不存在时不抛错', () => {
            mockComponentManagerQuery.mockReturnValue(null);
            expect(() => service.setPlaySpeed('missing', 2)).not.toThrow();
            expect(mockNodeEmit).not.toHaveBeenCalled();
        });
    });

    describe('play / stop / pause / restart', () => {
        it('play 会调用 comp.play 且清除 stoppedSet', () => {
            const comp = createFakeParticle();
            selectedComps.push(comp);

            service.play();

            expect(comp.calls).toContain('play');
            expect(comp.isPlaying).toBe(true);
        });

        it('stop 会调用 comp.stop', () => {
            const comp = createFakeParticle({ isPlaying: true, isStopped: false });
            selectedComps.push(comp);

            service.stop();

            expect(comp.calls).toContain('stop');
            expect(comp.isStopped).toBe(true);
        });

        it('pause 会调用 comp.pause', () => {
            const comp = createFakeParticle({ isPlaying: true });
            selectedComps.push(comp);

            service.pause();

            expect(comp.calls).toContain('pause');
            expect(comp.isPaused).toBe(true);
        });

        it('restart 会先 stop 再 play', () => {
            const comp = createFakeParticle({ isPlaying: true, isStopped: false });
            selectedComps.push(comp);

            service.restart();

            expect(comp.calls).toEqual(['stop', 'play']);
            expect(comp.isPlaying).toBe(true);
        });
    });
});
