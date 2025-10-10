/**
 * 此文件依赖了许多引擎接口，注意版本升级影响
 */
import { ImageAsset, Rect, Size, SpriteAtlas, SpriteFrame, Texture2D, assetManager } from 'cc';
import { basename, dirname, extname, join, normalize, relative } from 'path';
import { buildAssetLibrary } from '../../manager/asset-library';
import * as HashUuid from '../../utils/hash-uuid';
import { IAsset } from '../../../../../assets/@types/protected';
import { IPackOptions, IPacInfo, PacStoreInfo, IPackResult, CompressedInfo, IAtlasInfo, ISpriteFrameInfo } from '../../../../@types/protected';
import utils from '../../../../../base/utils';
import lodash from 'lodash';
import { BuildGlobalInfo } from '../../../../share/builder-config';

export const DefaultPackOption: IPackOptions = {
    maxWidth: 1024,
    maxHeight: 1024,

    // padding of image.
    padding: 2,

    allowRotation: true,
    forceSquared: false,
    powerOfTwo: false,
    algorithm: 'MaxRects',
    format: 'png',
    quality: 80,
    contourBleed: true,
    paddingBleed: true,
    filterUnused: true,
    removeTextureInBundle: true,
    removeImageInBundle: true,
    removeSpriteAtlasInBundle: true,
    compressSettings: {},
    bleed: 0,
    mode: 'build',
};

/**
 * 一个图集信息
 */
export class PacInfo implements IPacInfo {
    public spriteFrameInfos: SpriteFrameInfo[] = [];
    public spriteFrames: SpriteFrame[] = [];
    public relativePath = '';
    public relativeDir = '';
    public path = '';
    public uuid = '';
    public imagePath = '';
    public imageUuid = '';
    public textureUuid = ''; // Texture2D
    public name = 'autoatlas';
    public width = 1024;
    public height = 1024;
    public dirty = false;

    public packOptions: IPackOptions = JSON.parse(JSON.stringify(DefaultPackOption));

    public storeInfo: PacStoreInfo;
    public result?: IPackResult;

    constructor(pacAsset: IAsset, options?: Partial<IPackOptions>) {
        this.uuid = pacAsset.uuid;
        // 在 db 进程内取得得 meta 数据需要深拷贝避免影响原数据
        let userData = JSON.parse(JSON.stringify(pacAsset.meta.userData));
        userData = options ? Object.assign(userData, options) : userData;
        // TODO 可能会有非法数据被 assign
        this.packOptions = Object.assign(this.packOptions, userData);
        this.packOptions.bleed = this.packOptions.paddingBleed ? 1 : 0;
        this.path = pacAsset.url;
        // 参与缓存计算的数据
        this.storeInfo = {
            pac: {
                uuid: pacAsset.uuid,
                mtime: buildAssetLibrary.getAssetProperty(pacAsset, 'mtime'),
            },
            sprites: [],
            options: this.packOptions,
        };
        const assetsPath = join(BuildGlobalInfo.projectRoot, 'assets');
        this.relativePath = relative(assetsPath, pacAsset.source);
        this.relativeDir = relative(assetsPath, dirname(pacAsset.source));
        this.name = buildAssetLibrary.getAssetProperty(pacAsset, 'name');
    }

    public async initSpriteFramesWithRange(includeAssets?: string[]) {
        const spriteFrameAssets = await this.queryInvalidSpriteAssets(includeAssets);
        if (!spriteFrameAssets.length) {
            return this;
        }
        await this.initSpriteFrames(spriteFrameAssets);
        return this;
    }

