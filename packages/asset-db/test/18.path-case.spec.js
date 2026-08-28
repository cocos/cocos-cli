'use strict';

const { expect } = require('chai');
const path = require('path');
const fse = require('fs-extra');
const { v4 } = require('node-uuid');

const {
    create,
    queryAsset,
    queryUUID,
    queryUrl,
    refresh,
    reimport,
} = require('../dist');
const { getAssociatedFiles } = require('../dist/libs/dependency');
const { Importer } = require('../dist/libs/importer');
const { completionMeta } = require('../dist/libs/meta');

const describeWindows = process.platform === 'win32' ? describe : describe.skip;
let importerDependency = '';
let cacheImporterDependency = '';

function toggleAsciiCase(value) {
    return value.replace(/[a-z]/gi, (character) => (
        character === character.toLowerCase() ? character.toUpperCase() : character.toLowerCase()
    ));
}

class TestImporter extends Importer {
    get name() {
        return 'test';
    }

    async import(asset) {
        if (importerDependency) {
            asset.depend(importerDependency);
        }
    }
}

class NoopImporter extends Importer {
    get name() {
        return 'test';
    }

    async import() {
        // No generated files are required for cache tests.
    }
}

class DependencyCacheImporter extends Importer {
    get name() {
        return 'test';
    }

    async import(asset) {
        if (cacheImporterDependency && asset.basename === 'Source') {
            asset.depend(cacheImporterDependency);
        }
    }
}

