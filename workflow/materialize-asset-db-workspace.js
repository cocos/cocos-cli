const fs = require('fs-extra');
const path = require('path');
const { runCommand } = require('./utils');

async function collectRuntimeFiles(root, current = root, files = []) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
        const absolutePath = path.join(current, entry.name);
        if (entry.isDirectory()) {
            await collectRuntimeFiles(root, absolutePath, files);
            continue;
        }
        const stat = await fs.stat(absolutePath);
        files.push({
            path: path.relative(root, absolutePath).replace(/\\/g, '/'),
            bytes: stat.size,
        });
    }
    return files;
}

/**
 * Replace the AssetDB workspace link with one self-contained runtime copy.
 * Release archives must not depend on the workspace source tree or contain
 * duplicate package contents when a Windows junction is dereferenced.
 */
async function materializeAssetDbWorkspace(extensionDir) {
    const workspacePath = path.join(extensionDir, 'packages', 'asset-db');
    const installedPath = path.join(extensionDir, 'node_modules', '@cocos', 'asset-db');
    const temporaryPath = path.join(extensionDir, 'node_modules', '@cocos', '.asset-db-materialized');

    if (!await fs.pathExists(workspacePath)) {
        throw new Error(`AssetDB workspace is missing from release staging: ${workspacePath}`);
    }
    if (!await fs.pathExists(path.join(workspacePath, 'dist', 'index.js'))) {
        throw new Error('AssetDB build output is missing; run npm run build before release');
    }
    if (!await fs.pathExists(installedPath)) {
        throw new Error(`Installed AssetDB workspace link is missing: ${installedPath}`);
    }

    await fs.remove(temporaryPath);
    await fs.copy(workspacePath, temporaryPath, { dereference: true });
    await fs.remove(installedPath);
    await fs.move(temporaryPath, installedPath);
    await fs.remove(workspacePath);

    const installedStat = await fs.lstat(installedPath);
    if (installedStat.isSymbolicLink()) {
        throw new Error('AssetDB release package must be a physical directory, not a workspace link');
    }

    const forbiddenEntries = [
        'source',
        'test',
        'scripts',
        'db',
        'docs',
        'tsconfig.json',
        '.npmrc',
        '.gitignore',
    ];
    for (const entry of forbiddenEntries) {
        if (await fs.pathExists(path.join(installedPath, entry))) {
            throw new Error(`Unexpected AssetDB development file in release staging: ${entry}`);
        }
    }

    await runCommand(process.execPath, [
        '-e',
        "const assetdb = require('@cocos/asset-db'); if (typeof assetdb.create !== 'function') process.exit(1);",
    ], { cwd: extensionDir, shell: false });
    const runtimeFiles = await collectRuntimeFiles(installedPath);
    const runtimeBytes = runtimeFiles.reduce((total, file) => total + file.bytes, 0);
    console.log(`AssetDB workspace materialized as a single runtime package (${runtimeFiles.length} files, ${runtimeBytes} bytes)`);
    runtimeFiles.forEach((file) => console.log(`  ${file.path} (${file.bytes} bytes)`));
}

module.exports = {
    materializeAssetDbWorkspace,
};
