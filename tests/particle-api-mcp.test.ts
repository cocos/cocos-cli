/**
 * 粒子系统 MCP API 层测试。
 *
 * 验证 ParticleApi 将请求正确转发到 Scene.Particle 服务，
 * 并对未找到组件、缺少参数等场景返回正确的状态码。
 */

const mockQueryPlayInfo = jest.fn();
const mockSetPlaySpeed = jest.fn();
const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockStop = jest.fn();
const mockRestart = jest.fn();
const mockComponentQuery = jest.fn();
const mockRpcRequest = jest.fn();

jest.mock('../src/api/decorator/decorator.js', () => ({
    description: () => jest.fn(),
    param: () => jest.fn(),
    result: () => jest.fn(),
    title: () => jest.fn(),
    tool: () => jest.fn(),
}), { virtual: true });

jest.mock('../src/core/scene', () => ({
    Scene: {
        Component: {
            query: (...args: unknown[]) => mockComponentQuery(...args),
        },
        Particle: {
            queryPlayInfo: (...args: unknown[]) => mockQueryPlayInfo(...args),
            setPlaySpeed: (...args: unknown[]) => mockSetPlaySpeed(...args),
            // 行为方法返回 Promise<void>，与真实 ParticleProxy 一致
            play: (...args: unknown[]) => Promise.resolve(mockPlay(...args)),
            pause: (...args: unknown[]) => Promise.resolve(mockPause(...args)),
            stop: (...args: unknown[]) => Promise.resolve(mockStop(...args)),
            restart: (...args: unknown[]) => Promise.resolve(mockRestart(...args)),
        },
    },
}));

jest.mock('../src/core/scene/main-process/rpc', () => ({
    Rpc: {
        getInstance: () => ({
            request: (...args: unknown[]) => mockRpcRequest(...args),
        }),
    },
}));

import { ParticleApi } from '../src/api/scene/particle';
import { HTTP_STATUS } from '../src/api/base/schema-base';

