'use strict';
module.exports = require('../shared/legacy-compiler.cjs')({
    id: 'cocos-3.8-runtime', cacheVersion: 'cocos-3.8-cli-6', cacheDirectory: 'dev-cli-3.8',
    supportsVersion: version => typeof version === 'string' && /^3\.8\.[0-8]$/.test(version),
});
