const patchEmbeddedPlayer = require('../packages/cc-module/overwrite/embedded-player') as (
    ccm: Record<string, any>,
    embeddedPlayerModule: Record<string, any>,
) => void;

describe('EmbeddedPlayer cc-module overwrite', () => {
    it('补全编辑器扩展属性的序列化语义', () => {
        class EmbeddedPlayer {
            static __props__: string[] = [];
            static __values__: string[] = [];
        }
        const setClassAttr = jest.fn();
        const ccm = {
            editorExtrasTag: '__editorExtras__',
            CCClass: {
                Attr: {
                    setClassAttr,
                },
            },
        };

        patchEmbeddedPlayer(ccm, { EmbeddedPlayer });
        patchEmbeddedPlayer(ccm, { EmbeddedPlayer });

        expect(EmbeddedPlayer.__props__).toEqual(['__editorExtras__']);
        expect(EmbeddedPlayer.__values__).toEqual(['__editorExtras__']);
        expect(setClassAttr).toHaveBeenCalledWith(EmbeddedPlayer, '__editorExtras__', 'serializable', true);
        expect(setClassAttr).toHaveBeenCalledWith(EmbeddedPlayer, '__editorExtras__', 'visible', false);
        expect(setClassAttr).toHaveBeenCalledWith(EmbeddedPlayer, '__editorExtras__', 'editorOnly', true);
    });
});
