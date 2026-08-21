import { join } from 'path';

const mockGetBuildStageWithHookTasks = jest.fn();
const mockGetHooksInfo = jest.fn();
const mockRequireFile = jest.fn();
const mockRestoreLogSink = jest.fn();
const mockStopRecord = jest.fn();
const mockReadJSONSync = jest.fn();

jest.mock('fs-extra', () => ({
    readJSONSync: mockReadJSONSync,
}));

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
        stopRecord: mockStopRecord,
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
        mockStopRecord.mockClear();
        consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleDebug = jest.spyOn(console, 'debug').mockImplementation(() => {});
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockGetBuildStageWithHookTasks.mockReturnValue(stageConfig);
        mockGetHooksInfo.mockReturnValue(hooksInfo);
        mockRequireFile.mockReturnValue(hookModule);
        mockReadJSONSync.mockReturnValue({
            platform: 'web-desktop',
            packages: {
                'web-desktop': {},
            },
        });
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
        expect(hookModule.run).toHaveBeenCalledWith('build/web-desktop', expect.objectContaining({
            platform: 'web-desktop',
            dest: 'build/web-desktop',
            packages: {
                'web-desktop': {},
            },
        }));
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

    it('restores log sinks when a stage hook fails', async () => {
        const { executeBuildStageTask } = await import('../index');
        hookModule.run.mockRejectedValueOnce(new Error('custom stage failed'));

        await executeBuildStageTask('task-id', 'run', {
            dest: 'build/web-desktop',
            platform: 'web-desktop',
        }, jest.fn());

        expect(mockStopRecord).not.toHaveBeenCalled();
        expect(mockRestoreLogSink).toHaveBeenCalled();
    });

    it('executes arbitrary upload stage hooks in order and returns custom upload result', async () => {
        const { executeBuildStageTask } = await import('../index');
        const calls: string[] = [];
        const uploadHookModule = {
            throwError: true,
            onBeforeUpload: jest.fn(async () => calls.push('onBeforeUpload')),
            upload: jest.fn(async function(this: any) {
                calls.push('upload');
                this.buildExitRes.custom.upload = { success: true, packageId: 'pkg-1' };
            }),
            onAfterUpload: jest.fn(async () => calls.push('onAfterUpload')),
        };
        mockGetBuildStageWithHookTasks.mockReturnValue({
            name: 'upload',
            hook: 'upload',
            displayName: 'Upload',
            parallelism: 'all',
        });
        mockRequireFile.mockReturnValue(uploadHookModule);

        const result = await executeBuildStageTask('task-id', 'upload', {
            dest: 'build/web-desktop',
            platform: 'web-desktop',
        });

        expect(calls).toEqual(['onBeforeUpload', 'upload', 'onAfterUpload']);
        expect(result).toEqual({
            code: 0,
            dest: 'project://build/web-desktop',
            custom: {
                upload: {
                    success: true,
                    packageId: 'pkg-1',
                },
            },
        });
    });

    it('merges runtime package options into compile options for non-web stages', async () => {
        const { executeBuildStageTask } = await import('../index');
        let receivedOptions: any;
        const uploadHookModule = {
            throwError: true,
            upload: jest.fn(async (_root: string, options: any) => {
                receivedOptions = options;
            }),
        };
        mockReadJSONSync.mockReturnValue({
            platform: 'persisted-openpaas',
            dest: 'persisted-dest',
            logDest: 'persisted-log',
            packages: {
                openpaas: {
                    versionName: '1.0.0',
                },
            },
        });
        mockGetHooksInfo.mockReturnValue({
            pkgNameOrder: ['openpaas'],
            infos: {
                openpaas: {
                    path: 'openpaas/hooks',
                    internal: true,
                },
            },
        });
        mockGetBuildStageWithHookTasks.mockReturnValue({
            name: 'upload',
            hook: 'upload',
            displayName: 'Upload',
            parallelism: 'all',
        });
        mockRequireFile.mockReturnValue(uploadHookModule);

        await executeBuildStageTask('task-id', 'upload', {
            dest: 'build/openpaas',
            platform: 'openpaas',
            logDest: 'runtime-log',
            packages: {
                openpaas: {
                    accessToken: 'token-1',
                },
            },
        });

        expect(receivedOptions.packages.openpaas).toEqual({
            versionName: '1.0.0',
            accessToken: 'token-1',
        });
        expect(receivedOptions.platform).toBe('openpaas');
        expect(receivedOptions.dest).toBe('build/openpaas');
        expect(receivedOptions.logDest).toBe(join('project-root', 'runtime-log.log'));
    });

    it('overrides compile options with injected package objects for non-web stages', async () => {
        const { executeBuildStageTask } = await import('../index');
        let receivedOptions: any;
        const runHookModule = {
            throwError: true,
            run: jest.fn(async (_root: string, options: any) => {
                receivedOptions = options;
            }),
        };
        mockReadJSONSync.mockReturnValue({
            platform: 'wechatgame',
            packages: {
                wechatgame: {
                    wechatToolsPath: 'old-tools-path',
                    appid: 'persisted-appid',
                    nestedConfig: {
                        mode: 'persisted',
                        keepMe: true,
                    },
                },
            },
        });
        mockGetHooksInfo.mockReturnValue({
            pkgNameOrder: ['wechatgame'],
            infos: {
                wechatgame: {
                    path: 'wechatgame/hooks',
                    internal: true,
                },
            },
        });
        mockGetBuildStageWithHookTasks.mockReturnValue({
            name: 'run',
            hook: 'run',
            displayName: 'Run',
            parallelism: 'all',
        });
        mockRequireFile.mockReturnValue(runHookModule);

        await executeBuildStageTask('task-id', 'run', {
            dest: 'build/wechatgame',
            platform: 'wechatgame',
            packages: {
                wechatgame: {
                    wechatToolsPath: 'c:\\Program Files (x86)\\Tencent\\微信web开发者工具\\微信开发者工具.exe',
                    nestedConfig: {
                        mode: 'runtime',
                    },
                },
            },
        });

        expect(receivedOptions.packages.wechatgame).toEqual({
            wechatToolsPath: 'c:\\Program Files (x86)\\Tencent\\微信web开发者工具\\微信开发者工具.exe',
            appid: 'persisted-appid',
            nestedConfig: {
                mode: 'runtime',
            },
        });
    });

    it('uses current stage log destination for non-web stages by default', async () => {
        const { executeBuildStageTask } = await import('../index');
        const { newConsole } = await import('../../base/console');
        let receivedOptions: any;
        const uploadHookModule = {
            throwError: true,
            upload: jest.fn(async (_root: string, options: any) => {
                receivedOptions = options;
            }),
        };
        mockReadJSONSync.mockReturnValue({
            platform: 'openpaas',
            logDest: 'temp/builder/log/build-log.log',
            packages: {
                openpaas: {},
            },
        });
        mockGetHooksInfo.mockReturnValue({
            pkgNameOrder: ['openpaas'],
            infos: {
                openpaas: {
                    path: 'openpaas/hooks',
                    internal: true,
                },
            },
        });
        mockGetBuildStageWithHookTasks.mockReturnValue({
            name: 'upload',
            hook: 'upload',
            displayName: 'Upload',
            parallelism: 'all',
        });
        mockRequireFile.mockReturnValue(uploadHookModule);

        await executeBuildStageTask('task-id', 'upload', {
            dest: 'build/openpaas',
            platform: 'openpaas',
        });

        expect(newConsole.record).toHaveBeenCalledTimes(1);
        const logDest = (newConsole.record as jest.Mock).mock.calls[0][0];
        expect(logDest).toMatch(/temp[\\/]builder[\\/]log[\\/]openpaas-upload-/);
        expect(logDest).toMatch(/\.log$/);
        expect(receivedOptions.logDest).toBe(logDest);
    });

    it('uses current stage log destination for web stages', async () => {
        const { executeBuildStageTask } = await import('../index');
        const { newConsole } = await import('../../base/console');

        await executeBuildStageTask('task-id', 'run', {
            dest: 'build/web-desktop',
            platform: 'web-desktop',
        });

        expect(newConsole.record).toHaveBeenCalledTimes(1);
        const logDest = (newConsole.record as jest.Mock).mock.calls[0][0];
        expect(logDest).toMatch(/temp[\\/]builder[\\/]log[\\/]web-desktop-run-/);
        expect(logDest).toMatch(/\.log$/);
        expect(hookModule.run).toHaveBeenCalledWith('build/web-desktop', expect.objectContaining({
            platform: 'web-desktop',
            logDest,
        }));
    });

    it('cascades parent stage execution to built sub platforms with their own compile options', async () => {
        const { executeBuildStageTask } = await import('../index');
        const calls: Array<{ root: string; platform: string; token?: string }> = [];
        const uploadHookModule = {
            throwError: true,
            upload: jest.fn(async (root: string, options: any) => {
                calls.push({
                    root,
                    platform: options.platform,
                    token: options.packages?.[options.platform]?.bridgeBuildToken,
                });
            }),
        };
        const persistedOptions: Record<string, any> = {
            'build/openpaas/cocos.compile.config.json': {
                platform: 'openpaas',
                packages: {
                    openpaas: {},
                },
                subTaskPlatforms: ['web-desktop', 'web-mobile'],
                childTaskIds: ['parent:web-desktop', 'parent:web-mobile'],
                subTaskBuildOutputs: {
                    'web-desktop': {
                        platform: 'web-desktop',
                        dest: 'build/openpaas/web-desktop',
                        buildPath: 'build/openpaas',
                        outputName: 'web-desktop',
                        taskId: 'parent:web-desktop',
                        parentTaskId: 'parent',
                    },
                    'web-mobile': {
                        platform: 'web-mobile',
                        dest: 'build/openpaas/web-mobile',
                        buildPath: 'build/openpaas',
                        outputName: 'web-mobile',
                        taskId: 'parent:web-mobile',
                        parentTaskId: 'parent',
                    },
                },
            },
            'build/openpaas/web-desktop/cocos.compile.config.json': {
                platform: 'web-desktop',
                parentTaskId: 'parent',
                packages: {
                    'web-desktop': {
                        bridgeBuildToken: 'desktop-token',
                    },
                },
            },
            'build/openpaas/web-mobile/cocos.compile.config.json': {
                platform: 'web-mobile',
                parentTaskId: 'parent',
                packages: {
                    'web-mobile': {
                        bridgeBuildToken: 'mobile-token',
                    },
                },
            },
        };
        mockReadJSONSync.mockImplementation((file: string) => persistedOptions[file.replace(/\\/g, '/')]);
        mockGetBuildStageWithHookTasks.mockImplementation((platform: string, taskName: string) => {
            if (taskName === 'upload') {
                return {
                    name: 'upload',
                    hook: 'upload',
                    displayName: `Upload ${platform}`,
                    parallelism: 'all',
                };
            }
            return null;
        });
        mockGetHooksInfo.mockImplementation((platform: string) => ({
            pkgNameOrder: [platform],
            infos: {
                [platform]: {
                    path: `${platform}/hooks`,
                    internal: true,
                },
            },
        }));
        mockRequireFile.mockReturnValue(uploadHookModule);

        const result = await executeBuildStageTask('parent', 'upload', {
            dest: 'build/openpaas',
            platform: 'openpaas',
        });

        expect(result.code).toBe(0);
        expect(calls).toEqual([{
            root: 'build/openpaas',
            platform: 'openpaas',
        }, {
            root: 'build/openpaas/web-desktop',
            platform: 'web-desktop',
            token: 'desktop-token',
        }, {
            root: 'build/openpaas/web-mobile',
            platform: 'web-mobile',
            token: 'mobile-token',
        }]);
        expect((result as any).custom.stageResults.upload).toEqual({
            openpaas: {},
            'web-desktop': {},
            'web-mobile': {},
        });
    });

    it('cascades stage execution and skips sub platforms that do not support the stage at run time', async () => {
        const { executeBuildStageTask } = await import('../index');
        const calls: Array<{ root: string; platform: string }> = [];
        const makeHookModule = {
            throwError: true,
            make: jest.fn(async (root: string, options: any) => {
                calls.push({
                    root,
                    platform: options.platform,
                });
            }),
        };
        const persistedOptions: Record<string, any> = {
            'build/openpaas/cocos.compile.config.json': {
                platform: 'openpaas',
                packages: {
                    openpaas: {},
                },
                subTaskPlatforms: ['web-desktop', 'web-mobile'],
                subTaskBuildOutputs: {
                    'web-desktop': {
                        platform: 'web-desktop',
                        dest: 'build/openpaas/web-desktop',
                    },
                    'web-mobile': {
                        platform: 'web-mobile',
                        dest: 'build/openpaas/web-mobile',
                    },
                },
            },
            'build/openpaas/web-desktop/cocos.compile.config.json': {
                platform: 'web-desktop',
                parentTaskId: 'parent',
                packages: {
                    'web-desktop': {},
                },
            },
            'build/openpaas/web-mobile/cocos.compile.config.json': {
                platform: 'web-mobile',
                parentTaskId: 'parent',
                packages: {
                    'web-mobile': {},
                },
            },
        };
        mockReadJSONSync.mockImplementation((file: string) => persistedOptions[file.replace(/\\/g, '/')]);
        mockGetBuildStageWithHookTasks.mockImplementation((platform: string, taskName: string) => {
            if (platform === 'openpaas' && taskName === 'make') {
                return {
                    name: 'make',
                    hook: 'make',
                    displayName: 'Make',
                    parallelism: 'all',
                };
            }
            return null;
        });
        mockGetHooksInfo.mockImplementation((platform: string) => ({
            pkgNameOrder: [platform],
            infos: {
                [platform]: {
                    path: `${platform}/hooks`,
                    internal: true,
                },
            },
        }));
        mockRequireFile.mockReturnValue(makeHookModule);

        const result = await executeBuildStageTask('parent', 'make', {
            dest: 'build/openpaas',
            platform: 'openpaas',
        });

        expect(result.code).toBe(0);
        expect(calls).toEqual([{
            root: 'build/openpaas',
            platform: 'openpaas',
        }]);
        expect(mockRequireFile).toHaveBeenCalledWith('openpaas/hooks');
        expect(mockRequireFile).not.toHaveBeenCalledWith('web-desktop/hooks');
        expect(mockRequireFile).not.toHaveBeenCalledWith('web-mobile/hooks');
        expect((result as any).custom.stageResults.make).toEqual({
            openpaas: {},
            'web-desktop': {
                skipped: true,
            },
            'web-mobile': {
                skipped: true,
            },
        });
    });

    it('logs cascade stage failures before returning failed results', async () => {
        const { executeBuildStageTask } = await import('../index');
        mockReadJSONSync.mockReturnValue({
            platform: 'openpaas',
            packages: {
                openpaas: {},
            },
            subTaskPlatforms: ['web-desktop'],
            subTaskBuildOutputs: {},
        });
        mockGetBuildStageWithHookTasks.mockReturnValue({
            name: 'make',
            hook: 'make',
            displayName: 'Make',
            parallelism: 'all',
        });

        const result = await executeBuildStageTask('parent', 'make', {
            dest: 'build/openpaas',
            platform: 'openpaas',
        });

        expect(result).toEqual({
            code: 34,
            reason: 'Missing build output for stage platform web-desktop',
        });
        expect(consoleError).toHaveBeenCalledWith('Missing build output for stage platform web-desktop');
    });

    it('lets explicit stage log destination override persisted build log destination', async () => {
        const { executeBuildStageTask } = await import('../index');
        const { newConsole } = await import('../../base/console');
        const uploadHookModule = {
            throwError: true,
            upload: jest.fn(),
        };
        mockReadJSONSync.mockReturnValue({
            platform: 'openpaas',
            logDest: 'temp/builder/log/build-log.log',
            packages: {
                openpaas: {},
            },
        });
        mockGetHooksInfo.mockReturnValue({
            pkgNameOrder: ['openpaas'],
            infos: {
                openpaas: {
                    path: 'openpaas/hooks',
                    internal: true,
                },
            },
        });
        mockGetBuildStageWithHookTasks.mockReturnValue({
            name: 'upload',
            hook: 'upload',
            displayName: 'Upload',
            parallelism: 'all',
        });
        mockRequireFile.mockReturnValue(uploadHookModule);

        await executeBuildStageTask('task-id', 'upload', {
            dest: 'build/openpaas',
            platform: 'openpaas',
            logDest: 'custom-log',
        });

        expect(newConsole.record).toHaveBeenCalledWith(join('project-root', 'custom-log.log'));
    });

    it('opens a stage log sink before reading persisted build options', async () => {
        const { executeBuildStageTask } = await import('../index');
        const { newConsole } = await import('../../base/console');
        mockReadJSONSync.mockImplementationOnce(() => {
            throw new Error('missing build options');
        });

        const result = await executeBuildStageTask('task-id', 'upload', {
            dest: 'build/openpaas',
            platform: 'openpaas',
        });

        const firstLogDest = (newConsole.record as jest.Mock).mock.calls[0][0];
        expect(firstLogDest).toContain('openpaas-upload-');
        expect(firstLogDest).toMatch(/\.log$/);
        expect(result).toEqual({
            code: 34,
            reason: 'missing build options',
        });
    });

    it('uses build as action label when taskName equals platform', async () => {
        const { executeBuildStageTask } = await import('../index');
        const { newConsole } = await import('../../base/console');

        await executeBuildStageTask('task-id', 'run', {
            dest: 'build/web-desktop',
            platform: 'web-desktop',
            taskName: 'web-desktop',
        });

        const logDest = (newConsole.record as jest.Mock).mock.calls[0][0];
        expect(logDest).toMatch(/temp[\\/]builder[\\/]log[\\/]web-desktop-build-/);
        expect(logDest).toMatch(/\.log$/);
    });

    it('includes platform prefix in log filename for mini-game platforms', async () => {
        const { executeBuildStageTask } = await import('../index');
        const { newConsole } = await import('../../base/console');
        mockGetHooksInfo.mockReturnValue({
            pkgNameOrder: ['wechatgame'],
            infos: { wechatgame: { path: 'wechatgame/hooks', internal: true } },
        });

        await executeBuildStageTask('task-id', 'run', {
            dest: 'build/wechatgame',
            platform: 'wechatgame',
        });

        const logDest = (newConsole.record as jest.Mock).mock.calls[0][0];
        expect(logDest).toMatch(/temp[\\/]builder[\\/]log[\\/]wechatgame-run-/);
        expect(logDest).toMatch(/\.log$/);
    });
});
