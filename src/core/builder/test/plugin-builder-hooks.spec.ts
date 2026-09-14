import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { PluginManager } from '../manager/plugin';
import { BuildTaskBase } from '../worker/builder/manager/task-base';

jest.mock('../../base/i18n', () => ({
    __esModule: true,
    default: {
        transI18nName(name: string) { return name; },
        t(key: string) { return key; },
        registerLanguagePatch() {},
    },
}));

jest.mock('../../base/console', () => ({
    newConsole: {
        debug: jest.fn(),
        error: jest.fn(),
        success: jest.fn(),
        pluginTask: jest.fn(),
        trackTimeStart: jest.fn(),
        trackTimeEnd: jest.fn(() => 0),
    },
}));

jest.mock('../share/common-options-validator', () => ({
    checkBuildCommonOptionsByKey: jest.fn(),
    checkBundleCompressionSetting: jest.fn(),
}));

jest.mock('../share/builder-config', () => ({
    __esModule: true,
    default: {
        commonOptionConfigs: {},
        setProject: jest.fn(),
    },
}));

jest.mock('../share/texture-compress', () => ({
    configGroups: {},
    textureFormatConfigs: {},
    formatsInfo: {},
    defaultSupport: {},
}));

jest.mock('../../configuration', () => ({
    configurationRegistry: { register: jest.fn() },
}));

jest.mock('../../../global', () => ({
    GlobalPaths: { workspace: '/tmp/test-workspace', enginePath: '/tmp/test-engine' },
}));

let builtinRoot = '';
jest.mock('../../extension-roots', () => ({
    resolveBuiltinExtensionsRoot: jest.fn(() => (globalThis as { __cocosCliBuilderBuiltinRoot?: string }).__cocosCliBuilderBuiltinRoot),
}));

type HookInfo = {
    path: string;
    internal: boolean;
};

class TestBuildTask extends BuildTaskBase {
    public hooksInfo: { pkgNameOrder: string[]; infos: Record<string, HookInfo> } = { pkgNameOrder: [], infos: {} };
    public options: any = { preview: false };
    public hookMap: Record<string, string> = {
        onAfterInit: 'onAfterInit',
        onBeforeBuildAssets: 'onBeforeBuildAssets',
    };
    async handleHook(func: () => unknown) {
        await func();
    }

    async run() {
        return true;
    }
}

function createExtension(extensionDirectory: string, manifest: Record<string, unknown>, entry = 'builder.js', contents = 'module.exports = {};') {
    const extensionDir = join(builtinRoot, extensionDirectory);
    mkdirSync(extensionDir, { recursive: true });
    writeFileSync(join(extensionDir, 'package.json'), JSON.stringify(manifest));
    if (entry) {
        const entryPath = join(extensionDir, entry);
        mkdirSync(resolve(entryPath, '..'), { recursive: true });
        writeFileSync(entryPath, contents);
    }
    return extensionDir;
}

function createManager() {
    const manager = new PluginManager();
    (manager as any).platformConfig = {
        openpaas: {},
        'web-mobile': {},
    };
    (manager as any).platformRegisterInfoPool = new Map([
        ['openpaas', {}],
        ['web-mobile', {}],
    ]);
    return manager;
}

function setExtensionHooks(manager: PluginManager, hooks: Array<{ extensionName: string; path: string; root?: string }>) {
    (manager as any).extensionBuilderHooks = hooks;
}

function getHookInfo(manager: PluginManager, platform: string): { pkgNameOrder: string[]; infos: Record<string, HookInfo> } {
    return manager.getHooksInfo(platform) as { pkgNameOrder: string[]; infos: Record<string, HookInfo> };
}

