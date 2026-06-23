const mockEnsureDir = jest.fn();
const mockEmptyDirSync = jest.fn();
const mockOutputFileSync = jest.fn();
const mockOutputJSONSync = jest.fn();
const mockGetHooksInfo = jest.fn();
const mockGetBuildTemplateConfig = jest.fn();
const mockGetBuildStageWithHookTasks = jest.fn();
const mockGetBuildPath = jest.fn();
const mockStageTaskConfigs: any[] = [];
const mockStageTaskRuns: string[] = [];
const mockNewConsoleDebug = jest.fn();
const mockNewConsoleTrackTimeEnd = jest.fn();

jest.mock('fs-extra', () => ({
    ensureDir: mockEnsureDir,
    emptyDirSync: mockEmptyDirSync,
    outputFileSync: mockOutputFileSync,
    outputJSONSync: mockOutputJSONSync,
}));

jest.mock('cc', () => ({
    ResolutionPolicy: {
        SHOW_ALL: 0,
        FIXED_HEIGHT: 1,
        FIXED_WIDTH: 2,
        NO_BORDER: 3,
    },
}));

jest.mock('../manager/plugin', () => ({
    pluginManager: {
        getHooksInfo: mockGetHooksInfo,
        getBuildTemplateConfig: mockGetBuildTemplateConfig,
        getBuildStageWithHookTasks: mockGetBuildStageWithHookTasks,
    },
}));

jest.mock('../share/utils', () => ({
    formatMSTime: jest.fn((time: number) => `${time}ms`),
    getBuildPath: mockGetBuildPath,
}));

jest.mock('../share/common-options-validator', () => ({
    checkProjectSetting: jest.fn(),
}));

jest.mock('../../base/console', () => ({
    newConsole: {
        debug: mockNewConsoleDebug,
        success: jest.fn(),
        error: jest.fn(),
        trackTimeStart: jest.fn(),
        trackTimeEnd: mockNewConsoleTrackTimeEnd,
        trackMemoryStart: jest.fn(),
        trackMemoryEnd: jest.fn(),
        pluginTask: jest.fn(),
    },
}));

jest.mock('../../base/utils', () => ({
    __esModule: true,
    default: {
        Math: {
            clamp01: jest.fn((value: number) => Math.max(0, Math.min(1, value))),
        },
        Path: {
            resolveToRaw: jest.fn((path: string) => path),
        },
        File: {
            requireFile: jest.fn(),
        },
    },
}));

jest.mock('../../base/i18n', () => ({
    __esModule: true,
    default: {
        t: jest.fn((key: string) => key),
    },
}));

jest.mock('../../assets', () => ({
    assetDBManager: {
        pause: jest.fn(),
        resume: jest.fn(),
    },
}));

jest.mock('../worker/worker-pools/sub-process-manager', () => ({
    workerManager: {
        killRunningChilds: jest.fn(),
        quickSpawn: jest.fn(),
    },
}));

jest.mock('../worker/builder/utils', () => ({
    isInstallNodeJs: jest.fn(),
    relativeUrl: jest.fn(),
    transformCode: jest.fn(),
}));

jest.mock('../worker/builder/manager/asset', () => ({
    BuilderAssetCache: jest.fn().mockImplementation(() => ({
        init: jest.fn(),
    })),
}));

jest.mock('../worker/builder/manager/build-result', () => ({
    InternalBuildResult: jest.fn().mockImplementation(() => ({
        paths: {
            dir: 'build/test-platform',
            output: 'build/test-platform',
        },
        settings: {
            assets: {
                bundleVers: {},
            },
            engine: {},
        },
        addListener: jest.fn(),
    })),
    BuildResult: jest.fn(),
}));

jest.mock('../worker/builder/manager/build-template', () => ({
    BuildTemplate: jest.fn().mockImplementation(() => ({
        copyTo: jest.fn(),
    })),
}));

jest.mock('../worker/builder/task-config', () => {
    class MockTaskManager {
        static pluginTasks = {
            onBeforeBuild: 'onBeforeBuild',
            onBeforeInit: 'onBeforeInit',
            onAfterInit: 'onAfterInit',
            onBeforeBuildAssets: 'onBeforeBuildAssets',
            onAfterBuildAssets: 'onAfterBuildAssets',
            onBeforeCompressSettings: 'onBeforeCompressSettings',
            onAfterCompressSettings: 'onAfterCompressSettings',
            onBeforeCopyBuildTemplate: 'onBeforeCopyBuildTemplate',
            onAfterCopyBuildTemplate: 'onAfterCopyBuildTemplate',
            onAfterBuild: 'onAfterBuild',
        };

        static getBuildTask = jest.fn(() => []);

        taskWeight = 0.6;
        activeTask = jest.fn();
        activeCustomTask = jest.fn(() => []);
    }

    return {
        TaskManager: MockTaskManager,
    };
});

