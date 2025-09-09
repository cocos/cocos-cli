const { join } = require('path');

module.exports = function(ccm, info) {
    require('./widget-manager')(ccm);

    // serialize
    const serialize = require(join(info.editor, './builtin/engine/dist/editor-extends/utils/serialize/index'));
    EditorExtends.serialize = serialize.serialize;
    EditorExtends.serializeCompiled = serialize.serializeCompiled;
    const deserialize = require(join(info.editor, './builtin/engine/dist/editor-extends/utils/deserialize'));
    EditorExtends.deserializeFull = deserialize.deserializeFull;
};
