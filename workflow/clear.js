const fse = require('fs-extra');
const path = require('path');

function clear() {
    // remove dit
    let dir = path.join(__dirname, '..', 'dist');
    fse.removeSync(dir);
    console.log('clear ', dir);
    // remove node_modules
    dir = path.join(__dirname, '..', 'node_modules');
    fse.removeSync(dir);
    console.log('clear ', dir);
    // remove cc-module list
    const list = ['editor', 'loader.js', 'loader.d.ts', 'preload.js', 'preload.d.ts'];
    for (const name of list) {
        dir = path.join(__dirname, '..', 'packages', 'cc-module', name);
        fse.removeSync(dir);
        console.log('clear ', dir);
    }
    // remove packages/engine-compiler
    const sourceDir = path.join(__dirname, '../packages/engine-compiler/dist');
    fse.removeSync(sourceDir);
}

console.time('clear');
clear();
console.timeEnd('clear');
