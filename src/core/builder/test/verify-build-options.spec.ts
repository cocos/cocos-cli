const checkBuildOptionsMock = jest.fn();
const getOptionsByPlatformMock = jest.fn(async () => ({}));

jest.mock('../manager/plugin', () => ({
    pluginManager: {
        checkBuildOptions: checkBuildOptionsMock,
        getOptionsByPlatform: getOptionsByPlatformMock,
    },
}));

// index.ts 顶层会 import 大量与本 spec 无关的模块（builder-config、middleware、newConsole...），
// 桩掉这些副作用重的依赖，只为拿到 verifyBuildOptions 这个纯函数。
jest.mock('../share/builder-config', () => ({ __esModule: true, default: { init: jest.fn() } }));
jest.mock('../../../server/middleware/core', () => ({ middlewareService: { register: jest.fn() } }));
jest.mock('../build.middleware', () => ({ __esModule: true, default: {} }));
jest.mock('../../base/console', () => ({
    newConsole: {
        createLogSinkRestorer: () => () => {},
        buildStart: jest.fn(),
        buildComplete: jest.fn(),
        progress: jest.fn(),
        error: jest.fn(),
    },
}));
jest.mock('../../base/i18n', () => ({ __esModule: true, default: { t: (k: string) => k, transI18nName: (k: string) => k } }));
jest.mock('../../assets/manager/asset', () => ({ __esModule: true, default: {} }));

import { BuildExitCode } from '../@types/protected';

describe('verifyBuildOptions', () => {
    let verifyBuildOptions: typeof import('../index').verifyBuildOptions;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;

    beforeAll(async () => {
        ({ verifyBuildOptions } = await import('../index'));
    });

    beforeEach(() => {
        checkBuildOptionsMock.mockReset();
        getOptionsByPlatformMock.mockReset();
        getOptionsByPlatformMock.mockResolvedValue({});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it('skipCheck 为 true 时跳过校验，不调用 pluginManager', async () => {
        const result = await verifyBuildOptions('windows', { skipCheck: true } as any);
        expect(result).toBeNull();
        expect(checkBuildOptionsMock).not.toHaveBeenCalled();
        expect(getOptionsByPlatformMock).not.toHaveBeenCalled();
    });

    it('所有字段合法时返回 null', async () => {
        checkBuildOptionsMock.mockResolvedValue({
            name: { valid: true },
            mode: { valid: true },
        });
        const result = await verifyBuildOptions('windows', {} as any);
        expect(result).toBeNull();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('只有 warn 级别问题时不阻塞构建，仅打印警告', async () => {
        checkBuildOptionsMock.mockResolvedValue({
            name: { valid: false, level: 'warn', message: 'name is empty' },
        });
        const result = await verifyBuildOptions('windows', {} as any);
        expect(result).toBeNull();
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('name is empty'));
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('存在 error 级别问题时返回 PARAM_ERROR 并汇总所有字段', async () => {
        checkBuildOptionsMock.mockResolvedValue({
            name: { valid: false, level: 'error', message: 'Required' },
            packageName: { valid: false, message: 'Invalid package name specified' },
            debug: { valid: true },
            outputName: { valid: false, level: 'warn', message: 'auto filled' },
        });

        const result = await verifyBuildOptions('android', { platform: 'android' } as any);

        expect(result).not.toBeNull();
        expect(result!.code).toBe(BuildExitCode.PARAM_ERROR);
        expect(result!.reason).toContain('name: Required');
        expect(result!.reason).toContain('packageName: Invalid package name specified');
        // warn 级别不能混进 error 列表
        expect(result!.reason).not.toContain('outputName');
        // warnings 走单独打印
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('outputName: auto filled'));
    });

    it('error 都硬阻塞，fixedValue 不再降级（区别于之前的语义）', async () => {
        checkBuildOptionsMock.mockResolvedValue({
            packageName: {
                valid: false,
                level: 'error',
                message: 'Required',
                // 即使 checkBuildOptions 返回了 fixedValue，也应该硬阻塞——
                // 用户没传的场景通过 defaultsDeep 兜底后不会进到这里
                fixedValue: 'com.cocos.game',
            },
        });

        const result = await verifyBuildOptions('android', { platform: 'android' } as any);

        expect(result).not.toBeNull();
        expect(result!.code).toBe(BuildExitCode.PARAM_ERROR);
        expect(result!.reason).toContain('packageName: Required');
    });

    it('用户漏传的字段会被平台 default 兜底通过（defaultsDeep 语义）', async () => {
        // 模拟：用户没传 android.packageName；getOptionsByPlatform 返回带有 default 的完整选项
        getOptionsByPlatformMock.mockResolvedValue({
            packages: { android: { packageName: 'com.cocos.game' } },
        });
        // checkBuildOptions 接到 merged 后应该看到 packageName='com.cocos.game'，规则通过
        checkBuildOptionsMock.mockImplementation(async (_p, opts: any) => {
            expect(opts.packages?.android?.packageName).toBe('com.cocos.game');
            return { packageName: { valid: true } };
        });

        const result = await verifyBuildOptions('android', { platform: 'android' } as any);
        expect(result).toBeNull();
        expect(getOptionsByPlatformMock).toHaveBeenCalledWith('android');
    });

    it('用户传的值优先于 default（defaultsDeep 不覆盖已存在值）', async () => {
        getOptionsByPlatformMock.mockResolvedValue({
            packages: { android: { packageName: 'com.cocos.game' } },
        });
        checkBuildOptionsMock.mockImplementation(async (_p, opts: any) => {
            expect(opts.packages?.android?.packageName).toBe('com.myapp');
            return { packageName: { valid: true } };
        });

        const userOptions = { platform: 'android', packages: { android: { packageName: 'com.myapp' } } };
        const result = await verifyBuildOptions('android', userOptions as any);
        expect(result).toBeNull();
    });

    it('message 缺失时兜底成 invalid', async () => {
        checkBuildOptionsMock.mockResolvedValue({
            weird: { valid: false, level: 'error' },
        });
        const result = await verifyBuildOptions('windows', {} as any);
        expect(result!.reason).toContain('weird: invalid');
    });

    it('checkBuildOptions 抛异常时降级为 warn，不阻塞构建', async () => {
        checkBuildOptionsMock.mockRejectedValue(new Error('plugin blew up'));
        const result = await verifyBuildOptions('windows', {} as any);
        expect(result).toBeNull();
        expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to run build option checks:', expect.any(Error));
    });

    it('options 为 undefined 时不崩溃', async () => {
        checkBuildOptionsMock.mockResolvedValue({});
        const result = await verifyBuildOptions('windows');
        expect(result).toBeNull();
    });
});
