const { readFileSync } = require('node:fs');
const mappings = require('./offline-mappings');
const compiler = require('./shdc-lib');
const { stripEditorSupport } = require('./utils');

let prebuiltChunkRegistry;

function loadPrebuiltChunks() {
    if (prebuiltChunkRegistry) {
        compiler.restoreChunkRegistry(JSON.parse(readFileSync(prebuiltChunkRegistry, 'utf8')));
        prebuiltChunkRegistry = undefined;
    }
}

module.exports = {
    options: compiler.options,
    usePrebuiltChunkRegistry(file) {
        prebuiltChunkRegistry = file;
    },
    getChunkRegistry: compiler.getChunkRegistry,
    addChunk(name, content) {
        loadPrebuiltChunks();
        compiler.addChunk(name, content);
    },
    buildEffect(name, content) {
        loadPrebuiltChunks();
        return compiler.buildEffect(name, content);
    },
    stripEditorSupport,
    mappings,
};
