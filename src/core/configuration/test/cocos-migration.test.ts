import { CocosMigrationManager, CocosMigration } from '../migration';
import type { IMigrationTarget } from '../migration';

jest.mock('../migration/cocos-migration', () => ({
    CocosMigration: {
        migrate: jest.fn()
    }
}));

describe('CocosMigrationManager', () => {
    const mockMigrate = CocosMigration.migrate as jest.MockedFunction<typeof CocosMigration.migrate>;

    beforeEach(() => {
        jest.clearAllMocks();
        // 清空已注册的迁移器
        CocosMigrationManager.clear();
    });

    describe('register', () => {
        it('应支持注册单个迁移器，默认 targetScope 为 project', () => {
            const t1: IMigrationTarget = {
                sourceScope: 'project',
                pluginName: 'pkgA',
                migrate: async () => ({})
            };

            CocosMigrationManager.register(t1);

            const map = CocosMigrationManager.migrationTargets;
            expect(map.size).toBe(1);
            expect(map.get('project')?.length).toBe(1);
        });

        it('应支持批量注册并按各自 scope 分类', () => {
            const t1: IMigrationTarget = {
                sourceScope: 'project',
                pluginName: 'pkgA',
                migrate: async () => ({ a: 1 })
            };
            const t2: IMigrationTarget = {
                sourceScope: 'local',
                targetScope: 'project',
                pluginName: 'pkgB',
                migrate: async () => ({ b: 2 })
            };

            CocosMigrationManager.register([t1, t2]);

            const map = CocosMigrationManager.migrationTargets;
            expect(map.get('project')?.[0]).toBe(t1);
            expect(map.get('project')?.[1]).toBe(t2);
        });
    });

    describe('migrate', () => {
        it('无注册迁移器时直接抛异常', async () => {
            // 清空迁移器并阻止自动注册
            CocosMigrationManager.clear();
            // Mock registerMigration 方法使其不注册任何迁移器
            const originalRegisterMigration = CocosMigrationManager['registerMigration'];
            CocosMigrationManager['registerMigration'] = jest.fn().mockResolvedValue(undefined);

            try {
                await expect(CocosMigrationManager.migrate('/path')).rejects.toThrow('[Migration] 没有注册任何迁移器');
            } finally {
                // 恢复原始方法
                CocosMigrationManager['registerMigration'] = originalRegisterMigration;
            }
        });

        it('应按 scope 执行迁移并深度合并结果', async () => {
            const t1: IMigrationTarget = {
                sourceScope: 'project',
                pluginName: 'pkgA',
                migrate: async () => ({})
            };
            const t2: IMigrationTarget = {
                sourceScope: 'project',
                pluginName: 'pkgB',
                migrate: async () => ({})
            };
            const t3: IMigrationTarget = {
                sourceScope: 'local',
                targetScope: 'project',
                pluginName: 'pkgC',
                migrate: async () => ({})
            };

            // Mock registerMigration to prevent clearing our custom migrations
            const originalRegisterMigration = CocosMigrationManager['registerMigration'];
            CocosMigrationManager['registerMigration'] = jest.fn().mockResolvedValue(undefined);

            try {
                CocosMigrationManager.register([t1, t2, t3]);

                mockMigrate
                    .mockResolvedValueOnce({ a: { x: 1 }, p: 1 }) // t1
                    .mockResolvedValueOnce({ a: { y: 2 }, p: 2 }) // t2
                    .mockResolvedValueOnce({ g: { k: 3 } }); // t3

                const res = await CocosMigrationManager.migrate('/proj');

                expect(mockMigrate).toHaveBeenCalledTimes(3);
                expect(res).toEqual({
                    project: { a: { x: 1, y: 2 }, p: 2, g: { k: 3 } }
                });
            } finally {
                // Restore original method
                CocosMigrationManager['registerMigration'] = originalRegisterMigration;
            }
        });

        it('单个迁移器失败直接抛异常', async () => {
            const t1: IMigrationTarget = {
                sourceScope: 'project',
                pluginName: 'ok',
                migrate: async () => ({})
            };
            const t2: IMigrationTarget = {
                sourceScope: 'project',
                pluginName: 'bad',
                migrate: async () => ({})
            };
            CocosMigrationManager.register([t1, t2]);

            mockMigrate
                .mockResolvedValueOnce({ v: 1 })
                .mockRejectedValueOnce(new Error('单个迁移器失败直接抛异常'));
            await expect(CocosMigrationManager.migrate('/proj')).rejects.toThrow('[Migration] 迁移失败, 详情请查看日志');
        });
    });
});
