const fs = require('fs-extra');
const path = require('path');

async function writeArtifactManifest(directory, engineDir, kind) {
    const engine = await fs.readJSON(path.join(engineDir, 'package.json'));
    await fs.outputJSON(path.join(directory, 'simulator-artifact.json'), {
        formatVersion: 1, kind, engineVersion: engine.version,
        platform: process.platform, arch: process.arch, builtAt: new Date().toISOString(),
    }, { spaces: 2 });
}
module.exports = { writeArtifactManifest };
