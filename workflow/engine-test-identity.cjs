const fs = require('node:fs');
const path = require('node:path');
const semver = require('semver');
function expectedRuntimeVersion(enginePath, packageVersion) {
    const source = fs.readFileSync(path.join(enginePath, 'cocos/core/global-exports.ts'), 'utf8');
    const literal = source.match(/\b(?:const|let)\s+engineVersion\s*=\s*(['"])([^'"]+)\1/);
    const value = literal ? literal[2] : packageVersion;
    const expected = semver.parse(packageVersion); const declared = semver.parse(value);
    if (!expected || !declared || ['major', 'minor', 'patch'].some(key => expected[key] !== declared[key])) throw new Error('Runtime source version differs from package version');
    return value;
}
module.exports = { expectedRuntimeVersion };
