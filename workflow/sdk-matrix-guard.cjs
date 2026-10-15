/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, __dirname, __filename */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const config = JSON.parse(fs.readFileSync(process.env.SDK_MATRIX_CONFIG, 'utf8'));
const roots = [config.cli, config.engine, config.project].map(root => fs.realpathSync(root));
const harness = [__filename, path.join(__dirname, 'sdk-matrix-pair.cjs')];
const original = Module._resolveFilename;
Module._resolveFilename = function (...args) {
    const resolved = original.apply(this, args);
    if (path.isAbsolute(resolved)) {
        const real = fs.realpathSync(resolved);
        if (!harness.includes(real) && !roots.some(root => { const rel = path.relative(root, real); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); })) {
            throw new Error(`SDK resolved a module outside this pair: ${resolved}`);
        }
    }
    return resolved;
};
