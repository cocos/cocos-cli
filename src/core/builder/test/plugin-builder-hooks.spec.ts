import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
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
    failOnError?: boolean;
};

class TestBuildTask extends BuildTaskBase {
    public hooksInfo: { pkgNameOrder: string[]; infos: Record<string, HookInfo> } = { pkgNameOrder: [], infos: {} };
    public options: any = { preview: false };
    public hookMap: Record<string, string> = {
        onAfterInit: 'onAfterInit',
        onBeforeBuildAssets: 'onBeforeBuildAssets',
    };
    public result: any = { rawOptions: {}, marker: 'result' };
    public buildResult: any = { marker: 'build-result' };
    public cache: any = { marker: 'cache' };
    public bundleManager: any = {};

    async handleHook(func: Function, internal: boolean, ...args: any[]) {
        if (internal) {
            await func.call(this, this.options, this.result, this.cache, ...args);
        } else {
            await func(this.result.rawOptions, this.buildResult, ...args);
        }
    }

    async run() {
        return true;
    }
}

class TestBundleTask extends BuildTaskBase {
    public hooksInfo: { pkgNameOrder: string[]; infos: Record<string, HookInfo> } = { pkgNameOrder: [], infos: {} };
    public options: any = { preview: false };
    public hookMap: Record<string, string> = {
        onBeforeBundleInit: 'onBeforeBundleInit',
    };
    public bundles: any[] = [{ name: 'main' }];
    public cache: any = { marker: 'bundle-cache' };

    async handleHook(func: Function, internal: boolean, ...args: any[]) {
        if (internal) {
            await func.call(this, this.options, this.bundles, this.cache, ...args);
        } else {
            await func(this.options, this.bundles, ...args);
        }
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

    it('reads only the plural contributions.builder string shape', () => {
        const validDir = createExtension('valid', {
            name: 'pink-localization-editor',
            contributions: { builder: './builder.js' },
        });
        createExtension('contributes-only', {
            name: 'contributes-only',
            contributes: { builder: './builder.js' },
        });
        createExtension('object-shape', {
            name: 'object-shape',
            contributions: { builder: { path: './builder.js' } },
        });
        createExtension('empty-shape', {
            name: 'empty-shape',
            contributions: { builder: '' },
        });

        const manager = createManager();
        const hooks = (manager as any).scanBuiltinExtensionBuilderHooks(builtinRoot);

        expect(hooks).toEqual([{
            extensionName: 'pink-localization-editor',
            path: join(validDir, 'builder.js'),
            root: builtinRoot,
        }]);
        expect(existsSync(join(validDir, 'builder.js'))).toBe(true);
    });

    it('requires a non-empty manifest name and rejects invalid or escaping entries', () => {
        const validDir = createExtension('valid', {
            name: 'valid-extension',
            contributions: { builder: './dist/builder.js' },
        }, 'dist/builder.js');
        const outsidePath = join(tempRoot, 'outside.js');
        writeFileSync(outsidePath, 'module.exports = {};');
        createExtension('missing-name', {
            contributions: { builder: './builder.js' },
        });
        createExtension('outside', {
            name: 'outside-extension',
            contributions: { builder: '../../outside.js' },
        });
        createExtension('missing-entry', {
            name: 'missing-entry',
            contributions: { builder: './missing.js' },
        }, '', '');
        const directoryEntryDir = createExtension('directory-entry', {
            name: 'directory-entry',
            contributions: { builder: './builder-dir' },
        }, '');
        mkdirSync(join(directoryEntryDir, 'builder-dir'), { recursive: true });

        const manager = createManager();
        const warning = jest.spyOn(console, 'warn').mockImplementation();
        const hooks = (manager as any).scanBuiltinExtensionBuilderHooks(builtinRoot);

        expect(hooks).toEqual([{
            extensionName: 'valid-extension',
            path: join(validDir, 'dist', 'builder.js'),
            root: builtinRoot,
        }]);
        expect(warning.mock.calls.some(([message]) => String(message).includes('outside extension root'))).toBe(true);
        expect(existsSync(outsidePath)).toBe(true);
        warning.mockRestore();
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

        expect((manager as any).extensionBuilderHooks).toEqual([{
            extensionName: 'pink-localization-editor',
            path: join(entryDir, 'builder.js'),
            root: builtinRoot,
        }]);
        expect((manager as any).builderPathsMap['web-mobile']).toBeUndefined();

        await manager.register('web-mobile');

        expect((manager as any).builderPathsMap['web-mobile']['pink-localization-editor']).toBe(join(entryDir, 'builder.js'));
        expect((manager as any).builderPathsMap['pink-localization-editor']).toBeUndefined();
        expect(manager.getHooksInfo('web-mobile').infos['pink-localization-editor']).toEqual({
            path: join(entryDir, 'builder.js'),
            internal: true,
            failOnError: false,
        });
    });

    it('scans builtin extensions only and keeps the first stable duplicate name', () => {
        const projectRoot = join(tempRoot, 'project', 'extensions');
        mkdirSync(projectRoot, { recursive: true });
        const projectDir = join(projectRoot, 'project-copy');
        mkdirSync(projectDir, { recursive: true });
        writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
            name: 'pink-localization-editor',
            contributions: { builder: './project.js' },
        }));
        writeFileSync(join(projectDir, 'project.js'), 'module.exports = {};');

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
        expect(hooks.some((hook: { path: string }) => hook.path.includes('project.js'))).toBe(false);
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
        expect(map.openpaas['pink-localization-editor']).toBe(join(localizationEntry, 'builder.js'));
        expect(map['web-mobile']['pink-localization-editor']).toBe(join(localizationEntry, 'builder.js'));
        expect(map['pink-localization-editor']).toBeUndefined();
        expect(map.openpaas.openpaas).toBe('/platform/openpaas-hooks');
        expect(map['web-mobile'].occupied).toBe('/existing/occupied-hooks');

