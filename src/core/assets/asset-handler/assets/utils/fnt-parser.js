'use strict';

var FntLoader = {
    INFO_EXP: /info .*?(?=\/>)|info .*/gi,
    COMMON_EXP: /common .*?(?=\/>)|common .*/gi,
    PAGE_EXP: /page .*?(?=\/>)|page .*/gi,
    CHAR_EXP: /char .*?(?=\/>)|char .*/gi,
    KERNING_EXP: /kerning .*?(?=\/>)|kerning .*/gi,
    ITEM_EXP: /\w+=[^ \r\n]+/gi,
    NUM_EXP: /^\-?\d+(?:\.\d+)?$/, // eslint-disable-line

    _parseStrToObj: function(str) {
        var arr = str.match(this.ITEM_EXP);
        var obj = {};
        if (arr) {
            for (var i = 0, li = arr.length; i < li; i++) {
                var tempStr = arr[i];
                var index = tempStr.indexOf('=');
                var key = tempStr.substring(0, index);
                var value = tempStr.substring(index + 1);
                if (value[0] === '"') {
                    value = value.substring(1, value.length - 1);
                    if (value.match(this.NUM_EXP)) {
                        value = parseFloat(value);
                    }
                } else if (value.match(this.NUM_EXP)) {
                    value = parseFloat(value);
                }
                obj[key] = value;
            }
        }
        return obj;
    },

    /**
     * Parse Fnt string.
     * @param fntStr
     * @returns {{}}
     */
    parseFnt: function(fntStr) {
        var self = this,
            fnt = {};
        // padding
        var infoResult = fntStr.match(self.INFO_EXP);
        if (!infoResult) {
            return fnt;
        }

        var infoObj = self._parseStrToObj(infoResult[0]);
        // var paddingArr = infoObj["padding"].split(",");
        // var padding = {
        //     left: parseInt(paddingArr[0]),
        //     top: parseInt(paddingArr[1]),
        //     right: parseInt(paddingArr[2]),
        //     bottom: parseInt(paddingArr[3])
        // };

        // common
        var commonObj = self._parseStrToObj(fntStr.match(self.COMMON_EXP)[0]);
        fnt.commonHeight = commonObj['lineHeight'];
        fnt.fontSize = parseInt(infoObj['size']);

        if (cc.game.renderType === cc.game.RENDER_TYPE_WEBGL) {
            var texSize = cc.configuration.getMaxTextureSize();
            if (commonObj['scaleW'] > texSize.width || commonObj['scaleH'] > texSize.height) {
                Editor.log('cc.LabelBMFont._parseCommonArguments(): page can\'t be larger than supported');
            }
        }
        if (commonObj['pages'] !== 1) {
            Editor.log('cc.LabelBMFont._parseCommonArguments(): only supports 1 page');
        }

        // page
        var pageObj = self._parseStrToObj(fntStr.match(self.PAGE_EXP)[0]);
        if (pageObj['id'] !== 0) {
            Editor.log('cc.LabelBMFont._parseImageFileName() : file could not be found');
        }
        fnt.atlasName = pageObj['file'];

        // char
        var charLines = fntStr.match(self.CHAR_EXP);
        var fontDefDictionary = (fnt.fontDefDictionary = {});
        for (var i = 0, li = charLines.length; i < li; i++) {
            var charObj = self._parseStrToObj(charLines[i]);
            var charId = charObj['id'];
            fontDefDictionary[charId] = {
                rect: { x: charObj['x'], y: charObj['y'], width: charObj['width'], height: charObj['height'] },
                xOffset: charObj['xoffset'],
                yOffset: charObj['yoffset'],
                xAdvance: charObj['xadvance'],
            };
        }

        // kerning
        var kerningDict = (fnt.kerningDict = {});
        var kerningLines = fntStr.match(self.KERNING_EXP);
        if (kerningLines) {
            for (i = 0, li = kerningLines.length; i < li; i++) {
                var kerningObj = self._parseStrToObj(kerningLines[i]);
                kerningDict[(kerningObj['first'] << 16) | (kerningObj['second'] & 0xffff)] = kerningObj['amount'];
            }
        }
        return fnt;
    },
};

module.exports = FntLoader;
