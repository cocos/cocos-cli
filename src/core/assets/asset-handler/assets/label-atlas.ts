import { Asset, queryAsset } from '@editor/asset-db';
import { AssetHandler, IAsset } from '../../@types/protected';
import { SpriteFrame } from 'cc';
import { basename } from 'path';

import { getDependUUIDList } from '../utils';

const fntParser = require('../../../static/utils/fnt-parser');

const FONT_SIZE = 0.88;

interface ILabelAtlasUserData {
    itemWidth: number;
    itemHeight: number;
    startChar: string;
    fontSize: number;
    spriteFrameUuid: string;
    _fntConfig: {};
}

const defaultLabelAtlasUserData = {
    itemWidth: 2, // 默认值 1 - 32, 原本为 0 会导致引擎报错
    itemHeight: 2, // 默认值 1 - 32, 原本为 0 会导致引擎报错
    fontSize: 0,
    startChar: '',
    spriteFrameUuid: '',
    _fntConfig: {},
};

export const LabelAtlasHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'label-atlas',
    assetType: 'cc.LabelAtlas',
    createInfo: {
        generateMenuInfo() {
            return [
                {
                    label: 'i18n:ENGINE.assets.newLabelAtlas',
                    fullFileName: 'label-atlas.labelatlas',
                    template: `db://internal/default_file_content/${LabelAtlasHandler.name}/default.labelatlas`,
                },
            ];
        },
    },
    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.1',
        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否导入成功的标记
         * 如果返回 false，则 imported 标记不会变成 true
         * 后续的一系列操作都不会执行
         * @param asset
         */
        async import(asset: Asset) {
            const userData = asset.userData as ILabelAtlasUserData;
            // @ts-ignore
            Object.keys(defaultLabelAtlasUserData).forEach((key: string) => {
                if (!(key in userData)) {
                    // @ts-ignore
                    userData[key] = defaultLabelAtlasUserData[key];
                }
            });

            const labelAtlas = createLabelAtlas(asset);

            if (userData.spriteFrameUuid) {
                asset.depend(userData.spriteFrameUuid);
                const spriteFrameAsset = queryAsset(asset.userData.spriteFrameUuid);
                if (!spriteFrameAsset) {
                    return false;
                }
                labelAtlas.fontSize = userData.fontSize = userData.itemHeight * FONT_SIZE;
                // @ts-ignore
                labelAtlas.spriteFrame = EditorExtends.serialize.asAsset(userData.spriteFrameUuid, SpriteFrame);
                labelAtlas.fntConfig = userData._fntConfig = createFntConfigString(asset, spriteFrameAsset);
            }

            labelAtlas.name = asset.basename || '';

            const serializeJSON = EditorExtends.serialize(labelAtlas);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default LabelAtlasHandler;

/**
 * 创建一个 LabelAtlas 实例对象
 * @param asset
 */
function createLabelAtlas(asset: Asset) {
    // @ts-ignore
    const labelAtlas = new cc.LabelAtlas();
    labelAtlas.name = basename(asset.source, asset.extname);

    labelAtlas.fontSize = asset.userData.fontSize;
    labelAtlas.fntConfig = asset.userData._fntConfig;

    return labelAtlas;
}

function createFntConfigString(asset: Asset, spriteFrameAsset: IAsset) {
    const userData = asset.userData as ILabelAtlasUserData;
    const { itemWidth, itemHeight, fontSize } = userData;

    const spriteMeta = spriteFrameAsset.meta;
    const { rawWidth, rawHeight } = spriteMeta.userData;

    let result = null;
    if (userData.itemWidth > 0 && userData.itemHeight > 0 && userData.itemWidth <= rawWidth && userData.itemHeight <= rawHeight) {
        const textureName = spriteMeta.displayName;

        const startCharCode = userData.startChar.charCodeAt(0);

        result = `info face="Arial" size=${fontSize} bold=0 italic=0 charset="" unicode=0 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spaceing=0,0\n`;
        result += `common lineHeight=${itemHeight} base=${fontSize} scaleW=${rawWidth} scaleH=${rawHeight} pages=1 packed=0\n`;
        result += `page id=0 file="${textureName}"\n`;
        result += 'chars count=0\n';

        let totalChars = 0;
        for (let col = itemHeight; col <= rawHeight; col += itemHeight) {
            for (let row = 0; row < rawWidth && row + itemWidth <= rawWidth; row += itemWidth) {
                const charCode = startCharCode + totalChars;
                const x = row;
                const y = col - itemHeight;
                const char = String.fromCharCode(charCode);

                result += `char id=${charCode}     x=${x}   y=${y}   width=${itemWidth}     height=${itemHeight}     xoffset=0     yoffset=0    xadvance=${itemWidth}    page=0 chnl=0 letter="${char}"\n`;

                ++totalChars;
            }
        }
        return fntParser.parseFnt(result);
    } else {
        let warnLog = `LabelAtlas '${asset._url}' fnt data invalid, `;
        if (userData.itemWidth <= 0 || userData.itemWidth > rawWidth) {
            warnLog += `the item width must range from 1 - ${rawWidth}.`;
        } else if (userData.itemHeight <= 0 || userData.itemHeight > rawHeight) {
            warnLog += `the item height must range from 1 - ${rawHeight}.`;
        }
        console.warn(warnLog);
        return null;
    }
}
