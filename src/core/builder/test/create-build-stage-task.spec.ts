import { join } from 'path';

const mockGetBuildStageWithHookTasks = jest.fn();
const mockGetHooksInfo = jest.fn();
const mockReadJSONSync = jest.fn();
const mockRecord = jest.fn();
const mockRequireFile = jest.fn();

jest.mock('fs-extra', () => ({
    readJSONSync: mockReadJSONSync,
}));

jest.mock('../manager/plugin', () => ({
    pluginManager: {
        getBuildStageWithHookTasks: mockGetBuildStageWithHookTasks,
        getHooksInfo: mockGetHooksInfo,
    },
}));

jest.mock('../share/common-options-validator', () => ({
    fillIncludeModulesFromProjectConfig: jest.fn(),
}));

jest.mock('../../base/console', () => ({
    newConsole: {
        record: mockRecord,
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
            resolveToRaw: jest.fn((path: string) => path.startsWith('raw:') ? path : `raw:${path}`),
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

describe('createBuildStageTask', () => {
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

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetBuildStageWithHookTasks.mockReturnValue(stageConfig);
        mockGetHooksInfo.mockReturnValue(hooksInfo);
        mockReadJSONSync.mockReturnValue(undefined);
        mockRequireFile.mockReturnValue({});
        jest.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('creates a web stage task without reading persisted build options', async () => {
        const { createBuildStageTask } = await import('../index');

        const task = await createBuildStageTask('task-id', 'run', {
            dest: 'build/web-desktop',
            platform: 'web-desktop',
        });

        expect(mockReadJSONSync).not.toHaveBeenCalled();
        expect(mockGetBuildStageWithHookTasks).toHaveBeenCalledWith('web-desktop', 'run');
        expect(mockGetHooksInfo).toHaveBeenCalledWith('web-desktop');
        expect(task.id).toBe('task-id');
        expect(task.name).toBe('run');
        expect(task.hooksInfo).toBe(hooksInfo);
        expect(task.options).toBeUndefined();
        expect(task.hookMap).toEqual({
            onBeforeRun: 'onBeforeRun',
            run: 'run',
            onAfterRun: 'onAfterRun',
        });
        expect(task.buildExitRes.dest).toBe('raw:build/web-desktop');
    });

    it('reads and merges persisted build options for non-web stage tasks', async () => {
        const { createBuildStageTask } = await import('../index');
        const buildOptions = {
            platform: 'openpaas',
            packages: {
                openpaas: {
                    versionName: '1.0.0',
                    accessToken: 'persisted-token',
                },
            },
        };
        const openpaasHooksInfo = {
            pkgNameOrder: ['openpaas'],
            infos: {
                openpaas: {
                    path: 'openpaas/hooks',
                    internal: false,
                },
            },
        };
        mockReadJSONSync.mockReturnValue(buildOptions);
        mockGetBuildStageWithHookTasks.mockReturnValue({
            name: 'upload',
            hook: 'upload',
            displayName: 'Upload',
            parallelism: 'all',
        });
        mockGetHooksInfo.mockReturnValue(openpaasHooksInfo);

        const task = await createBuildStageTask('task-id', 'upload', {
            dest: 'build/openpaas',
            platform: 'openpaas',
            packages: {
                openpaas: {
                    accessToken: 'runtime-token',
                },
            },
        });

        expect(mockReadJSONSync).toHaveBeenCalledWith(join('raw:build/openpaas', 'cocos.compile.config.json'));
        expect(task.name).toBe('upload');
        expect(task.hooksInfo).toBe(openpaasHooksInfo);
        expect(task.options.packages.openpaas).toEqual({
            versionName: '1.0.0',
            accessToken: 'runtime-token',
        });
        expect(task.hookMap).toEqual({
            onBeforeUpload: 'onBeforeUpload',
            upload: 'upload',
            onAfterUpload: 'onAfterUpload',
        });
        expect(task.buildExitRes.dest).toBe('raw:build/openpaas');
    });

    it('does not treat stage logDest as build hook options during task creation', async () => {
        const { createBuildStageTask } = await import('../index');
        const buildOptions = {
            platform: 'openpaas',
            logDest: 'temp/builder/log/build-log.log',
            packages: {
                openpaas: {
                    versionName: '1.0.0',
                },
            },
        };
        mockReadJSONSync.mockReturnValue(buildOptions);
        mockGetBuildStageWithHookTasks.mockReturnValue({
            name: 'upload',
            hook: 'upload',
            displayName: 'Upload',
            parallelism: 'all',
        });

        const task = await createBuildStageTask('task-id', 'upload', {
            dest: 'build/openpaas',
            platform: 'openpaas',
            logDest: 'custom-stage-log',
        });

        expect(mockRecord).not.toHaveBeenCalled();
        expect(task.options.logDest).toBe('temp/builder/log/build-log.log');
        expect((task.options as any).packages.openpaas.logDest).toBeUndefined();
    });

    it('runs the corresponding platform stage hooks', async () => {
        const { createBuildStageTask } = await import('../index');
        const calls: string[] = [];
        const bytedanceHooksPath = 'web-desktop/hooks';
        const bytedanceHooksInfo = {
            pkgNameOrder: ['bytedance-mini-game'],
            infos: {
                'bytedance-mini-game': {
                    path: bytedanceHooksPath,
                    internal: true,
                },
            },
        };
        const buildOptions = {
            platform: 'bytedance-mini-game',
            packages: {
                'bytedance-mini-game': {
                    appid: 'test-appid',
                },
            },
        };
        const hookModule = {
            throwError: true,
            run: jest.fn(async function(this: any, root: string, options: any) {
                calls.push('run');
                expect(this.id).toBe('task-id');
                expect(this.name).toBe('run');
                expect(this.buildExitRes.dest).toBe('raw:build/bytedance-mini-game');
                expect(root).toBe('raw:build/bytedance-mini-game');
                expect(options).toBe(buildOptions);
            }),
        };
        mockGetHooksInfo.mockReturnValue(bytedanceHooksInfo);
        mockReadJSONSync.mockReturnValue(buildOptions);
        mockRequireFile.mockReturnValue(hookModule);

        const task = await createBuildStageTask('task-id', 'run', {
            dest: 'build/bytedance-mini-game',
            platform: 'bytedance-mini-game',
        });
        const result = await task.run();

        expect(result).toBe(true);
        expect(mockReadJSONSync).toHaveBeenCalledWith(join('raw:build/bytedance-mini-game', 'cocos.compile.config.json'));
        expect(mockRequireFile).toHaveBeenCalledWith(bytedanceHooksPath);
        expect(calls).toEqual(['run']);
        expect(hookModule.run).toHaveBeenCalledTimes(1);
    });

    it('throws when the requested build stage is not registered', async () => {
        const { createBuildStageTask } = await import('../index');
        mockGetBuildStageWithHookTasks.mockReturnValue(undefined);

        await expect(createBuildStageTask('task-id', 'deploy', {
            dest: 'build/web-desktop',
            platform: 'web-desktop',
        })).rejects.toThrow('No Build stage deploy');
    });
});
