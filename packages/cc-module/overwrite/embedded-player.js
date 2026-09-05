'use strict';

module.exports = function patchEmbeddedPlayer(ccm, embeddedPlayerModule) {
    if (!embeddedPlayerModule) {
        try {
            embeddedPlayerModule = require('cc/editor/embedded-player');
        } catch {
            return;
        }
    }

    const EmbeddedPlayer = embeddedPlayerModule.EmbeddedPlayer;
    const editorExtrasTag = ccm.editorExtrasTag || '__editorExtras__';
    const classAttr = ccm.CCClass?.Attr;
    if (!EmbeddedPlayer || !classAttr || !Array.isArray(EmbeddedPlayer.__props__) || !Array.isArray(EmbeddedPlayer.__values__)) {
        return;
    }

    // CLI 以非 EDITOR 模式加载引擎，需要补回播放器的编辑器扩展数据。
    if (!EmbeddedPlayer.__props__.includes(editorExtrasTag)) {
        EmbeddedPlayer.__props__.push(editorExtrasTag);
    }
    if (!EmbeddedPlayer.__values__.includes(editorExtrasTag)) {
        EmbeddedPlayer.__values__.push(editorExtrasTag);
    }
    classAttr.setClassAttr(EmbeddedPlayer, editorExtrasTag, 'serializable', true);
    classAttr.setClassAttr(EmbeddedPlayer, editorExtrasTag, 'visible', false);
};