describe('ParticleApi MCP 转发层', () => {
    let api: ParticleApi;

    beforeEach(() => {
        jest.clearAllMocks();
        api = new ParticleApi();
    });

    describe('queryPlayInfo', () => {
        it('直接用 uuid 查询并返回运行时信息', async () => {
            mockQueryPlayInfo.mockResolvedValue({ speed: 1.5, time: 2.5, particle: 42, isPlaying: true });

            const result = await api.queryPlayInfo({ uuid: 'comp-uuid-1' });

            expect(mockQueryPlayInfo).toHaveBeenCalledWith('comp-uuid-1');
            expect(result.code).toBe(HTTP_STATUS.OK);
            expect(result.data).toMatchObject({ speed: 1.5, time: 2.5, particle: 42, isPlaying: true, found: true });
        });

        it('通过 nodePath 解析出 uuid 后查询', async () => {
            mockComponentQuery.mockResolvedValue({ value: { uuid: { value: 'resolved-uuid' } } });
            mockQueryPlayInfo.mockResolvedValue({ speed: 1, time: 0, particle: 0, isPlaying: false });

            const result = await api.queryPlayInfo({ nodePath: 'Canvas/Particles' });

            expect(mockComponentQuery).toHaveBeenCalledWith({ path: 'Canvas/Particles/cc.ParticleSystem' });
            expect(mockQueryPlayInfo).toHaveBeenCalledWith('resolved-uuid');
            expect(result.code).toBe(HTTP_STATUS.OK);
        });

        it('找不到组件时返回 404', async () => {
            mockComponentQuery.mockResolvedValue(null);

            const result = await api.queryPlayInfo({ nodePath: 'Canvas/Missing' });

            expect(result.code).toBe(HTTP_STATUS.NOT_FOUND);
            expect(result.reason).toContain('not found');
        });

        it('queryPlayInfo 返回 null 时返回 404', async () => {
            mockQueryPlayInfo.mockResolvedValue(null);

            const result = await api.queryPlayInfo({ uuid: 'gone' });

            expect(result.code).toBe(HTTP_STATUS.NOT_FOUND);
        });
    });

    describe('setPlaySpeed', () => {
        it('设置速度后返回最新运行时信息', async () => {
            mockSetPlaySpeed.mockResolvedValue(undefined);
            mockQueryPlayInfo.mockResolvedValue({ speed: 2.5, time: 1, particle: 5, isPlaying: true });

            const result = await api.setPlaySpeed({ uuid: 'comp-uuid-1', speed: 2.5 });

            expect(mockSetPlaySpeed).toHaveBeenCalledWith('comp-uuid-1', 2.5);
            expect(result.code).toBe(HTTP_STATUS.OK);
            expect(result.data?.speed).toBe(2.5);
        });
    });

    describe('play / pause / stop / restart', () => {
        it('提供 nodePath 时先选中节点再 play', async () => {
            mockRpcRequest.mockResolvedValue(undefined);
            mockPlay.mockResolvedValue(undefined);

            const result = await api.play({ nodePath: 'Canvas/Particles' });

            expect(mockRpcRequest).toHaveBeenCalledWith('Selection', 'select', ['Canvas/Particles']);
            expect(mockPlay).toHaveBeenCalled();
            expect(result.code).toBe(HTTP_STATUS.OK);
            expect(result.data).toEqual({ action: 'play', applied: true });
        });

        it('提供 uuid 时反查节点路径后选中再 stop', async () => {
            // 明确区分组件 UUID 与所属节点 UUID。真实 Node.getPathByUuid 使用
            // NodeMgr.getNode(uuid)，只接收节点 UUID；传入组件 UUID 会查不到节点、返回空，
            // 导致后续粒子 stop 无法执行。
            // 生产代码应先用组件 UUID 查到组件实例，取其所属节点 UUID，
            // 再用节点 UUID 反查节点路径（绝不把组件 UUID 当作节点 UUID 传给 Node 查询）。
            const componentUuid = 'comp-uuid-1';
            const nodeUuid = 'node-uuid-1';
            mockRpcRequest.mockImplementation(async (module: string, method: string, args: unknown[]) => {
                // 组件查询：返回组件实例（含 node.uuid），验证组件到所属节点的解析过程
                if (module === 'Component' && method === 'query') {
                    return { node: { uuid: nodeUuid } };
                }
                if (module === 'Node' && method === 'getPathByUuid') {
                    // 只对正确的节点 UUID 返回路径，传组件 UUID 返回空（与真实 NodeMgr 一致）
                    return args[0] === nodeUuid ? 'Canvas/Particles' : '';
                }
                if (module === 'Selection' && method === 'select') {
                    return undefined;
                }
                return undefined;
            });
            mockStop.mockResolvedValue(undefined);

            const result = await api.stop({ uuid: componentUuid });

            // 先用组件 UUID 查询组件实例（RPC: Component.query）
            expect(mockRpcRequest).toHaveBeenCalledWith('Component', 'query', [componentUuid]);
            // 绝不应把组件 UUID 当作节点 UUID 传给 Node 查询
            expect(mockRpcRequest).not.toHaveBeenCalledWith('Node', 'getPathByUuid', [componentUuid]);
            // 应使用节点 UUID 查询节点路径
            expect(mockRpcRequest).toHaveBeenCalledWith('Node', 'getPathByUuid', [nodeUuid]);
            expect(mockRpcRequest).toHaveBeenCalledWith('Selection', 'select', ['Canvas/Particles']);
            expect(mockStop).toHaveBeenCalled();
            expect(result.code).toBe(HTTP_STATUS.OK);
        });

        it('组件 UUID 误传给 Node 查询时返回 404 且不执行粒子操作', async () => {
            // 组件 UUID 与节点 UUID 不同时，若生产代码把组件 UUID 直接传给
            // Node.getPathByUuid，真实接口会查不到节点（返回空路径），
            // 因此 stop 无法执行、应返回 404。
            // 修复后生产代码会先用组件 UUID 查到组件实例、再用节点 UUID 查路径。
            // 此用例验证：组件存在但其所属节点路径解析失败（节点已被删除等）时，
            // 返回 404 且不执行粒子操作。组件 UUID 绝不应被当作节点 UUID 传给 Node 查询。
            const componentUuid = 'comp-uuid-2';
            const nodeUuid = 'node-uuid-2';
            mockRpcRequest.mockImplementation(async (module: string, method: string, args: unknown[]) => {
                if (module === 'Component' && method === 'query') {
                    return { node: { uuid: nodeUuid } };
                }
                if (module === 'Node' && method === 'getPathByUuid') {
                    // 所属节点路径解析失败（节点已被删除等），返回空路径
                    return '';
                }
                return undefined;
            });
            mockStop.mockResolvedValue(undefined);

            const result = await api.stop({ uuid: componentUuid });

            // 组件 UUID 不应被当作节点 UUID 传给 Node 查询
            expect(mockRpcRequest).not.toHaveBeenCalledWith('Node', 'getPathByUuid', [componentUuid]);
            expect(mockStop).not.toHaveBeenCalled();
            expect(result.code).toBe(HTTP_STATUS.NOT_FOUND);
        });

        it('不提供标识时直接作用于当前选中的粒子', async () => {
            mockPause.mockResolvedValue(undefined);

            const result = await api.pause({});

            expect(mockRpcRequest).not.toHaveBeenCalled();
            expect(mockPause).toHaveBeenCalled();
            expect(result.code).toBe(HTTP_STATUS.OK);
        });

        it('restart 调用 Scene.Particle.restart', async () => {
            mockRestart.mockResolvedValue(undefined);

            const result = await api.restart({});

            expect(mockRestart).toHaveBeenCalled();
            expect(result.data?.action).toBe('restart');
        });
    });
});
