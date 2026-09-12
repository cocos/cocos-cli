/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console */
const path = require('node:path');
const { compileEngine } = require(path.resolve(process.argv[2], 'packages/engine-compiler/dist/index.js'));
(async () => {
    await compileEngine(path.resolve(process.argv[3]));
    await compileEngine(path.resolve(process.argv[3]), true);
})().catch(error => { console.error(error); process.exitCode = 1; });
