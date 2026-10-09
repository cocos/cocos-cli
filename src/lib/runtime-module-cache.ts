import * as fs from 'fs';
import * as vm from 'vm';
import * as os from 'os';
import { createRequire } from 'module';
import { basename, dirname, extname, join, resolve } from 'path';

const HEADER_SIZE = 16;
const CACHE_VERSION = 2;
const CACHE_MAGIC = Buffer.from('RTBCACH1');
const CACHE_ENABLED_ENV = 'COCOS_RUNTIME_BUNDLE_CACHE';
const CACHE_SCOPE_ENV = 'COCOS_RUNTIME_BUNDLE_CACHE_SCOPE';
const CACHE_FILE_ENV = 'COCOS_RUNTIME_BUNDLE_CACHE_FILE';
const PINK_VERSION_ENV = 'VSCODE_PINK_VERSION';
const COCOS_CLI_VERSION_ENV = 'COCOS_CLI_VERSION';
const V8_CACHED_DATA_VERSION = process.versions.v8;
const COMMONJS_PARAMETERS = ['exports', 'require', 'module', '__filename', '__dirname'];
const GLOBAL_INSTALL_KEY = '__cocos_runtime_module_cache_installed__';
const globalState = globalThis as typeof globalThis & {
    [GLOBAL_INSTALL_KEY]?: boolean;
};

export interface RuntimeBundleCacheEntry {
    offset: number;
    length: number;
    codeCacheOffset: number;
    codeCacheLength: number;
    mtimeMs: number;
}

export interface RuntimeBundleResolutionEntry {
    filename: string;
    mtimeMs: number;
}

export interface RuntimeBundlerOptions {
    cachePath?: string;
    isRuntimeBundle?: (filePath: string) => boolean;
    enabled?: boolean;
    moveToTrash?: (filePath: string) => Promise<void>;
}

interface RuntimeModule {
    filename?: string;
    paths?: string[];
    exports: unknown;
    loaded: boolean;
    require(request: string): unknown;
}

type ModuleLoad = (this: RuntimeModule, filename: string) => void;
type ResolveFilename = (
    request: string,
    parent?: RuntimeModule,
    isMain?: boolean,
    options?: unknown,
) => string;

const nodeRequire = createRequire(resolve(process.cwd(), 'package.json'));
const nodeModule = nodeRequire('module') as {
    prototype: {
        load: ModuleLoad;
    };
    _resolveFilename: ResolveFilename;
    _nodeModulePaths(path: string): string[];
    builtinModules?: string[];
};
const builtinModules = new Set(nodeModule.builtinModules ?? []);
const packageTypeCache = new Map<string, 'commonjs' | 'module' | undefined>();

interface PendingModule {
    source: Buffer;
    codeCache: Buffer;
    mtimeMs: number;
}

interface CacheManifest {
    v8CachedDataVersion: string;
    modules: Record<string, RuntimeBundleCacheEntry>;
    resolutions: Record<string, RuntimeBundleResolutionEntry>;
}

interface CompiledModule {
    cachedDataRejected?: boolean;
    cachedData?: Buffer;
    (...args: unknown[]): unknown;
}

interface CompiledModuleCacheEntry {
    mtimeMs: number;
    sourceLength: number;
    compiled: CompiledModule;
}

/**
 * Caches runtime-bundle source and V8 CommonJS compiled data at the module
 * resolution/load boundaries.
 *
 * The cache file is laid out as:
 *   fixed header | JSON manifest | source/code-cache byte ranges
 *
 * A cache miss reads and compiles the source once, then records the source and
 * V8 cachedData asynchronously. A cache hit skips the source-file read and
 * executes a wrapper compiled from the cachedData. Cache writes are serialized
 * and use a stream.
 */
export class RuntimeBundler {
    private readonly cachePath: string;
    private readonly isRuntimeBundle: (filePath: string) => boolean;
    private readonly enabled: boolean;
    private readonly cleanupStaleCaches: boolean;
    private readonly moveToTrash: (filePath: string) => Promise<void>;

