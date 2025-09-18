'use strict';

import { Asset, queryAsset } from '@editor/asset-db';
import { SpriteFrame } from 'cc';
import { existsSync, readFile } from 'fs-extra';
import { basename, dirname, join } from 'path';
import { changeImageDefaultType } from './utils/image-utils';

import { getDependUUIDList } from '../utils';
import { AssetHandler } from '../../@types/protected';

const fntParser = require('./utils/fnt-parser');

/**
 * 获取实际的纹理文件位置
 * @param name
 * @param path
 */
function getRealFntTexturePath(name: string, asset: Asset) {
    // const isWin32Path = name.indexOf(':') !== -1;
    const textureBaseName = basename(name);

    // if (isWin32Path) {
    //     textureBaseName = Path.win32.basename(textureName);
    // }
    const texturePath = join(dirname(asset.source), textureBaseName);

    if (!existsSync(texturePath)) {
        console.warn('Parse Error: Unable to find file Texture, the path: ' + texturePath);
    }
    return texturePath;
}

const UserFlags = {
    DoNotNotify: false,
};

export const BitmapHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'bitmap-font',

    // 编辑器属性上定义的如果是资源的基类类型，此处也需要定义基类类型
    // 不会影响实际资源类型
    assetType: 'cc.BitmapFont',

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.6',
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
            // 解析文字文件
            const fntData = await readFile(asset.source, 'utf8');
            let fntConfig;
            try {
                fntConfig = fntParser.parseFnt(fntData);
            } catch (error) {
                console.error(error);
                throw new Error(`BitmapFont import failed: ${asset.uuid} file parsing failed`);
            }

            // 缓存 fnt 配置
            asset.userData._fntConfig = fntConfig;

            // 如果文字尺寸不存在的话，不需要导入
            if (!fntConfig.fontSize) {
                console.error(`BitmapFont import failed: ${asset.uuid} file parsing failed, There is no 'fontSize' in the configuration.`);
                return false;
            }

            asset.userData.fontSize = fntConfig.fontSize;

            // 标记依赖资源
            const texturePath = getRealFntTexturePath(fntConfig.atlasName, asset);
            asset.depend(texturePath);
            const textureUuid = asset._assetDB.pathToUuid(texturePath);
            if (!textureUuid) {
                return false;
            }

            // 挂载 textureUuid
            asset.userData.textureUuid = textureUuid;

            // 如果依赖的资源已经导入完成了，则生成对应的数据，并且
            if (asset.userData.textureUuid) {
                const textureAsset = queryAsset(asset.userData.textureUuid);

                if (!textureAsset) {
                    return false;
                }

                changeImageDefaultType(textureAsset, 'sprite-frame');

                const bitmap = createBitmapFnt(asset);

                bitmap.spriteFrame = EditorExtends.serialize.asAsset(textureAsset.uuid + '@f9941', SpriteFrame);

                const serializeJSON = EditorExtends.serialize(bitmap);
                await asset.saveToLibrary('.json', serializeJSON);

                const depends = getDependUUIDList(serializeJSON);
                asset.setData('depends', depends);
            }
            return true;
        },
    },

    /**
     * 判断是否允许使用当前的 Handler 进行导入
     * @param asset
     */
    async validate(asset: Asset) {
        return true;
    },
};

export default BitmapHandler;

/**
 * 创建一个 Bitmap 实例对象
 * @param asset
 */
function createBitmapFnt(asset: Asset) {
    // @ts-ignore
    const bitmap = new cc.BitmapFont();
    bitmap.name = basename(asset.source, asset.extname);
    // 3.5 再改
    bitmap.name = asset.basename || '';

    bitmap.fontSize = asset.userData.fontSize;
    bitmap.fntConfig = asset.userData._fntConfig;

    return bitmap;
}
