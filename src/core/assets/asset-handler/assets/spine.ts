import { Asset, queryAsset, queryUUID } from '@editor/asset-db';
import * as path from 'path';
import * as fs from 'fs';
import * as fse from 'fs-extra';
const ATLAS_EXTS = ['.atlas', '.txt', '.atlas.txt', ''];

import { sp, Texture2D } from 'cc';

import { getDependUUIDList } from '../utils';
import { AssetHandler } from '../../@types/protected';

interface ISpineUserData {
    atlasUuid: string;
}

interface ISpineAtlas {
    path: string;
    content: string;
}

interface IParserAtlasResults {
    textures: Texture2D[];
    textureNames: string[];
    atlasText: string;
    atlasUuid: string;
}

function searchAtlas<T>(skeletonPath: string, callback: (err: Error | null, p?: string) => T) {
    const ext = path.extname(skeletonPath);
    skeletonPath = skeletonPath.substr(0, skeletonPath.length - ext.length);

    function next(index: number) {
        const suffix = ATLAS_EXTS[index];
        const path = skeletonPath + suffix;
        fs.exists(path, (exists: boolean) => {
            if (exists) {
                return callback(null, path);
            } else if (index + 1 < ATLAS_EXTS.length) {
                next(index + 1);
            } else {
                // 表示没有找到
                callback(null, undefined);
            }
        });
    }

    next(0);
}

function loadAtlasText(asset: Asset, callback: (err: null | Error, ret: ISpineAtlas | null) => void) {
    searchAtlas(asset.source, (err: Error | null, p?: string) => {
        if (err) {
            return callback(err, null);
        }
        if (!p) {
            callback(
                new Error(
                    `The atlas with the same name is not found. Select the {asset[${asset.basename}${asset.extname}](${asset.uuid})} asset and add it manually in the attribute inspector.`,
                ),
                null,
            );
        } else {
            fs.readFile(p, { encoding: 'utf8' }, (err: Error | null, data: string) => {
                callback(err, {
                    path: p,
                    content: data,
                });
            });
        }
    });
}

// A dummy texture loader to record all textures in atlas
class TextureParser {
    asset: Asset;
    atlasPath: string;
    texturesUUID: string[];
    textureNames: string[];
    constructor(asset: Asset, atlasPath: string) {
        this.atlasPath = atlasPath;
        // array of loaded texture uuid
        this.texturesUUID = [];
        // array of corresponding line
        this.textureNames = [];
        this.asset = asset;
        this.asset.depend(atlasPath);
    }
    load(line: string) {
        const name = path.basename(line);
        const base = path.dirname(this.atlasPath);
        const filePath = path.resolve(base, name);
        const asset = queryAsset(filePath);
        if (asset) {
            const uuid = asset.uuid + '@6c48a';
            this.asset.depend(uuid);
            console.log(`UUID is initialized for ${filePath}.`);
            this.texturesUUID.push(uuid);
            this.textureNames.push(line);
        } else if (!fs.existsSync(filePath)) {
            console.error(`Can not find texture "${line}" for atlas "${this.atlasPath}"`);
        } else {
            // AssetDB may call postImport more than once, we can get uuid in the next time.
            console.warn(`WARN: UUID not yet initialized for "${filePath}".`);
        }

        return null;
    }
}

const scale = 1;
export const SpineHandler: AssetHandler = {
    name: 'spine-data',
    assetType: 'sp.SkeletonData',

    /**
     * 判断是否允许使用当前的 Handler 进行导入
     * @param asset
     */
    async validate(asset: Asset) {
        const assetpath = asset.source;
        // handle binary file
        if (assetpath.endsWith('.skel')) {
            return true;
        }
        // TODO - import as a folder named '***.spine'
        let json;
        const text = fs.readFileSync(assetpath, 'utf8');
        const fastTest = text.slice(0, 30);
        const maybe =
            fastTest.indexOf('slots') > 0 ||
            fastTest.indexOf('skins') > 0 ||
            fastTest.indexOf('events') > 0 ||
            fastTest.indexOf('animations') > 0 ||
            fastTest.indexOf('bones') > 0 ||
            fastTest.indexOf('skeleton') > 0 ||
            fastTest.indexOf('"ik"') > 0;
        if (maybe) {
            try {
                json = JSON.parse(text);
            } catch (e) {
                return false;
            }
            return Array.isArray(json.bones);
        }
        return false;
    },

    importer: {
        version: '1.2.7',
        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否更新的 boolean
         * 如果返回 true，则会更新依赖这个资源的所有资源
         * @param asset
         */
        async import(asset: Asset) {
            const fspath = asset.source;
            if (fspath.endsWith('.skel')) {
                return await importBinary(asset);
            } else {
                return await importJson(asset);
            }
        },
    },
};