    private cacheBytes: Buffer | undefined;
    private cacheContentOffset = 0;
    private cacheModules = new Map<string, RuntimeBundleCacheEntry>();
    private cacheResolutions = new Map<string, RuntimeBundleResolutionEntry>();
    private pendingModules = new Map<string, PendingModule>();
    private pendingResolutions = new Map<string, RuntimeBundleResolutionEntry>();
    private compiledModules = new Map<string, CompiledModuleCacheEntry>();
    private freshnessChecks = new Map<string, Promise<void>>();
    private resolutionChecks = new Map<string, Promise<void>>();
    private flushPromise: Promise<void> | undefined;
    private flushScheduled = false;
    private installed = false;
    private originalModuleLoad: ModuleLoad | undefined;
    private hookedModuleLoad: ModuleLoad | undefined;
    private originalResolveFilename: ResolveFilename | undefined;
    private hookedResolveFilename: ResolveFilename | undefined;

    constructor(options: RuntimeBundlerOptions = {}) {
        this.cleanupStaleCaches = options.cachePath === undefined && !process.env[CACHE_FILE_ENV]?.trim();
        this.cachePath = options.cachePath ?? getDefaultCachePath();
        this.enabled = options.enabled ?? isCacheEnabled(process.env[CACHE_ENABLED_ENV]);
        this.isRuntimeBundle = options.isRuntimeBundle ?? isCacheableModulePath;
        this.moveToTrash = options.moveToTrash ?? moveCacheFileToTrash;
    }

    install(): void {
        if (!this.enabled || this.installed) {
            return;
        }

        this.loadCacheSync();
        if (this.cleanupStaleCaches) {
            scheduleStaleCacheCleanup(this.cachePath, this.moveToTrash);
        }
        this.originalModuleLoad = nodeModule.prototype.load;
        this.originalResolveFilename = nodeModule._resolveFilename;
        const originalModuleLoad = this.originalModuleLoad;
        const originalResolveFilename = this.originalResolveFilename;
        const bundler = this;
        this.hookedModuleLoad = function hookedModuleLoad(this: RuntimeModule, filename: string): void {
            bundler.loadModule(this, filename, originalModuleLoad);
        };
        this.hookedResolveFilename = function hookedResolveFilename(
            request: string,
            parent?: RuntimeModule,
            isMain?: boolean,
            options?: unknown,
        ): string {
            return bundler.resolveFilename(request, parent, isMain, options, originalResolveFilename);
        };
        nodeModule._resolveFilename = this.hookedResolveFilename;
        nodeModule.prototype.load = this.hookedModuleLoad;
        this.installed = true;
    }

    uninstall(): void {
        if (!this.installed) {
            return;
        }
        if (this.hookedModuleLoad && nodeModule.prototype.load === this.hookedModuleLoad && this.originalModuleLoad) {
            nodeModule.prototype.load = this.originalModuleLoad;
        }
        if (this.hookedResolveFilename && nodeModule._resolveFilename === this.hookedResolveFilename && this.originalResolveFilename) {
            nodeModule._resolveFilename = this.originalResolveFilename;
        }
        this.hookedModuleLoad = undefined;
        this.originalModuleLoad = undefined;
        this.hookedResolveFilename = undefined;
        this.originalResolveFilename = undefined;
        this.compiledModules.clear();
        this.installed = false;
    }

    async flush(): Promise<void> {
        const checks = [...this.freshnessChecks.values(), ...this.resolutionChecks.values()];
        if (checks.length > 0) {
            await Promise.all(checks);
        }
        if (this.flushPromise) {
            await this.flushPromise;
            if (this.hasPending()) {
                await this.flush();
            }
            return;
        }
        if (!this.hasPending()) {
            return;
        }

        const pendingModules = this.pendingModules;
        const pendingResolutions = this.pendingResolutions;
        this.pendingModules = new Map();
        this.pendingResolutions = new Map();
        this.flushPromise = this.writeCache(pendingModules, pendingResolutions)
            .catch((error) => {
                this.restorePending(pendingModules, pendingResolutions);
                throw error;
            })
            .finally(() => {
                this.flushPromise = undefined;
        });
        await this.flushPromise;
        if (this.hasPending()) {
            await this.flush();
        }
    }

    private hasPending(): boolean {
        return this.pendingModules.size > 0 || this.pendingResolutions.size > 0;
    }

