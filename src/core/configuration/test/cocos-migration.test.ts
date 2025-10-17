import { CocosMigrationManager } from '../migration/cocos-migration-manager';
import { CocosMigration } from '../migration/cocos-migration';
import { IMigrationTarget } from '../migration/types';
import { newConsole } from '../../base/console';

jest.mock('../migration/cocos-migration', () => ({
    CocosMigration: {
        migrate: jest.fn()
    }
}));

describe('CocosMigrationManager', () => {
    const mockMigrate = CocosMigration.migrate as jest.MockedFunction<typeof CocosMigration.migrate>;

    beforeEach(() => {
        jest.clearAllMocks();
        // 清空已注册的迁移器（访问私有静态字段）
        (CocosMigrationManager as any).migrationTargets = new Map();

        // 静音日志输出
        jest.spyOn(newConsole, 'debug').mockImplementation(() => { });
        jest.spyOn(newConsole, 'log').mockImplementation(() => { });
        jest.spyOn(newConsole, 'warn').mockImplementation(() => { });
        jest.spyOn(newConsole, 'error').mockImplementation(() => { });
    });

    describe('register', () => {
        it('应支持注册单个迁移器，默认 targetScope 为 project', () => {
            const t1: IMigrationTarget = {
                sourceScope: 'project',
                pluginName: 'pkgA',
                migrate: async () => ({})
            };

            CocosMigrationManager.register(t1);

            const map = (CocosMigrationManager as any).migrationTargets as Map<string, IMigrationTarget[]>;
            expect(map.size).toBe(1);
            expect(map.get('project')?.length).toBe(1);
            expect(newConsole.debug).toHaveBeenCalledWith('[Migration] 已注册迁移插件: pkgA');
        });

        it('应支持批量注册并按各自 scope 分类', () => {
            const t1: IMigrationTarget = {
                sourceScope: 'project',
                pluginName: 'pkgA',
                migrate: async () => ({ a: 1 })
            };
            const t2: IMigrationTarget = {
                sourceScope: 'local',
                targetScope: 'global',
                pluginName: 'pkgB',
                migrate: async () => ({ b: 2 })
            };

            CocosMigrationManager.register([t1, t2]);

            const map = (CocosMigrationManager as any).migrationTargets as Map<string, IMigrationTarget[]>;
            expect(map.get('project')?.[0]).toBe(t1);
            expect(map.get('global')?.[0]).toBe(t2);
            expect(newConsole.debug).toHaveBeenCalledTimes(2);
        });
    });

    describe('migrate', () => {
        it('无注册迁移器时返回空对象并给出提示', async () => {
            const res = await CocosMigrationManager.migrate('/path');
            expect(res).toEqual({});
            expect(newConsole.warn).toHaveBeenCalledWith('[Migration] 没有注册任何迁移器');
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
                targetScope: 'global',
                pluginName: 'pkgC',
                migrate: async () => ({})
            };

            CocosMigrationManager.register([t1, t2, t3]);

            mockMigrate
                .mockResolvedValueOnce({ a: { x: 1 }, p: 1 })
                .mockResolvedValueOnce({ a: { y: 2 }, p: 2 })
                .mockResolvedValueOnce({ g: { k: 3 } });

            const res = await CocosMigrationManager.migrate('/proj');

            expect(mockMigrate).toHaveBeenCalledTimes(3);
            expect(res).toEqual({
                project: { a: { x: 1, y: 2 }, p: 2 },
                global: { g: { k: 3 } }
            });
            expect(newConsole.log).toHaveBeenCalledWith('[Migration] 开始执行迁移');
            expect(newConsole.log).toHaveBeenCalledWith('[Migration] 所有迁移执行完成');
            expect(newConsole.debug).toHaveBeenCalledWith('[Migration] 迁移完成: pkgA');
            expect(newConsole.debug).toHaveBeenCalledWith('[Migration] 迁移完成: pkgB');
            expect(newConsole.debug).toHaveBeenCalledWith('[Migration] 迁移完成: pkgC');
        });

        it('单个迁移器失败不影响整体，错误被记录', async () => {
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
                .mockRejectedValueOnce(new Error('boom'));

            const res = await CocosMigrationManager.migrate('/proj');
            expect(res).toEqual({ project: { v: 1 } });
            expect(newConsole.error).toHaveBeenCalled();
        });
    });
});


