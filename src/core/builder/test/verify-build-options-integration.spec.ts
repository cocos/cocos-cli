import lodash from 'lodash';

// 与 verify-build-options.spec.ts 的分工：那份把 pluginManager 整个桩掉，只测 verifyBuildOptions 自己的分流；
// 这份不桩 pluginManager，用真实平台 config 跑通「合并平台默认值 → checkBuildOptions → 真实 verifyRuleMap」整条链。
const projectStore: Record<string, any> = { common: {} };

jest.mock('../share/builder-config', () => ({
    __esModule: true,
    default: {
        commonOptionConfigs: {},
        // 用内存 store 模拟项目 build profile：internalRegister 会把各平台 options 的 default 写进来，
        // getOptionsByPlatform 再读出来，与真实流程一致
        setProject: jest.fn(async (key: string, value: unknown) => {
            lodash.set(projectStore, key, value);
        }),
        getProject: jest.fn(async (key: string) => lodash.get(projectStore, key)),
        buildTemplateDir: '',
        init: jest.fn(),
    },
}));

jest.mock('../../base/i18n', () => ({
    __esModule: true,
    default: {
        t: (key: string) => key,
        transI18nName: (key: string) => key,
        setLanguage: jest.fn(),
        registerLanguagePatch: jest.fn(),
    },
}));
jest.mock('../../configuration', () => ({ configurationRegistry: { register: jest.fn() } }));
jest.mock('../../../global', () => ({
    GlobalPaths: {
        workspace: '/tmp/cocos-cli-test-ws',
        enginePath: '/tmp/cocos-cli-test-engine',
        project: '/tmp/cocos-cli-test-project',
    },
}));
jest.mock('../../../server/middleware/core', () => ({ middlewareService: { register: jest.fn() } }));
jest.mock('../build.middleware', () => ({ __esModule: true, default: {} }));
jest.mock('../../base/console', () => ({
    newConsole: {
        createLogSinkRestorer: () => () => {},
        buildStart: jest.fn(),
        buildComplete: jest.fn(),
        progress: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
}));
jest.mock('../../assets/manager/asset', () => ({ __esModule: true, default: {} }));

let mockEngineRenderPipeline: string | undefined;
jest.mock('../../engine', () => ({
    Engine: {
        getConfig: () => ({ renderPipeline: mockEngineRenderPipeline }),
    },
}));

import { BuildExitCode } from '../@types/protected';
import androidConfig from '../platforms/android/src/config';
import iosConfig from '../platforms/ios/src/config';

const DEFERRED_PIPELINE_UUID = '5d45ba66-829a-46d3-948e-2ed3fa7ee421';

describe('verifyBuildOptions 走真实 pluginManager + 平台 config', () => {
    let verifyBuildOptions: typeof import('../index').verifyBuildOptions;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;

    beforeAll(async () => {
        const { pluginManager } = await import('../manager/plugin');
        const pool = (pluginManager as any).platformRegisterInfoPool as Map<string, unknown>;
        for (const [platform, config] of [['android', androidConfig], ['ios', iosConfig]] as const) {
            pool.set(platform, { platform, path: `/plugins/${platform}`, type: 'register', config });
            await pluginManager.register(platform);
        }
        ({ verifyBuildOptions } = await import('../index'));
    });

    beforeEach(() => {
        mockEngineRenderPipeline = undefined;
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it('注册后平台默认值能兜住漏传字段：只传 platform 也能通过', async () => {
        await expect(verifyBuildOptions('android', {} as any)).resolves.toBeNull();
    });

    // ===== 问题 2：值非法 + 默认值合法，现在硬失败，不再回落默认值 =====

    it('apiLevel 非法时返回 PARAM_ERROR，不会静默抬到默认值 35', async () => {
        const userOptions = { packages: { android: { apiLevel: 10 } } };
        const result = await verifyBuildOptions('android', userOptions as any);

        expect(result).not.toBeNull();
        expect(result!.code).toBe(BuildExitCode.PARAM_ERROR);
        expect(result!.reason).toContain('apiLevel');
        expect(result!.reason).toContain('19');
        // 入口层只判定不修改：调用方传进来的对象保持原值，构建也不会拿 35 继续跑
        expect(userOptions.packages.android.apiLevel).toBe(10);
    });

    it('packageName 非法时返回 PARAM_ERROR（同类：默认值 com.cocos.game 合法也不回落）', async () => {
        const result = await verifyBuildOptions('android', {
            packages: { android: { packageName: '123abc' } },
        } as any);

        expect(result!.code).toBe(BuildExitCode.PARAM_ERROR);
        expect(result!.reason).toContain('packageName');
    });

    it('skipCheck 是逃生门：非法值也直接放过', async () => {
        await expect(verifyBuildOptions('android', {
            skipCheck: true,
            packages: { android: { apiLevel: 10 } },
        } as any)).resolves.toBeNull();
    });

    // ===== 问题 2 类型 B：值非法 + 默认值也非法 =====

    it('useDebugKeystore=false + keystore 留空 → PARAM_ERROR，逐条列出 4 个字段', async () => {
        const result = await verifyBuildOptions('android', {
            packages: { android: { useDebugKeystore: false } },
        } as any);

        expect(result!.code).toBe(BuildExitCode.PARAM_ERROR);
        for (const key of ['keystorePath', 'keystorePassword', 'keystoreAlias', 'keystoreAliasPassword']) {
            expect(result!.reason).toContain(key);
        }
        expect(result!.reason).toContain('Cannot be empty');
    });

    it('useDebugKeystore=false + keystore 填全 → 通过', async () => {
        const result = await verifyBuildOptions('android', {
            packages: {
                android: {
                    useDebugKeystore: false,
                    keystorePath: '/keystores/release.keystore',
                    keystorePassword: 'pwd',
                    keystoreAlias: 'alias',
                    keystoreAliasPassword: 'pwd',
                },
            },
        } as any);
        expect(result).toBeNull();
    });

    it('ios 不传 packageName 时因默认值为空而失败（唯一一类"默认值本身不合法"）', async () => {
        const result = await verifyBuildOptions('ios', {} as any);

        expect(result!.code).toBe(BuildExitCode.PARAM_ERROR);
        expect(result!.reason).toContain('packageName');
    });

    // ===== 联动规则在整条链上确实生效 =====

    it('androidInstant=true 时 apiLevel 22 被拦（联动 gate 读的是合并后的 options）', async () => {
        const result = await verifyBuildOptions('android', {
            packages: { android: { androidInstant: true, apiLevel: 22 } },
        } as any);

        expect(result!.code).toBe(BuildExitCode.PARAM_ERROR);
        expect(result!.reason).toContain('23');
    });

    // renderPipeline 是项目设置，构建阶段才由 checkProjectSetting 填进 options；
    // 入口层按编辑器的做法直接读工程配置，所以调用方显式传入和工程设置两条来源都要生效
    it('调用方显式传延迟渲染管线 uuid 时 apiLevel 20 被拦', async () => {
        const blocked = await verifyBuildOptions('android', {
            renderPipeline: DEFERRED_PIPELINE_UUID,
            packages: { android: { apiLevel: 20 } },
        } as any);
        expect(blocked!.code).toBe(BuildExitCode.PARAM_ERROR);
        expect(blocked!.reason).toContain('21');

        const passed = await verifyBuildOptions('android', {
            packages: { android: { apiLevel: 21 } },
        } as any);
        expect(passed).toBeNull();
    });

    it('工程配置开了延迟渲染管线时，调用方不传也能拦住 apiLevel 20', async () => {
        mockEngineRenderPipeline = DEFERRED_PIPELINE_UUID;
        const blocked = await verifyBuildOptions('android', {
            packages: { android: { apiLevel: 20 } },
        } as any);
        expect(blocked!.code).toBe(BuildExitCode.PARAM_ERROR);
        expect(blocked!.reason).toContain('21');
    });

    it('工程配置是其他渲染管线时 apiLevel 20 放行', async () => {
        mockEngineRenderPipeline = 'fd8ec536-a354-4a17-9c74-4f3883c378c8';
        await expect(verifyBuildOptions('android', {
            packages: { android: { apiLevel: 20 } },
        } as any)).resolves.toBeNull();
    });

    it('调用方显式传的 renderPipeline 优先于工程配置', async () => {
        mockEngineRenderPipeline = DEFERRED_PIPELINE_UUID;
        await expect(verifyBuildOptions('android', {
            renderPipeline: 'fd8ec536-a354-4a17-9c74-4f3883c378c8',
            packages: { android: { apiLevel: 20 } },
        } as any)).resolves.toBeNull();
    });
});
