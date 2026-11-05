'use strict';
module.exports = require('../shared/legacy-backend.cjs')({
    compiler: require('./compiler.cjs'), compilerModule: 'adapters/engine/cocos38/compiler.cjs',
    hostEntry: require('node:path').join(__dirname, 'host.cjs'),
});