    private resolveFilename(
        request: string,
        parent: RuntimeModule | undefined,
        isMain: boolean | undefined,
        options: unknown,
        originalResolveFilename: ResolveFilename,
    ): string {
        const key = getResolutionKey(request, parent, isMain, options);
        if (key) {
            const cached = this.pendingResolutions.get(key) ?? this.cacheResolutions.get(key);
            if (cached) {
                this.scheduleResolutionFreshnessCheck(key, cached);
                return cached.filename;
            }
        }

        const filename = originalResolveFilename.call(nodeModule, request, parent, isMain, options);
        if (key && typeof filename === 'string' && isCacheableResolvedPath(filename)) {
            this.scheduleResolutionRecord(key, filename);
        }
        return filename;
    }

    private loadModule(module: RuntimeModule, filename: string, originalModuleLoad: ModuleLoad): void {
        const filePath = resolve(filename);
        if (!this.isRuntimeBundle(filePath)) {
            originalModuleLoad.call(module, filename);
            return;
        }

        const pending = this.pendingModules.get(filePath);
        if (pending) {
            this.scheduleFreshnessCheck(filePath, pending.mtimeMs);
            this.executeCompiledModule(module, filename, pending.source, pending.codeCache, pending.mtimeMs);
            return;
        }

        const cached = this.cacheModules.get(filePath);
        if (cached) {
            const content = this.getCachedModule(cached);
            if (content) {
                this.scheduleFreshnessCheck(filePath, cached.mtimeMs);
                const codeCache = this.executeCompiledModule(module, filename, content.source, content.codeCache, cached.mtimeMs);
                if (codeCache !== undefined) {
                    this.recordAsync(filePath, content.source, codeCache, cached.mtimeMs);
                }
                return;
            }
        }

        // Cache miss: keep the synchronous require contract and read the
        // source once inside the module-loading path.
        let mtimeMs: number;
        let content: Buffer;
        try {
            mtimeMs = fs.statSync(filePath).mtimeMs;
            content = fs.readFileSync(filePath);
        } catch {
            originalModuleLoad.call(module, filename);
            return;
        }
        const codeCache = this.executeCompiledModule(module, filename, content, undefined, mtimeMs);
        this.recordAsync(filePath, content, codeCache ?? Buffer.alloc(0), mtimeMs);
    }

    private scheduleFreshnessCheck(filePath: string, cachedMtimeMs: number): void {
        if (this.freshnessChecks.has(filePath)) {
            return;
        }
        const check = this.scheduleIdle(() => this.refreshIfStale(filePath, cachedMtimeMs))
            .finally(() => {
                this.freshnessChecks.delete(filePath);
            });
        this.freshnessChecks.set(filePath, check);
    }

    private scheduleIdle(task: () => Promise<void>): Promise<void> {
        return new Promise<void>((resolvePromise) => {
            setImmediate(() => {
                void task()
                    .catch(() => undefined)
                    .finally(resolvePromise);
            });
        });
    }

    private async refreshIfStale(filePath: string, cachedMtimeMs: number): Promise<void> {
        const stats = await fs.promises.stat(filePath);
        if (!stats.isFile() || stats.mtimeMs === cachedMtimeMs) {
            return;
        }

        const source = await fs.promises.readFile(filePath);
        const currentPending = this.pendingModules.get(filePath);
        if (currentPending && currentPending.mtimeMs > stats.mtimeMs) {
            return;
        }
        this.compiledModules.delete(filePath);
        this.recordAsync(filePath, source, Buffer.alloc(0), stats.mtimeMs);
    }