    /**
     * @param {Object} pacAssetInfo 从 db 中获取出来的 pac 信息
     */
    public async initSpriteFrames(spriteFrameAssets: (IAsset)[]) {
        let spriteFrameInfos = await Promise.all(spriteFrameAssets.map(async (asset: IAsset) => {
            if (assetManager.assets.has(asset.uuid)) {
                assetManager.releaseAsset(assetManager.assets.get(asset.uuid)!);
            }
            return new Promise((resolve, reject) => {
                assetManager.loadAny(asset.uuid, (err, spriteFrame: SpriteFrame) => {
                    // 此处的错误处理都不 reject ，全部执行完后续会过滤非法数据
                    if (err || !spriteFrame) {
                        console.error(`sprite frame can't be load:${asset.uuid}, will remove it from atlas.`);
                        err && console.error(err);
                        resolve(null);
                        return;
                    }
                    try {
                        const spriteFrameInfo = new SpriteFrameInfo(spriteFrame, asset, this.packOptions);
                        spriteFrameInfo._pacUuid = this.uuid;
                        this.spriteFrames.push(spriteFrame);
                        resolve(spriteFrameInfo);
                    } catch (error) {
                        console.error(`packer: load sprite frame failed:${asset.uuid}`);
                        console.error(error);
                        resolve(null);
                    }
                });
            });
        }));

        // 移除 无效的 sprite frame
        spriteFrameInfos = spriteFrameInfos.filter((info) => info != null);

        // 对 图片 进行排序，确保每次重新计算合图后的结果是稳定的。
        // 该排序只影响合图解析碎图的顺序，最终图集中的排序与合图算法有关，只有当图集中有相同尺寸的碎图时该排序才会产生作用。
        spriteFrameInfos = lodash.sortBy(spriteFrameInfos, 'uuid');
        this.spriteFrameInfos = spriteFrameInfos as SpriteFrameInfo[];
        this.storeInfo.sprites = this.spriteFrameInfos.map((info) => info.toJSON());

        return this;
    }

    private async queryInvalidSpriteAssets(_includeAssets?: string[]): Promise<Array<IAsset>> {

        // 去 db 查询理论上会比在同进程 cache 里查询的慢 TODO
        const assets = await buildAssetLibrary.queryAssetsByOptions({
            pattern: dirname(this.path) + '/**/*',
            importer: 'sprite-frame',
        });
        let spriteFrameAssets: Array<IAsset> = [];
        // 过滤配置了不参与自动图集或者不在指定资源范围内的 sprite
        for (const asset of assets) {
            if (!asset.meta.userData.packable) {
                continue;
            }
            if (!this.packOptions.filterUnused) {
                spriteFrameAssets.push(asset);
                continue;
            } else if (this.packOptions.filterUnused && (!_includeAssets || _includeAssets.includes(asset.uuid))) {
                spriteFrameAssets.push(asset);
                continue;
            }
        }
        if (!spriteFrameAssets || spriteFrameAssets.length === 0) {
            return [];
        }
        // 查找子目录下的所有 pac 文件
        const subPacAssets: any = await buildAssetLibrary.queryAssetsByOptions({
            pattern: dirname(this.path) + '/*/**/*.pac',
        });
        const subPacDirs = subPacAssets.map((subPac: IAsset) => dirname(subPac.source));
        /// 查找子文件夹中的 .pac 文件，如果有则排除子文件夹下的 sprite frame
        if (subPacAssets.length !== 0) {
            // 排除含有 .pac 文件的子文件夹下的 sprite frame
            spriteFrameAssets = spriteFrameAssets.filter((info: IAsset) => {
                for (const subPacDir of subPacDirs) {
                    if (utils.Path.contains(subPacDir, info.source)) {
                        return false;
                    }
                }
                return true;
            });
        }

        return spriteFrameAssets;
    }

    public toJSON() {
        const json = Object.assign({}, this);
        // @ts-ignore
        delete json.spriteFrames;
        // @ts-ignore
        delete json.storeInfo;
    }
}

/**
 * 每张图集可能生成多张大图，每一张大图有对应的 AtlasInfo
 */
export class AtlasInfo {
    public imagePath: string;
    public imageUuid = '';
    public textureUuid = ''; // Texture2D
    public name: string;
    public spriteFrameInfos: SpriteFrameInfo[];
    public width: number;
    public height: number;
    public compressed: CompressedInfo = {
        imagePathNoExt: '',
        suffixs: [],
    };

    constructor(spriteFrameInfos: SpriteFrameInfo[], width: number, height: number, name: string, imagePath: string) {
        // 这里使用碎图 uuid 来计算大图的 uuid
        const uuids = spriteFrameInfos.map((spriteFrameInfo) => spriteFrameInfo.uuid);
        this.imageUuid = HashUuid.calculate([uuids], HashUuid.BuiltinHashType.AutoAtlasImage)[0];
        this.textureUuid = this.imageUuid + '@' + require('@editor/asset-db/libs/utils').nameToId('texture');
        this.spriteFrameInfos = spriteFrameInfos;
        this.width = width;
        this.height = height;
        this.name = name;
        // 暂时 hack 直接替换有风险，需要重新组织这块逻辑
        // 合图的临时缓存地址也需要使用计算好的 imageUuid ，因为 etc 的纹理压缩工具只支持指定输出文件夹，文件名将会用 src 的
        this.imagePath = imagePath.replace(name, this.imageUuid);
        this.compressed.suffixs.push(extname(imagePath));
    }

