const mockGetBuildStageWithHookTasks = jest.fn();
const mockGetHooksInfo = jest.fn();
const mockRequireFile = jest.fn();
const mockRestoreLogSink = jest.fn();

jest.mock('../manager/plugin', () => ({
    pluginManager: {
        getBuildStageWithHookTasks: mockGetBuildStageWithHookTasks,
        getHooksInfo: mockGetHooksInfo,
    },
}));

jest.mock('../share/builder-config', () => ({
    __esModule: true,
    default: {
        projectRoot: 'project-root',
        projectTempDir: 'project-root/temp',
    },
}));

jest.mock('../share/common-options-validator', () => ({
    fillIncludeModulesFromProjectConfig: jest.fn(),
}));

jest.mock('../../base/console', () => ({
    newConsole: {
        createLogSinkRestorer: jest.fn(() => mockRestoreLogSink),
        record: jest.fn(),
        trackMemoryStart: jest.fn(),
        trackMemoryEnd: jest.fn(),
        trackTimeStart: jest.fn(),
        trackTimeEnd: jest.fn(() => 1),
        pluginTask: jest.fn(),
        debug: jest.fn(),
        success: jest.fn(),
        error: jest.fn(),
    },
}));

jest.mock('../../base/utils', () => ({
    __esModule: true,
    default: {
        Path: {
            resolveToRaw: jest.fn((path: string) => path),
            resolveToUrl: jest.fn((path: string) => `project://${path}`),
        },
        Math: {
            clamp01: jest.fn((value: number) => Math.max(0, Math.min(1, value))),
        },
        File: {
            requireFile: mockRequireFile,
        },
    },
}));

jest.mock('../../assets/manager/asset', () => ({
    __esModule: true,
    default: {
        queryAsset: jest.fn(),
    },
}));

describe('executeBuildStageTask', () => {
    const stageConfig = {
        name: 'run',
        hook: 'run',
        displayName: 'Run',
        parallelism: 'all' as const,
    };
    const hooksInfo = {
        pkgNameOrder: ['web-desktop'],
        infos: {
            'web-desktop': {
                path: 'web-desktop/hooks',
                internal: true,
            },
        },
    };
    const hookModule = {
        throwError: true,
        run: jest.fn(),
    };
    let consoleLog: jest.SpyInstance;
    let consoleDebug: jest.SpyInstance;
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleDebug = jest.spyOn(console, 'debug').mockImplementation(() => {});
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockGetBuildStageWithHookTasks.mockReturnValue(stageConfig);
        mockGetHooksInfo.mockReturnValue(hooksInfo);
        mockRequireFile.mockReturnValue(hookModule);
        hookModule.run.mockResolvedValue(undefined);
    });

    afterEach(() => {
        consoleLog.mockRestore();
        consoleDebug.mockRestore();
        consoleError.mockRestore();
    });

    it('forwards build stage progress updates through callback', async () => {
        const { executeBuildStageTask } = await import('../index');
        const onProgress = jest.fn();

        const result = await executeBuildStageTask('task-id', 'run', {
            dest: 'build/web-desktop',
            platform: 'web-desktop',
        }, onProgress);

        expect(result).toEqual({
            code: 0,
            dest: 'project://build/web-desktop',
            custom: {},
        });
        expect(onProgress).toHaveBeenCalledWith('init options success', 0.1);
        expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('web-desktop:run completed'), expect.any(Number));
        expect(hookModule.run).toHaveBeenCalledWith('build/web-desktop', undefined);
    });

    it('returns the thrown hook error message as failed result reason', async () => {
        const { executeBuildStageTask } = await import('../index');
        hookModule.run.mockRejectedValueOnce(new Error('custom stage failed'));

        const result = await executeBuildStageTask('task-id', 'run', {
            dest: 'build/web-desktop',
            platform: 'web-desktop',
        }, jest.fn());

        expect(result).toEqual({
            code: 34,
            reason: 'custom stage failed',
        });
    });
});
