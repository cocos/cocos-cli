import { join } from 'path';
import EventEmitter from 'events';

const mockRestoreLogSink = jest.fn();

jest.mock('fs-extra', () => ({}));

jest.mock('../manager/plugin', () => ({
    pluginManager: {},
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
        stage: jest.fn(),
        trackMemoryStart: jest.fn(),
        trackMemoryEnd: jest.fn(),
        taskComplete: jest.fn(),
        success: jest.fn(),
        error: jest.fn(),
        progress: jest.fn(),
    },
}));

jest.mock('../../base/utils', () => ({
    __esModule: true,
    default: {
        Path: {
            resolveToRaw: jest.fn((path: string) => path),
            resolveToUrl: jest.fn((path: string) => `project://${path}`),
        },
    },
}));

jest.mock('../../assets/manager/asset', () => ({
    __esModule: true,
    default: { queryAsset: jest.fn() },
}));

function createMockBuilder(error?: any) {
    const emitter = new EventEmitter();
    return Object.assign(emitter, {
        run: jest.fn(async () => !error),
        error,
        buildExitRes: { code: 0, dest: 'build/out', custom: {} },
    });
}

jest.mock('../worker/builder/asset-handler/bundle', () => ({
    BundleManager: {
        create: jest.fn(async () => createMockBuilder()),
    },
}));

describe('buildBundleOnly', () => {
    let consoleDebug: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        consoleDebug = jest.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleDebug.mockRestore();
    });

    it('uses bundleOptions.taskName for log filename instead of buildTaskOptions.taskName', async () => {
        const { buildBundleOnly } = await import('../index');
        const { newConsole } = await import('../../base/console');

        const buildTaskOptions = {
            platform: 'google-play',
            taskName: 'google-play',
        } as any;

        await buildBundleOnly({
            taskName: 'my-bundle',
            dest: 'build/google-play',
            buildTaskOptions,
        });

        const logDest = (newConsole.record as jest.Mock).mock.calls[0][0];
        expect(logDest).toMatch(/temp[\\/]builder[\\/]log[\\/]google-play-my-bundle-/);
        expect(logDest).toMatch(/\.log$/);
        expect(buildTaskOptions.taskName).toBe('google-play');
        expect(buildTaskOptions.logDest).toBe(logDest);
    });

    it('falls back to bundle-build when bundleOptions.taskName is empty', async () => {
        const { buildBundleOnly } = await import('../index');
        const { newConsole } = await import('../../base/console');

        const buildTaskOptions = {
            platform: 'google-play',
            taskName: 'google-play',
        } as any;

        await buildBundleOnly({
            taskName: '',
            dest: 'build/google-play',
            buildTaskOptions,
        });

        const logDest = (newConsole.record as jest.Mock).mock.calls[0][0];
        expect(logDest).toMatch(/temp[\\/]builder[\\/]log[\\/]google-play-bundle-build-/);
        expect(logDest).toMatch(/\.log$/);
        expect(buildTaskOptions.taskName).toBe('google-play');
        expect(buildTaskOptions.logDest).toBe(logDest);
    });
});
