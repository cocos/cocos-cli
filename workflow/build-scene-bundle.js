const { rollup } = require('rollup');
const commonjs = require('@rollup/plugin-commonjs');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const virtual = require('@rollup/plugin-virtual');
const json = require('@rollup/plugin-json');
const path = require('path');

async function buildSceneBundle() {
    const workspaceDir = path.join(__dirname, '..');
    const sceneProcessDir = path.join(workspaceDir, 'dist', 'core', 'scene', 'scene-process').replace(/\\/g, '/');
    const bridgeFile = path.join(sceneProcessDir, 'engine-bootstrap.js').replace(/\\/g, '/');

    console.log('[Build] Bundling scene services for preview...');

    const bundle = await rollup({
        input: 'entry',
        external: (id) => {
            if (id === 'cc') return true;
            return false;
        },
        plugins: [
            json(),
            virtual({
                entry: `
                    import * as Bridge from '${bridgeFile}';
                    const { startup, serviceManager, EditorExtends, Service } = Bridge;
                    export { startup, serviceManager, EditorExtends, Service };
                `
            }),
            {
                name: 'smart-node-builtins',
                resolveId(id, importer) {
                    // editor-extends root: resolve to globalThis.EditorExtends (pre-loaded bundle)
                    // Only match root import, not subpaths like utils/serialize
                    if (importer && (id.match(/engine[/\\]editor-extends[/\\]?$/) || id.match(/engine[/\\]editor-extends[/\\]index(\.js|\.ts)?$/))) {
                        return '\0global-editor-extends';
                    }

                    const stubs = [
                        'fs', 'node:fs', 'fs-extra', 'graceful-fs', 'lodash', 'package.json', '@cocos/asset-db',
                        'constants', 'stream', 'assert', 'crypto', 'child_process', 'vm', 'buffer',
                        'tty', 'zlib', 'http', 'https', 'net', 'tls', 'dns', 'readline', 'punycode',
                        'cc/mods-mgr', 'inherits', 'sys', 'url', 'process', 'proper-lockfile'
                    ];
                    if (stubs.includes(id)) {
                        return '\0smart-' + id;
                    }
                    if (['cc/preload', 'cc/editor/populate-internal-constants', 'cc/env', 'cce.env'].includes(id)) {
                        return '\0alias-cc-' + id;
                    }
                    if (id === 'cc/editor/serialization') {
                        return '\0alias-cc-editor-serialization';
                    }

                    const polyfills = {
                        events: path.join(workspaceDir, 'node_modules', 'events', 'events.js'),
                        path: path.join(workspaceDir, 'node_modules', 'path-browserify', 'index.js'),
                        util: path.join(workspaceDir, 'node_modules', 'util', 'util.js'),
                        os: path.join(workspaceDir, 'node_modules', 'os-browserify', 'main.js'),
                        'reflect-metadata': path.join(workspaceDir, 'node_modules', 'reflect-metadata', 'Reflect.js')
                    };
                    if (polyfills[id]) {
                        return polyfills[id];
                    }

                    if (id.endsWith('/package.json')) {
                        return '\0smart-' + id;
                    }
                    return null;
                },
                load(id) {
                    if (id === '\0global-editor-extends') {
                        return `
                            // Patch EventEmitter.prototype.off for scene-bundle's events module
                            // (previously patched by inlined editor-extends, now in separate bundle)
                            import EventEmitter from 'events';
                            if (!EventEmitter.prototype.off) {
                                EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
                            }
                            var _ee = globalThis.EditorExtends || {};
                            export var emit = function() { return _ee.emit.apply(_ee, arguments); };
                            export var on = function() { return _ee.on.apply(_ee, arguments); };
                            export var off = function() { return (_ee.off || _ee.removeListener).apply(_ee, arguments); };
                            export var removeListener = function() { return _ee.removeListener.apply(_ee, arguments); };
                            export var Component = _ee.Component;
                            export var Node = _ee.Node;
                            export var Script = _ee.Script;
                            export var UuidUtils = _ee.UuidUtils;
                            export var MissingReporter = _ee.MissingReporter;
                            export var serialize = _ee.serialize;
                            export var serializeCompiled = _ee.serializeCompiled;
                            export var deserializeFull = _ee.deserializeFull;
                            export var GeometryUtils = _ee.GeometryUtils;
                            export var PrefabUtils = _ee.PrefabUtils;
                            export var walkProperties = function() {};
                            export function init() { return _ee.init ? _ee.init() : Promise.resolve(); }
                            export default _ee;
                        `;
                    }
                    if (id.startsWith('\0smart-')) {
                        const originalId = id.substring('\0smart-'.length);
                        // graceful-fs patches the fs object it receives — give it a plain
                        // mutable object so assignment to its properties doesn't throw.
                        if (originalId === 'graceful-fs') {
                            return `
                                // graceful-fs stub: plain writable object so monkey-patching works
                                var _gfs = {
                                    existsSync: function() { return false; },
                                    readFileSync: function() { return ''; },
                                    writeFileSync: function() {},
                                    statSync: function() { return { isFile: function() { return false; }, isDirectory: function() { return false; }, mtime: new Date(0) }; },
                                    stat: function(p, cb) { cb && cb(null, { isFile: function() { return false; }, isDirectory: function() { return false; }, mtime: new Date(0) }); },
                                    lstat: function(p, cb) { cb && cb(null, { isFile: function() { return false; }, isDirectory: function() { return false; }, mtime: new Date(0) }); },
                                    lstatSync: function() { return { isFile: function() { return false; }, isDirectory: function() { return false; }, mtime: new Date(0) }; },
                                    readdir: function(p, cb) { cb && cb(null, []); },
                                    readdirSync: function() { return []; },
                                    mkdir: function(p, o, cb) { var fn = typeof o === 'function' ? o : cb; fn && fn(null); },
                                    mkdirSync: function() {},
                                    rmdir: function(p, o, cb) { var fn = typeof o === 'function' ? o : cb; fn && fn(null); },
                                    rmdirSync: function() {},
                                    realpath: function(p, o, cb) { var fn = typeof o === 'function' ? o : cb; fn && fn(null, p); },
                                    realpathSync: function(p) { return p; },
                                    utimes: function(p, a, m, cb) { cb && cb(null); },
                                    utimesSync: function() {},
                                    open: function(p, f, m, cb) { var fn = typeof f === 'function' ? f : (typeof m === 'function' ? m : cb); fn && fn(new Error('ENOENT')); },
                                    close: function(fd, cb) { cb && cb(null); },
                                    read: function(fd, buf, off, len, pos, cb) { cb && cb(null, 0); },
                                    write: function(fd, buf, off, len, pos, cb) { cb && cb(null, 0); },
                                    readJSON: async function() { return { chunks: {}, entries: {} }; },
                                    readJson: async function() { return { chunks: {}, entries: {} }; },
                                };
                                export default _gfs;
                                export var existsSync = _gfs.existsSync;
                                export var readFileSync = _gfs.readFileSync;
                                export var writeFileSync = _gfs.writeFileSync;
                                export var statSync = _gfs.statSync;
                                export var stat = _gfs.stat;
                                export var lstat = _gfs.lstat;
                                export var lstatSync = _gfs.lstatSync;
                                export var readdir = _gfs.readdir;
                                export var readdirSync = _gfs.readdirSync;
                                export var mkdir = _gfs.mkdir;
                                export var mkdirSync = _gfs.mkdirSync;
                                export var rmdir = _gfs.rmdir;
                                export var rmdirSync = _gfs.rmdirSync;
                                export var realpath = _gfs.realpath;
                                export var realpathSync = _gfs.realpathSync;
                                export var utimes = _gfs.utimes;
                                export var utimesSync = _gfs.utimesSync;
                                export var open = _gfs.open;
                                export var close = _gfs.close;
                                export var read = _gfs.read;
                                export var write = _gfs.write;
                                export var readJSON = _gfs.readJSON;
                                export var readJson = _gfs.readJson;
                            `;
                        }
                        if (originalId === 'cc/mods-mgr') {
                            return `
                                function _createDeferredModule(id) {
                                    return new Proxy({}, {
                                        get: function(target, prop) {
                                            if (typeof System !== 'undefined' && System.get) {
                                                var real = System.get(id);
                                                if (real) return real[prop];
                                            }
                                            return undefined;
                                        },
                                        has: function(target, prop) {
                                            if (typeof System !== 'undefined' && System.get) {
                                                var real = System.get(id);
                                                if (real) return prop in real;
                                            }
                                            return false;
                                        }
                                    });
                                }
                                export function syncImport(id) {
                                    return _createDeferredModule(id);
                                }
                                export default { syncImport: syncImport };
                            `;
                        }
                        if (originalId === 'proper-lockfile') {
                            return `
                                const _lockfile = {
                                    lock: async () => (async () => {}),
                                    unlock: async () => {},
                                    check: async () => false
                                };
                                export default _lockfile;
                                export const lock = _lockfile.lock;
                                export const unlock = _lockfile.unlock;
                                export const check = _lockfile.check;
                            `;
                        }
                        if (originalId === 'process') {
                            return `
                                const _process = {
                                    cwd: () => '/',
                                    platform: 'browser',
                                    nextTick: (fn, ...args) => setTimeout(() => fn(...args), 0),
                                    env: {},
                                    versions: { node: '16.0.0' },
                                    stdout: { write: () => {} },
                                    stderr: { write: () => {} },
                                    binding: () => ({}),
                                    on: () => {},
                                    once: () => {},
                                    removeListener: () => {},
                                    emit: () => {},
                                };
                                if (typeof window !== 'undefined' && !window.process) {
                                    window.process = _process;
                                }
                                export default _process;
                                export const cwd = _process.cwd;
                                export const platform = _process.platform;
                                export const nextTick = _process.nextTick;
                                export const env = _process.env;
                                export const versions = _process.versions;
                            `;
                        }
                        if (originalId === 'url') {
                            const urlPolyfillPath = path.join(workspaceDir, 'node_modules', 'url', 'url.js').replace(/\\/g, '/');
                            return `
                                import * as _url from '${urlPolyfillPath}';
                                export const URL = _url.URL || window.URL;
                                export const URLSearchParams = _url.URLSearchParams || window.URLSearchParams;
                                export const parse = _url.parse;
                                export const format = _url.format;
                                export const resolve = _url.resolve;
                                
                                export function pathToFileURL(p) {
                                    let resolved = p.replace(/\\\\/g, '/');
                                    // Handle Windows drive letters: D:/... -> /D:/...
                                    if (resolved.match(/^[a-zA-Z]:/)) resolved = '/' + resolved;
                                    if (!resolved.startsWith('/')) resolved = '/' + resolved;
                                    return new URL('file://' + encodeURI(resolved).replace(/#/g, '%23').replace(/\\?/g, '%3F'));
                                }
                                
                                export function fileURLToPath(u) {
                                    if (typeof u === 'string') u = new URL(u);
                                    if (u.protocol !== 'file:') return u.href;
                                    let p = decodeURIComponent(u.pathname);
                                    if (p.match(/^\\/[a-zA-Z]:/)) {
                                        p = p.substring(1).replace(/\\//g, '\\\\');
                                    }
                                    return p;
                                }
                                
                                export default {
                                    ..._url,
                                    URL,
                                    URLSearchParams,
                                    pathToFileURL,
                                    fileURLToPath
                                };
                            `;
                        }
                        return `
                            let realMod = {};
                            const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
                            const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
                            // Allow explicit override via global flag
                            const useRealNode = (isNode && !isBrowser && globalThis.__ENABLE_NODE_BUILTINS__ !== false) || globalThis.__ENABLE_NODE_BUILTINS__ === true;
                            
                            if (useRealNode) {
                                // Dynamic require to hide it from static analysis
                                const req = typeof require !== 'undefined' ? require : (typeof _cc_require !== 'undefined' ? _cc_require : null);
                                if (req) {
                                    try {
                                        const modName = '${originalId.startsWith('node:') ? originalId.substring(5) : originalId}';
                                        realMod = req(modName);
                                    } catch(e) {
                                        console.warn('Smart polyfill: failed to require ${originalId}');
                                    }
                                }
                            }
                            
                            export const existsSync = realMod.existsSync || function() { return false; };
                            export const readFileSync = realMod.readFileSync || function() { return ''; };
                            export const writeFileSync = realMod.writeFileSync || function() {};
                            export const remove = realMod.remove || async function() {};
                            export const readJSON = realMod.readJSON || async function() { return { chunks: {}, entries: {} }; };
                            export const readJson = realMod.readJson || async function() { return { chunks: {}, entries: {} }; };
                            export const statSync = realMod.statSync || function() { return { isFile: () => false, isDirectory: () => false, mtime: new Date(0) }; };
                            export const stat = realMod.stat || function(p, cb) { cb && cb(null, { isFile: () => false, isDirectory: () => false, mtime: new Date(0) }); };
                            export const lstat = realMod.lstat || function(p, cb) { cb && cb(null, { isFile: () => false, isDirectory: () => false, mtime: new Date(0) }); };
                            export const lstatSync = realMod.lstatSync || function() { return { isFile: () => false, isDirectory: () => false, mtime: new Date(0) }; };
                            export const mkdir = realMod.mkdir || function(p, o, cb) { var fn = typeof o === 'function' ? o : cb; fn && fn(null); };
                            export const mkdirSync = realMod.mkdirSync || function() {};
                            export const rmdir = realMod.rmdir || function(p, o, cb) { var fn = typeof o === 'function' ? o : cb; fn && fn(null); };
                            export const rmdirSync = realMod.rmdirSync || function() {};
                            export const realpath = realMod.realpath || function(p, o, cb) {
                                var fn = typeof o === 'function' ? o : cb;
                                if (typeof fn === 'function') fn(null, p);
                            };
                            export const realpathSync = realMod.realpathSync || function(p) { return p; };
                            export const utimes = realMod.utimes || function(p, a, m, cb) { cb && cb(null); };
                            export const utimesSync = realMod.utimesSync || function() {};
                            
                            export default new Proxy({}, {
                                get(target, prop) {
                                    if (prop === 'existsSync') return existsSync;
                                    if (prop === 'readFileSync') return readFileSync;
                                    if (prop === 'writeFileSync') return writeFileSync;
                                    if (prop === 'remove') return remove;
                                    if (prop === 'readJSON') return readJSON;
                                    if (prop === 'readJson') return readJson;
                                    if (prop === 'statSync') return statSync;
                                    if (prop === 'stat') return stat;
                                    if (prop === 'lstat') return lstat;
                                    if (prop === 'lstatSync') return lstatSync;
                                    if (prop === 'mkdir') return mkdir;
                                    if (prop === 'mkdirSync') return mkdirSync;
                                    if (prop === 'rmdir') return rmdir;
                                    if (prop === 'rmdirSync') return rmdirSync;
                                    if (prop === 'realpath') return realpath;
                                    if (prop === 'realpathSync') return realpathSync;
                                    if (prop === 'utimes') return utimes;
                                    if (prop === 'utimesSync') return utimesSync;
                                    
                                    if (realMod && prop in realMod) {
                                        return realMod[prop];
                                    }
                                    
                                    // Fallback for missing methods
                                    if (typeof prop === 'string') {
                                        return function() {};
                                    }
                                    return undefined;
                                }
                            });
                        `;
                    }
                    if (id === '\0alias-cc-editor-serialization') {
                        return [
                            `import * as cc from 'cc';`,
                            `function _getInternal() {`,
                            `    return (cc && cc.internal) || (typeof globalThis !== 'undefined' && globalThis.cc && globalThis.cc.internal) || {};`,
                            `}`,
                            `export const BufferBuilder = new Proxy(function() {}, {`,
                            `    construct(target, args) {`,
                            `        const C = _getInternal().BufferBuilder;`,
                            `        if (!C) throw new Error('cc.internal.BufferBuilder is not available. Please ensure engine is correctly compiled.');`,
                            `        return new C(...args);`,
                            `    },`,
                            `    get(target, prop) {`,
                            `        const C = _getInternal().BufferBuilder;`,
                            `        return C ? C[prop] : target[prop];`,
                            `    }`,
                            `});`,
                            `export const CCON = new Proxy(function() {}, {`,
                            `    construct(target, args) {`,
                            `        const C = _getInternal().CCON;`,
                            `        if (!C) throw new Error('cc.internal.CCON is not available.');`,
                            `        return new C(...args);`,
                            `    },`,
                            `    get(target, prop) {`,
                            `        const C = _getInternal().CCON;`,
                            `        return C ? C[prop] : target[prop];`,
                            `    }`,
                            `});`,
                            `export function encodeCCONBinary(...args) { return _getInternal().encodeCCONBinary(...args); }`,
                            `export function decodeCCONBinary(...args) { return _getInternal().decodeCCONBinary(...args); }`,
                        ].join('\n');
                    }
                    if (id.startsWith('\0alias-cc-')) {
                        return `import * as cc from 'cc';\nexport * from 'cc';\nexport default cc;`;
                    }
                    return null;
                }
            },
            {
                // Post-process: fix default import interop for external ESM modules (like cc)
                // that are loaded via SystemJS but don't have a "default" export.
                // Rollup emits: `require$$0__default = module["default"]`
                // but cc's SystemJS registration has no default export.
                // Fix: `module["default"] || module`
                name: 'fix-external-default-interop',
                renderChunk(code) {
                    let fixed = code.replace(/= module\["default"\];/g, '= module["default"] || module;');
                    // Fix url polyfill missing the URL constructor
                    fixed = fixed.replace(/url_1\.URL/g, 'window.URL');
                    return { code: fixed, map: null };
                }
            },
            {
                // reload 时清除 System-A 中的 pack chunk 缓存。
                // 双实例下 _invalidateAllPackMods 只删 System-B 的 pack:/// URL，
                // System-A 中通过 DOM import map 加载的 HTTP chunk 不会被删除，
                // 导致 re-import 返回缓存，类不重新注册。
                name: 'clear-pack-chunks-before-reimport',
                renderChunk(code) {
                    return { code: code.replace(
                        "await System.import('cce:/internal/x/prerequisite-imports')",
                        "/* 清除 System-A 中的 pack chunk 缓存 */ " +
                        "(function() { try { for (var e of System.entries()) { if (e[0].indexOf('/chunks/') !== -1) System.delete(e[0]); } } catch(_e) {} })(); " +
                        "await System.import('cce:/internal/x/prerequisite-imports')"
                    ), map: null };
                }
            },
            {
                // Bare global references to EditorExtends (not imported) need live access
                // to globalThis.EditorExtends (the pre-loaded bundle's live-binding wrapper).
                name: 'alias-editor-extends-global',
                renderChunk(code) {
                    return {
                        code: 'var EditorExtends = globalThis.EditorExtends;\n' + code,
                        map: null
                    };
                }
            },
            nodeResolve({
                preferBuiltins: true,
                browser: true,
            }),
            commonjs({
                ignoreDynamicRequires: true
            }),
        ],
    });

    const bundleOutputFile = path.join(workspaceDir, 'static', 'web', 'scene-bundle.js');
    await bundle.write({
        file: bundleOutputFile,
        format: 'system',
        sourcemap: true,
        banner: `
(function() {
    var _process = {
        platform: 'browser',
        nextTick: function(fn) { 
            var args = Array.prototype.slice.call(arguments, 1);
            setTimeout(function() { if (typeof fn === 'function') fn.apply(null, args); }, 0); 
        },
        env: { NODE_ENV: 'development' },
        versions: { node: '16.0.0' },
        stdout: { write: function() {} },
        stderr: { write: function() {} },
        binding: function() { return {}; },
        on: function() {},
        once: function() {},
        removeListener: function() {},
        emit: function() {},
    };
    if (typeof window !== 'undefined') {
        if (!window.process) {
            window.process = _process;
        }
    }
    if (typeof globalThis !== 'undefined' && !globalThis.process) {
        globalThis.process = _process;
    }
})();
        `
    });

    console.log('[Build] Successfully bundled to', bundleOutputFile);
}

