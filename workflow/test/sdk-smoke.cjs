/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console */
'use strict';
// Run in a fresh process. Reject resolution back into the development checkout.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = fs.realpathSync(process.argv[2]);
const kind = process.argv[3];
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (...args) {
    const resolved = originalResolve.apply(this, args);
    if (path.isAbsolute(resolved)) {
        const relative = path.relative(root, fs.realpathSync(resolved));
        if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`SDK resolved outside its artifact: ${resolved}`);
    }
    return resolved;
};
if (kind === 'cli') {
    // Do not initialize application telemetry for a local packaging smoke test.
    require(path.join(root, 'dist/core/base/sentry.js')).initSentry = () => {};
    process.argv = [process.execPath, path.join(root, 'dist/cli.js'), '--help'];
    require(path.join(root, 'dist/cli.js'));
} else if (kind === 'engine') {
    const { StatsQuery } = require(path.join(root, 'node_modules/@cocos/ccbuild'));
    StatsQuery.create(root).then(query => {
        const features = query.getFeatures();
        if (!features.length) throw new Error('Engine SDK has no features');
        console.log(JSON.stringify({ engine: root, features: features.length, version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version }));
    }).catch(error => { console.error(error); process.exitCode = 1; });
} else throw new Error('Expected cli or engine');
