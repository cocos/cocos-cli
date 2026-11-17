'use strict';
const backend = require('../shared/legacy-backend.cjs')({
    compiler: require('./compiler.cjs'), compilerModule: 'adapters/engine/cocos35/compiler.cjs',
    capabilities: {
        polygonSpriteFrames: { status: 'not-implemented', missing: [], reason: '3.5 SpriteFrame has no mesh type API' },
        embeddedPlayers: { status: 'not-implemented', missing: [], reason: '3.5 has no embedded player editor API' },
        lightProbes: { status: 'not-implemented', missing: [], reason: '3.5 Scene globals do not provide light probe data' },
        nodeMobility: { status: 'not-implemented', missing: [], reason: '3.5 has no MobilityMode node property' },
        customLayoutSerialization: { status: 'not-implemented', missing: [], reason: '3.5 lacks the newer layout graph archive API' },
        reflectionProbes: { status: 'not-implemented', missing: [], reason: '3.5 has no reflection probe editor module' },
        lodGroups: { status: 'not-implemented', missing: [], reason: '3.5 has no LOD editor module' },
        additiveLayers: { status: 'not-implemented', missing: [], reason: '3.5 animation graph layers do not provide additive blending' },
        poseGraph: { status: 'not-implemented', missing: [], reason: '3.5 does not provide the 3.8 Pose Graph editor API' },
        auxiliaryCurves: { status: 'not-implemented', missing: [], reason: '3.5 AnimationClip has no auxiliary curve runtime API' },
        lightProbeSphereVolume: { status: 'not-implemented', missing: [], reason: '3.5 LightProbeInfo has no sphere display-size property' },
    },
    hostEntry: require('node:path').join(__dirname, 'host.cjs'),
    modules: ['cc', 'cc/editor/cli-host', 'cc/editor/populate-internal-constants', 'cc/editor/serialization', 'cc/editor/new-gen-anim', 'cc/editor/material', 'cc/editor/2d-misc', 'cc/editor/offline-mappings', 'cc/editor/animation-clip-migration', 'cc/editor/exotic-animation'],
});