    public toJSON() {
        return {
            spriteFrameInfos: this.spriteFrameInfos.map((info) => info.toJSON()),
            width: this.width,
            height: this.height,
            name: this.name,
            imagePath: this.imagePath,
            imageUuid: this.imageUuid,
            textureUuid: this.textureUuid,
            compressed: this.compressed,
        };
    }
}

// 自定义的 spriteFrame 数据格式信息，将会序列化到缓存内二次使用
export class SpriteFrameInfo {
    public name = '';
    public uuid = '';
    public imageUuid = '';
    public textureUuid = '';
    public spriteFrame: SpriteFrame;

    public trim = {
        width: 0,
        height: 0,
        rotatedWidth: 0,
        rotatedHeight: 0,
        x: 0,
        y: 0,
    };
    public rawWidth = 0;
    public rawHeight = 0;
    public width = 0;
    public height = 0;
    public originalPath = '';
    public rotated = false;

    public _file = '';
    public _libraryPath = '';
    public _pacUuid = '';

    private _mtime = 0;

    constructor(spriteFrame: SpriteFrame, assetInfo: IAsset, options: IPackOptions) {
        const trim = spriteFrame.rect;
        this.spriteFrame = spriteFrame;
        const rotatedWidth = spriteFrame.rotated ? trim.height : trim.width;
        const rotatedHeight = spriteFrame.rotated ? trim.width : trim.height;

        this.name = assetInfo.displayName || '';
        // 已经自动合图的情况下，不再动态合图
        spriteFrame.packable = false;
        this.rotated = spriteFrame.rotated;
        this.uuid = assetInfo.uuid;
        // @ts-ignore TODO 目前只有私有接口可用
        this.imageUuid = spriteFrame.texture._mipmaps![0]._uuid;
        this.textureUuid = spriteFrame.texture._uuid;
        // TODO 子资源嵌套时，取父资源可能依旧无法拿到实际图片地址
        // 目前 spriteFrame 的父资源都是图片，暂时没问题
        this._file = assetInfo.parent!.source; // image 的原始地址
        // @ts-ignore
        this._libraryPath = normalize(spriteFrame.texture._mipmaps![0].url);
        this.trim = {
            rotatedWidth: rotatedWidth,
            rotatedHeight: rotatedHeight,
            x: trim.x,
            y: trim.y,
            width: trim.width,
            height: trim.height,
        };
        this.rawWidth = spriteFrame.originalSize.width;
        this.rawHeight = spriteFrame.originalSize.height;
        this.width = trim.width + (options.padding + options.bleed) * 2;
        this.height = trim.height + (options.padding + options.bleed) * 2;
        this._mtime = assetInfo._assetDB.infoManager.get(assetInfo.parent!.source).time;
    }

    public toJSON() {
        const json: any = Object.assign({}, this);
        // TODO 移除所有的私有属性（临时属性）
        delete json._libraryPath;
        delete json._file;
        delete json._pacUuid;
        delete json.spriteFrame;
        return json;
    }

    // public clone() {
    //     const obj = new SpriteFrameInfo();
    //     Object.assign(obj, this);
    //     return obj;
    // }
}

export function createAssetInstance(atlases: IAtlasInfo[], pacInfo: IAsset, spriteFrames: SpriteFrame[]) {
    const res = createApriteAtlasFromAtlas(atlases, pacInfo, spriteFrames);
    return [
        res.spriteAtlas,
        ...res.images,
        ...res.spriteFrames,
        ...res.textures,
    ];
}

