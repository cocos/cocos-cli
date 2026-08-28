'use strict';

const { expect } = require('chai');
const fse = require('fs-extra');
const path = require('path');

const assetdb = require('../dist');
const {
    fsCopy,
    fsReadFile,
    fsRename,
    resetOperationContexts,
    takeOperationContext,
} = require('../dist/libs/filesystem');

describe('AssetDB 文件系统 Provider', () => {
    const PATH = {
        ROOT: path.join(__dirname, './filesystem-provider'),
        TARGET: path.join(__dirname, './filesystem-provider/target'),
        LIBRARY: path.join(__dirname, './filesystem-provider/library'),
        TEMP: path.join(__dirname, './filesystem-provider/temp'),
        FILE: path.join(__dirname, './filesystem-provider/target/1.test'),
        SOURCE: path.join(__dirname, './filesystem-provider/source.txt'),
    };

    function createDB() {
        return new assetdb.AssetDB({
            name: 'test',
            target: PATH.TARGET,
            library: PATH.LIBRARY,
            temp: PATH.TEMP,
            level: 0,
        });
    }

    function createAsset(metaOverrides = {}) {
        const db = createDB();
        const meta = {
            importer: 'test',
            uuid: '12345678-1234-1234-1234-123456789012',
            ...metaOverrides,
        };
        const asset = new assetdb.Asset(PATH.FILE, meta, db);
        return { db, asset };
    }

    afterEach(() => {
        if (typeof assetdb.resetFileSystemProvider === 'function') {
            assetdb.resetFileSystemProvider();
        }
        if (typeof resetOperationContexts === 'function') {
            resetOperationContexts();
        }
        fse.removeSync(PATH.ROOT);
    });

    it('允许注册只有 writeFile 的 provider', () => {
        const provider = {
            writeFile() {},
        };

        expect(assetdb.getFileSystemProvider).to.be.a('function');
        assetdb.setFileSystemProvider(provider);
        expect(assetdb.getFileSystemProvider()).to.equal(provider);
    });

    it('fsReadFile 会优先使用 provider.readFile', async () => {
        const calls = [];
        const provider = {
            async readFile(filePath, encoding) {
                calls.push({ filePath, encoding });
                return encoding ? 'virtual-content' : Buffer.from('virtual-content');
            },
        };

        assetdb.setFileSystemProvider(provider);

        const result = await fsReadFile('virtual://asset', 'utf8');

        expect(result).to.equal('virtual-content');
        expect(calls).to.deep.equal([{
            filePath: 'virtual://asset',
            encoding: 'utf8',
        }]);
    });

    it('saveToLibrary 会使用 provider.writeFile，并由本地实现兜底 createDirectory', async () => {
        const calls = [];
        const provider = {
            async writeFile(filePath, content, options) {
                calls.push({
                    path: filePath,
                    content: content.toString(),
                    options,
                });
                await fse.outputFile(filePath, content);
            },
        };

        assetdb.setFileSystemProvider(provider);

        const { asset } = createAsset();
        const targetFile = path.join(asset.library, 'nested/file.txt');

        await asset.saveToLibrary('nested/file.txt', 'hello');

        expect(calls).to.have.length(1);
        expect(calls[0].path).to.equal(targetFile);
        expect(calls[0].content).to.equal('hello');
        expect(calls[0].options?.context).to.include({
            kind: 'write',
            source: PATH.FILE,
            origin: 'direct-op',
        });
        expect(fse.existsSync(asset.library)).to.equal(true);
        expect(fse.readFileSync(targetFile, 'utf8')).to.equal('hello');

        const context = takeOperationContext(targetFile);
        expect(context).to.include({
            kind: 'write',
            source: PATH.FILE,
            origin: 'direct-op',
        });
        expect(context?.paths).to.deep.equal([targetFile]);
    });

    it('saveToLibrary 会调用 provider.createDirectory', async () => {
        const calls = [];
        const provider = {
            async createDirectory(dirPath) {
                calls.push({
                    type: 'createDirectory',
                    path: dirPath,
                });
                await fse.ensureDir(dirPath);
            },
            async writeFile(filePath, content) {
                calls.push({
                    type: 'writeFile',
                    path: filePath,
                    content: content.toString(),
                });
                await fse.outputFile(filePath, content);
            },
        };

        assetdb.setFileSystemProvider(provider);

        const { asset } = createAsset();
        const targetFile = path.join(asset.library, 'nested/file.txt');

        await asset.saveToLibrary('nested/file.txt', 'hello');

        expect(calls).to.deep.equal([
            {
                type: 'createDirectory',
                path: asset.library,
            },
            {
                type: 'writeFile',
                path: targetFile,
                content: 'hello',
            },
        ]);
    });

    it('deleteFromLibrary 会调用 provider.delete', async () => {
        const calls = [];
        const provider = {
            async delete(filePath, options) {
                calls.push({
                    path: filePath,
                    options,
                });
                await fse.remove(filePath);
            },
        };

        assetdb.setFileSystemProvider(provider);

        const { asset } = createAsset({
            files: ['.copy'],
        });
        const targetFile = `${asset.library}.copy`;

        fse.outputFileSync(targetFile, 'existing');

        await asset.deleteFromLibrary('.copy');

        expect(calls).to.have.length(1);
        expect(calls[0].path).to.equal(targetFile);
        expect(calls[0].options?.context).to.include({
            kind: 'delete',
            source: PATH.FILE,
            origin: 'direct-op',
        });
        expect(fse.existsSync(targetFile)).to.equal(false);
        expect(asset.meta.files).to.deep.equal([]);
    });

    it('deleteFromLibrary internal cleanup should not enter provider trash branch', async () => {
        const trashCalls = [];
        const provider = {
            async delete(filePath, options) {
                if (options?.useTrash !== false) {
                    trashCalls.push(filePath);
                }
                await fse.remove(filePath);
            },
        };

        assetdb.setFileSystemProvider(provider);

        const { asset } = createAsset({
            files: ['.copy'],
        });
        const targetFile = `${asset.library}.copy`;

        fse.outputFileSync(targetFile, 'existing');

        await asset.deleteFromLibrary('.copy');

        expect(trashCalls).to.deep.equal([]);
        expect(fse.existsSync(targetFile)).to.equal(false);
    });

    it('copyToLibrary 会调用 provider.delete 和 provider.copy', async () => {
        const calls = [];
        const provider = {
            async delete(filePath, options) {
                calls.push({
                    type: 'delete',
                    path: filePath,
                    options,
                });
                await fse.remove(filePath);
            },
            async copy(sourcePath, destinationPath, options) {
                calls.push({
                    type: 'copy',
                    source: sourcePath,
                    destination: destinationPath,
                    options,
                });
                await fse.copy(sourcePath, destinationPath);
            },
        };

        assetdb.setFileSystemProvider(provider);

        const { asset } = createAsset();
        const targetFile = `${asset.library}.copy`;

        fse.outputFileSync(PATH.SOURCE, 'source');
        fse.outputFileSync(targetFile, 'existing');

        await asset.copyToLibrary('.copy', PATH.SOURCE);

        expect(calls.map((item) => item.type)).to.deep.equal(['delete', 'copy']);
        expect(calls[0].path).to.equal(targetFile);
        expect(calls[0].options?.context).to.include({
            kind: 'copy',
            source: PATH.FILE,
            origin: 'direct-op',
        });
        expect(calls[1].source).to.equal(PATH.SOURCE);
        expect(calls[1].destination).to.equal(targetFile);
        expect(calls[1].options?.context).to.include({
            kind: 'copy',
            source: PATH.FILE,
            origin: 'direct-op',
        });
        expect(fse.readFileSync(targetFile, 'utf8')).to.equal('source');
        expect(asset.meta.files).to.deep.equal(['.copy']);
    });

    it('copyToLibrary overwrite cleanup should not enter provider trash branch', async () => {
        const trashCalls = [];
        const provider = {
            async delete(filePath, options) {
                if (options?.useTrash !== false) {
                    trashCalls.push(filePath);
                }
                await fse.remove(filePath);
            },
            async copy(sourcePath, destinationPath) {
                await fse.copy(sourcePath, destinationPath);
            },
        };

        assetdb.setFileSystemProvider(provider);

        const { asset } = createAsset();
        const targetFile = `${asset.library}.copy`;

        fse.outputFileSync(PATH.SOURCE, 'source');
        fse.outputFileSync(targetFile, 'existing');

        await asset.copyToLibrary('.copy', PATH.SOURCE);

        expect(trashCalls).to.deep.equal([]);
        expect(fse.readFileSync(targetFile, 'utf8')).to.equal('source');
    });

    it('fsCopy 使用本地 provider 时，未显式传 overwrite 也应保留默认覆盖语义', async () => {
        const sourcePath = path.join(PATH.ROOT, 'copy-default-source.txt');
        const targetPath = path.join(PATH.ROOT, 'copy-default-target.txt');

        fse.outputFileSync(sourcePath, 'new-content');
        fse.outputFileSync(targetPath, 'original-content');

        await fsCopy(sourcePath, targetPath);

        expect(fse.readFileSync(targetPath, 'utf8')).to.equal('new-content');
    });

    it('fsRename 会优先使用 provider.rename', async () => {
        const calls = [];
        const sourcePath = path.join(PATH.ROOT, 'rename-source.txt');
        const targetPath = path.join(PATH.ROOT, 'rename-target.txt');
        fse.outputFileSync(sourcePath, 'rename-me');

        const provider = {
            async rename(oldPath, newPath, options) {
                calls.push({
                    oldPath,
                    newPath,
                    options,
                });
                await fse.move(oldPath, newPath, { overwrite: !!options?.overwrite });
            },
        };

        assetdb.setFileSystemProvider(provider);

        await fsRename(sourcePath, targetPath, {
            overwrite: true,
            context: {
                opId: 'rename-op-1',
                kind: 'rename',
                origin: 'direct-op',
                source: sourcePath,
                paths: [sourcePath, targetPath],
                timestamp: 1,
            },
        });

        expect(calls).to.deep.equal([{
            oldPath: sourcePath,
            newPath: targetPath,
            options: {
                overwrite: true,
                context: {
                    opId: 'rename-op-1',
                    kind: 'rename',
                    origin: 'direct-op',
                    source: sourcePath,
                    paths: [sourcePath, targetPath],
                    timestamp: 1,
                },
            },
        }]);
        expect(fse.existsSync(sourcePath)).to.equal(false);
        expect(fse.readFileSync(targetPath, 'utf8')).to.equal('rename-me');
    });

    it('save 会使用 provider.writeFile，但 exists/stat 统一回退到本地实现', async () => {
        let existsCalls = 0;
        let statCalls = 0;
        let writeCalls = 0;
        const provider = {
            exists() {
                existsCalls += 1;
                return false;
            },
            stat() {
                statCalls += 1;
                return {
                    isDirectory() {
                        return false;
                    },
                    mtimeMs: 999,
                };
            },
            async writeFile(filePath, content) {
                writeCalls += 1;
                await fse.outputFile(filePath, content);
            },
        };

        assetdb.setFileSystemProvider(provider);

        const { db, asset } = createAsset();
        const metaPath = `${PATH.FILE}.meta`;

        fse.outputFileSync(PATH.FILE, 'source');
        await db.metaManager.get(metaPath);
        db.metaManager.path2meta[metaPath].json = asset.meta;
        writeCalls = 0;

        const result = await asset.save();

        expect(result).to.equal(true);
        expect(writeCalls).to.equal(1);
        expect(existsCalls).to.equal(0);
        expect(statCalls).to.equal(0);
        expect(fse.existsSync(metaPath)).to.equal(true);
        expect(db.infoManager.get(metaPath)?.time).to.be.a('number');
    });

    it('isDirectory 保持同步接口，并忽略 provider.stat', () => {
        let statCalls = 0;
        const provider = {
            stat() {
                statCalls += 1;
                return {
                    isDirectory() {
                        return false;
                    },
                    mtimeMs: 0,
                };
            },
        };

        assetdb.setFileSystemProvider(provider);

        const { asset } = createAsset();
        fse.ensureDirSync(PATH.FILE);

        const result = asset.isDirectory();

        expect(result).to.equal(true);
        expect(statCalls).to.equal(0);
    });
});