const fallbackLabels = backend.getEditorI18nFallbacks;
backend.getEditorI18nFallbacks = lang => {
    const labels = fallbackLabels(lang);
    Object.assign(labels.assets.fbx, {
        GlTFUserData: { mountAllAnimationsOnPrefab: { name: lang === 'zh' ? '挂载全部动画' : 'Mount All Animations' } },
        addVertexColor: { name: lang === 'zh' ? '添加顶点颜色' : 'Add Vertex Color', title: lang === 'zh' ? '为缺少顶点颜色的网格添加默认颜色' : 'Add default vertex colors to meshes without them' },
    });
    return labels;
};
const configureLegacy = backend.configureRuntime;
backend.configureRuntime = (engine, getModule, host) => {
    configureLegacy(engine, getModule, host);
    engine.CCClass.isCCClassOrFastDefined ??= constructor => !!constructor && Object.prototype.hasOwnProperty.call(constructor, '__values__');
    engine.js.getClassId ??= engine.js._getClassId;
    engine.js.getClassById ??= engine.js._getClassById;
    if (engine.cclegacy.js) {
        engine.cclegacy.js.getClassId ??= engine.cclegacy.js._getClassId;
        engine.cclegacy.js.getClassById ??= engine.cclegacy.js._getClassById;
    }
    const devices = { get gfxDevice() { return engine.game.gfxDevice || engine.game._gfxDevice; }, get swapchain() { return engine.game.swapchain || engine.game._swapchain; } };
    if (engine.gfx) engine.gfx.deviceManager ??= devices;
    if (engine.cclegacy.gfx) engine.cclegacy.gfx.deviceManager ??= devices;
    const headless = getModule('cc/editor/cli-host');
    engine.cclegacy.EmptyDevice ??= headless.EmptyDevice;
    headless.shaderAssembly.glsl4 ??= headless.glsl4;
    const initialize = engine.game.init;
    if (!initialize.cliLegacyConfig35) {
        const adapted = function (options) {
            const settings = options.overrideSettings || {};
            const rendering = settings.rendering || {};
            return Promise.resolve(initialize.call(this, { ...options,
                renderMode: rendering.renderMode,
                renderPipeline: rendering.renderPipeline === 'builtin' ? '' : rendering.renderPipeline,
                assetOptions: settings.assets,
                physics: settings.physics,
                macros: settings.engine?.macros,
                layers: settings.engine?.customLayers?.map(layer => ({ name: layer.name, value: 2 ** layer.bit })),
                customJointTextureLayouts: settings.animation?.customJointTextureLayouts,
                frameRate: settings.screen?.frameRate,
                showFPS: settings.profiling?.showFPS,
                adapter: { canvas: document.getElementById('GameCanvas'), frame: document.getElementById('GameDiv'), container: document.getElementById('Cocos3dGameContainer') },
            })).then(async result => {
                await this._setupRenderPipeline();
                return result;
            });
        };
        Object.defineProperty(adapted, 'cliLegacyConfig35', { value: true });
        engine.game.init = adapted;
    }
    if (engine.PhysicsMaterial && engine.CCClass?.Attr?.setClassAttr) {
        for (const field of ['friction', 'restitution']) engine.CCClass.Attr.setClassAttr(engine.PhysicsMaterial, field, 'type', 'Float');
    }
    const probe = engine.js?.getClassByName?.('cc.LightProbeInfo')?.prototype;
    if (probe && !probe.onProbeBakeFinished && typeof probe.clearAllSHUBOs === 'function') {
        probe.onProbeBakeFinished = function () { this.clearAllSHUBOs(); };
        probe.onProbeBakeCleared = function () { this.clearSHCoefficients(); };
    }
    const serializeTag = engine.serializeTag;
    const serializeNode = engine.Node?.prototype?.[serializeTag];
    if (typeof serializeNode === 'function' && !serializeNode.cliKeepPrefabUuid35) {
        const preserveIdentity = function (output, context) {
            serializeNode.call(this, output, context);
            const custom = context.customArguments || {};
            const prefab = this._prefab;
            const mounted = !!this[engine.editorExtrasTag]?.mountedRoot;
            const synchronized = prefab?.root?._prefab?.instance && (prefab.instance || !mounted);
            if (custom.keepNodeUuid && !custom[engine.Node.reserveContentsForAllSyncablePrefabTag] && synchronized && context.root !== this && prefab.root === this) {
                output.writeProperty('_id', this.uuid);
            }
        };
        Object.defineProperty(preserveIdentity, 'cliKeepPrefabUuid35', { value: true });
        engine.Node.prototype[serializeTag] = preserveIdentity;
    }
    const prototype = engine.Prefab?.prototype;
    const instantiate = prototype?._instantiate;
    const Instance = engine.Prefab?._utils?.PrefabInstance;
    if (typeof instantiate === 'function' && Instance && !instantiate.cliEditorInstance37) {
        const wrapped = function (...args) {
            const node = instantiate.apply(this, args);
            let info = node?._prefab;
            if (info && !info.instance) {
                if (info === this.data?._prefab) {
                    info = Object.assign(new engine.Prefab._utils.PrefabInfo(), info);
                    node._prefab = info;
                }
                info.root = node;
                info.instance = new Instance();
                info.instance.fileId = node.uuid;
                info.instance.expanded = true;
            }
            return node;
        };
        Object.defineProperty(wrapped, 'cliEditorInstance37', { value: true });
        prototype._instantiate = wrapped;
    }
    const animation = getModule('cc/editor/new-gen-anim');
    // 3.5 exports the common blend base as a type only. Expose the actual
    // selected-engine superclass rather than substituting a newer implementation.
    if (animation?.AnimationBlend1D && !animation.AnimationBlend) {
        animation.AnimationBlend = Object.getPrototypeOf(animation.AnimationBlend1D.prototype).constructor;
    }
    if (animation?.AnimationGraph && !animation.AnimationGraph.prototype.addVariable) {
        animation.AnimationGraph.prototype.addVariable = function (name, type, value) {
            const methods = { [animation.VariableType.FLOAT]: 'addFloat', [animation.VariableType.BOOLEAN]: 'addBoolean',
                [animation.VariableType.TRIGGER]: 'addTrigger', [animation.VariableType.INTEGER]: 'addInteger' };
            const method = methods[type];
            if (!method) {
                const error = new Error('This engine does not support the requested animation variable type');
                error.code = 'ENGINE_CAPABILITY_UNAVAILABLE'; throw error;
            }
            return this[method](name, value);
        };
    }
    if (animation && !animation.getVariableValueAttributes) {
        animation.getVariableValueAttributes = variable => variable.type === animation.VariableType.INTEGER
            ? { type: 'Integer', step: 1 } : variable.type === animation.VariableType.FLOAT ? { step: 0.1 } : {};
    }
};
module.exports = backend;