    /*
    ```mermaid
    sequenceDiagram
        participant Load as Module.load
        participant Memory as compiledModules
        participant V8 as vm.compileFunction
        participant Disk as idle refresh
        Load->>Memory: lookup by path, mtime and source length
        alt compiled wrapper exists
            Memory-->>Load: reuse Function
        else wrapper missing
            Load->>V8: compile once with cachedData when available
            V8-->>Memory: store executable Function
        end
        Disk-->>Memory: invalidate only after source changes
    ```
    */
    private executeCompiledModule(
        module: RuntimeModule,
        filename: string,
        source: Buffer,
        cachedData: Buffer | undefined,
        mtimeMs: number,
    ): Buffer | undefined {
        // Module.load normally initializes these before invoking the extension.
        module.filename ??= filename;
        module.paths ??= nodeModule._nodeModulePaths(dirname(filename));
        if (getModuleExtension(filename) === '.json') {
            module.exports = JSON.parse(stripJsonBom(source.toString('utf8')));
            module.loaded = true;
            return undefined;
        }

        const sourceText = stripShebang(source.toString('utf8'));
        const cacheKey = resolve(filename);
        const reusableCachedData = cachedData && cachedData.length > 0 ? cachedData : undefined;
        const existing = this.compiledModules.get(cacheKey);
        let compiled = existing && existing.mtimeMs === mtimeMs && existing.sourceLength === source.length
            ? existing.compiled
            : undefined;
        let cachedDataRejected = false;
        if (!compiled) {
            compiled = compileCommonJs(sourceText, filename, reusableCachedData);
            cachedDataRejected = compiled.cachedDataRejected === true;
            this.compiledModules.set(cacheKey, {
                mtimeMs,
                sourceLength: source.length,
                compiled,
            });
        }
        const moduleExports = module.exports;
        const localRequire = createModuleRequire(module);
        Reflect.apply(compiled, moduleExports, [moduleExports, localRequire, module, filename, dirname(filename)]);
        module.loaded = true;
        if (compiled === existing?.compiled || (reusableCachedData !== undefined && !cachedDataRejected)) {
            return undefined;
        }
        return compiled.cachedData ?? Buffer.alloc(0);
    }

    private loadCacheSync(): void {
        let bytes: Buffer;
        try {
            bytes = fs.readFileSync(this.cachePath);
        } catch {
            return;
        }

        if (bytes.length < HEADER_SIZE || !bytes.subarray(0, 8).equals(CACHE_MAGIC)) {
            return;
        }
        if (bytes.readUInt32LE(8) !== CACHE_VERSION) {
            return;
        }

        const mappingLength = bytes.readUInt32LE(12);
        const contentOffset = HEADER_SIZE + mappingLength;
        if (contentOffset > bytes.length) {
            return;
        }

        try {
            const mapping = JSON.parse(bytes.subarray(HEADER_SIZE, contentOffset).toString('utf8')) as unknown;
            if (!isCacheManifest(mapping, bytes.length - contentOffset)) {
                return;
            }
            this.cacheBytes = bytes;
            this.cacheContentOffset = contentOffset;
            this.cacheModules = new Map(Object.entries(mapping.modules));
            this.cacheResolutions = new Map(Object.entries(mapping.resolutions));
        } catch {
            this.cacheBytes = undefined;
            this.cacheModules.clear();
            this.cacheResolutions.clear();
        }
    }

    private getCachedModule(entry: RuntimeBundleCacheEntry): { source: Buffer; codeCache: Buffer } | undefined {
        if (!this.cacheBytes || !isCacheEntry(entry, this.cacheBytes.length - this.cacheContentOffset)) {
            return undefined;
        }
        const start = this.cacheContentOffset + entry.offset;
        const codeCacheStart = this.cacheContentOffset + entry.codeCacheOffset;
        return {
            source: this.cacheBytes.subarray(start, start + entry.length),
            codeCache: this.cacheBytes.subarray(codeCacheStart, codeCacheStart + entry.codeCacheLength),
        };
    }

    private recordAsync(filePath: string, source: Buffer, codeCache: Buffer, mtimeMs: number): void {
        this.pendingModules.set(filePath, {
            source: Buffer.from(source),
            codeCache: Buffer.from(codeCache),
            mtimeMs,
        });
        if (this.flushScheduled) {
            return;
        }
        this.flushScheduled = true;
        setImmediate(() => {
            this.flushScheduled = false;
            void this.flush().catch(() => undefined);
        });
    }

    private recordResolutionAsync(key: string, entry: RuntimeBundleResolutionEntry): void {
        this.pendingResolutions.set(key, entry);
        if (this.flushScheduled) {
            return;
        }
        this.flushScheduled = true;
        setImmediate(() => {
            this.flushScheduled = false;
            void this.flush().catch(() => undefined);
        });
    }

    private scheduleResolutionRecord(key: string, filename: string): void {
        if (this.resolutionChecks.has(key)) {
            return;
        }
        const check = this.scheduleIdle(async () => {
            const stats = await fs.promises.stat(filename);
            if (stats.isFile()) {
                this.recordResolutionAsync(key, { filename, mtimeMs: stats.mtimeMs });
            }
        })
            .finally(() => {
                this.resolutionChecks.delete(key);
            });
        this.resolutionChecks.set(key, check);
    }

