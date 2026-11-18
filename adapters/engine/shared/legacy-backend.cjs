'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
module.exports = function createLegacyBackend(options) {
    const { directory, identity, CACHE_VERSION, ADAPTER_ID, supportsVersion } = options.compiler;
    const sourceFiles = ['cc.config.json', 'cocos/core/platform/macro.ts', 'editor/engine-features/render-config.json'];
    const modules = options.modules || ['cc', 'cc/editor/populate-internal-constants', 'cc/editor/serialization', 'cc/editor/new-gen-anim',
        'cc/editor/embedded-player', 'cc/editor/reflection-probe', 'cc/editor/lod-group-utils', 'cc/editor/material',
        'cc/editor/2d-misc', 'cc/editor/offline-mappings', 'cc/editor/custom-pipeline', 'cc/editor/animation-clip-migration',
        'cc/editor/exotic-animation', 'cc/editor/color-utils'];
    function runtime(selection) {
        return { engineRoot: selection.path, engineDev: directory(selection.path),
            editorExports: path.join(selection.path, 'editor/exports'),
            editorLoader: path.join(directory(selection.path), 'editor/loader.js'),
            webLoader: path.join(directory(selection.path), 'web/loader.js'),
            webAdapter: options.hostEntry, engineAdapter: null,
            declarations: path.join(selection.path, 'bin/.declarations/cc.d.ts'),
            editorDeclarations: path.join(selection.path, 'bin/.declarations/cc.editor.d.ts'), requiredModules: [...modules], requiresEditorMode: true, screenEventsModule: 'pal/screen-adapter' };
    }
    function requiredFiles(selection, profile) {
        const files = sourceFiles.map(file => path.join(selection.path, file));
        if (profile !== 'source') {
            const layout = runtime(selection);
            files.push(layout.editorLoader, layout.webAdapter, layout.declarations, layout.editorDeclarations,
                path.join(directory(selection.path), 'editor/backend.json'));
        }
        if (profile === 'web') files.push(runtime(selection).webLoader, path.join(directory(selection.path), 'web/backend.json'));
        return files;
    }
    function validatePreparation(selection, profile) {
        const expected = identity(selection.path);
        for (const target of profile === 'source' ? [] : profile === 'web' ? ['editor', 'web'] : ['editor']) {
            const stamp = JSON.parse(fs.readFileSync(path.join(directory(selection.path), target, 'backend.json'), 'utf8'));
            if (stamp.adapter !== ADAPTER_ID || stamp.cacheVersion !== CACHE_VERSION || stamp.version !== expected.version || stamp.config !== expected.config || stamp.source !== expected.source) {
                throw new Error('Stale or incompatible legacy ' + target + ' artifacts; recompile the selected engine');
            }
        }
    }
    function inspectCapability(selection, profile) {
        const missing = requiredFiles(selection, profile).filter(file => { try { return !fs.statSync(file).isFile(); } catch { return true; } });
        if (missing.length) return { status: 'missing', missing, reason: 'Experimental backend requires its own prepared artifacts' };
        try { validatePreparation(selection, profile); }
        catch (error) { return { status: 'missing', missing: [], reason: error.message }; }
        return { status: 'ready', missing: [], reason: 'Static preparation checks passed; this experimental backend still needs project acceptance tests' };
    }
    return {
        id: ADAPTER_ID, protocolVersion: 1, implementationVersion: '0.1.0', runtimeSupport: 'experimental',
        supports: supportsVersion, runtime, requiredFiles, validatePreparation,
        // Legacy Game.init loads scriptPackages rather than the newer preview hook.
        getPreviewScriptPackages: () => ['cce:/internal/x/prerequisite-imports'],
        compile: selection => ({ directory: directory(selection.path), version: CACHE_VERSION,
            compilerSource: null, compilerModule: options.compilerModule }),
        inspect(selection) {
            return { validation: 'static-only', runtimeInterfaces: 'not-tested', layout: runtime(selection), capabilities: {
                sourcePreparation: inspectCapability(selection, 'source'), sceneEditing: inspectCapability(selection, 'runtime'),
                webPreview: { status: 'unverified', missing: [], reason: 'Web compilation is available; browser rendering and hot reload require acceptance testing' },
                nativeBuild: { status: 'not-implemented', missing: [], reason: 'Legacy native toolchains are not integrated' },
                ...(options.capabilities || {}),
            } };
        },
        getEditorI18nFallbacks(lang) {
            return { assets: {
                newPac: lang === 'zh' ? '自动图集' : 'Auto Atlas',
                newLabelAtlas: lang === 'zh' ? '艺术数字' : 'Label Atlas',
                image: { label: lang === 'zh' ? '图像' : 'Image' },
                fbx: { meshSimplify: { targetRatio: { name: lang === 'zh' ? '目标比率' : 'Target Ratio' } } },
            } };
        },
        resolveAssetTemplate(template, selection) {
            const names = { 'scene/3d.scene': 'scene/default.scene', 'scene/2d.scene': 'scene/scene-2d.scene',
                'scene/quality.scene': 'scene/scene-quality.scene', 'typescript/default': 'typescript/ts' };
            const prefix = 'db://internal/default_file_content/';
            if (!template.startsWith(prefix)) return template;
            const relative = names[template.slice(prefix.length)] || template.slice(prefix.length);
            if (selection && !fs.existsSync(path.join(selection.path, 'editor/assets/default_file_content', relative))) {
                const extension = path.extname(relative).slice(1);
                const flatName = relative === 'scene/scene-2d.scene' ? 'scene-2d'
                    : relative === 'scene/scene-quality.scene' ? 'scene-quality'
                    : relative.endsWith('/effect-surface.effect') ? 'effect-surface'
                    : relative.endsWith('/forward-pipeline.rpp') ? 'forward-pipeline'
                    : extension || path.basename(relative);
                const flat = path.join(selection.path, 'editor/assets/default_file_content', flatName);
                if (fs.existsSync(flat) && fs.statSync(flat).isFile()) return prefix + flatName;
            }
            return prefix + relative;
        },
        configureRuntime(engine, getModule, host) {
            const downloader = engine.assetManager?.downloader;
            const downloadArrayBuffer = downloader?._downloadArrayBuffer;
            const downloadCCONB = downloader?._downloaders?.['.cconb'];
            function withLocalAnimation(download, decode) {
                return function (url, options, done) {
                    // The glTF importer requests a CCONB URL for its local .bin staging file.
                    if (typeof url !== 'string' || !/^file:.*__original-animation-\d+\.cconb(?:[?#]|$)/.test(url)) {
                        return download.call(this, url, options, done);
                    }
                    let filename;
                    try { filename = fileURLToPath(new URL(url)).replace(/\.cconb$/, '.bin'); }
                    catch (error) { done(error); return; }
                    fs.readFile(filename, (error, bytes) => {
                        if (error) { done(error); return; }
                        let data;
                        try { data = decode(bytes); }
                        catch (decodeError) { done(decodeError); return; }
                        done(null, data);
                    });
                };
            }
            if (typeof downloadArrayBuffer === 'function') {
                downloader._downloadArrayBuffer = withLocalAnimation(downloadArrayBuffer,
                    bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
            } else if (typeof downloadCCONB === 'function' && typeof downloader.register === 'function') {
                // Earlier engines call their private array-buffer downloader directly.
                const { decodeCCONBinary } = getModule('cc/editor/serialization');
                downloader.register('.cconb', withLocalAnimation(downloadCCONB, decodeCCONBinary));
            }
            // Editor mode activation asks for the focused node even while importing
            // assets, where no scene selection exists yet.
            const editor = globalThis.Editor;
            if (editor?.Message && host?.queryAssetInfo) {
                const request = editor.Message.request.bind(editor.Message);
                editor.Message.request = (channel, method, ...args) => channel === 'asset-db' && method === 'query-asset-info'
                    ? Promise.resolve(host.queryAssetInfo(args[0])).then(info => {
                        // Before 3.8.7 the editor resolver expects a .cconb library key.
                        // CLI stores CCON as a sole .bin file and serves it as .cconb.
                        if (/^3\.[567]\.|^3\.8\.[0-6]$/.test(engine.VERSION || '') && info?.library?.['.bin'] && Object.keys(info.library).length === 1) {
                            return { ...info, library: { '.cconb': info.library['.bin'] } };
                        }
                        return info;
                    }) : request(channel, method, ...args);
            }
            if (/^3\.[567]\.|^3\.8\.[0-3]$/.test(engine.VERSION || '') && engine.game?.init) {
                const init = engine.game.init;
                engine.game.init = function (options) {
                    const rendering = options?.overrideSettings?.rendering;
                    if (rendering?.customPipeline) {
                        const error = new Error('This engine uses render-pipeline assets; the modern customPipeline option is unavailable');
                        error.code = 'ENGINE_CAPABILITY_UNAVAILABLE';
                        throw error;
                    }
                    const pipeline = rendering?.renderPipeline;
                    // Without an asset server, the legacy host uses the engine's default forward pipeline.
                    const useDefaultPipeline = pipeline === 'builtin' || (
                        pipeline === 'fd8ec536-a354-4a17-9c74-4f3883c378c8' && !options.overrideSettings.assets?.server
                    );
                    const value = useDefaultPipeline ? { ...options, overrideSettings: {
                        ...options.overrideSettings, rendering: { ...rendering, renderPipeline: '' },
                    } } : options;
                    return init.call(this, value);
                };
            }
            if (editor && !editor.Selection) editor.Selection = {
                getLastSelected: type => host?.getLastSelected(type) ?? '',
            };
            if (/^3\.[567]\.|^3\.8\.[0-3]$/.test(engine.VERSION || '')) {
                // EffectAsset and Pass must agree on the active library. Old releases
                // use module presence, so editor utility imports can select the wrong one.
                const legacy = engine.cclegacy;
                let rendering;
                const install = value => {
                    if (!value) { rendering = value; return; }
                    const bridge = Object.create(value);
                    Object.defineProperty(bridge, 'enableEffectImport', { enumerable: true,
                        get: () => !!legacy.director?.root?.usesCustomPipeline && value.enableEffectImport,
                    });
                    rendering = bridge;
                };
                install(legacy.rendering);
                Object.defineProperty(legacy, 'rendering', { configurable: true, enumerable: true,
                    get: () => rendering, set: install,
                });
            }
            if (engine.VERSION === '3.8.0') {
                const animation = getModule('cc/editor/new-gen-anim');
                if (animation && !animation.getPoseGraphNodeInputAttrs && engine.CCClass?.Attr?.attr) {
                    animation.getPoseGraphNodeInputAttrs = (node, [property]) => {
                        const attrs = { ...engine.CCClass.Attr.attr(node.constructor, property) };
                        delete attrs.type; delete attrs.ctor;
                        // 3.8.0 inputs were serializable but lacked editable metadata.
                        if (attrs.visible === false) attrs.visible = true;
                        if (Array.isArray(node[property])) delete attrs.default;
                        return attrs;
                    };
                }
            }
            // cocos4 #118 adds aliases, not a different serialization implementation.
            // Reuse this engine's public exports; never copy a 4.x codec into 3.x.
            const serialization = getModule('cc/editor/serialization');
            const internal = engine.cclegacy?.internal;
            if (!internal) throw new Error('Missing required interface cc.cclegacy.internal');
            for (const key of ['CCON', 'encodeCCONBinary', 'decodeCCONBinary', 'BufferBuilder']) {
                if (typeof serialization?.[key] !== 'function') throw new Error('Missing serialization export ' + key);
                if (internal[key] === undefined) internal[key] = serialization[key];
            }
        },
        validateRuntime(engine, selection) {
            if (!supportsVersion(selection?.version) || engine?.VERSION !== selection.version) throw new Error('Engine runtime version does not match selected source ' + selection?.version + ': ' + engine?.VERSION);
            for (const key of ['game.init', 'physics.selector.switchTo', 'Node', 'Component', 'deserialize']) {
                if (typeof key.split('.').reduce((value, part) => value?.[part], engine) !== 'function') throw new Error('Missing required interface cc.' + key);
            }
            if (!engine.Layers?.Enum) throw new Error('Missing required interface cc.Layers.Enum');
        },
    };

};
