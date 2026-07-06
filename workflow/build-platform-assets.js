const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');

const srcPlatformsDir = path.join(__dirname, '..', 'src', 'core', 'builder', 'platforms');
const distPlatformsDir = path.join(__dirname, '..', 'dist', 'core', 'builder', 'platforms');
const assetNames = ['package.json', 'static', 'dist'];

if (!fs.existsSync(srcPlatformsDir)) {
    process.exit(0);
}

const platformDirs = fs.readdirSync(srcPlatformsDir)
    .map((name) => path.join(srcPlatformsDir, name))
    .filter((dir) => fs.statSync(dir).isDirectory())
    .sort();

let copiedCount = 0;

for (const platformDir of platformDirs) {
    const packageJSONPath = path.join(platformDir, 'package.json');
    if (!fs.existsSync(packageJSONPath)) {
        continue;
    }

    const platformName = path.basename(platformDir);
    const distPlatformDir = path.join(distPlatformsDir, platformName);
    const copiedAssets = [];

    for (const assetName of assetNames) {
        const srcPath = path.join(platformDir, assetName);
        if (!fs.existsSync(srcPath)) {
            continue;
        }

        fse.copySync(srcPath, path.join(distPlatformDir, assetName), {
            overwrite: true,
        });
        copiedAssets.push(assetName);
    }

    if (copiedAssets.length > 0) {
        copiedCount++;
        console.log(`[build-platform-assets] ${platformName}: ${copiedAssets.join(', ')}`);
    }
}

if (copiedCount === 0) {
    console.log('[build-platform-assets] no platform assets found.');
}
