const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const platformsDir = path.join(__dirname, '..', 'src', 'core', 'builder', 'platforms');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function readPackageJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`Failed to read ${file}: ${error.message}`);
    }
}

if (!fs.existsSync(platformsDir)) {
    process.exit(0);
}

const platformDirs = fs.readdirSync(platformsDir)
    .map((name) => path.join(platformsDir, name))
    .filter((dir) => fs.statSync(dir).isDirectory())
    .sort();

let buildCount = 0;

for (const platformDir of platformDirs) {
    const packageJSONPath = path.join(platformDir, 'package.json');
    if (!fs.existsSync(packageJSONPath)) {
        continue;
    }

    const pkg = readPackageJSON(packageJSONPath);
    if (!pkg.scripts || !pkg.scripts['build-view']) {
        continue;
    }

    buildCount++;
    console.log(`[build-platform-views] ${path.basename(platformDir)}: npm run build-view`);

    const result = spawnSync(npmCmd, ['run', 'build-view'], {
        cwd: platformDir,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    });

    if (result.error) {
        console.error(`[build-platform-views] failed to run build-view for ${path.basename(platformDir)}: ${result.error.message}`);
        process.exit(1);
    }

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

if (buildCount === 0) {
    console.log('[build-platform-views] no platform build-view scripts found.');
}
