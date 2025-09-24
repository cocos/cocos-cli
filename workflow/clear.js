const fse = require('fs-extra');
const path = require('path');

function clear() {
    // remove dit
    let dir = path.join(__dirname, '..', 'dist');
    fse.removeSync(dir);
    console.log('clear ', dir);
    dir = path.join(__dirname, '..', 'node_modules');
    fse.removeSync(dir);
    console.log('clear ', dir);
    // remove bin/engine
    dir = path.join(__dirname, '..', 'bin', 'engine');
    fse.removeSync(dir);
    console.log('clear ', dir);
    // remove cc-module list
    const list = ['editor', 'loader.js', 'loader.d.ts', 'preload.js', 'preload.d.ts'];
    for (const name of list) {
        dir = path.join(__dirname, '..', 'packages', 'engine', 'cc-module', name)
        fse.removeSync(dir);
        console.log('clear ', dir);
    }
}

console.time('clear');
clear();
console.timeEnd('clear');