jest.mock('../worker/builder/asset-handler/bundle', () => ({
    BundleManager: {
        create: jest.fn(),
    },
}));

jest.mock('../worker/builder/stage-task-manager', () => {
    const { EventEmitter } = require('events');

    return {
        BuildStageTask: class MockBuildStageTask extends EventEmitter {
            public id: string;
            public name: string;
            public error?: Error;
            public buildExitRes: any;
            public break = jest.fn();

            constructor(id: string, config: any) {
                super();
                this.id = id;
                this.name = config.name;
                this.buildExitRes = {
                    custom: {
                        [config.name]: {
                            completed: true,
                        },
                    },
                };
                mockStageTaskConfigs.push(config);
            }

            async run() {
                mockStageTaskRuns.push(this.name);
                this.buildExitRes.custom[this.name] = {
                    completed: true,
                };
                this.emit('update', `${this.name} progress`, 0.3);
                return true;
            }
        },
    };
});

describe('BuildTask nextStages', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStageTaskConfigs.length = 0;
        mockStageTaskRuns.length = 0;
        mockNewConsoleTrackTimeEnd.mockResolvedValue(1);
        mockGetHooksInfo.mockReturnValue({
            pkgNameOrder: [],
            infos: {},
        });
        mockGetBuildTemplateConfig.mockReturnValue(undefined);
        mockGetBuildPath.mockReturnValue('build/test-platform');
        mockGetBuildStageWithHookTasks.mockImplementation((_platform: string, taskName: string) => ({
            name: taskName,
            hook: taskName,
            displayName: taskName,
            parallelism: 'all',
        }));
    });

    it('runs configured nextStages after the main build and merges their custom results', async () => {
        const { BuildTask } = await import('../worker/builder');
        const options = {
            platform: 'test-platform',
            taskName: 'test-task',
            outputName: 'test-platform',
            nextStages: ['make', 'run'],
            packages: {},
            useCache: true,
            md5Cache: false,
        };
        const task = new BuildTask('task-id', options as any);
        const updates: Array<{ message: string; progress: number }> = [];
        const bundleRunPluginTask = jest.fn();
        const taskAny = task as any;

        task.on('update', (message: string, progress: number) => {
            updates.push({ message, progress });
        });
        taskAny.runPluginTask = jest.fn();
        taskAny.lockAssetDB = jest.fn();
        taskAny.init = jest.fn();
        taskAny.initBundleManager = jest.fn(async () => {
            taskAny.bundleManager = {
                hookMap: {
                    onBeforeBundleDataTask: 'onBeforeBundleDataTask',
                    onAfterBundleDataTask: 'onAfterBundleDataTask',
                    onBeforeBundleBuildTask: 'onBeforeBundleBuildTask',
                    onAfterBundleBuildTask: 'onAfterBundleBuildTask',
                },
                runPluginTask: bundleRunPluginTask,
            };
        });
        taskAny.runBuildTask = jest.fn();
        taskAny.postBuild = jest.fn(() => {
            task.buildExitRes.custom.build = {
                completed: true,
            };
        });

        await expect(task.run()).resolves.toBe(true);

        expect(taskAny.mainTaskWeight).toBeCloseTo(1 / 3);
        expect(task.hookWeight).toBeCloseTo(0.2);
        expect(mockGetBuildStageWithHookTasks).toHaveBeenNthCalledWith(1, 'test-platform', 'make');
        expect(mockGetBuildStageWithHookTasks).toHaveBeenNthCalledWith(2, 'test-platform', 'run');
        expect(mockStageTaskRuns).toEqual(['make', 'run']);
        expect(mockStageTaskConfigs.map((config) => ({
            name: config.name,
            root: config.root,
            buildTaskOptions: config.buildTaskOptions,
            progressHeartbeat: config.progressHeartbeat,
        }))).toEqual([{
            name: 'make',
            root: 'build/test-platform',
            buildTaskOptions: task.options,
            progressHeartbeat: false,
        }, {
            name: 'run',
            root: 'build/test-platform',
            buildTaskOptions: task.options,
            progressHeartbeat: false,
        }]);
        expect(task.buildExitRes.custom).toEqual({
            build: {
                completed: true,
            },
            make: {
                completed: true,
            },
            run: {
                completed: true,
            },
        });
        expect(updates).toEqual([
            { message: 'make progress', progress: 0.2 },
            { message: 'run progress', progress: 0.4 },
        ]);
    });
});