describeWindows('AssetDB Windows path identity', () => {
    const PATHS = {
        ROOT: path.join(__dirname, 'path-case'),
        TARGET: path.join(__dirname, 'path-case', 'AssetsRoot'),
        LIBRARY: path.join(__dirname, 'path-case', 'Library'),
        TEMP: path.join(__dirname, 'path-case', 'Temp'),
        FILE: path.join(__dirname, 'path-case', 'AssetsRoot', 'CaseDir', 'CaseAsset.TEST'),
        DEPENDENCY: path.join(__dirname, 'path-case', 'AssetsRoot', 'Shared', 'Dependency.test'),
        UUID: v4(),
    };

    let database;

    before(async () => {
        importerDependency = PATHS.DEPENDENCY;
        fse.ensureDirSync(PATHS.LIBRARY);
        fse.outputJSONSync(PATHS.FILE, { value: 1 }, { spaces: 2 });
        fse.outputJSONSync(PATHS.FILE + '.meta', completionMeta({ uuid: PATHS.UUID }), { spaces: 2 });
        database = create({
            name: 'path-case',
            target: PATHS.TARGET,
            library: PATHS.LIBRARY,
            temp: PATHS.TEMP,
            level: 0,
        });
        database.importerManager.add(TestImporter, ['.test']);
        await database.start();
    });

    after(async () => {
        await database.stop();
        await new Promise((resolve) => setTimeout(resolve, 600));
        fse.removeSync(PATHS.ROOT);
        importerDependency = '';
    });

    it('matches casing variants across query, UUID, URL, reimport, refresh, info, meta, and dependency APIs', async () => {
        const variant = toggleAsciiCase(PATHS.FILE);
        const dependencyVariant = toggleAsciiCase(PATHS.DEPENDENCY);
        const asset = queryAsset(variant);

        expect(asset).to.not.equal(null);
        expect(asset.uuid).to.equal(PATHS.UUID);
        expect(asset.source).to.equal(PATHS.FILE);
        expect(queryUUID(variant)).to.equal(PATHS.UUID);
        expect(database.pathToUuid(variant)).to.equal(PATHS.UUID);
        expect(queryUrl(variant)).to.equal('db://path-case/CaseDir/CaseAsset.TEST');

        const reimported = await reimport(variant);
        expect(reimported.uuid).to.equal(PATHS.UUID);
        expect(await refresh(variant)).to.be.a('number');
        expect(queryAsset(variant).source).to.equal(PATHS.FILE);

        expect(database.infoManager.get(variant)).to.not.equal(null);
        expect(database.metaManager.path2meta[toggleAsciiCase(PATHS.FILE + '.meta')]).to.not.equal(undefined);

        asset.depend(dependencyVariant);
        expect(getAssociatedFiles(dependencyVariant)).to.deep.equal([PATHS.FILE]);
    });

    it('preserves UUID while adopting real casing after a case-only rename', async () => {
        const previousPath = PATHS.FILE;
        const nextPath = path.join(path.dirname(previousPath), 'CASEASSET.test');
        const temporaryPath = path.join(path.dirname(previousPath), 'asset-case-rename.tmp');
        const previousSize = database.path2asset.size;
        const previousAsset = database.getAsset(PATHS.UUID);
        const previousUrl = previousAsset.url;
        const urlDependent = database.path2asset.get(path.dirname(previousPath));
        urlDependent.depend(previousUrl);

        fse.moveSync(previousPath, temporaryPath);
        fse.moveSync(temporaryPath, nextPath);
        fse.moveSync(previousPath + '.meta', temporaryPath + '.meta');
        fse.moveSync(temporaryPath + '.meta', nextPath + '.meta');

        await database.refresh(nextPath);

        const asset = database.getAsset(PATHS.UUID);
        expect(asset.source).to.equal(nextPath);
        expect(asset.url).to.equal('db://path-case/CaseDir/CASEASSET.test');
        expect(asset.basename).to.equal('CASEASSET');
        expect(asset.extname).to.equal('.test');
        expect(database.path2asset.size).to.equal(previousSize);
        expect(Array.from(database.path2asset.keys())).to.include(nextPath);
        expect(queryAsset(previousPath).uuid).to.equal(PATHS.UUID);
        expect(queryUrl(previousPath)).to.equal(asset.url);

        const infoPaths = [];
        await database.infoManager.forEach((file) => infoPaths.push(file));
        expect(infoPaths).to.include(nextPath);
        expect(infoPaths).to.include(nextPath + '.meta');
        expect(Object.keys(database.metaManager.path2meta)).to.include(nextPath + '.meta');
        expect(getAssociatedFiles(toggleAsciiCase(PATHS.DEPENDENCY))).to.deep.equal([nextPath]);
        expect(getAssociatedFiles(asset.url)).to.include(urlDependent.source);
        expect(getAssociatedFiles(previousUrl)).to.deep.equal([]);
    });

    it('adopts real descendant casing when a renamed directory is refreshed directly', async () => {
        const asset = database.getAsset(PATHS.UUID);
        const previousDirectory = path.dirname(asset.source);
        const nextDirectory = path.join(path.dirname(previousDirectory), 'CASEDIR');
        const temporaryDirectory = path.join(path.dirname(previousDirectory), 'directory-case-rename.tmp');
        const previousMeta = previousDirectory + '.meta';
        const nextMeta = nextDirectory + '.meta';
        const temporaryMeta = temporaryDirectory + '.meta';

        fse.moveSync(previousDirectory, temporaryDirectory);
        fse.moveSync(temporaryDirectory, nextDirectory);
        if (fse.existsSync(previousMeta)) {
            fse.moveSync(previousMeta, temporaryMeta);
            fse.moveSync(temporaryMeta, nextMeta);
        }

        await database.refresh(nextDirectory);

        expect(asset.source).to.equal(path.join(nextDirectory, 'CASEASSET.test'));
        expect(asset.url).to.equal('db://path-case/CASEDIR/CASEASSET.test');
        expect(queryAsset(toggleAsciiCase(asset.source)).uuid).to.equal(PATHS.UUID);
    });

    it('rejects conflicting paths returned by a directory scan', async () => {
        const fastGlob = require('fast-glob');
        const originalSync = fastGlob.sync;
        const root = path.join(__dirname, 'path-case-scan-conflict');
        const target = path.join(root, 'target');
        const conflictDatabase = create({
            name: 'path-case-scan-conflict',
            target,
            library: path.join(root, 'library'),
            temp: path.join(root, 'temp'),
            level: 0,
        });
        fse.ensureDirSync(target);

        let error;
        try {
            fastGlob.sync = () => ['A.test', 'a.test'];
            await conflictDatabase.start();
        } catch (caught) {
            error = caught;
        } finally {
            fastGlob.sync = originalSync;
            await conflictDatabase.stop();
            fse.removeSync(root);
        }

        expect(error).to.be.an('error');
        expect(error.code).to.equal('ASSET_DB_PATH_CASE_CONFLICT');
        expect(error.paths.map((item) => path.basename(item))).to.deep.equal(['A.test', 'a.test']);
    });

    it('discards a conflicting core cache and rebuilds it from disk', async () => {
        const root = path.join(__dirname, 'path-case-cache-conflict');
        const target = path.join(root, 'Target');
        const library = path.join(root, 'Library');
        const temp = path.join(root, 'Temp');
        const file = path.join(target, 'CacheDir', 'CacheAsset.test');
        const uuid = v4();
        const options = {
            name: 'path-case-cache-conflict',
            target,
            library,
            temp,
            level: 0,
        };

        fse.outputJSONSync(file, { value: 1 }, { spaces: 2 });
        fse.outputJSONSync(file + '.meta', completionMeta({ uuid }), { spaces: 2 });
        fse.ensureDirSync(library);

        const initialDatabase = create(options);
        initialDatabase.importerManager.add(NoopImporter, ['.test']);
        await initialDatabase.start();
        await initialDatabase.stop();

        const cachePath = path.join(library, `.${options.name}`);
        const cache = fse.readJSONSync(cachePath);
        cache.data.paths.push(toggleAsciiCase(cache.data.paths[0]));
        fse.outputJSONSync(cachePath, cache, { spaces: 2 });

        const restoredDatabase = create(options);
        restoredDatabase.importerManager.add(NoopImporter, ['.test']);
        await restoredDatabase.startWithCache();

        expect(restoredDatabase.path2asset.get(toggleAsciiCase(file)).uuid).to.equal(uuid);
        const rebuiltCache = fse.readJSONSync(cachePath);
        expect(rebuiltCache.data.paths.length).to.equal(new Set(rebuiltCache.data.paths.map((item) => item.toLowerCase())).size);

        await restoredDatabase.stop();
        await new Promise((resolve) => setTimeout(resolve, 600));
        fse.removeSync(root);
    });

    it('reimports assets to rebuild dependencies after a dependency cache conflict', async () => {
        const root = path.join(__dirname, 'path-case-dependency-cache-conflict');
        const target = path.join(root, 'Target');
        const library = path.join(root, 'Library');
        const source = path.join(target, 'Source.test');
        const dependency = path.join(target, 'Dependency.test');
        const options = {
            name: 'path-case-dependency-cache-conflict',
            target,
            library,
            temp: path.join(root, 'Temp'),
            level: 0,
        };

        fse.outputJSONSync(source, { value: 1 }, { spaces: 2 });
        fse.outputJSONSync(dependency, { value: 2 }, { spaces: 2 });
        fse.ensureDirSync(library);

        cacheImporterDependency = dependency;
        try {
            const initialDatabase = create(options);
            initialDatabase.importerManager.add(DependencyCacheImporter, ['.test']);
            await initialDatabase.start();
            await initialDatabase.stop();

            const dependencyCachePath = path.join(library, `.${options.name}-dependency.json`);
            const dependencyCache = fse.readJSONSync(dependencyCachePath);
            const storedPath = Object.keys(dependencyCache.data.path)
                .find((item) => /Source\.test$/i.test(item));
            dependencyCache.data.path[toggleAsciiCase(storedPath)] = dependencyCache.data.path[storedPath];
            fse.outputJSONSync(dependencyCachePath, dependencyCache, { spaces: 2 });

            const restoredDatabase = create(options);
            restoredDatabase.importerManager.add(DependencyCacheImporter, ['.test']);
            await restoredDatabase.startWithCache();

            expect(restoredDatabase.dependencyManager.cacheConflict).to.be.an('error');
            expect(getAssociatedFiles(toggleAsciiCase(dependency))).to.include(source);

            await restoredDatabase.stop();
        } finally {
            cacheImporterDependency = '';
            fse.removeSync(root);
        }
    });

    it('discards a conflicting info cache instead of silently restoring it', async () => {
        const root = path.join(__dirname, 'path-case-info-cache-conflict');
        const target = path.join(root, 'Target');
        const library = path.join(root, 'Library');
        const file = path.join(target, 'InfoDir', 'InfoAsset.test');
        const uuid = v4();
        const options = {
            name: 'path-case-info-cache-conflict',
            target,
            library,
            temp: path.join(root, 'Temp'),
            level: 0,
        };

        fse.ensureDirSync(library);
        fse.outputJSONSync(file, { value: 1 }, { spaces: 2 });
        fse.outputJSONSync(file + '.meta', completionMeta({ uuid }), { spaces: 2 });

        const initialDatabase = create(options);
        initialDatabase.importerManager.add(NoopImporter, ['.test']);
        await initialDatabase.start();
        await initialDatabase.stop();

        const infoCachePath = path.join(library, `.${options.name}-info.json`);
        const infoCache = fse.readJSONSync(infoCachePath);
        const storedPath = Object.keys(infoCache.map).find((item) => /InfoAsset\.test$/i.test(item));
        infoCache.map[toggleAsciiCase(storedPath)] = infoCache.map[storedPath];
        fse.outputJSONSync(infoCachePath, infoCache, { spaces: 2 });

        const restoredDatabase = create(options);
        restoredDatabase.importerManager.add(NoopImporter, ['.test']);
        await restoredDatabase.startWithCache();

        expect(restoredDatabase.infoManager.cacheConflict).to.be.an('error');
        expect(restoredDatabase.path2asset.get(toggleAsciiCase(file)).uuid).to.equal(uuid);
        expect(restoredDatabase.infoManager.get(toggleAsciiCase(file))).to.not.equal(null);

        await restoredDatabase.stop();
        const rebuiltInfoCache = fse.readJSONSync(infoCachePath);
        const identityKeys = Object.keys(rebuiltInfoCache.map).map((item) => item.toLowerCase());
        expect(identityKeys.length).to.equal(new Set(identityKeys).size);

        fse.removeSync(root);
    });
});