    private scheduleResolutionFreshnessCheck(key: string, entry: RuntimeBundleResolutionEntry): void {
        if (this.resolutionChecks.has(key)) {
            return;
        }
        const check = this.scheduleIdle(async () => {
            try {
                const stats = await fs.promises.stat(entry.filename);
                const current = this.pendingResolutions.get(key) ?? this.cacheResolutions.get(key);
                if (current !== entry) {
                    return;
                }
                if (!stats.isFile()) {
                    this.pendingResolutions.delete(key);
                    this.cacheResolutions.delete(key);
                    return;
                }
                if (stats.mtimeMs !== entry.mtimeMs) {
                    this.recordResolutionAsync(key, { filename: entry.filename, mtimeMs: stats.mtimeMs });
                }
            } catch {
                const current = this.pendingResolutions.get(key) ?? this.cacheResolutions.get(key);
                if (current === entry) {
                    this.pendingResolutions.delete(key);
                    this.cacheResolutions.delete(key);
                }
            }
        })
            .finally(() => {
                this.resolutionChecks.delete(key);
            });
        this.resolutionChecks.set(key, check);
    }

    private restorePending(
        pendingModules: Map<string, PendingModule>,
        pendingResolutions: Map<string, RuntimeBundleResolutionEntry>,
    ): void {
        const restoredModules = new Map(pendingModules);
        for (const [filePath, content] of this.pendingModules) {
            restoredModules.set(filePath, content);
        }
        this.pendingModules = restoredModules;

        const restoredResolutions = new Map(pendingResolutions);
        for (const [key, entry] of this.pendingResolutions) {
            restoredResolutions.set(key, entry);
        }
        this.pendingResolutions = restoredResolutions;
    }

    private async writeCache(
        pendingModules: Map<string, PendingModule>,
        pendingResolutions: Map<string, RuntimeBundleResolutionEntry>,
    ): Promise<void> {
        const contentByPath = new Map<string, { source: Buffer; codeCache: Buffer }>();
        const entries = new Map<string, RuntimeBundleCacheEntry>();

        for (const [filePath, entry] of this.cacheModules) {
            const content = this.getCachedModule(entry);
            if (content) {
                contentByPath.set(filePath, {
                    source: Buffer.from(content.source),
                    codeCache: Buffer.from(content.codeCache),
                });
                entries.set(filePath, { ...entry });
            }
        }
        for (const [filePath, value] of pendingModules) {
            contentByPath.set(filePath, { source: value.source, codeCache: value.codeCache });
            entries.set(filePath, {
                offset: 0,
                length: value.source.length,
                codeCacheOffset: value.source.length,
                codeCacheLength: value.codeCache.length,
                mtimeMs: value.mtimeMs,
            });
        }

        let offset = 0;
        const modules: Record<string, RuntimeBundleCacheEntry> = {};
        for (const [filePath, entry] of entries) {
            const content = contentByPath.get(filePath)!;
            modules[filePath] = {
                offset,
                length: content.source.length,
                codeCacheOffset: offset + content.source.length,
                codeCacheLength: content.codeCache.length,
                mtimeMs: entry.mtimeMs,
            };
            offset += content.source.length + content.codeCache.length;
        }

        const resolutions = new Map(this.cacheResolutions);
        for (const [key, entry] of pendingResolutions) {
            resolutions.set(key, entry);
        }
        const manifest: CacheManifest = {
            v8CachedDataVersion: V8_CACHED_DATA_VERSION,
            modules,
            resolutions: Object.fromEntries(resolutions),
        };

        const mappingBytes = Buffer.from(JSON.stringify(manifest), 'utf8');
        const header = Buffer.alloc(HEADER_SIZE);
        CACHE_MAGIC.copy(header, 0);
        header.writeUInt32LE(CACHE_VERSION, 8);
        header.writeUInt32LE(mappingBytes.length, 12);

        const tempPath = `${this.cachePath}.${process.pid}.${Date.now()}.tmp`;
        await fs.promises.mkdir(dirname(this.cachePath), { recursive: true });
        const stream = fs.createWriteStream(tempPath, { flags: 'w' });
        try {
            await this.writeStream(stream, [
                header,
                mappingBytes,
                ...Object.keys(modules).flatMap((filePath) => {
                    const content = contentByPath.get(filePath)!;
                    return [content.source, content.codeCache];
                }),
            ]);
            await fs.promises.rename(tempPath, this.cachePath);
        } catch (error) {
            stream.destroy();
            await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
            throw error;
        }

        this.cacheModules = new Map(Object.entries(modules));
        this.cacheResolutions = resolutions;
        this.cacheContentOffset = HEADER_SIZE + mappingBytes.length;
        this.cacheBytes = Buffer.concat([
            header,
            mappingBytes,
            ...Object.keys(modules).flatMap((filePath) => {
                const content = contentByPath.get(filePath)!;
                return [content.source, content.codeCache];
            }),
        ], HEADER_SIZE + mappingBytes.length + offset);
    }

