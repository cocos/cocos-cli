const fs = require('fs-extra');
const path = require('path');
const { realpathSync } = require('fs');
const { parseCliEnginePath, resolveEngineDir } = require('./build-simulator');

const rootDir = path.resolve(__dirname, '..');
const defaultSpineFeature = 'spine-3.8';

function resolveModule(request, engineDir) {
    const resolved = require.resolve(request, {
        paths: [engineDir, rootDir],
    });
    return {
        resolved,
        exports: require(resolved),
    };
}

function normalizeEngineDir(engineDir) {
    try {
        let resolved = realpathSync.native(engineDir);
        if (resolved.startsWith('\\\\?\\')) {
            resolved = resolved.slice(4);
        }
        return resolved;
    } catch (error) {
        console.warn(`Failed to normalize engine path "${engineDir}":`, error);
        return engineDir;
    }
}

function getSimulatorStaticDir() {
    return path.join(rootDir, 'static', 'simulator');
}

function getSimulatorRuntimeBuildPlatform() {
    if (process.platform === 'win32') {
        return 'WINDOWS';
    }
    if (process.platform === 'darwin') {
        return 'MAC';
    }
    return 'NATIVE';
}

function getSystemJsPlatform() {
    return process.platform === 'win32' ? 'windows' : 'mac';
}

function selectSpineFeature(features, preferredFeature) {
    const available = features.filter((feature) => feature.startsWith('spine-'));
    const selected = preferredFeature || process.env.SIMULATOR_SPINE_FEATURE || defaultSpineFeature;
    if (available.length === 0) {
        return { selected: undefined, features };
    }

    if (!available.includes(selected)) {
        throw new Error(`Simulator runtime build spine feature "${selected}" is unavailable. Available spine features: ${available.join(', ')}`);
    }

    return {
        selected,
        features: features.filter((feature) => !feature.startsWith('spine-')).concat(selected),
    };
}

function buildImportMap(featureUnits) {
    const importMap = {
        imports: {
            'cc/env': './builtin/cce.env.js',
            'cce.env': './builtin/cce.env.js',
        },
    };

    for (const featureUnit of featureUnits) {
        importMap.imports[`cce:/internal/x/cc-fu/${featureUnit}`] = `./cocos-js/${featureUnit}.js`;
    }

    return importMap;
}

function parseSimulatorSpineFeature(argv = process.argv.slice(2)) {
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--spineFeature') {
            return argv[i + 1];
        }
        if (arg.startsWith('--spineFeature=')) {
            return arg.slice('--spineFeature='.length);
        }
    }
    return undefined;
}

async function buildSimulatorRuntime(enginePath, options = {}) {
    if (process.env.SKIP_SIMULATOR_BUILD === '1' || process.env.SKIP_SIMULATOR_RUNTIME_BUILD === '1') {
        console.log('Skip simulator runtime build because SKIP_SIMULATOR_BUILD=1 or SKIP_SIMULATOR_RUNTIME_BUILD=1');
        return;
    }

    const engineDir = normalizeEngineDir(resolveEngineDir(enginePath));
    const staticDir = getSimulatorStaticDir();
    const engineOutput = path.join(engineDir, 'bin', 'native-preview');

    const ccbuildModule = resolveModule('@cocos/ccbuild', engineDir);
    const moduleSystemModule = resolveModule('@cocos/module-system', engineDir);
    const polyfillsModule = resolveModule('@cocos/build-polyfills', engineDir);

    console.log(`Building simulator runtime with engine: ${engineDir}`);
    console.log(`Using @cocos/ccbuild from: ${ccbuildModule.resolved}`);
    console.log(`Using @cocos/module-system from: ${moduleSystemModule.resolved}`);
    console.log(`Using @cocos/build-polyfills from: ${polyfillsModule.resolved}`);

    const { buildEngine, StatsQuery } = ccbuildModule.exports;
    const { build: buildSystemJs } = moduleSystemModule.exports;
    const buildPolyfills = polyfillsModule.exports.default || polyfillsModule.exports;

    if (typeof buildEngine !== 'function' || typeof StatsQuery?.create !== 'function') {
        throw new Error('Failed to load @cocos/ccbuild buildEngine/StatsQuery.');
    }
    if (typeof buildSystemJs !== 'function') {
        throw new Error('Failed to load @cocos/module-system build().');
    }
    if (typeof buildPolyfills !== 'function') {
        throw new Error('Failed to load @cocos/build-polyfills.');
    }

    await fs.ensureDir(staticDir);
    await fs.emptyDir(engineOutput);
    await Promise.all([
        fs.remove(path.join(staticDir, 'import-map.json')),
        fs.remove(path.join(staticDir, 'system.bundle.js')),
        fs.remove(path.join(staticDir, 'polyfills.bundle.js')),
    ]);

    const statsQuery = await StatsQuery.create(engineDir);
    const initialFeatures = statsQuery.getFeatures().filter((feature) => !['gfx-webgpu', 'vendor-google'].includes(feature));
    const { selected: spineFeature, features } = selectSpineFeature(initialFeatures, options.spineFeature);

    console.log('-----------------------------------------------');
    console.log(` platform: ${getSimulatorRuntimeBuildPlatform()}`);
    console.log(` spine feature: ${spineFeature || 'none'}`);
    console.log(` features: ${features.join(',\n')}`);
    console.log('-----------------------------------------------');

    await buildEngine({
        engine: engineDir,
        out: engineOutput,
        moduleFormat: 'system',
        compress: false,
        targets: 'chrome 80',
        split: true,
        features,
        nativeCodeBundleMode: 'wasm',
        platform: getSimulatorRuntimeBuildPlatform(),
        mode: 'PREVIEW',
        flags: {
            DEBUG: true,
            SERVER_MODE: false,
        },
    });

    const importMap = buildImportMap(statsQuery.getFeatureUnits());
    await fs.writeFile(
        path.join(staticDir, 'import-map.json'),
        `${JSON.stringify(importMap, null, 2)}\n`,
        'utf8',
    );

    await buildPolyfills({
        debug: false,
        sourceMap: false,
        file: path.join(staticDir, 'polyfills.bundle.js'),
        coreJs: {
            modules: ['es.global-this'],
            blacklist: [],
        },
        asyncFunctions: true,
        fetch: true,
    });

    await buildSystemJs({
        out: path.join(staticDir, 'system.bundle.js'),
        minify: false,
        sourceMap: false,
        platform: getSystemJsPlatform(),
        editor: false,
    });

    console.log(`Simulator runtime prepared at: ${engineOutput}`);
    console.log(`Simulator static assets prepared at: ${staticDir}`);
}

if (require.main === module) {
    buildSimulatorRuntime(parseCliEnginePath(), {
        spineFeature: parseSimulatorSpineFeature(),
    }).catch((error) => {
        console.error('[build-simulator-runtime] failed:', error);
        process.exit(1);
    });
}

module.exports = {
    buildSimulatorRuntime,
    buildSimulatorTsArtifacts: buildSimulatorRuntime,
    buildImportMap,
    getSimulatorStaticDir,
    getSimulatorRuntimeBuildPlatform,
    parseSimulatorSpineFeature,
    selectSpineFeature,
};
