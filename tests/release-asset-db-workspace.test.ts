import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const fse = require('fs-extra');
const { materializeAssetDbWorkspace } = require('../workflow/materialize-asset-db-workspace');

describe('AssetDB release workspace materialization', () => {
    let stagingRoot = '';

    afterEach(async () => {
        if (stagingRoot) {
            await fs.promises.rm(stagingRoot, { recursive: true, force: true });
        }
    });

    it('replaces the workspace link with one self-contained runtime package', async () => {
        stagingRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cocos-cli-asset-db-release-'));

        const sourcePackage = path.resolve(__dirname, '../packages/asset-db');
        const workspacePackage = path.join(stagingRoot, 'packages', 'asset-db');
        const installedPackage = path.join(stagingRoot, 'node_modules', '@cocos', 'asset-db');

        await fse.ensureDir(workspacePackage);
        await fse.copyFile(
            path.join(sourcePackage, 'package.json'),
            path.join(workspacePackage, 'package.json'),
        );
        await fse.copy(
            path.join(sourcePackage, 'dist'),
            path.join(workspacePackage, 'dist'),
        );
        await fse.ensureDir(path.dirname(installedPackage));
        await fs.promises.symlink(
            workspacePackage,
            installedPackage,
            process.platform === 'win32' ? 'junction' : 'dir',
        );
        for (const dependency of ['fast-glob', 'graceful-fs', 'node-uuid', 'workflow-extra']) {
            await fs.promises.symlink(
                path.resolve(__dirname, '../node_modules', dependency),
                path.join(stagingRoot, 'node_modules', dependency),
                process.platform === 'win32' ? 'junction' : 'dir',
            );
        }
        await fse.ensureDir(path.join(workspacePackage, 'node_modules'));
        for (const dependency of ['fs-extra', 'jsonfile', 'universalify']) {
            await fs.promises.symlink(
                path.resolve(__dirname, '../packages/asset-db/node_modules', dependency),
                path.join(workspacePackage, 'node_modules', dependency),
                process.platform === 'win32' ? 'junction' : 'dir',
            );
        }

        expect((await fs.promises.lstat(installedPackage)).isSymbolicLink()).toBe(true);

        await materializeAssetDbWorkspace(stagingRoot);

        expect(await fse.pathExists(workspacePackage)).toBe(false);
        expect((await fs.promises.lstat(installedPackage)).isSymbolicLink()).toBe(false);
        expect((await fs.promises.readdir(installedPackage)).sort()).toEqual(['dist', 'node_modules', 'package.json']);
        expect((await fs.promises.readdir(path.join(installedPackage, 'node_modules'))).sort()).toEqual([
            'fs-extra',
            'jsonfile',
            'universalify',
        ]);
        for (const devDependency of ['@types', 'chai', 'mocha', 'typescript']) {
            expect(await fse.pathExists(path.join(installedPackage, 'node_modules', devDependency))).toBe(false);
        }
    });
});
