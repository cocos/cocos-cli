// 类型定义

import { FntData, FontDefDictionary, KerningDict } from '../../../@types/userDatas';

export interface ParsedObj {
    [key: string]: string | number;
}

class FntLoader {
    private readonly INFO_EXP = /info .*?(?=\/>)|info .*/gi;
    private readonly COMMON_EXP = /common .*?(?=\/>)|common .*/gi;
    private readonly PAGE_EXP = /page .*?(?=\/>)|page .*/gi;
    private readonly CHAR_EXP = /char .*?(?=\/>)|char .*/gi;
    private readonly KERNING_EXP = /kerning .*?(?=\/>)|kerning .*/gi;
    private readonly ITEM_EXP = /\w+=[^ \r\n]+/gi;
    private readonly NUM_EXP = /^-?\d+(?:\.\d+)?$/;

    private _parseStrToObj(str: string): ParsedObj {
        const arr = str.match(this.ITEM_EXP);
        const obj: ParsedObj = {};
        if (arr) {
            for (let i = 0, li = arr.length; i < li; i++) {
                const tempStr = arr[i];
                const index = tempStr.indexOf('=');
                const key = tempStr.substring(0, index);
                let value: string | number = tempStr.substring(index + 1);
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
    }

    /**
     * Parse Fnt string.
     * @param fntStr - FNT file content string
     * @returns Parsed font data
     */
    public parseFnt(fntStr: string): FntData {
        const fnt: FntData = {};

        // padding
        const infoResult = fntStr.match(this.INFO_EXP);
        if (!infoResult) {
            return fnt;
        }

        const infoObj = this._parseStrToObj(infoResult[0]);
        // var paddingArr = infoObj["padding"].split(",");
        // var padding = {
        //     left: parseInt(paddingArr[0]),
        //     top: parseInt(paddingArr[1]),
        //     right: parseInt(paddingArr[2]),
        //     bottom: parseInt(paddingArr[3])
        // };

        // common
        const commonMatch = fntStr.match(this.COMMON_EXP);
        if (!commonMatch) {
            return fnt;
        }
        const commonObj = this._parseStrToObj(commonMatch[0]);
        fnt.commonHeight = commonObj['lineHeight'] as number;
        fnt.fontSize = parseInt(infoObj['size'] as string);

        if (cc.game.renderType === cc.game.RENDER_TYPE_WEBGL) {
            const texSize = cc.configuration.getMaxTextureSize();
            if ((commonObj['scaleW'] as number) > texSize.width || (commonObj['scaleH'] as number) > texSize.height) {
                console.log('cc.LabelBMFont._parseCommonArguments(): page can\'t be larger than supported');
            }
        }
        if (commonObj['pages'] !== 1) {
            console.log('cc.LabelBMFont._parseCommonArguments(): only supports 1 page');
        }

        // page
        const pageMatch = fntStr.match(this.PAGE_EXP);
        if (!pageMatch) {
            return fnt;
        }
        const pageObj = this._parseStrToObj(pageMatch[0]);
        if (pageObj['id'] !== 0) {
            console.log('cc.LabelBMFont._parseImageFileName() : file could not be found');
        }
        fnt.atlasName = pageObj['file'] as string;

        // char
        const charLines = fntStr.match(this.CHAR_EXP);
        if (!charLines) {
            return fnt;
        }
        const fontDefDictionary: FontDefDictionary = {};
        fnt.fontDefDictionary = fontDefDictionary;

        for (let i = 0, li = charLines.length; i < li; i++) {
            const charObj = this._parseStrToObj(charLines[i]);
            const charId = charObj['id'] as number;
            fontDefDictionary[charId] = {
                rect: {
                    x: charObj['x'] as number,
                    y: charObj['y'] as number,
                    width: charObj['width'] as number,
                    height: charObj['height'] as number
                },
                xOffset: charObj['xoffset'] as number,
                yOffset: charObj['yoffset'] as number,
                xAdvance: charObj['xadvance'] as number,
            };
        }

        // kerning
        const kerningDict: KerningDict = {};
        fnt.kerningDict = kerningDict;
        const kerningLines = fntStr.match(this.KERNING_EXP);
        if (kerningLines) {
            for (let i = 0, li = kerningLines.length; i < li; i++) {
                const kerningObj = this._parseStrToObj(kerningLines[i]);
                kerningDict[(kerningObj['first'] as number) << 16 | (kerningObj['second'] as number) & 0xffff] = kerningObj['amount'] as number;
            }
        }
        return fnt;
    }
}

export default new FntLoader();