    private async writeStream(stream: fs.WriteStream, chunks: Buffer[]): Promise<void> {
        await new Promise<void>((resolvePromise, rejectPromise) => {
            let index = 0;
            let settled = false;

            const cleanup = (): void => {
                stream.removeListener('error', onError);
                stream.removeListener('finish', onFinish);
                stream.removeListener('drain', onDrain);
            };
            const resolveOnce = (): void => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                resolvePromise();
            };
            const rejectOnce = (error: Error): void => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                rejectPromise(error);
            };
            const onError = (error: Error): void => rejectOnce(error);
            const onFinish = (): void => resolveOnce();
            const writeNext = (): void => {
                if (settled) {
                    return;
                }
                try {
                    while (index < chunks.length && stream.write(chunks[index]!)) {
                        index += 1;
                    }
                    if (index < chunks.length) {
                        index += 1;
                        stream.once('drain', onDrain);
                    } else {
                        stream.end();
                    }
                } catch (error) {
                    rejectOnce(error as Error);
                }
            };
            const onDrain = (): void => writeNext();

            stream.once('error', onError);
            stream.once('finish', onFinish);
            writeNext();
        });
    }
}

function isCacheEnabled(value: string | undefined): boolean {
    if (value === undefined) {
        return true;
    }
    return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
}

function getDefaultCachePath(): string {
    const configuredFile = process.env[CACHE_FILE_ENV]?.trim();
    if (configuredFile) {
        return resolve(process.cwd(), configuredFile);
    }

    const configuredScope = process.env[CACHE_SCOPE_ENV]?.trim().toLowerCase();
    const isScene = configuredScope === 'scene' || (configuredScope !== 'host' && isSceneProcess());
    const baseName = isScene ? '.runtime-bundle-cache.scene' : '.runtime-bundle-cache';
    return resolve(process.cwd(), `${baseName}-[${getRuntimeCacheVersion()}]`);
}

function isSceneProcess(): boolean {
    return process.argv.some((argument) => /[\\/]scene-process[\\/]main\.(?:c|m)?js$/.test(argument));
}

function getRuntimeCacheVersion(): string {
    const pinkVersion = process.env[PINK_VERSION_ENV]?.trim()
        || readNearestVersion(__dirname, 'product.json', 'pinkVersion')
        || readNearestVersion(process.cwd(), 'product.json', 'pinkVersion')
        || 'unknown';
    const cocosCliPath = getArgumentValue('--cocos-path', '--enginePath');
    const cocosCliVersion = process.env[COCOS_CLI_VERSION_ENV]?.trim()
        || (cocosCliPath ? readNearestVersion(cocosCliPath, 'package.json', 'version') : undefined)
        || 'unknown';
    return `${sanitizeVersion(pinkVersion)}+${sanitizeVersion(cocosCliVersion)}`;
}

function getArgumentValue(...names: string[]): string | undefined {
    for (let index = 0; index < process.argv.length; index++) {
        const argument = process.argv[index];
        for (const name of names) {
            if (argument === name) {
                return process.argv[index + 1];
            }
            if (argument.startsWith(`${name}=`)) {
                return argument.slice(name.length + 1);
            }
        }
    }
    return undefined;
}

function readNearestVersion(startDirectory: string, fileName: string, property: string): string | undefined {
    let directory = resolve(startDirectory);
    while (true) {
        try {
            const filePath = join(directory, fileName);
            const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
            const version = value[property];
            if (typeof version === 'string' && version.trim()) {
                return version.trim();
            }
        } catch {
            // Continue searching parent directories when the file is absent or invalid.
        }

        const parent = dirname(directory);
        if (parent === directory) {
            return undefined;
        }
        directory = parent;
    }
}

