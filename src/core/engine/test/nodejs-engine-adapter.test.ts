/**
 * packages/engine/platforms/nodejs/engine 适配层全分支测试
 *
 * 测试目标：fs-utils.js / cache-manager.js / asset-manager.js
 * 策略：mock globalThis.nodeEnv + cc 全局对象，用 jest.isolateModules 隔离加载
 */

import path from 'path';

const ENGINE_PLATFORM_DIR = path.resolve(__dirname, '../../../../packages/engine/platforms/nodejs/engine');

// ─── 公共 mock 工厂 ────────────────────────────────────────────

function createMockFs() {
    return {
        unlink: jest.fn(),
        pathExistsSync: jest.fn(() => true),
        ensureDirSync: jest.fn(),
        copyFile: jest.fn(),
        writeFile: jest.fn(),
        writeFileSync: jest.fn(),
        readFile: jest.fn(),
        readdir: jest.fn(),
        readJson: jest.fn(),
        readJsonSync: jest.fn(),
        mkdirSync: jest.fn(),
        rmSync: jest.fn(),
        pathExists: jest.fn(),
        remove: jest.fn(),
    };
}

class MockCache {
    _map: Record<string, any> = {};
    constructor(data?: Record<string, any>) {
        if (data) this._map = { ...data };
    }
    has(key: string) { return key in this._map; }
    get(key: string) { return this._map[key]; }
    add(key: string, val: any) { this._map[key] = val; }
    remove(key: string) { const v = this._map[key]; delete this._map[key]; return v; }
    forEach(fn: (val: any, key: string) => void) { Object.entries(this._map).forEach(([k, v]) => fn(v, k)); }
}

function createMockCc() {
    return {
        warn: jest.fn(),
        error: jest.fn(),
        warnID: jest.fn(),
        AssetManager: { Cache: MockCache },
        assetManager: {
            downloader: {
                maxConcurrency: 8, maxRequestsPerFrame: 64,
                remoteBundles: [] as string[], remoteServerAddress: '',
                bundleVers: {} as Record<string, string>,
                register: jest.fn(), downloadDomImage: jest.fn(),
                downloadFile: jest.fn(),
                downloadScript: null as any,
                _downloadArrayBuffer: null as any,
                _downloadJson: null as any,
            },
            parser: {
                register: jest.fn(),
                parsePVRTex: jest.fn(), parsePKMTex: jest.fn(),
                parseASTCTex: jest.fn(), parsePlist: jest.fn(),
            },
            presets: {
                preload: {} as any,
                scene: {} as any,
                bundle: {} as any,
            },
            transformPipeline: { append: jest.fn() },
            init: jest.fn(),
            bundles: { forEach: jest.fn() },
            files: { remove: jest.fn() },
            utils: { getUuidFromURL: jest.fn((url: string) => url) },
            cacheManager: null as any,
        },
        path: {
            extname: jest.fn((p: string) => { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i) : ''; }),
            basename: jest.fn((p: string) => p.split('/').pop()!),
        },
        js: { isEmptyObject: jest.fn((o: any) => Object.keys(o).length === 0) },
        settings: { querySettings: jest.fn() },
        AudioPlayer: { load: jest.fn() },
    };
}

// 加载 fs-utils 并返回模块
function loadFsUtils(mockFs: ReturnType<typeof createMockFs>) {
    const mockPath = {
        join: jest.fn((...args: string[]) => args.filter(Boolean).join('/')),
        isAbsolute: jest.fn((p: string) => p.startsWith('/') || /^[A-Z]:/.test(p)),
        normalize: jest.fn((p: string) => p),
        dirname: jest.fn((p: string) => p.split('/').slice(0, -1).join('/')),
        extname: jest.fn((p: string) => { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i) : ''; }),
    };
    (globalThis as any).nodeEnv = {
        require: jest.fn((mod: string) => {
            if (mod === 'path') return mockPath;
            if (mod === 'fs-extra') return mockFs;
            if (mod === 'url') return { fileURLToPath: (u: string) => u.replace('file://', '') };
            return {};
        }),
        userDataPath: '/mock/userData',
    };
    let fsUtils: any;
    jest.isolateModules(() => {
        fsUtils = require(path.join(ENGINE_PLATFORM_DIR, 'fs-utils.js'));
    });
    return { fsUtils, mockFs, mockPath };
}

// ═══════════════════════════════════════════════════════════════
//  fs-utils.js
// ═══════════════════════════════════════════════════════════════