export function createApriteAtlasFromAtlas(atlases: IAtlasInfo[], pacInfo: IAsset, allSpriteFrames: SpriteFrame[]) {
    const spriteAtlas = new SpriteAtlas();
    spriteAtlas._uuid = pacInfo.uuid;
    // TODO name 获取有误
    spriteAtlas.name = basename(pacInfo.source, extname(pacInfo.source));

    const images: ImageAsset[] = [];
    const textures: Texture2D[] = [];
    const spriteFrames: SpriteFrame[] = [];
    for (const atlas of atlases) {
        const { image, texture } = createTextureFromAtlas(atlas, pacInfo);
        images.push(image);
        textures.push(texture);
        if (atlas.spriteFrameInfos) {
            atlas.spriteFrameInfos.forEach((spriteFrameInfo) => {
                let spriteFrame = allSpriteFrames.find((frame) => frame._uuid === spriteFrameInfo.uuid);
                // TODO 是否可以通过直接更改现有对象的某个属性实现
                spriteFrame = generateSpriteFrame(spriteFrameInfo, spriteFrame!, texture);
                spriteFrames.push(spriteFrame);
                spriteAtlas.spriteFrames[spriteFrameInfo.name] = EditorExtends.serialize.asAsset(spriteFrameInfo.uuid);
            });
        }
    }

    return {
        spriteAtlas,
        textures,
        images,
        spriteFrames,
    };
}

export function createTextureFromAtlas(atlas: IAtlasInfo, pacInfo: IAsset) {
    const imageUuid = atlas.imageUuid;
    const textureUuid = atlas.textureUuid;
    // @ts-ignore
    if (atlas.compressd) {
        // @ts-ignore
        atlas.compressed = atlas.compressd;
    }
    if (!atlas.compressed) {
        throw new Error('Can\'t find atlas.compressed.');
    }
    const image = new ImageAsset();
    image._setRawAsset('.png');
    image._uuid = imageUuid;
    // @ts-ignore
    image._width = image._nativeAsset.width = atlas.width;
    // @ts-ignore
    image._height = image._nativeAsset.height = atlas.height;

    const texture = new Texture2D();
    if (!pacInfo.meta.userData.textureSetting) {
        console.warn(`meta.userData.textureSetting in asset(${pacInfo.uuid}) is missing.`);
    }
    applyTextureBaseAssetUserData(pacInfo.meta.userData.textureSetting, texture);
    texture._mipmaps = [image];
    texture._uuid = textureUuid;
    return { texture, image };
}

export function applyTextureBaseAssetUserData(userData: any, texture: Texture2D) {
    userData = userData || {
        wrapModeS: 'repeat',
        wrapModeT: 'repeat',
        minfilter: 'nearest',
        magfilter: 'linear',
        mipfilter: 'none',
        anisotropy: 1,
    };
    const getWrapMode = (wrapMode: 'clamp-to-edge' | 'repeat' | 'mirrored-repeat') => {
        switch (wrapMode) {
            case 'clamp-to-edge':
                return Texture2D.WrapMode.CLAMP_TO_EDGE;
            case 'repeat':
                return Texture2D.WrapMode.REPEAT;
            case 'mirrored-repeat':
                return Texture2D.WrapMode.MIRRORED_REPEAT;
        }
    };
    const getFilter = (filter: 'nearest' | 'linear' | 'none') => {
        switch (filter) {
            case 'nearest':
                return Texture2D.Filter.NEAREST;
            case 'linear':
                return Texture2D.Filter.LINEAR;
            case 'none':
                return Texture2D.Filter.NONE;
        }
    };
    texture.setWrapMode(getWrapMode(userData.wrapModeS), getWrapMode(userData.wrapModeT));
    texture.setFilters(getFilter(userData.minfilter), getFilter(userData.magfilter));
    texture.setMipFilter(getFilter(userData.mipfilter));
    texture.setAnisotropy(userData.anisotropy);
}

export function generateSpriteFrame(item: ISpriteFrameInfo, oldSpriteFrame: SpriteFrame, texture: Texture2D): SpriteFrame {
    const spriteFrame = new SpriteFrame();
    // texture 需要先设置，在引擎的接口实现里后续的 rect、originalSize、offset 会根据 texture 计算
    spriteFrame.texture = texture;

    spriteFrame.rect = new Rect(item.trim.x, item.trim.y, item.trim.width, item.trim.height);
    spriteFrame.originalSize = new Size(item.rawWidth, item.rawHeight);
    spriteFrame.offset = oldSpriteFrame.offset;
    spriteFrame.name = item.name;
    spriteFrame.rotated = item.rotated;

    spriteFrame.insetBottom = oldSpriteFrame.insetBottom;
    spriteFrame.insetTop = oldSpriteFrame.insetTop;
    spriteFrame.insetRight = oldSpriteFrame.insetRight;
    spriteFrame.insetLeft = oldSpriteFrame.insetLeft;

    spriteFrame._uuid = oldSpriteFrame.uuid;
    return spriteFrame;
}