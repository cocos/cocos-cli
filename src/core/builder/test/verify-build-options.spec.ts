const checkBuildOptionsMock = jest.fn();

jest.mock('../manager/plugin', () => ({
    pluginManager: {
        checkBuildOptions: checkBuildOptionsMock,
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

    it('error 但带 fixedValue 时降级为 warn（平台 default 可兜底，不阻塞构建）', async () => {
        checkBuildOptionsMock.mockResolvedValue({
            // 模拟 android: 用户没传 packageName，规则失败但平台 default='com.cocos.game' 作为 fixedValue
            packageName: {
                valid: false,
                level: 'error',
                message: 'Required',
                fixedValue: 'com.cocos.game',
            },
        });

        const result = await verifyBuildOptions('android', { platform: 'android' } as any);

        expect(result).toBeNull();
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('packageName: Required'));
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('error 且没有 fixedValue 时才真正阻塞构建', async () => {
        checkBuildOptionsMock.mockResolvedValue({
            packageName: {
                valid: false,
                level: 'error',
                message: 'Invalid package name specified',
                // 没有 fixedValue —— 用户传的值非法且平台无 default
            },
        });

        const result = await verifyBuildOptions('android', {} as any);

        expect(result).not.toBeNull();
        expect(result!.code).toBe(BuildExitCode.PARAM_ERROR);
        expect(result!.reason).toContain('packageName: Invalid package name specified');
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
        // 应该传空对象进去，而不是 undefined
        expect(checkBuildOptionsMock).toHaveBeenCalledWith('windows', {});
    });
});