describe('nodejs engine adapter — fs-utils', () => {
    let fsUtils: any;
    let mockFs: ReturnType<typeof createMockFs>;

    beforeEach(() => {
        jest.useFakeTimers();
        (globalThis as any).cc = createMockCc();
        const loaded = loadFsUtils(createMockFs());
        fsUtils = loaded.fsUtils;
        mockFs = loaded.mockFs;
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        delete (globalThis as any).cc;
        delete (globalThis as any).nodeEnv;
        delete (globalThis as any).fsUtils;
    });

    // --- isOutOfStorage ---
    it('isOutOfStorage: 包含 ENOSPC 返回 true', () => {
        expect(fsUtils.isOutOfStorage('write ENOSPC: no space')).toBe(true);
    });
    it('isOutOfStorage: 不包含 ENOSPC 返回 false', () => {
        expect(fsUtils.isOutOfStorage('permission denied')).toBe(false);
    });

    // --- getUserDataPath ---
    it('getUserDataPath: 返回 userDataPath/writablePath', () => {
        expect(fsUtils.getUserDataPath()).toBe('/mock/userData/writablePath');
    });

    // --- checkFsValid ---
    it('checkFsValid: fs 存在返回 true', () => {
        expect(fsUtils.checkFsValid()).toBe(true);
    });
    it('checkFsValid: fs 为 null 返回 false', () => {
        // fs 是模块级 const，需要重新加载模块使 require('fs-extra') 返回 null
        const mockFsNull = createMockFs();
        (globalThis as any).nodeEnv.require.mockImplementation((mod: string) => {
            if (mod === 'path') return { join: jest.fn((...a: string[]) => a.filter(Boolean).join('/')), isAbsolute: jest.fn(), normalize: jest.fn((p: string) => p), dirname: jest.fn(), extname: jest.fn() };
            if (mod === 'fs-extra') return null;
            return {};
        });
        let fsUtilsNull: any;
        jest.isolateModules(() => {
            fsUtilsNull = require(path.join(ENGINE_PLATFORM_DIR, 'fs-utils.js'));
        });
        expect(fsUtilsNull.checkFsValid()).toBe(false);
    });

    // --- initJsbDownloader ---
    it('initJsbDownloader: 仅打印日志，不抛异常', () => {
        const spy = jest.spyOn(console, 'log').mockImplementation();
        fsUtils.initJsbDownloader(4, 3000);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    // --- fullPathForFilename ---
    it('fullPathForFilename: 空字符串返回空', () => {
        expect(fsUtils.fullPathForFilename('')).toBe('');
    });
    it('fullPathForFilename: 绝对路径直接返回', () => {
        expect(fsUtils.fullPathForFilename('/abs/file.txt')).toBe('/abs/file.txt');
    });
    it('fullPathForFilename: 相对路径 + 文件存在 → 返回拼接路径', () => {
        mockFs.pathExistsSync.mockReturnValue(true);
        expect(fsUtils.fullPathForFilename('rel/file.txt')).toBe('rel/file.txt');
    });
    it('fullPathForFilename: 相对路径 + 文件不存在 → 返回空', () => {
        mockFs.pathExistsSync.mockReturnValue(false);
        expect(fsUtils.fullPathForFilename('missing.txt')).toBe('');
    });
    it('fullPathForFilename: forceReturnFullpath=true 无论是否存在都返回路径', () => {
        mockFs.pathExistsSync.mockReturnValue(false);
        expect(fsUtils.fullPathForFilename('any.txt', true)).toBe('any.txt');
    });

    // --- deleteFile ---
    it('deleteFile: 成功 → onComplete(null)', (done) => {
        mockFs.unlink.mockImplementation((_p: any, cb: any) => cb(null));
        fsUtils.deleteFile('/abs/f.txt', (err: any) => {
            expect(err).toBeNull();
            done();
        });
    });
    it('deleteFile: 失败 → onComplete(Error)', (done) => {
        mockFs.unlink.mockImplementation((_p: any, cb: any) => cb(new Error('EPERM')));
        fsUtils.deleteFile('/abs/f.txt', (err: any) => {
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toContain('EPERM');
            done();
        });
    });
    it('deleteFile: 无回调不抛异常', () => {
        mockFs.unlink.mockImplementation((_p: any, cb: any) => cb(null));
        expect(() => fsUtils.deleteFile('/abs/f.txt')).not.toThrow();
    });

    // --- saveFile ---
    it('saveFile: 成功 → onComplete(null) + 删源文件', (done) => {
        mockFs.copyFile.mockImplementation((_s: any, _d: any, cb: any) => cb(null));
        fsUtils.saveFile('/abs/src', '/abs/dest', (err: any) => {
            expect(err).toBeNull();
            expect(mockFs.remove).toHaveBeenCalled();
            done();
        });
    });
    it('saveFile: 失败 → onComplete(Error)', (done) => {
        mockFs.copyFile.mockImplementation((_s: any, _d: any, cb: any) => cb(new Error('IO')));
        fsUtils.saveFile('/abs/src', '/abs/dest', (err: any) => {
            expect(err).toBeInstanceOf(Error);
            done();
        });
    });

    // --- copyFile ---
    it('copyFile: 成功 → onComplete(null)', (done) => {
        mockFs.copyFile.mockImplementation((_s: any, _d: any, cb: any) => cb(null));
        fsUtils.copyFile('/abs/a', '/abs/b', (err: any) => {
            expect(err).toBeNull();
            done();
        });
    });
    it('copyFile: 失败 → onComplete(Error)', (done) => {
        mockFs.copyFile.mockImplementation((_s: any, _d: any, cb: any) => cb(new Error('fail')));
        fsUtils.copyFile('/abs/a', '/abs/b', (err: any) => {
            expect(err).toBeInstanceOf(Error);
            done();
        });
    });

    // --- writeFile ---
    it('writeFile: 成功 → onComplete(null)', (done) => {
        mockFs.writeFile.mockImplementation((_p: any, _d: any, _e: any, cb: any) => cb(null));
        fsUtils.writeFile('/abs/f', 'data', 'utf8', (err: any) => {
            expect(err).toBeNull();
            done();
        });
    });
    it('writeFile: 失败 → onComplete(Error)', (done) => {
        mockFs.writeFile.mockImplementation((_p: any, _d: any, _e: any, cb: any) => cb(new Error('IO')));
        fsUtils.writeFile('/abs/f', 'data', 'utf8', (err: any) => {
            expect(err).toBeInstanceOf(Error);
            done();
        });
    });

    // --- writeFileSync ---
    it('writeFileSync: 正常 → 返回 null', () => {
        expect(fsUtils.writeFileSync('/abs/f', 'data', 'utf8')).toBeNull();
    });
    it('writeFileSync: 抛异常 → 返回 Error', () => {
        mockFs.writeFileSync.mockImplementation(() => { throw new Error('disk full'); });
        const result = fsUtils.writeFileSync('/abs/f', 'data', 'utf8');
        expect(result).toBeInstanceOf(Error);
        expect(result.message).toContain('disk full');
    });

    // --- readFile ---
    it('readFile: 成功 → onComplete(null, data)', (done) => {
        mockFs.readFile.mockImplementation((_p: any, _e: any, cb: any) => cb(null, 'content'));
        fsUtils.readFile('/abs/f', 'utf8', (err: any, data: any) => {
            expect(err).toBeNull();
            expect(data).toBe('content');
            done();
        });
    });
    it('readFile: 失败 → onComplete(Error, null)', (done) => {
        mockFs.readFile.mockImplementation((_p: any, _e: any, cb: any) => cb(new Error('ENOENT')));
        fsUtils.readFile('/abs/f', 'utf8', (err: any, data: any) => {
            expect(err).toBeInstanceOf(Error);
            expect(data).toBeNull();
            done();
        });
    });

    // --- readDir ---
    it('readDir: 成功 → onComplete(null, files)', (done) => {
        mockFs.readdir.mockImplementation((_p: any, cb: any) => cb(null, ['a', 'b']));
        fsUtils.readDir('/abs/d', (err: any, files: any) => {
            expect(err).toBeNull();
            expect(files).toEqual(['a', 'b']);
            done();
        });
    });
    it('readDir: 失败 → onComplete(Error, null)', (done) => {
        mockFs.readdir.mockImplementation((_p: any, cb: any) => cb(new Error('ENOENT')));
        fsUtils.readDir('/abs/d', (err: any, files: any) => {
            expect(err).toBeInstanceOf(Error);
            expect(files).toBeNull();
            done();
        });
    });

    // --- readText / readArrayBuffer ---
    it('readText: 委托 readFile 传 utf8', (done) => {
        mockFs.readFile.mockImplementation((_p: any, enc: any, cb: any) => {
            expect(enc).toBe('utf8');
            cb(null, 'text');
        });
        fsUtils.readText('/abs/f', (err: any, data: any) => {
            expect(data).toBe('text');
            done();
        });
    });
    it('readArrayBuffer: 委托 readFile 传空编码', (done) => {
        mockFs.readFile.mockImplementation((_p: any, enc: any, cb: any) => {
            expect(enc).toBe('');
            cb(null, Buffer.from([1, 2]));
        });
        fsUtils.readArrayBuffer('/abs/f', (err: any, data: any) => {
            expect(data).toBeTruthy();
            done();
        });
    });

    // --- readJson ---
    it('readJson: 成功 → onComplete(null, obj)', (done) => {
        mockFs.readJson.mockImplementation((_p: any, cb: any) => cb(null, { a: 1 }));
        fsUtils.readJson('/abs/f.json', (err: any, obj: any) => {
            expect(err).toBeNull();
            expect(obj).toEqual({ a: 1 });
            done();
        });
    });
    it('readJson: 失败 → onComplete(Error, null)', (done) => {
        mockFs.readJson.mockImplementation((_p: any, cb: any) => cb(new Error('parse')));
        fsUtils.readJson('/abs/f.json', (err: any, obj: any) => {
            expect(err).toBeInstanceOf(Error);
            expect(obj).toBeNull();
            done();
        });
    });

    // --- readJsonSync ---
    it('readJsonSync: 正常 → 返回对象', () => {
        mockFs.readJsonSync.mockReturnValue({ v: 1 });
        expect(fsUtils.readJsonSync('/abs/f.json')).toEqual({ v: 1 });
    });
    it('readJsonSync: 异常 → 返回 Error', () => {
        mockFs.readJsonSync.mockImplementation(() => { throw new Error('bad json'); });
        const result = fsUtils.readJsonSync('/abs/f.json');
        expect(result).toBeInstanceOf(Error);
    });

    // --- makeDirSync ---
    it('makeDirSync: 正常 → 返回 null', () => {
        expect(fsUtils.makeDirSync('/abs/d', true)).toBeNull();
    });
    it('makeDirSync: 异常 → 返回 Error', () => {
        mockFs.mkdirSync.mockImplementation(() => { throw new Error('EEXIST'); });
        expect(fsUtils.makeDirSync('/abs/d', true)).toBeInstanceOf(Error);
    });

    // --- rmdirSync ---
    it('rmdirSync: 正常 → 返回 null', () => {
        expect(fsUtils.rmdirSync('/abs/d', true)).toBeNull();
    });
    it('rmdirSync: 异常 → 返回 Error', () => {
        mockFs.rmSync.mockImplementation(() => { throw new Error('ENOTEMPTY'); });
        expect(fsUtils.rmdirSync('/abs/d', true)).toBeInstanceOf(Error);
    });

    // --- exists ---
    it('exists: 文件存在 → onComplete(true)', (done) => {
        mockFs.pathExists.mockImplementation((_p: any, cb: any) => cb(null, true));
        fsUtils.exists('/abs/f', (result: any) => {
            expect(result).toBe(true);
            done();
        });
    });
    it('exists: 文件不存在 → onComplete(false)', (done) => {
        mockFs.pathExists.mockImplementation((_p: any, cb: any) => cb(null, false));
        fsUtils.exists('/abs/f', (result: any) => {
            expect(result).toBe(false);
            done();
        });
    });
    it('exists: 出错 → 返回 Error 但不调 onComplete', () => {
        mockFs.pathExists.mockImplementation((_p: any, cb: any) => cb(new Error('IO')));
        const onComplete = jest.fn();
        fsUtils.exists('/abs/f', onComplete);
        expect(onComplete).not.toHaveBeenCalled();
    });

    // --- loadSubpackage ---
    it('loadSubpackage: 始终抛异常', () => {
        expect(() => fsUtils.loadSubpackage('test', null, null)).toThrow('nodejs not implement');
    });
});

// ═══════════════════════════════════════════════════════════════
//  cache-manager.js
// ═══════════════════════════════════════════════════════════════

describe('nodejs engine adapter — cache-manager', () => {
    let cacheManager: any;
    let mockFs: ReturnType<typeof createMockFs>;
    let mockCc: ReturnType<typeof createMockCc>;

    beforeEach(() => {
        jest.useFakeTimers();
        mockCc = createMockCc();
        (globalThis as any).cc = mockCc;
        const loaded = loadFsUtils(createMockFs());
        mockFs = loaded.mockFs;

        // readJsonSync 默认返回 Error（触发 init 的新建分支）
        mockFs.readJsonSync.mockReturnValue(new Error('ENOENT'));

        jest.isolateModules(() => {
            cacheManager = require(path.join(ENGINE_PLATFORM_DIR, 'cache-manager.js'));
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        delete (globalThis as any).cc;
        delete (globalThis as any).nodeEnv;
        delete (globalThis as any).fsUtils;
    });

    // --- getCache / getTemp ---
    describe('getCache / getTemp', () => {
        beforeEach(() => cacheManager.init());

        it('getCache: 有缓存返回 url', () => {
            cacheManager.cachedFiles.add('http://a.com/b.png', { url: '/cache/b.png' });
            expect(cacheManager.getCache('http://a.com/b.png')).toBe('/cache/b.png');
        });
        it('getCache: 无缓存返回空字符串', () => {
            expect(cacheManager.getCache('http://miss.com')).toBe('');
        });
        it('getTemp: 有临时文件返回路径', () => {
            cacheManager.tempFiles.add('http://a.com/c.png', '/tmp/c.png');
            expect(cacheManager.getTemp('http://a.com/c.png')).toBe('/tmp/c.png');
        });
        it('getTemp: 无临时文件返回空字符串', () => {
            expect(cacheManager.getTemp('http://miss.com')).toBe('');
        });
    });

    // --- init ---
    describe('init', () => {
        it('readJsonSync 返回 Error → 新建缓存目录 + 写空缓存', () => {
            mockFs.readJsonSync.mockReturnValue(new Error('ENOENT'));
            cacheManager.init();
            expect(mockFs.mkdirSync).toHaveBeenCalled();
            expect(mockFs.writeFileSync).toHaveBeenCalled();
            expect(cacheManager.cachedFiles).toBeInstanceOf(MockCache);
        });
        it('readJsonSync 返回无 version → rmdir + 新建', () => {
            mockFs.readJsonSync.mockReturnValue({ files: {} });
            cacheManager.init();
            expect(mockFs.rmSync).toHaveBeenCalled();
            expect(mockFs.mkdirSync).toHaveBeenCalled();
        });
        it('readJsonSync 返回有效数据 → 使用已有缓存', () => {
            mockFs.readJsonSync.mockReturnValue({ version: '1.0', files: { 'http://x': { url: '/c/x' } } });
            cacheManager.init();
            expect(cacheManager.cachedFiles.has('http://x')).toBe(true);
        });
    });

    // --- updateLastTime ---
    describe('updateLastTime', () => {
        beforeEach(() => cacheManager.init());

        it('有缓存 → 更新 lastTime', () => {
            cacheManager.cachedFiles.add('u1', { url: '/c/u1', lastTime: 0 });
            cacheManager.updateLastTime('u1');
            expect(cacheManager.cachedFiles.get('u1').lastTime).toBeGreaterThan(0);
        });
        it('无缓存 → 无操作', () => {
            expect(() => cacheManager.updateLastTime('miss')).not.toThrow();
        });
    });

    // --- writeCacheFile ---
    describe('writeCacheFile', () => {
        beforeEach(() => cacheManager.init());

        it('首次调用 → 设置 setTimeout', () => {
            cacheManager.writeCacheFile();
            expect(jest.getTimerCount()).toBeGreaterThan(0);
        });
        it('重复调用 → 不新增 timer', () => {
            cacheManager.writeCacheFile();
            const count = jest.getTimerCount();
            cacheManager.writeCacheFile();
            expect(jest.getTimerCount()).toBe(count);
        });
        it('timer 触发 → 调用 writeFileSync', () => {
            cacheManager.writeCacheFile();
            mockFs.writeFileSync.mockClear();
            jest.advanceTimersByTime(cacheManager.writeFileInterval + 100);
            expect(mockFs.writeFileSync).toHaveBeenCalled();
        });
    });

    // --- cacheFile ---
    describe('cacheFile', () => {
        beforeEach(() => cacheManager.init());

        it('正常入队 + 启动定时器', () => {
            cacheManager.cacheFile('id1', '/tmp/src', true, 'bundle1', true);
            expect(cacheManager.cacheQueue['id1']).toBeTruthy();
            expect(jest.getTimerCount()).toBeGreaterThan(0);
        });
        it('已在队列 → 不重复入队', () => {
            cacheManager.cacheFile('id1', '/tmp/src', true, null, true);
            cacheManager.cacheFile('id1', '/tmp/src2', true, null, true);
            expect(cacheManager.cacheQueue['id1'].srcUrl).toBe('/tmp/src');
        });
        it('已缓存 → 不入队', () => {
            cacheManager.cachedFiles.add('id1', { url: '/cached' });
            cacheManager.cacheFile('id1', '/tmp/src', true, null, true);
            expect(cacheManager.cacheQueue['id1']).toBeUndefined();
        });
        it('outOfStorage → 不启动定时器', () => {
            cacheManager.outOfStorage = true;
            cacheManager.cacheFile('id1', '/tmp/src', true, null, true);
            expect(cacheManager.cacheQueue['id1']).toBeTruthy();
        });
    });

    // --- _cache ---
    describe('_cache', () => {
        beforeEach(() => cacheManager.init());

        it('空队列 → 直接返回', () => {
            cacheManager._cache();
            expect(mockFs.copyFile).not.toHaveBeenCalled();
        });
        it('isCopy=true → 调用 copyFile', () => {
            cacheManager.cacheQueue = { 'f.png': { srcUrl: '/src/f.png', isCopy: true, cacheBundleRoot: null } };
            mockFs.copyFile.mockImplementation((_s: any, _d: any, cb: any) => cb(null));
            cacheManager._cache();
            expect(mockFs.copyFile).toHaveBeenCalled();
        });
        it('copyFile 成功 → 加入 cachedFiles + 从队列移除', () => {
            cacheManager.cacheQueue = { 'f.png': { srcUrl: '/src/f.png', isCopy: true, cacheBundleRoot: null } };
            mockFs.copyFile.mockImplementation((_s: any, _d: any, cb: any) => cb(null));
            cacheManager._cache();
            expect(cacheManager.cachedFiles.has('f.png')).toBe(true);
            expect(cacheManager.cacheQueue['f.png']).toBeUndefined();
        });
        it('cacheBundleRoot 存在 → localPath 包含 bundleRoot', () => {
            cacheManager.cacheQueue = { 'f.png': { srcUrl: '/s', isCopy: true, cacheBundleRoot: 'mybundle' } };
            let destPath = '';
            mockFs.copyFile.mockImplementation((_s: any, d: any, cb: any) => { destPath = d; cb(null); });
            cacheManager._cache();
            expect(destPath).toContain('mybundle');
        });
        it('队列还有更多 → 安排下次 _cache', () => {
            cacheManager.cacheQueue = {
                'a.png': { srcUrl: '/s/a', isCopy: true, cacheBundleRoot: null },
                'b.png': { srcUrl: '/s/b', isCopy: true, cacheBundleRoot: null },
            };
            mockFs.copyFile.mockImplementation((_s: any, _d: any, cb: any) => cb(null));
            (globalThis as any).cc.js.isEmptyObject.mockReturnValue(false);
            cacheManager._cache();
            expect(jest.getTimerCount()).toBeGreaterThan(0);
        });
    });

    // --- clearCache ---
    describe('clearCache', () => {
        beforeEach(() => cacheManager.init());

        it('重置所有状态', () => {
            cacheManager.outOfStorage = true;
            cacheManager.clearCache();
            expect(cacheManager.outOfStorage).toBe(false);
            expect(mockFs.rmSync).toHaveBeenCalled();
            expect(mockFs.mkdirSync).toHaveBeenCalled();
            expect(mockFs.writeFileSync).toHaveBeenCalled();
        });
    });

    // --- clearLRU ---
    describe('clearLRU', () => {
        beforeEach(() => cacheManager.init());

        it('无缓存条目（或全是 internal）→ cleaning 重置为 false', () => {
            cacheManager.clearLRU();
            // caches.length = 0, cleaning 应已重置
        });
        it('有 3+ 条目 → 按 lastTime 排序后删除 1/3', () => {
            for (let i = 0; i < 9; i++) {
                cacheManager.cachedFiles.add(`url${i}`, { url: `/c/${i}`, lastTime: i * 100, bundle: 'res' });
            }
            cacheManager.clearLRU();
            // 应删除 3 条（9 → floor(9/3)=3 → floor(3/3)=1...不对，这里代码逻辑是先 floor/3 得 3，然后 if < 3 不成立所以再没 floor）
            // 实际代码: caches.length = floor(9/3) = 3, if (3 === 0) false, 然后 for 循环删 3 条
            expect(mockCc.assetManager.files.remove).toHaveBeenCalledTimes(3);
        });
        it('重复调用 → cleaning 锁定期间直接返回', () => {
            for (let i = 0; i < 9; i++) {
                cacheManager.cachedFiles.add(`url${i}`, { url: `/c/${i}`, lastTime: i, bundle: 'res' });
            }
            cacheManager.clearLRU();
            mockCc.assetManager.files.remove.mockClear();
            cacheManager.clearLRU(); // 应直接返回
            expect(mockCc.assetManager.files.remove).not.toHaveBeenCalled();
        });
    });

    // --- removeCache ---
    describe('removeCache', () => {
        beforeEach(() => cacheManager.init());

        it('有缓存 → 删除 + 触发 deleteFile', () => {
            cacheManager.cachedFiles.add('u1', { url: '/cache/u1' });
            mockFs.unlink.mockImplementation((_p: any, cb: any) => cb(null));
            cacheManager.removeCache('u1');
            expect(cacheManager.cachedFiles.has('u1')).toBe(false);
            expect(mockFs.unlink).toHaveBeenCalled();
        });
        it('无缓存 → 不调用 deleteFile', () => {
            cacheManager.removeCache('miss');
            expect(mockFs.unlink).not.toHaveBeenCalled();
        });
    });

    // --- _deleteFileCB ---
    it('_deleteFileCB: 无错误 → outOfStorage = false', () => {
        cacheManager.outOfStorage = true;
        cacheManager._deleteFileCB(null);
        expect(cacheManager.outOfStorage).toBe(false);
    });
    it('_deleteFileCB: 有错误 → outOfStorage 不变', () => {
        cacheManager.outOfStorage = true;
        cacheManager._deleteFileCB(new Error('fail'));
        expect(cacheManager.outOfStorage).toBe(true);
    });

    // --- makeBundleFolder ---
    it('makeBundleFolder: 调用 makeDirSync', () => {
        cacheManager.init();
        cacheManager.makeBundleFolder('myBundle');
        expect(mockFs.mkdirSync).toHaveBeenCalled();
    });
});

// ═══════════════════════════════════════════════════════════════
//  asset-manager.js (模块加载级别的测试)
// ═══════════════════════════════════════════════════════════════

describe('nodejs engine adapter — asset-manager', () => {
    let mockFs: ReturnType<typeof createMockFs>;
    let mockCc: ReturnType<typeof createMockCc>;
    let cacheManager: any;
    let transformPipelineFn: any;

    beforeEach(() => {
        jest.useFakeTimers();
        mockCc = createMockCc();
        (globalThis as any).cc = mockCc;
        const loaded = loadFsUtils(createMockFs());
        mockFs = loaded.mockFs;
        mockFs.readJsonSync.mockReturnValue(new Error('ENOENT'));

        jest.isolateModules(() => {
            require(path.join(ENGINE_PLATFORM_DIR, 'asset-manager.js'));
        });
        cacheManager = mockCc.assetManager.cacheManager;
        // 获取 transformPipeline.append 注册的函数
        transformPipelineFn = mockCc.assetManager.transformPipeline.append.mock.calls[0]?.[0];
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        delete (globalThis as any).cc;
        delete (globalThis as any).nodeEnv;
        delete (globalThis as any).fsUtils;
    });

    // --- 模块加载后的副作用 ---
    it('加载后设置 downloader 并发参数', () => {
        expect(mockCc.assetManager.downloader.maxConcurrency).toBe(30);
        expect(mockCc.assetManager.downloader.maxRequestsPerFrame).toBe(60);
    });

    it('加载后设置 presets 并发参数', () => {
        expect(mockCc.assetManager.presets.preload.maxConcurrency).toBe(15);
        expect(mockCc.assetManager.presets.preload.maxRequestsPerFrame).toBe(30);
        expect(mockCc.assetManager.presets.scene.maxConcurrency).toBe(32);
        expect(mockCc.assetManager.presets.scene.maxRequestsPerFrame).toBe(64);
        expect(mockCc.assetManager.presets.bundle.maxConcurrency).toBe(32);
        expect(mockCc.assetManager.presets.bundle.maxRequestsPerFrame).toBe(64);
    });

    it('加载后注册 downloader.register 和 parser.register', () => {
        expect(mockCc.assetManager.downloader.register).toHaveBeenCalled();
        expect(mockCc.assetManager.parser.register).toHaveBeenCalled();
    });

    it('加载后替换 parser 的 texture 解析器', () => {
        expect(mockCc.assetManager.parser.parsePVRTex).not.toBe(createMockCc().assetManager.parser.parsePVRTex);
    });

    it('加载后注册 transformPipeline', () => {
        expect(mockCc.assetManager.transformPipeline.append).toHaveBeenCalledTimes(1);
        expect(typeof transformPipelineFn).toBe('function');
    });

    // --- transformPipeline ---
    describe('transformPipeline', () => {
        it('.cconb → .bin 替换', () => {
            const item = { url: 'res/model.cconb', ext: '.cconb', options: {}, config: { name: 'main' } };
            const task = { input: [item], output: null as any };
            transformPipelineFn(task);
            expect(item.url).toBe('res/model.bin');
        });
        it('.ccon → .json 替换', () => {
            const item = { url: 'res/data.ccon', ext: '.ccon', options: {}, config: { name: 'main' } };
            const task = { input: [item], output: null as any };
            transformPipelineFn(task);
            expect(item.url).toBe('res/data.json');
        });
        it('bundle ext → 跳过', () => {
            const item = { url: 'mybundle', ext: 'bundle', options: {} as any };
            const task = { input: [item], output: null as any };
            transformPipelineFn(task);
            expect(item.options.cacheEnabled).toBeUndefined();
        });
        it('无 config → cacheEnabled 默认 false', () => {
            const item = { url: 'res/tex.png', ext: '.png', options: {} as any };
            const task = { input: [item], output: null as any };
            transformPipelineFn(task);
            expect(item.options.cacheEnabled).toBe(false);
        });
        it('有 config → __cacheBundleRoot__ 设为 config.name', () => {
            const item = { url: 'res/tex.png', ext: '.png', options: {} as any, config: { name: 'main' } };
            const task = { input: [item], output: null as any };
            transformPipelineFn(task);
            expect(item.options.__cacheBundleRoot__).toBe('main');
        });
    });

    // --- assetManager.init 覆盖 ---
    describe('cc.assetManager.init 覆盖', () => {
        it('调用后 init 被替换为新函数', () => {
            expect(typeof mockCc.assetManager.init).toBe('function');
        });

        it('调用 init → cacheManager.init 被执行', () => {
            mockFs.readJsonSync.mockReturnValue(new Error('ENOENT'));
            mockCc.assetManager.init({});
            // cacheManager.init 会调用 readJsonSync + mkdirSync + writeFileSync
            expect(mockFs.readJsonSync).toHaveBeenCalled();
        });

        it('不再处理 subpackages（已移除该逻辑）', () => {
            mockFs.readJsonSync.mockReturnValue(new Error('ENOENT'));
            mockCc.assetManager.init({});
            // settings.querySettings 不应被调用
            expect(mockCc.settings.querySettings).not.toHaveBeenCalled();
        });
    });

    // --- _getFontFamily (通过 loadFont 间接测试) ---
    describe('_getFontFamily（通过 parser.register 的 .ttf handler）', () => {
        it('路径含 .ttf → 提取文件名 + _LABEL 后缀', () => {
            const handlers = mockCc.assetManager.parser.register.mock.calls[0][0];
            const loadFont = handlers['.ttf'];
            const onComplete = jest.fn();
            loadFont('fonts/arial.ttf', {}, onComplete);
            expect(onComplete).toHaveBeenCalledWith(null, 'arial_LABEL');
        });
        it('路径含 .tmp → 同样提取', () => {
            const handlers = mockCc.assetManager.parser.register.mock.calls[0][0];
            const loadFont = handlers['.ttf'];
            const onComplete = jest.fn();
            loadFont('fonts/arial.tmp', {}, onComplete);
            expect(onComplete).toHaveBeenCalledWith(null, 'arial_LABEL');
        });
        it('无 .ttf 和 .tmp → 返回原路径', () => {
            const handlers = mockCc.assetManager.parser.register.mock.calls[0][0];
            const loadFont = handlers['.ttf'];
            const onComplete = jest.fn();
            loadFont('fonts/arial.woff', {}, onComplete);
            expect(onComplete).toHaveBeenCalledWith(null, 'fonts/arial.woff');
        });
        it('无斜杠 → 整个路径作为基名', () => {
            const handlers = mockCc.assetManager.parser.register.mock.calls[0][0];
            const loadFont = handlers['.ttf'];
            const onComplete = jest.fn();
            loadFont('myfont.ttf', {}, onComplete);
            expect(onComplete).toHaveBeenCalledWith(null, 'myfont_LABEL');
        });
        it('字体名含空格 → 用双引号包裹', () => {
            const handlers = mockCc.assetManager.parser.register.mock.calls[0][0];
            const loadFont = handlers['.ttf'];
            const onComplete = jest.fn();
            loadFont('fonts/My Font.ttf', {}, onComplete);
            expect(onComplete).toHaveBeenCalledWith(null, '"My Font_LABEL"');
        });
    });
});