describe('PluginManager builtin extension Builder hooks', () => {
    let tempRoot = '';

    beforeEach(() => {
        tempRoot = mkdtempSync(join(tmpdir(), 'cocos-cli-builder-hooks-'));
        builtinRoot = join(tempRoot, 'builtin-extensions');
        mkdirSync(builtinRoot, { recursive: true });
        (globalThis as { __cocosCliBuilderBuiltinRoot?: string }).__cocosCliBuilderBuiltinRoot = builtinRoot;
    });

    afterEach(() => {
        rmSync(tempRoot, { recursive: true, force: true });
        builtinRoot = '';
        delete (globalThis as { __cocosCliBuilderBuiltinRoot?: string }).__cocosCliBuilderBuiltinRoot;
    });

    it('uses the builtin resolver in init and mounts only after register(platform)', async () => {
        const missingRootManager = new PluginManager();
        delete (globalThis as { __cocosCliBuilderBuiltinRoot?: string }).__cocosCliBuilderBuiltinRoot;
        await missingRootManager.init();
        expect((missingRootManager as any).extensionBuilderHooks).toEqual([]);

        const entryDir = createExtension('localization', {
            name: 'pink-localization-editor',
            contributions: { builder: './builder.js' },
        });
        const manager = new PluginManager();
        (globalThis as { __cocosCliBuilderBuiltinRoot?: string }).__cocosCliBuilderBuiltinRoot = builtinRoot;
        await manager.init();

        expect((manager as any).builderPathsMap['web-mobile']).toBeUndefined();

        await manager.register('web-mobile');

        expect(manager.getHooksInfo('web-mobile').infos['pink-localization-editor']).toEqual({
            path: join(entryDir, 'builder.js'),
            internal: true,
        });
    });

    it('keeps the first stable duplicate name', () => {
        const firstDir = createExtension('a-first', {
            name: 'duplicate-extension',
            contributions: { builder: './first.js' },
        }, 'first.js');
        createExtension('z-second', {
            name: 'duplicate-extension',
            contributions: { builder: './second.js' },
        }, 'second.js');

        const manager = createManager();
        const hooks = (manager as any).scanBuiltinExtensionBuilderHooks(builtinRoot);

        expect(hooks).toEqual([{
            extensionName: 'duplicate-extension',
            path: join(firstDir, 'first.js'),
            root: builtinRoot,
        }]);
    });

    it('mounts each builtin hook into the platform-first map and projects precise flags', () => {
        const manager = createManager();
        const localizationEntry = createExtension('localization', {
            name: 'pink-localization-editor',
            contributions: { builder: './builder.js' },
        });
        const openpaasEntry = createExtension('conflict', {
            name: 'openpaas',
            contributions: { builder: './builder.js' },
        });
        const occupiedEntry = createExtension('occupied', {
            name: 'occupied',
            contributions: { builder: './builder.js' },
        });
        (manager as any).builderPathsMap = {
            openpaas: { openpaas: '/platform/openpaas-hooks' },
            'web-mobile': {
                'web-mobile': '/platform/web-mobile-hooks',
                occupied: '/existing/occupied-hooks',
            },
        };
        setExtensionHooks(manager, [
            { extensionName: 'pink-localization-editor', path: join(localizationEntry, 'builder.js'), root: builtinRoot },
            { extensionName: 'openpaas', path: join(openpaasEntry, 'builder.js'), root: builtinRoot },
            { extensionName: 'occupied', path: join(occupiedEntry, 'builder.js'), root: builtinRoot },
        ]);

        (manager as any).registerExtensionBuilderHooks('openpaas');
        (manager as any).registerExtensionBuilderHooks('web-mobile');

        const map = (manager as any).builderPathsMap;
        expect(map['web-mobile']['pink-localization-editor']).toBe(join(localizationEntry, 'builder.js'));

        const openpaasHooks = getHookInfo(manager, 'openpaas');
        expect(openpaasHooks.pkgNameOrder).toEqual(['openpaas', 'pink-localization-editor', 'occupied']);
        expect(openpaasHooks.infos.openpaas).toEqual({
            path: '/platform/openpaas-hooks',
            internal: true,
        });
        expect(openpaasHooks.infos['pink-localization-editor']).toEqual({
            path: join(localizationEntry, 'builder.js'),
            internal: true,
        });
        const webHooks = getHookInfo(manager, 'web-mobile');
        expect(webHooks.infos.occupied).toEqual({
            path: '/existing/occupied-hooks',
            internal: false,
        });
    });

    it('loads builtin hooks through runPluginTask and selects internal dispatch', async () => {
        const marker = join(tempRoot, 'hook-calls.jsonl');
        const contents = `
            const fs = require('fs');
            module.exports = {
                throwError: false,
                onAfterInit() { fs.appendFileSync(${JSON.stringify(marker)}, 'onAfterInit\\n'); },
                onBeforeBuildAssets() { fs.appendFileSync(${JSON.stringify(marker)}, 'onBeforeBuildAssets\\n'); },
            };
        `;
        const entryDir = createExtension('localization', {
            name: 'pink-localization-editor',
            contributions: { builder: './builder.js' },
        }, 'builder.js', contents);
        const manager = createManager();
        (manager as any).builderPathsMap = { 'web-mobile': {} };
        setExtensionHooks(manager, [{ extensionName: 'pink-localization-editor', path: join(entryDir, 'builder.js'), root: builtinRoot }]);
        (manager as any).registerExtensionBuilderHooks('web-mobile');

        const task = new TestBuildTask('test-task', 'test-task');
        const handleHook = jest.spyOn(task, 'handleHook');
        task.hooksInfo = getHookInfo(manager, 'web-mobile');
        await task.runPluginTask('onAfterInit');
        await task.runPluginTask('onBeforeBuildAssets');

        expect(readFileSync(marker, 'utf8').trim().split('\n')).toEqual(['onAfterInit', 'onBeforeBuildAssets']);
        expect(handleHook).toHaveBeenNthCalledWith(1, expect.any(Function), true);
        expect(handleHook).toHaveBeenNthCalledWith(2, expect.any(Function), true);
    });

    it('fails for builtin hook errors and entry loading errors', async () => {
        const entryDir = createExtension('localization', {
            name: 'pink-localization-editor',
            contributions: { builder: './builder.js' },
        }, 'builder.js', `
            module.exports = {
                throwError: false,
                onAfterInit() { throw new Error('builtin failure'); },
            };
        `);
        const manager = createManager();
        (manager as any).builderPathsMap = { 'web-mobile': {} };
        setExtensionHooks(manager, [
            { extensionName: 'pink-localization-editor', path: join(entryDir, 'builder.js'), root: builtinRoot },
        ]);
        (manager as any).registerExtensionBuilderHooks('web-mobile');

        const task = new TestBuildTask('test-task', 'test-task');
        task.hooksInfo = getHookInfo(manager, 'web-mobile');
        await expect(task.runPluginTask('onAfterInit')).rejects.toThrow('builtin failure');
        expect(task.error?.message).toBe('builtin failure');

        const missingTask = new TestBuildTask('missing-task', 'missing-task');
        missingTask.hooksInfo = getHookInfo(manager, 'web-mobile');
        missingTask.hooksInfo.infos['pink-localization-editor'].path = join(tempRoot, 'missing.js');
        await expect(missingTask.runPluginTask('onAfterInit')).rejects.toThrow();
        expect(missingTask.error).toBeDefined();
    });
});
