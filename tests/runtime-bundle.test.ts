import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import * as vm from 'vm';
import { RuntimeBundler, runtimeBundler } from '../src/lib/runtime-module-cache';

jest.mock('vm', () => {
    const actual = jest.requireActual<typeof import('vm')>('vm');
    return {
        ...actual,
        compileFunction: jest.fn(actual.compileFunction),
    };
});

const nodeFs = require('fs') as typeof import('fs');
const nodeModule = require('module') as typeof import('module');

describe('RuntimeBundler', () => {
    let tempRoot: string;
    let bundler: RuntimeBundler | undefined;

    beforeEach(() => {
        tempRoot = mkdtempSync(join(tmpdir(), 'cocos-runtime-bundle-'));
    });

    afterEach(() => {
        bundler?.uninstall();
        runtimeBundler.install();
        jest.restoreAllMocks();
        rmSync(tempRoot, { recursive: true, force: true });
    });

    function createModule(sourcePath: string, value: string): void {
        writeFileSync(sourcePath, `module.exports = ${JSON.stringify(value)};`);
    }

    function requireFresh(sourcePath: string): unknown {
        const moduleInstance = new (nodeModule as any)(sourcePath, module) as {
            filename: string;
            paths: string[];
            exports: unknown;
            load(filename: string): void;
        };
        moduleInstance.filename = sourcePath;
        moduleInstance.paths = (nodeModule as any)._nodeModulePaths(dirname(sourcePath));
        moduleInstance.load(sourcePath);
        return moduleInstance.exports;
    }

    it('matches CommonJS and JSON modules by default but excludes built-ins and unsupported module types', () => {
        runtimeBundler.uninstall();
        bundler = new RuntimeBundler();
        const isRuntimeBundle = (bundler as any).isRuntimeBundle as (filePath: string) => boolean;

        expect(isRuntimeBundle('/tmp/project/module.js')).toBe(true);
        expect(isRuntimeBundle('/tmp/project/module.cjs')).toBe(true);
        expect(isRuntimeBundle('/tmp/project/module.json')).toBe(true);
        expect(isRuntimeBundle('/tmp/project/module')).toBe(true);
        expect(isRuntimeBundle('node:fs')).toBe(false);
        expect(isRuntimeBundle('/tmp/project/module.mjs')).toBe(false);
        expect(isRuntimeBundle('/tmp/project/module.node')).toBe(false);
    });

    it('skips JavaScript files inside type=module package scopes', () => {
        const packageRoot = join(tempRoot, 'esm-package');
        mkdirSync(join(packageRoot, 'nested'), { recursive: true });
        writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ type: 'module' }));
        writeFileSync(join(packageRoot, 'index.js'), 'export default true;');
        writeFileSync(join(packageRoot, 'nested', 'common.cjs'), 'module.exports = true;');

        runtimeBundler.uninstall();
        const bundler = new RuntimeBundler();
        const isRuntimeBundle = (bundler as any).isRuntimeBundle as (filePath: string) => boolean;

        expect(isRuntimeBundle(join(packageRoot, 'index.js'))).toBe(false);
        expect(isRuntimeBundle(join(packageRoot, 'nested', 'extensionless'))).toBe(false);
        expect(isRuntimeBundle(join(packageRoot, 'nested', 'common.cjs'))).toBe(true);
    });

    it('separates host and scene cache files and supports an explicit cache file', () => {
        const previousScope = process.env.COCOS_RUNTIME_BUNDLE_CACHE_SCOPE;
        const previousFile = process.env.COCOS_RUNTIME_BUNDLE_CACHE_FILE;
        const previousPinkVersion = process.env.VSCODE_PINK_VERSION;
        const previousCocosCliVersion = process.env.COCOS_CLI_VERSION;
        try {
            delete process.env.COCOS_RUNTIME_BUNDLE_CACHE_FILE;
            process.env.VSCODE_PINK_VERSION = 'pink-test';
            process.env.COCOS_CLI_VERSION = 'cli-test';
            process.env.COCOS_RUNTIME_BUNDLE_CACHE_SCOPE = 'host';
            expect((new RuntimeBundler() as any).cachePath).toBe(resolve(process.cwd(), '.runtime-bundle-cache-[pink-test+cli-test]'));

            process.env.COCOS_RUNTIME_BUNDLE_CACHE_SCOPE = 'scene';
            expect((new RuntimeBundler() as any).cachePath).toBe(resolve(process.cwd(), '.runtime-bundle-cache.scene-[pink-test+cli-test]'));

            const explicitPath = join(tempRoot, 'scene-runtime-bundle.cache');
            process.env.COCOS_RUNTIME_BUNDLE_CACHE_FILE = explicitPath;
            expect((new RuntimeBundler() as any).cachePath).toBe(explicitPath);
        } finally {
            if (previousScope === undefined) {
                delete process.env.COCOS_RUNTIME_BUNDLE_CACHE_SCOPE;
            } else {
                process.env.COCOS_RUNTIME_BUNDLE_CACHE_SCOPE = previousScope;
            }
            if (previousFile === undefined) {
                delete process.env.COCOS_RUNTIME_BUNDLE_CACHE_FILE;
            } else {
                process.env.COCOS_RUNTIME_BUNDLE_CACHE_FILE = previousFile;
            }
            if (previousPinkVersion === undefined) {
                delete process.env.VSCODE_PINK_VERSION;
            } else {
                process.env.VSCODE_PINK_VERSION = previousPinkVersion;
            }
            if (previousCocosCliVersion === undefined) {
                delete process.env.COCOS_CLI_VERSION;
            } else {
                process.env.COCOS_CLI_VERSION = previousCocosCliVersion;
            }
        }
    });

    it('moves legacy and stale versioned default caches to trash asynchronously', async () => {
        const previousCwd = process.cwd();
        const previousPinkVersion = process.env.VSCODE_PINK_VERSION;
        const previousCocosCliVersion = process.env.COCOS_CLI_VERSION;
        const movedFiles: string[] = [];
        try {
            process.chdir(tempRoot);
            process.env.VSCODE_PINK_VERSION = 'pink-current';
            process.env.COCOS_CLI_VERSION = 'cli-current';
            const legacyPath = resolve(process.cwd(), '.runtime-bundle-cache');
            const stalePath = resolve(process.cwd(), '.runtime-bundle-cache-[pink-old+cli-old]');
            const currentPath = resolve(process.cwd(), '.runtime-bundle-cache-[pink-current+cli-current]');
            writeFileSync(legacyPath, 'legacy');
            writeFileSync(stalePath, 'stale');
            writeFileSync(currentPath, 'current');

            runtimeBundler.uninstall();
            bundler = new RuntimeBundler({
                moveToTrash: async (filePath) => {
                    movedFiles.push(filePath);
                    rmSync(filePath, { force: true });
                },
            });
            bundler.install();
            await new Promise<void>((resolvePromise) => setImmediate(() => setImmediate(resolvePromise)));

            expect(movedFiles.sort()).toEqual([legacyPath, stalePath].sort());
            expect(existsSync(legacyPath)).toBe(false);
            expect(existsSync(stalePath)).toBe(false);
            expect(existsSync(currentPath)).toBe(true);
        } finally {
            process.chdir(previousCwd);
            if (previousPinkVersion === undefined) {
                delete process.env.VSCODE_PINK_VERSION;
            } else {
                process.env.VSCODE_PINK_VERSION = previousPinkVersion;
            }
            if (previousCocosCliVersion === undefined) {
                delete process.env.COCOS_CLI_VERSION;
            } else {
                process.env.COCOS_CLI_VERSION = previousCocosCliVersion;
            }
        }
    });

    it('keeps stale caches when moving them to trash fails', async () => {
        const previousCwd = process.cwd();
        const previousPinkVersion = process.env.VSCODE_PINK_VERSION;
        const previousCocosCliVersion = process.env.COCOS_CLI_VERSION;
        try {
            process.chdir(tempRoot);
            process.env.VSCODE_PINK_VERSION = 'pink-current';
            process.env.COCOS_CLI_VERSION = 'cli-current';
            const stalePath = resolve(process.cwd(), '.runtime-bundle-cache-[pink-old+cli-old]');
            writeFileSync(stalePath, 'stale');

            runtimeBundler.uninstall();
            bundler = new RuntimeBundler({
                moveToTrash: async () => {
                    throw new Error('trash unavailable');
                },
            });
            bundler.install();
            await new Promise<void>((resolvePromise) => setImmediate(() => setImmediate(resolvePromise)));

            expect(existsSync(stalePath)).toBe(true);
        } finally {
            process.chdir(previousCwd);
            if (previousPinkVersion === undefined) {
                delete process.env.VSCODE_PINK_VERSION;
            } else {
                process.env.VSCODE_PINK_VERSION = previousPinkVersion;
            }
            if (previousCocosCliVersion === undefined) {
                delete process.env.COCOS_CLI_VERSION;
            } else {
                process.env.COCOS_CLI_VERSION = previousCocosCliVersion;
            }
        }
    });

    it('records module bytes on a miss and serves a cache hit through Module.load', async () => {
        const sourcePath = join(tempRoot, 'runtime', 'index.js');
        const cachePath = join(tempRoot, '.runtime-bundle-cache');
        mkdirSync(join(tempRoot, 'runtime'), { recursive: true });
        createModule(sourcePath, 'first');

        bundler = new RuntimeBundler({
            cachePath,
            isRuntimeBundle: (filePath) => filePath.endsWith('/runtime/index.js'),
        });
        const originalLoad = (nodeModule.prototype as any).load;
        bundler.install();
        expect((nodeModule.prototype as any).load).not.toBe(originalLoad);

        const originalReadFileSync = nodeFs.readFileSync;
        expect(nodeFs.readFileSync).toBe(originalReadFileSync);
        expect(requireFresh(sourcePath)).toBe('first');
        expect(requireFresh(sourcePath)).toBe('first');
        await bundler.flush();
        bundler.uninstall();

        const cache = readFileSync(cachePath);
        const mappingLength = cache.readUInt32LE(12);
        const mapping = JSON.parse(cache.subarray(16, 16 + mappingLength).toString('utf8'));
        const entry = mapping.modules[Object.keys(mapping.modules)[0]];
        expect(entry).toEqual(expect.objectContaining({
            length: Buffer.byteLength(`module.exports = ${JSON.stringify('first')};`),
            mtimeMs: statSync(sourcePath).mtimeMs,
        }));
        expect(cache.subarray(16 + mappingLength + entry.offset, 16 + mappingLength + entry.offset + entry.length).toString()).toBe(
            `module.exports = ${JSON.stringify('first')};`,
        );

        bundler = new RuntimeBundler({
            cachePath,
            isRuntimeBundle: (filePath) => filePath.endsWith('/runtime/index.js'),
        });
        bundler.install();
        expect(requireFresh(sourcePath)).toBe('first');
    });

    it('persists compiled data and does not call Module._compile on a cache hit', async () => {
        const sourcePath = join(tempRoot, 'runtime', 'index.js');
        const cachePath = join(tempRoot, '.runtime-bundle-cache');
        mkdirSync(join(tempRoot, 'runtime'), { recursive: true });
        createModule(sourcePath, 'compiled');

        runtimeBundler.uninstall();
        bundler = new RuntimeBundler({
            cachePath,
            isRuntimeBundle: (filePath) => filePath.endsWith('/runtime/index.js'),
        });
        bundler.install();
        expect(requireFresh(sourcePath)).toBe('compiled');
        await bundler.flush();
        bundler.uninstall();

        const cache = readFileSync(cachePath);
        const mappingLength = cache.readUInt32LE(12);
        const mapping = JSON.parse(cache.subarray(16, 16 + mappingLength).toString('utf8'));
        const entry = mapping.modules[sourcePath];
        expect(entry).toEqual(expect.objectContaining({
            codeCacheLength: expect.any(Number),
        }));
        expect(entry.codeCacheLength).toBeGreaterThan(0);

        bundler = new RuntimeBundler({
            cachePath,
            isRuntimeBundle: (filePath) => filePath.endsWith('/runtime/index.js'),
        });
        bundler.install();
        const compile = jest.spyOn((nodeModule.prototype as any), '_compile');
        expect(requireFresh(sourcePath)).toBe('compiled');
        expect(compile).not.toHaveBeenCalled();
        compile.mockRestore();
    });

    it('reuses the compiled CommonJS wrapper for repeated loads in one process', () => {
        const sourcePath = join(tempRoot, 'runtime', 'index.js');
        const cachePath = join(tempRoot, '.runtime-bundle-cache');
        mkdirSync(join(tempRoot, 'runtime'), { recursive: true });
        createModule(sourcePath, 'compiled-once');

        runtimeBundler.uninstall();
        bundler = new RuntimeBundler({
            cachePath,
            isRuntimeBundle: (filePath) => filePath.endsWith('/runtime/index.js'),
        });
        const compileFunction = vm.compileFunction as jest.MockedFunction<typeof vm.compileFunction>;
        compileFunction.mockClear();
        bundler.install();

        expect(requireFresh(sourcePath)).toBe('compiled-once');
        expect(requireFresh(sourcePath)).toBe('compiled-once');

        expect(compileFunction).toHaveBeenCalledTimes(1);
        compileFunction.mockClear();
    });

    it('executes once when persisted V8 cached data is rejected', async () => {
        const sourcePath = join(tempRoot, 'runtime', 'index.js');
        const cachePath = join(tempRoot, '.runtime-bundle-cache');
        mkdirSync(join(tempRoot, 'runtime'), { recursive: true });
        createModule(sourcePath, 'rejected-cache');

        runtimeBundler.uninstall();
        bundler = new RuntimeBundler({ cachePath });
        bundler.install();
        expect(requireFresh(sourcePath)).toBe('rejected-cache');
        await bundler.flush();
        bundler.uninstall();

        const cache = readFileSync(cachePath);
        const mappingLength = cache.readUInt32LE(12);
        const mapping = JSON.parse(cache.subarray(16, 16 + mappingLength).toString('utf8'));
        const entry = mapping.modules[sourcePath];
        const codeCacheOffset = 16 + mappingLength + entry.codeCacheOffset;
        const corruptedCache = Buffer.from(cache);
        corruptedCache[codeCacheOffset] ^= 0xff;
        writeFileSync(cachePath, corruptedCache);

        bundler = new RuntimeBundler({ cachePath });
        const compileFunction = vm.compileFunction as jest.MockedFunction<typeof vm.compileFunction>;
        compileFunction.mockClear();
        bundler.install();

        expect(requireFresh(sourcePath)).toBe('rejected-cache');
        expect(compileFunction).toHaveBeenCalledTimes(1);
        compileFunction.mockClear();
    });

    it('returns cached content before asynchronously checking and refreshing a changed source', async () => {
        const sourcePath = join(tempRoot, 'runtime', 'index.js');
        const cachePath = join(tempRoot, '.runtime-bundle-cache');
        mkdirSync(join(tempRoot, 'runtime'), { recursive: true });
        createModule(sourcePath, 'first');

        runtimeBundler.uninstall();
        bundler = new RuntimeBundler({ cachePath });
        bundler.install();
        expect(requireFresh(sourcePath)).toBe('first');
        await bundler.flush();
        bundler.uninstall();

        writeFileSync(sourcePath, 'module.exports = "second";');
        const changedMtime = statSync(sourcePath).mtimeMs + 2000;
        utimesSync(sourcePath, new Date(changedMtime), new Date(changedMtime));

        bundler = new RuntimeBundler({ cachePath });
        bundler.install();
        const statSyncSpy = jest.spyOn(nodeFs, 'statSync');
        const asyncStatSpy = jest.spyOn(nodeFs.promises, 'stat');
        expect(requireFresh(sourcePath)).toBe('first');
        expect(statSyncSpy).not.toHaveBeenCalledWith(sourcePath);
        expect(asyncStatSpy).not.toHaveBeenCalledWith(sourcePath);

        await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
        expect(asyncStatSpy).toHaveBeenCalledWith(sourcePath);
        await bundler.flush();
        expect(requireFresh(sourcePath)).toBe('second');
        statSyncSpy.mockRestore();
        asyncStatSpy.mockRestore();
    });

    it('does not compile solely to refresh an expired cache entry during idle maintenance', async () => {
        const sourcePath = join(tempRoot, 'runtime', 'index.js');
        const cachePath = join(tempRoot, '.runtime-bundle-cache');
        mkdirSync(join(tempRoot, 'runtime'), { recursive: true });
        createModule(sourcePath, 'first');

        runtimeBundler.uninstall();
        bundler = new RuntimeBundler({ cachePath });
        bundler.install();
        expect(requireFresh(sourcePath)).toBe('first');
        await bundler.flush();
        bundler.uninstall();

        writeFileSync(sourcePath, 'module.exports = "second";');
        const changedMtime = statSync(sourcePath).mtimeMs + 2000;
        utimesSync(sourcePath, new Date(changedMtime), new Date(changedMtime));

        bundler = new RuntimeBundler({ cachePath });
        const compileFunction = vm.compileFunction as jest.MockedFunction<typeof vm.compileFunction>;
        compileFunction.mockClear();
        bundler.install();
        expect(requireFresh(sourcePath)).toBe('first');
        expect(compileFunction).toHaveBeenCalledTimes(1);

        await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
        await bundler.flush();

        expect(compileFunction).toHaveBeenCalledTimes(1);
        compileFunction.mockClear();
    });

    it('defers the automatic cache flush until the event-loop idle phase', async () => {
        const sourcePath = join(tempRoot, 'runtime', 'index.js');
        const cachePath = join(tempRoot, '.runtime-bundle-cache');
        mkdirSync(join(tempRoot, 'runtime'), { recursive: true });
        createModule(sourcePath, 'first');

        runtimeBundler.uninstall();
        bundler = new RuntimeBundler({ cachePath });
        bundler.install();
        const writeCache = jest.spyOn(bundler as any, 'writeCache');
        expect(requireFresh(sourcePath)).toBe('first');
        await Promise.resolve();
        expect(writeCache).not.toHaveBeenCalled();

        await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
        expect(writeCache).toHaveBeenCalled();
        await bundler.flush();
        writeCache.mockRestore();
    });

    it('reuses a cached dependency resolution without calling the original resolver', async () => {
        const sourcePath = join(tempRoot, 'runtime', 'index.js');
        const dependencyPath = join(tempRoot, 'runtime', 'dependency.js');
        const cachePath = join(tempRoot, '.runtime-bundle-cache');
        mkdirSync(join(tempRoot, 'runtime'), { recursive: true });
        writeFileSync(dependencyPath, 'module.exports = "dependency";');
        writeFileSync(sourcePath, 'module.exports = require("./dependency.js");');

        runtimeBundler.uninstall();
        const resolveFilename = jest.spyOn(nodeModule as any, '_resolveFilename');
        bundler = new RuntimeBundler({ cachePath });
        bundler.install();
        expect(requireFresh(sourcePath)).toBe('dependency');
        await bundler.flush();
        bundler.uninstall();

        const cache = readFileSync(cachePath);
        const mappingLength = cache.readUInt32LE(12);
        const mapping = JSON.parse(cache.subarray(16, 16 + mappingLength).toString('utf8'));
        expect(mapping.resolutions).toEqual(expect.any(Object));

        resolveFilename.mockClear();
        delete (nodeModule as any)._cache[dependencyPath];
        bundler = new RuntimeBundler({ cachePath });
        bundler.install();
        const statSyncSpy = jest.spyOn(nodeFs, 'statSync');
        expect(requireFresh(sourcePath)).toBe('dependency');
        expect(resolveFilename).not.toHaveBeenCalled();
        expect(statSyncSpy).not.toHaveBeenCalledWith(sourcePath);
        expect(statSyncSpy).not.toHaveBeenCalledWith(dependencyPath);
        statSyncSpy.mockRestore();
        resolveFilename.mockRestore();
    });

    it('invalidates a cached module when its mtime changes', async () => {
        const sourcePath = join(tempRoot, 'runtime', 'index.js');
        const cachePath = join(tempRoot, '.runtime-bundle-cache');
        mkdirSync(join(tempRoot, 'runtime'), { recursive: true });
        createModule(sourcePath, 'first');

        bundler = new RuntimeBundler({
            cachePath,
            isRuntimeBundle: (filePath) => filePath.endsWith('/runtime/index.js'),
        });
        bundler.install();
        expect(requireFresh(sourcePath)).toBe('first');
        await bundler.flush();
        bundler.uninstall();

        writeFileSync(sourcePath, 'module.exports = "second";');
        const changedMtime = statSync(sourcePath).mtimeMs + 2000;
        utimesSync(sourcePath, new Date(changedMtime), new Date(changedMtime));
        bundler = new RuntimeBundler({
            cachePath,
            isRuntimeBundle: (filePath) => filePath.endsWith('/runtime/index.js'),
        });
        bundler.install();

        expect(requireFresh(sourcePath)).toBe('first');
        await bundler.flush();
        expect(requireFresh(sourcePath)).toBe('second');
    });

    it('serves cached JSON through the native JSON module contract', async () => {
        const sourcePath = join(tempRoot, 'runtime', 'metadata.json');
        const cachePath = join(tempRoot, '.runtime-bundle-cache');
        mkdirSync(join(tempRoot, 'runtime'), { recursive: true });
        writeFileSync(sourcePath, '\uFEFF{"name":"first","enabled":true}');

        bundler = new RuntimeBundler({ cachePath });
        bundler.install();
        expect(requireFresh(sourcePath)).toEqual({ name: 'first', enabled: true });
        await bundler.flush();
        bundler.uninstall();

        bundler = new RuntimeBundler({ cachePath });
        bundler.install();
        const readFileSync = jest.spyOn(nodeFs, 'readFileSync');
        expect(requireFresh(sourcePath)).toEqual({ name: 'first', enabled: true });
        expect(readFileSync).not.toHaveBeenCalledWith(sourcePath);
        readFileSync.mockRestore();
    });

    it('can be disabled with COCOS_RUNTIME_BUNDLE_CACHE', () => {
        const sourcePath = join(tempRoot, 'runtime', 'index.js');
        mkdirSync(join(tempRoot, 'runtime'), { recursive: true });
        createModule(sourcePath, 'content');

        runtimeBundler.uninstall();
        const previousValue = process.env.COCOS_RUNTIME_BUNDLE_CACHE;
        process.env.COCOS_RUNTIME_BUNDLE_CACHE = '0';
        try {
            bundler = new RuntimeBundler({
                cachePath: join(tempRoot, '.runtime-bundle-cache'),
                isRuntimeBundle: (filePath) => filePath.endsWith('/runtime/index.js'),
            });
            bundler.install();

            expect(requireFresh(sourcePath)).toBe('content');
            writeFileSync(sourcePath, 'module.exports = "changed";');
            expect(requireFresh(sourcePath)).toBe('changed');
        } finally {
            if (previousValue === undefined) {
                delete process.env.COCOS_RUNTIME_BUNDLE_CACHE;
            } else {
                process.env.COCOS_RUNTIME_BUNDLE_CACHE = previousValue;
            }
        }
    });

    it('keeps pending bytes when an asynchronous cache write fails', async () => {
        const sourcePath = join(tempRoot, 'runtime', 'index.js');
        const cachePath = join(tempRoot, '.runtime-bundle-cache');
        mkdirSync(join(tempRoot, 'runtime'), { recursive: true });
        createModule(sourcePath, 'content');

        bundler = new RuntimeBundler({
            cachePath,
            isRuntimeBundle: (filePath) => filePath.endsWith('/runtime/index.js'),
        });
        bundler.install();
        const writeCache = jest.spyOn(bundler as any, 'writeCache').mockRejectedValue(new Error('write failed'));

        expect(requireFresh(sourcePath)).toBe('content');
        await expect(bundler.flush()).rejects.toThrow('write failed');

        writeCache.mockRestore();
        await bundler.flush();
        bundler.uninstall();

        bundler = new RuntimeBundler({
            cachePath,
            isRuntimeBundle: (filePath) => filePath.endsWith('/runtime/index.js'),
        });
        bundler.install();
        expect(requireFresh(sourcePath)).toBe('content');
    });
});
