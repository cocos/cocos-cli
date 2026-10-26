jest.mock('cc', () => ({
    Component: class Component {},
    Node: class Node {},
    GeometryRenderer: class GeometryRenderer {},
    director: {
        getTotalFrames: jest.fn(() => 0),
        tick: jest.fn(),
    },
}));

jest.mock('../scene-process/service/core/decorator', () => {
    const actual = jest.requireActual('../scene-process/service/core/decorator');
    return {
        ...actual,
        queryRegisteredService: jest.fn(() => null),
    };
});

import { EngineService } from '../scene-process/service/engine';
import { ServiceEvents } from '../scene-process/service/core/global-events';
import { queryRegisteredService } from '../scene-process/service/core/decorator';
import { director } from 'cc';

describe('Engine repaint recovery', () => {
    it('accepts repaint requests after a failed frame without scheduling recursive repaint', async () => {
        const service = new EngineService();
        (director.tick as jest.Mock).mockImplementationOnce(() => {
            void service.repaintInEditMode();
            expect((service as any)._shouldRepaintInEM).toBe(false);
            throw new Error('texture upload failed');
        });
        expect(() => service.tickInEditMode(0)).toThrow('texture upload failed');
        await service.repaintInEditMode();
        expect((service as any)._shouldRepaintInEM).toBe(true);
    });
});

type Group = { index: number; name: string };

function makeService() {
    return new EngineService() as unknown as {
        updatePhysicsGroup(groups?: Group[]): void;
    };
}

describe('Engine updatePhysicsGroup', () => {
    let enumUpdate: jest.Mock;

    beforeEach(() => {
        enumUpdate = jest.fn();
        (globalThis as any).cc = {
            // cc.Enum 枚举里同时存在 name→value 与 value→name 的反向映射（与引擎一致）
            internal: {
                PhysicsGroup: { DEFAULT: 1, '1': 'DEFAULT' },
                PhysicsGroup2D: { DEFAULT: 1, '1': 'DEFAULT' },
            },
            Enum: { update: enumUpdate },
            EditorExtends: {
                Node: {
                    getNode: jest.fn(),
                    getNodePath: jest.fn(),
                },
            },
        };
        // 默认无选中，避免触发广播
        (queryRegisteredService as jest.Mock).mockReturnValue({ query: jest.fn(() => []) });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        (queryRegisteredService as jest.Mock).mockReset();
    });

    it('新增分组按 1<<index 写入 3D/2D 枚举并调用 cc.Enum.update', () => {
        const service = makeService();

        service.updatePhysicsGroup([{ index: 2, name: 'BIT_1' }]);

        const { PhysicsGroup, PhysicsGroup2D } = (globalThis as any).cc.internal;
        expect(PhysicsGroup.BIT_1).toBe(1 << 2);
        expect(PhysicsGroup2D.BIT_1).toBe(1 << 2);
        // 原有 DEFAULT 保留
        expect(PhysicsGroup.DEFAULT).toBe(1);
        // 两个枚举各更新一次
        expect(enumUpdate).toHaveBeenCalledTimes(2);
    });

    it('删除引擎中相同 value / name 的旧项后再写入新名', () => {
        (globalThis as any).cc.internal.PhysicsGroup = { DEFAULT: 1, '1': 'DEFAULT', OLD: 4, '4': 'OLD' };
        const service = makeService();

        service.updatePhysicsGroup([{ index: 2, name: 'NEW' }]);

        const g = (globalThis as any).cc.internal.PhysicsGroup;
        expect(g.NEW).toBe(4);
        // 旧的正/反向映射都被清掉
        expect(g.OLD).toBeUndefined();
        expect(g['4']).toBeUndefined();
        expect(g.DEFAULT).toBe(1);
    });

    it('跳过非法分组项（缺 name / index 非数字）', () => {
        const service = makeService();

        service.updatePhysicsGroup([
            { index: 3, name: '' } as Group,
            { name: 'NoIndex' } as unknown as Group,
            { index: 5, name: 'OK' },
        ]);

        const g = (globalThis as any).cc.internal.PhysicsGroup;
        expect(g.OK).toBe(1 << 5);
        expect(Object.prototype.hasOwnProperty.call(g, 'NoIndex')).toBe(false);
        expect(g['8']).toBeUndefined(); // 1<<3，空 name 未写入
    });

    it('物理枚举不存在时安全跳过', () => {
        (globalThis as any).cc.internal = {};
        const service = makeService();
        const broadcast = jest.spyOn(ServiceEvents, 'broadcast').mockImplementation(() => {});

        expect(() => service.updatePhysicsGroup([{ index: 2, name: 'BIT_1' }])).not.toThrow();
        expect(enumUpdate).not.toHaveBeenCalled();
        expect(broadcast).not.toHaveBeenCalled();
    });

    it('删除的分组从枚举中移除（重建为内置 + 当前分组）', () => {
        (globalThis as any).cc.internal.PhysicsGroup = { DEFAULT: 1, '1': 'DEFAULT', BIT_1: 4, '4': 'BIT_1' };
        (globalThis as any).cc.internal.PhysicsGroup2D = { DEFAULT: 1, '1': 'DEFAULT', BIT_1: 4, '4': 'BIT_1' };
        const service = makeService();

        // 传入空列表：等价于用户删除了所有自定义分组
        service.updatePhysicsGroup([]);

        const g = (globalThis as any).cc.internal.PhysicsGroup;
        expect(g.BIT_1).toBeUndefined();
        expect(g['4']).toBeUndefined();
        expect(g.DEFAULT).toBe(1);
        expect(enumUpdate).toHaveBeenCalledTimes(2);
    });

    it('对选中节点上碰撞体的 group 属性发带 propPath 的 node:change（刷新下拉）', () => {
        // 选中节点上有一个碰撞体（group 为数字），期望以 setProperty 同款方式发 node:change
        const collider = { group: 1 };
        const node = { components: [collider] };
        (queryRegisteredService as jest.Mock).mockReturnValue({ query: jest.fn(() => ['root/child']) });
        (globalThis as any).cc.EditorExtends.Node.getNodeByPath = jest.fn(() => node);
        const emit = jest.spyOn(ServiceEvents, 'emit').mockImplementation(() => {});

        const service = makeService();
        service.updatePhysicsGroup([{ index: 2, name: 'BIT_1' }]);

        expect(emit).toHaveBeenCalledWith(
            'node:change',
            node,
            expect.objectContaining({ propPath: '_components.0.group' }),
        );
    });

    it('选中节点无碰撞体时退回路径级 node:change', () => {
        const node = { components: [{ /* 非碰撞体，无 group */ }] };
        (queryRegisteredService as jest.Mock).mockReturnValue({ query: jest.fn(() => ['root/only']) });
        (globalThis as any).cc.EditorExtends.Node.getNodeByPath = jest.fn(() => node);
        const broadcast = jest.spyOn(ServiceEvents, 'broadcast').mockImplementation(() => {});

        const service = makeService();
        service.updatePhysicsGroup([{ index: 2, name: 'BIT_1' }]);

        expect(broadcast).toHaveBeenCalledWith('node:change', 'root/only');
    });
});
