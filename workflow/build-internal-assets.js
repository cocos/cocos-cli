const { cp, mkdir, mkdtemp, rename, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');

async function buildPreviewSystemJs() {
    const { build } = require('@cocos/module-system');
    const output = resolve(__dirname, '../dist/preview-systemjs');
    await mkdir(output, { recursive: true });
    await build({ out: join(output, 'system.js'), minify: false, sourceMap: true, platform: 'web-mobile', editor: true });
}

async function buildInternalAssets() {
    const { GlobalConfig, GlobalPaths } = require('../dist/global');
    const { Project, project } = require('../dist/core/project/script');
    const { configurationManager } = require('../dist/core/configuration');
    const { Engine, initEngine } = require('../dist/core/engine');
    const assetConfig = require('../dist/core/assets/asset-config');
    const { target, library: output } = assetConfig.internalAssetPaths(GlobalPaths.enginePath);
    const library = resolve(output);
    if (library !== resolve(__dirname, '../dist/internal-assets')) {
        throw new Error(`Unexpected internal asset build output: ${library}`);
    }
    const scratch = await mkdtemp(join(tmpdir(), 'cocos-internal-assets-'));
    let staging;
    try {
        await mkdir(dirname(library), { recursive: true });
        staging = await mkdtemp(join(dirname(library), '.internal-assets-'));
        const source = join(scratch, 'internal');
        // Importers update .meta files. Build against a copy of the engine assets.
        await cp(target, source, { recursive: true });
        GlobalConfig.mode = 'simple';
        if (!(await Project.create(scratch))) throw new Error('Failed to create the internal asset build project.');
        await configurationManager.initialize(scratch);
        await project.open(scratch);
        await initEngine(GlobalPaths.enginePath, scratch);
        const { default: scripting } = require('../dist/core/scripting');
        const modules = Engine.getConfig().includeModules;
        await scripting.initialize(scratch, GlobalPaths.enginePath, modules);
        try {
            await assetConfig.default.init();
            const mounts = assetConfig.default.data.assetDBList;
            const internal = mounts.find(mount => mount.name === 'internal');
            if (!internal) throw new Error('Internal asset database is not configured.');
            mounts.splice(0, mounts.length, { ...internal, target: source, library: staging });
            const { initAssetDB, assetDBManager } = require('../dist/core/assets');
            await initAssetDB();
            await assetDBManager.buildInternalSnapshot();
            await rm(library, { recursive: true, force: true });
            await rename(staging, library);
            console.log(`[AssetDB] Built internal assets in ${library}`);
        } finally {
            await scripting.close();
        }
    } finally {
        if (staging) await rm(staging, { recursive: true, force: true });
        await rm(scratch, { recursive: true, force: true });
    }
}

buildPreviewSystemJs().then(buildInternalAssets).then(
    () => process.exit(0),
    error => {
        console.error('[AssetDB] Failed to build internal assets:', error);
        process.exit(1);
    },
);