        const openpaasHooks = getHookInfo(manager, 'openpaas');
        expect(openpaasHooks.pkgNameOrder).toEqual(['openpaas', 'pink-localization-editor', 'occupied']);
        expect(openpaasHooks.infos.openpaas).toEqual({
            path: '/platform/openpaas-hooks',
            internal: true,
            failOnError: true,
        });
        expect(openpaasHooks.infos['pink-localization-editor']).toEqual({
            path: join(localizationEntry, 'builder.js'),
            internal: true,
            failOnError: false,
        });
        const webHooks = getHookInfo(manager, 'web-mobile');
        expect(webHooks.infos.occupied).toEqual({
            path: '/existing/occupied-hooks',
            internal: false,
            failOnError: false,
        });
    });

    it('runs builtin hooks through runPluginTask with the internal Builder ABI', async () => {
        const marker = join(tempRoot, 'hook-calls.jsonl');
        const contents = `
            const fs = require('fs');
            function record(stage, options, result, cache) {
                fs.appendFileSync(${JSON.stringify(marker)}, JSON.stringify({
                    stage,
                    builderBundleManager: !!this.bundleManager,
                    sameOptions: options === this.options,
                    sameResult: result === this.result,
                    sameCache: cache === this.cache,
                }) + '\\n');
            }
            module.exports = {
                throwError: false,
                onAfterInit(options, result, cache) { record.call(this, 'onAfterInit', options, result, cache); },
                onBeforeBuildAssets(options, result, cache) { record.call(this, 'onBeforeBuildAssets', options, result, cache); },
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
        task.hooksInfo = getHookInfo(manager, 'web-mobile');
        await task.runPluginTask('onAfterInit');
        await task.runPluginTask('onBeforeBuildAssets');

        const calls = readFileSync(marker, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
        expect(calls).toEqual([
            {
                stage: 'onAfterInit',
                builderBundleManager: true,
                sameOptions: true,
                sameResult: true,
                sameCache: true,
            },
            {
                stage: 'onBeforeBuildAssets',
                builderBundleManager: true,
                sameOptions: true,
                sameResult: true,
                sameCache: true,
            },
        ]);
    });

    it('keeps bundle hook ABI and soft-failure behavior on a BuildTaskBase bundle path', async () => {
        const marker = join(tempRoot, 'bundle-hook.json');
        const contents = `
            const fs = require('fs');
            module.exports = {
                throwError: false,
                onBeforeBundleInit(options, bundles, cache) {
                    fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({
                        sameOptions: options === this.options,
                        sameBundles: bundles === this.bundles,
                        sameCache: cache === this.cache,
                    }));
                    throw new Error('bundle soft failure');
                },
            };
        `;
        const entryDir = createExtension('bundle-hook', {
            name: 'pink-localization-editor',
            contributions: { builder: './builder.js' },
        }, 'builder.js', contents);
        const manager = createManager();
        (manager as any).builderPathsMap = { 'web-mobile': {} };
        setExtensionHooks(manager, [{ extensionName: 'pink-localization-editor', path: join(entryDir, 'builder.js'), root: builtinRoot }]);
        (manager as any).registerExtensionBuilderHooks('web-mobile');

        const task = new TestBundleTask('bundle-task', 'bundle-task');
        task.hooksInfo = getHookInfo(manager, 'web-mobile');
        await task.runPluginTask('onBeforeBundleInit');

        expect(JSON.parse(readFileSync(marker, 'utf8'))).toEqual({
            sameOptions: true,
            sameBundles: true,
            sameCache: true,
        });
        expect(task.error).toBeUndefined();
    });

    it('keeps throwError and failOnError decisions independent and preserves legacy fallback', async () => {
        const continueMarker = join(tempRoot, 'continued.txt');
        const softEntryDir = createExtension('soft', {
            name: 'soft-extension',
            contributions: { builder: './builder.js' },
        }, 'builder.js', `
            const fs = require('fs');
            module.exports = {
                throwError: false,
                onAfterInit() { throw new Error('soft failure'); },
                onBeforeBuildAssets() { fs.writeFileSync(${JSON.stringify(continueMarker)}, 'continued'); },
            };
        `);
        const hardEntryDir = createExtension('hard', {
            name: 'hard-extension',
            contributions: { builder: './builder.js' },
        }, 'builder.js', `
            module.exports = { throwError: true, onAfterInit() { throw new Error('hard failure'); } };
        `);
        const manager = createManager();
        (manager as any).builderPathsMap = { 'web-mobile': {} };
        setExtensionHooks(manager, [
            { extensionName: 'soft-extension', path: join(softEntryDir, 'builder.js'), root: builtinRoot },
            { extensionName: 'hard-extension', path: join(hardEntryDir, 'builder.js'), root: builtinRoot },
        ]);
        (manager as any).registerExtensionBuilderHooks('web-mobile');

        const softTask = new TestBuildTask('soft-task', 'soft-task');
        softTask.hooksInfo = {
            pkgNameOrder: ['soft-extension'],
            infos: getHookInfo(manager, 'web-mobile').infos,
        };
        await softTask.runPluginTask('onAfterInit');
        await softTask.runPluginTask('onBeforeBuildAssets');
        expect(softTask.error).toBeUndefined();
        expect(readFileSync(continueMarker, 'utf8')).toBe('continued');

        const hardTask = new TestBuildTask('hard-task', 'hard-task');
        hardTask.hooksInfo = {
            pkgNameOrder: ['hard-extension'],
            infos: { 'hard-extension': getHookInfo(manager, 'web-mobile').infos['hard-extension'] },
        };
        await expect(hardTask.runPluginTask('onAfterInit')).rejects.toThrow('hard failure');

        const legacyEntry = join(tempRoot, 'legacy.js');
        writeFileSync(legacyEntry, 'module.exports = { throwError: false, onAfterInit() { throw new Error(\'legacy failure\'); } };');
        const legacyTask = new TestBuildTask('legacy-task', 'legacy-task');
        legacyTask.hooksInfo = {
            pkgNameOrder: ['legacy-platform'],
            infos: { 'legacy-platform': { path: legacyEntry, internal: true } },
        };
        await expect(legacyTask.runPluginTask('onAfterInit')).rejects.toThrow('legacy failure');

        const missingTask = new TestBuildTask('missing-task', 'missing-task');
        missingTask.hooksInfo = {
            pkgNameOrder: ['soft-extension'],
            infos: { 'soft-extension': { path: join(tempRoot, 'missing.js'), internal: true, failOnError: false } },
        };
        await missingTask.runPluginTask('onAfterInit');
        expect(missingTask.error).toBeUndefined();
    });
});