async function buildEditorExtends() {
    const workspaceDir = path.join(__dirname, '..');
    const editorExtendsDir = path.join(workspaceDir, 'dist', 'core', 'engine', 'editor-extends').replace(/\\/g, '/');
    const eventsPolyfill = path.join(workspaceDir, 'node_modules', 'events', 'events.js');

    console.log('[Build] Bundling editor-extends for preview...');

    const bundle = await rollup({
        input: 'editor-extends-entry',
        inlineDynamicImports: true,
        plugins: [
            json(),
            virtual({
                'editor-extends-entry': `
                    import * as _ee from '${editorExtendsDir}/index.js';
                    // Patch UuidUtils aliases (engine uses uuid/compressUuid/decompressUuid/isUuid)
                    if (_ee.UuidUtils) {
                        var U = _ee.UuidUtils;
                        U.uuid = U.uuid || U.generate;
                        U.compressUuid = U.compressUuid || U.compressUUID;
                        U.decompressUuid = U.decompressUuid || U.decompressUUID;
                        U.isUuid = U.isUuid || U.isUUID;
                    }
                    // Live-binding wrapper: getter 始终从模块命名空间读取最新值，
                    // 使 init() 后赋值的 serialize/GeometryUtils 等能通过 globalThis.EditorExtends 访问
                    var editorExtends = {};
                    var keys = Object.keys(_ee);
                    for (var i = 0; i < keys.length; i++) {
                        (function(key) {
                            Object.defineProperty(editorExtends, key, {
                                get: function() { return _ee[key]; },
                                set: function(v) {
                                    Object.defineProperty(editorExtends, key, {
                                        value: v, writable: true, configurable: true
                                    });
                                },
                                enumerable: true,
                                configurable: true,
                            });
                        })(keys[i]);
                    }
                    globalThis.EditorExtends = editorExtends;
                    // Override init: inlined serialize/geometry/prefab depends on stubbed cc.
                    // Just set allow flags here; serialize is loaded by engine-bootstrap after engine.
                    Object.defineProperty(editorExtends, 'init', {
                        value: async function() {
                            _ee.Component.allow = true;
                            _ee.Node.allow = true;
                            _ee.Script.allow = true;
                        },
                        writable: true,
                        configurable: true,
                    });
                `
            }),
            {
                name: 'editor-extends-deps',
                resolveId(id) {
                    if (id === 'events') return eventsPolyfill;
                    if (id === 'semver') return '\0ee-stub-semver';
                    if (id === 'cc' || id.startsWith('cc/')) return '\0ee-stub-cc';
                    var stubs = ['fs', 'fs-extra', 'lodash', '@cocos/asset-db', 'child_process', 'path'];
                    if (stubs.includes(id)) return '\0ee-stub-empty';
                    if (id === 'crypto') return '\0ee-stub-crypto';
                    if (id === 'node-uuid') return '\0ee-stub-uuid';
                    if (id.endsWith('/package.json')) return '\0ee-stub-json';
                    return null;
                },
                load(id) {
                    if (id === '\0ee-stub-semver') return 'export function rsort(arr) { return arr.sort().reverse(); }';
                    if (id === '\0ee-stub-cc') return 'export default {};';
                    if (id === '\0ee-stub-empty') return 'export default {};';
                    if (id === '\0ee-stub-json') return 'export default {};';
                    if (id === '\0ee-stub-crypto') return `
                        export function createHash() {
                            var data = '';
                            return {
                                update: function(d) { data += d; return this; },
                                digest: function() { return data.substring(0, 32); }
                            };
                        }
                        export default { createHash: createHash };
                    `;
                    if (id === '\0ee-stub-uuid') return `
                        function v4() {
                            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                                var r = Math.random() * 16 | 0;
                                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                            });
                        }
                        export default { v4: v4 };
                        export { v4 };
                    `;
                    return null;
                }
            },
            nodeResolve({ preferBuiltins: false, browser: true }),
            commonjs(),
        ],
    });

    const outputFile = path.join(workspaceDir, 'static', 'web', 'editor-extends.bundle.js');
    await bundle.write({
        file: outputFile,
        format: 'es',
        sourcemap: false,
        banner: '(async function() {',
        footer: '})();',
    });

    console.log('[Build] Successfully bundled editor-extends to', outputFile);
}

Promise.all([
    buildSceneBundle(),
    buildEditorExtends(),
]).catch(err => {
    console.error('Failed to bundle:', err);
    process.exit(1);
});
