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
                resolveId(id) {
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
        cwd: function() { 
            return (typeof window !== 'undefined' && (window.__CC_PROJECT_PATH__ || (window.Editor && window.Editor.Project && window.Editor.Project.path))) || '/';
        },
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
        } else if (!window.process.cwd) {
            window.process.cwd = _process.cwd;
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

buildSceneBundle().catch(err => {
    console.error('Failed to bundle scene services:', err);
    process.exit(1);
});