function sanitizeVersion(version: string): string {
    return version.replace(/[^A-Za-z0-9._-]/g, '_');
}

/*
```mermaid
sequenceDiagram
    participant Runtime as RuntimeBundler
    participant Cache as 当前版本 cache
    participant FS as 文件系统
    participant Trash as 系统回收站
    Runtime->>Cache: 同步读取当前版本 cache
    Runtime-->>FS: setImmediate 扫描旧版本 cache
    FS-->>Runtime: 返回旧 cache 文件
    Runtime->>Trash: 异步移入回收站
```
*/
function scheduleStaleCacheCleanup(cachePath: string, moveToTrash: (filePath: string) => Promise<void>): void {
    setImmediate(() => {
        void cleanupStaleCacheFiles(cachePath, moveToTrash).catch(() => undefined);
    });
}

async function cleanupStaleCacheFiles(cachePath: string, moveToTrash: (filePath: string) => Promise<void>): Promise<void> {
    const currentName = basename(cachePath);
    const baseName = currentName.split('-[', 1)[0];
    let entries: fs.Dirent[];
    try {
        entries = await fs.promises.readdir(dirname(cachePath), { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        if (!entry.isFile() || entry.name === currentName || !isStaleCacheName(entry.name, baseName)) {
            continue;
        }
        await moveToTrash(join(dirname(cachePath), entry.name)).catch(() => undefined);
    }
}

function isStaleCacheName(fileName: string, baseName: string): boolean {
    return fileName === baseName || (fileName.startsWith(`${baseName}-[`) && fileName.endsWith(']'));
}

async function moveCacheFileToTrash(filePath: string): Promise<void> {
    const electronTrash = getElectronTrashItem();
    if (electronTrash) {
        await electronTrash(filePath);
        return;
    }

    if (process.platform === 'win32') {
        return;
    }

    const trashDirectory = process.platform === 'darwin'
        ? join(os.homedir(), '.Trash')
        : join(os.homedir(), '.local', 'share', 'Trash', 'files');
    await fs.promises.mkdir(trashDirectory, { recursive: true });
    await fs.promises.rename(filePath, await getUniqueTrashPath(trashDirectory, basename(filePath)));
}

function getElectronTrashItem(): ((filePath: string) => Promise<void>) | undefined {
    try {
        const electron = nodeRequire('electron') as { shell?: { trashItem?: (filePath: string) => Promise<void> } };
        return electron.shell?.trashItem;
    } catch {
        return undefined;
    }
}

async function getUniqueTrashPath(trashDirectory: string, fileName: string): Promise<string> {
    const extension = extname(fileName);
    const stem = basename(fileName, extension);
    for (let index = 0; ; index++) {
        const candidate = join(trashDirectory, index === 0 ? fileName : `${stem}-${index}${extension}`);
        try {
            await fs.promises.access(candidate);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return candidate;
            }
            throw error;
        }
    }
}

function isCacheableModulePath(filePath: string): boolean {
    const normalized = filePath.replaceAll('\\', '/');
    if (normalized.startsWith('node:') || builtinModules.has(normalized)) {
        return false;
    }
    const moduleName = normalized.startsWith('node:') ? normalized.slice('node:'.length) : normalized;
    if (builtinModules.has(moduleName)) {
        return false;
    }
    if (!normalized.startsWith('/') && !/^[A-Za-z]:\//.test(normalized)) {
        return false;
    }
    const extension = extname(normalized).toLowerCase();
    // Module.load is also used for extensionless CommonJS files and JSON
    // modules. ESM (.mjs) and native addons (.node) bypass this source loader
    // and must continue through Node's normal loading path.
    if (extension === '.json' || extension === '.cjs') {
        return true;
    }
    if (extension !== '' && extension !== '.js') {
        return false;
    }
    return !isModulePackagePath(resolve(filePath));
}

function isModulePackagePath(filePath: string): boolean {
    let directory = dirname(filePath);
    while (true) {
        const packageType = packageTypeForDirectory(directory);
        if (packageType) {
            return packageType === 'module';
        }
        const parent = dirname(directory);
        if (parent === directory) {
            return false;
        }
        directory = parent;
    }
}

function packageTypeForDirectory(directory: string): 'commonjs' | 'module' | undefined {
    if (packageTypeCache.has(directory)) {
        return packageTypeCache.get(directory);
    }

    try {
        const packageJson = JSON.parse(fs.readFileSync(resolve(directory, 'package.json'), 'utf8')) as { type?: unknown };
        const packageType = packageJson.type === 'module' ? 'module' : 'commonjs';
        packageTypeCache.set(directory, packageType);
        return packageType;
    } catch {
        packageTypeCache.set(directory, undefined);
        return undefined;
    }
}

function isCacheableResolvedPath(filePath: string): boolean {
    return isCacheableModulePath(resolve(filePath));
}

function getResolutionKey(
    request: string,
    parent: RuntimeModule | undefined,
    isMain: boolean | undefined,
    options: unknown,
): string | undefined {
    if (!parent?.filename || options !== undefined || isBuiltinRequest(request)) {
        return undefined;
    }
    return JSON.stringify({ parent: resolve(parent.filename), request, isMain: Boolean(isMain) });
}

function isBuiltinRequest(request: string): boolean {
    const moduleName = request.startsWith('node:') ? request.slice('node:'.length) : request;
    return request.startsWith('node:') || builtinModules.has(moduleName);
}

function compileCommonJs(source: string, filename: string, cachedData?: Buffer): CompiledModule {
    return vm.compileFunction(source, COMMONJS_PARAMETERS, {
        filename,
        cachedData,
        produceCachedData: cachedData === undefined,
    }) as unknown as CompiledModule;
}

function createModuleRequire(module: RuntimeModule): NodeRequire {
    const localRequire = module.require.bind(module) as NodeRequire;
    localRequire.resolve = ((request: string, options?: { paths?: string[] }): string => (
        nodeModule._resolveFilename(request, module, false, options)
    )) as NodeRequire['resolve'];
    localRequire.cache = nodeRequire.cache;
    localRequire.extensions = nodeRequire.extensions;
    localRequire.main = nodeRequire.main;
    return localRequire;
}

function getModuleExtension(filePath: string): string {
    return extname(filePath).toLowerCase();
}

function stripJsonBom(content: string): string {
    return content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
}

function stripShebang(content: string): string {
    return content.replace(/^#![^\r\n]*(?:\r\n|\n|\r|$)/, (line) => line.replace(/[^\r\n]/g, ' '));
}

function isCacheManifest(value: unknown, contentLength: number): value is CacheManifest {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const manifest = value as Partial<CacheManifest>;
    if (manifest.v8CachedDataVersion !== V8_CACHED_DATA_VERSION
        || !manifest.modules
        || !manifest.resolutions
        || typeof manifest.modules !== 'object'
        || typeof manifest.resolutions !== 'object') {
        return false;
    }
    return Object.values(manifest.modules).every((entry) => isCacheEntry(entry, contentLength))
        && Object.values(manifest.resolutions).every(isResolutionEntry);
}

function isCacheEntry(value: unknown, contentLength: number): value is RuntimeBundleCacheEntry {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const entry = value as Partial<RuntimeBundleCacheEntry>;
    const { offset, length, codeCacheOffset, codeCacheLength, mtimeMs } = entry;
    return typeof offset === 'number'
        && typeof length === 'number'
        && typeof codeCacheOffset === 'number'
        && typeof codeCacheLength === 'number'
        && Number.isSafeInteger(offset)
        && Number.isSafeInteger(length)
        && Number.isSafeInteger(codeCacheOffset)
        && Number.isSafeInteger(codeCacheLength)
        && offset >= 0
        && length >= 0
        && codeCacheOffset >= 0
        && codeCacheLength >= 0
        && offset + length <= contentLength
        && codeCacheOffset + codeCacheLength <= contentLength
        && typeof mtimeMs === 'number'
        && Number.isFinite(mtimeMs);
}

function isResolutionEntry(value: unknown): value is RuntimeBundleResolutionEntry {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const entry = value as Partial<RuntimeBundleResolutionEntry>;
    return typeof entry.filename === 'string'
        && typeof entry.mtimeMs === 'number'
        && Number.isFinite(entry.mtimeMs);
}

export const runtimeBundler = new RuntimeBundler();
if (!globalState[GLOBAL_INSTALL_KEY]) {
    globalState[GLOBAL_INSTALL_KEY] = true;
    runtimeBundler.install();
}
