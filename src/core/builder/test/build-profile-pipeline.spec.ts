import { mkdirSync } from 'fs';
import { mkdtemp as mkdtempAsync, rm as rmAsync, readFile as readFileAsync, writeFile as writeFileAsync } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';

const mockEnsureDir = jest.fn();
const mockEmptyDirSync = jest.fn();
const mockOutputFileSync = jest.fn();
const mockOutputJSONSync = jest.fn();
// profile 报告通过 fs-extra.outputJSON 写盘：mock 为真实写文件，便于断言
const mockOutputJSON = jest.fn(async (dest: string, data: unknown) => {
    mkdirSync(dirname(dest), { recursive: true });
    await writeFileAsync(dest, JSON.stringify(data, null, 2), 'utf8');
});
const mockGetHooksInfo = jest.fn();
const mockGetBuildTemplateConfig = jest.fn();
const mockGetBuildStageWithHookTasks = jest.fn();
const mockGetBuildPath = jest.fn();
const mockStageTaskRuns: string[] = [];
const mockNewConsoleTrackTimeEnd = jest.fn();
const mockRestoreLogSink = jest.fn();

jest.mock('fs-extra', () => ({
    ensureDir: mockEnsureDir,
    emptyDirSync: mockEmptyDirSync,
    outputFileSync: mockOutputFileSync,
    outputJSONSync: mockOutputJSONSync,
    outputJSON: mockOutputJSON,
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
        debug: jest.fn(),
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        success: jest.fn(),
        error: jest.fn(),
        trackTimeStart: jest.fn(),
        trackTimeEnd: mockNewConsoleTrackTimeEnd,
        trackMemoryStart: jest.fn(),
        trackMemoryEnd: jest.fn(),
        pluginTask: jest.fn(),
        createLogSinkRestorer: jest.fn(() => mockRestoreLogSink),
        stopRecord: jest.fn(),
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
    InternalBuildResult: jest.fn().mockImplementation((task: any) => ({
        paths: {
            dir: `build/${task.options.platform}`,
            output: `build/${task.options.platform}`,
            compileConfig: `build/${task.options.platform}/cocos.compile.config.json`,
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
        copyTo: jest.fn(async () => { /* noop */ }),
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

        // 每类任务返回一个假任务，用于验证 runBuildTask 的任务级插桩
        static getBuildTask = jest.fn((type: string) => [{
            name: `fake-task/${type}`,
            title: `fake ${type}`,
            handle: async () => { /* noop */ },
        }]);

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
            }

            async run() {
                mockStageTaskRuns.push(this.name);
                this.emit('update', `${this.name} progress`, 0.3);
                return true;
            }
        },
    };
});

import { buildProfiler, enableBuildProfile, IBuildProfileReport } from '../profile';

describe('build pipeline profile instrumentation', () => {
    let tempRoot = '';

    beforeEach(async () => {
        jest.clearAllMocks();
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
        tempRoot = await mkdtempAsync(join(tmpdir(), 'cocos-cli-profile-pipeline-'));
        delete process.env.COCOS_BUILD_PROFILE;
        buildProfiler.disable();
    });

    afterEach(async () => {
        delete process.env.COCOS_BUILD_PROFILE;
        buildProfiler.disable();
        await rmAsync(tempRoot, { recursive: true, force: true });
    });

    it('records stage, task and stage-task entries during BuildTask.run and writes report', async () => {
        enableBuildProfile();
        const logDest = join(tempRoot, 'logs', 'test-platform-build-pipeline-1.log');
        buildProfiler.beginBuild({ taskId: 'pipeline-1', taskName: 'test-platform', platform: 'test-platform', logDest });

        const { BuildTask } = await import('../worker/builder');
        const options = {
            platform: 'test-platform',
            taskId: 'pipeline-1',
            taskName: 'test-platform',
            outputName: 'test-platform',
            nextStages: ['make'],
            packages: {},
            useCache: true,
            md5Cache: false,
        };
        const task = new BuildTask('pipeline-1', options as any);
        const taskAny = task as any;

        taskAny.runPluginTask = jest.fn();
        taskAny.lockAssetDB = jest.fn();
        taskAny.init = jest.fn(async () => { /* noop */ });
        taskAny.initBundleManager = jest.fn(async () => {
            taskAny.bundleManager = {
                hookMap: {
                    onBeforeBundleDataTask: 'onBeforeBundleDataTask',
                    onAfterBundleDataTask: 'onAfterBundleDataTask',
                    onBeforeBundleBuildTask: 'onBeforeBundleBuildTask',
                    onAfterBundleBuildTask: 'onAfterBundleBuildTask',
                },
                runPluginTask: jest.fn(),
            };
        });
        taskAny.postBuild = jest.fn(async () => { /* noop */ });

        await expect(task.run()).resolves.toBe(true);
        expect(mockStageTaskRuns).toEqual(['make']);

        const reportPath = await buildProfiler.endBuild({ success: true, code: 0, dest: 'build/test-platform' });
        expect(reportPath).toBe(join(tempRoot, 'logs', 'profile-pipeline-1.json'));

        const report: IBuildProfileReport = JSON.parse(await readFileAsync(reportPath!, 'utf8'));
        const names = report.entries.map((entry) => entry.name);

        // 阶段级作用域
        for (const stage of ['init', 'initBundleManager', 'dataTasks', 'buildTasks', 'settingTasks', 'postprocessTasks', 'copyBuildTemplate', 'postBuild', 'nextStages']) {
            expect(names).toContain(stage);
        }
        // 任务级（runBuildTask 内部）
        expect(names).toContain('fake-task/dataTasks');
        expect(names).toContain('fake-task/buildTasks');
        // stage 任务（handleBuildStageTask 内部）
        expect(names).toContain('stage:make');

        // 作用域层级正确：任务 entry 的 stage 是所属阶段
        const dataTaskEntry = report.entries.find((entry) => entry.name === 'fake-task/dataTasks')!;
        expect(dataTaskEntry.stage).toBe('dataTasks');
        const stageMakeEntry = report.entries.find((entry) => entry.name === 'stage:make')!;
        expect(stageMakeEntry.stage).toBe('nextStages');

        // 汇总正确
        expect(report.summary.byStage['dataTasks'].count).toBe(1);
        expect(report.meta.success).toBe(true);
    });

    it('records failing task with error when build task throws', async () => {
        enableBuildProfile();
        const logDest = join(tempRoot, 'logs', 'test-platform-build-pipeline-2.log');
        buildProfiler.beginBuild({ taskId: 'pipeline-2', platform: 'test-platform', logDest });

        const { BuildTask } = await import('../worker/builder');
        const options = {
            platform: 'test-platform',
            taskId: 'pipeline-2',
            taskName: 'test-platform',
            outputName: 'test-platform',
            packages: {},
            useCache: true,
            md5Cache: false,
        };
        const task = new BuildTask('pipeline-2', options as any);
        const taskAny = task as any;

        taskAny.runPluginTask = jest.fn();
        taskAny.lockAssetDB = jest.fn();
        taskAny.init = jest.fn(async () => { /* noop */ });
        taskAny.initBundleManager = jest.fn(async () => {
            taskAny.bundleManager = {
                hookMap: {
                    onBeforeBundleDataTask: 'onBeforeBundleDataTask',
                    onAfterBundleDataTask: 'onAfterBundleDataTask',
                    onBeforeBundleBuildTask: 'onBeforeBundleBuildTask',
                    onAfterBundleBuildTask: 'onAfterBundleBuildTask',
                },
                runPluginTask: jest.fn(),
            };
        });
        taskAny.postBuild = jest.fn(async () => { /* noop */ });
        // dataTasks 中注入一个抛错任务
        const { TaskManager } = await import('../worker/builder/task-config');
        (TaskManager.getBuildTask as jest.Mock).mockImplementation((type: string) => [{
            name: `fake-task/${type}`,
            title: `fake ${type}`,
            handle: async () => {
                if (type === 'dataTasks') {
                    throw new Error('data task exploded');
                }
            },
        }]);

        await expect(task.run()).rejects.toThrow('data task exploded');

        const reportPath = await buildProfiler.endBuild({ success: false, code: 1, reason: 'data task exploded' });
        const report: IBuildProfileReport = JSON.parse(await readFileAsync(reportPath!, 'utf8'));

        expect(report.meta.success).toBe(false);
        expect(report.meta.reason).toBe('data task exploded');

        // 失败任务级 entry 带错误信息
        const failedTaskEntry = report.entries.find((entry) => entry.name === 'fake-task/dataTasks')!;
        expect(failedTaskEntry.error).toBe('data task exploded');
        // 失败阶段级 entry 同样带错误信息
        const failedStageEntry = report.entries.find((entry) => entry.name === 'dataTasks')!;
        expect(failedStageEntry.error).toBe('data task exploded');
        // 后续阶段未执行
        const names = report.entries.map((entry) => entry.name);
        expect(names).not.toContain('buildTasks');
        expect(names).not.toContain('stage:make');
    });
});