export default SpineHandler;

/**
 * 通过 TextureParser 解析 .atlas 后缀的图集
 * @param asset
 * @param spineAtlas
 */
function parserAtlas(asset: Asset, spineAtlas: ISpineAtlas): IParserAtlasResults {
    // parse atlas textures
    const textureParser = new TextureParser(asset, spineAtlas.path);
    const lines = spineAtlas.content.split('\n');
    if (!lines || lines.length < 1) {
        throw new Error(`Failed to load atlas file: "${spineAtlas.path}"`);
    }

    let page = null;
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.length === 0) {
            page = null;
        } else if (!page) {
            page = trimmed;
            textureParser.load(page);
        }
    }

    return {
        textures: textureParser.texturesUUID.map((uuid) => {
            return EditorExtends.serialize.asAsset(uuid /* + '@f9941' */, Texture2D);
        }) as Texture2D[],
        textureNames: textureParser.textureNames,
        atlasText: spineAtlas.content,
        atlasUuid: queryUUID(spineAtlas.path),
    };
}

/**
 * 得到 spine atlas 的解析数据，设置给 spData，然后存到为 JSON 到 Library 中
 * @param asset - spine 资源
 * @param spData - sp.SkeletonData 类型
 * @param spineAtlas - spine atlas 的解析数据
 * @param resolve
 * @param reject
 */
function saveToLibrary(
    asset: Asset,
    spData: sp.SkeletonData,
    spineAtlas: ISpineAtlas | null,
    resolve: (reason: any) => void,
    reject: (reason: any) => void,
) {
    if (spineAtlas) {
        try {
            const info = parserAtlas(asset, spineAtlas);
            spData.textures = info.textures;
            spData.textureNames = info.textureNames;
            spData.atlasText = info.atlasText;
            // 存储 atlas uuid 到 userData
            asset.userData.atlasUuid = info.atlasUuid;
        } catch (e) {
            reject(e);
        }
    }
    const serializeJSON = EditorExtends.serialize(spData);
    asset.saveToLibrary('.json', serializeJSON).then(() => {
        const depends = getDependUUIDList(serializeJSON);
        asset.setData('depends', depends);
        resolve(true);
    }, reject);
}

function initTexture(asset: Asset, spData: sp.SkeletonData): Promise<boolean> {
    return new Promise((resolve: (reason: any) => void, reject: (reason: any) => void) => {
        const spineUserData = asset.userData as ISpineUserData;
        // 如果有图集 uuid 就通过图集 uuid 获取到资源去解析
        if (spineUserData.atlasUuid) {
            const atlasAsset = queryAsset(spineUserData.atlasUuid);
            if (atlasAsset) {
                fs.readFile(atlasAsset.source, { encoding: 'utf8' }, (err: Error | null, data: string) => {
                    const spineAtlas: ISpineAtlas = {
                        path: atlasAsset.source,
                        content: data,
                    };
                    saveToLibrary(asset, spData, spineAtlas, resolve, reject);
                });
            } else {
                reject(new Error(`Failed to load atlas file by uuid: ${spineUserData.atlasUuid}`));
            }
        } else {
            // 没有图集 uuid 时，去查找与 spine 同名的图集
            loadAtlasText(asset, (err: Error | null, spineAtlas: ISpineAtlas | null) => {
                if (err) {
                    return reject(err);
                }
                saveToLibrary(asset, spData, spineAtlas, resolve, reject);
            });
        }
    });
}

async function importJson(asset: Asset): Promise<boolean> {
    const fspath = asset.source;
    const data = await fse.readFile(fspath, { encoding: 'utf8' });
    let json;
    try {
        json = JSON.parse(data);
    } catch (e) {
        console.error(e);
        return false;
    }

    const spData = new sp.SkeletonData();
    spData.name = asset.basename || '';
    spData.skeletonJson = json;
    spData.scale = scale;
    return await initTexture(asset, spData);
}

async function importBinary(asset: Asset): Promise<boolean> {
    // import native asset
    // Since skel is not in the white list of the WeChat suffix, bin is used instead

    await asset.copyToLibrary('.bin', asset.source);

    const fspath = asset.source;
    // import asset
    const spAsset = new sp.SkeletonData();
    spAsset.name = asset.basename || '';
    spAsset._setRawAsset('.bin');
    spAsset.scale = scale;

    return await initTexture(asset, spAsset);
}
