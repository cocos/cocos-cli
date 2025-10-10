import { Asset, VirtualAsset } from '@editor/asset-db';
import { emptyDirSync, existsSync, outputJSONSync, readJSONSync } from 'fs-extra';
import lodash from 'lodash';
import { dirname, join } from 'path';
import { buildAssetLibrary } from '../../manager/asset-library';
import { versionDev } from './config';
import { PacInfo } from './pac-info';
import { packer } from './packer';
import { IAsset } from '../../../../../assets/@types/protected';
import { IPackOptions, IStorePackInfo, PreviewPackResult } from '../../../../@types/protected';
import { calcMd5 } from '../../utils';

// 管理自动图集缓存，提供对外接口
export class TexturePacker {

    pacInfos: PacInfo[] = [];

    /**
     * 是否使用缓存
     */
    static useCache = true;

    private static getCacheDirWithUuid(packUuid: string, mode: 'build' | 'preview' = 'build') {
        return join(buildAssetLibrary.getAssetTempDirByUuid(packUuid), 'texture-packer' + mode);
    }

    static async packSingle(pacAsset: IAsset, option?: Partial<IPackOptions>) {
        const pacInfo = await new PacInfo(pacAsset, option).initSpriteFramesWithRange();
        return TexturePacker.internalPack(pacInfo);
    }

    static queryPacStoredPath(pacInfo: PacInfo) {
        const cacheTempDir = TexturePacker.getCacheDirWithUuid(pacInfo.uuid, pacInfo.packOptions.mode);
        return join(cacheTempDir, 'pac-info.json');
    }

    async init(pacAssets: Array<IAsset>, assetsRange?: string[]) {
        const pacInfos: PacInfo[] = [];
        await Promise.all(pacAssets.map(async (pacAsset) => {
            if (pacAsset.url.startsWith('db://internal/default_file_content')) {
                return;
            }
            const pacInfo = await new PacInfo(pacAsset).initSpriteFramesWithRange(assetsRange);
            if (pacInfo.spriteFrameInfos.length === 0) {
                return;
            }
            pacInfos.push(pacInfo);
        }));
        this.pacInfos = pacInfos;
        return this;
    }

    async pack(): Promise<PacInfo[]> {
        return await Promise.all(this.pacInfos.map((pacInfo) => {
            return TexturePacker.internalPack(pacInfo);
        }));
    }

    private static async internalPack(pacInfo: PacInfo): Promise<PacInfo> {
        let storedPacInfo: IStorePackInfo | null = null;
        const storedPacInfoPath = TexturePacker.queryPacStoredPath(pacInfo);
        if (TexturePacker.useCache) {
            const res = TexturePacker.getPacResFromCache(pacInfo, storedPacInfoPath);
            if (res.result) {
                pacInfo.result = res.result;
                pacInfo.dirty = false;
                return pacInfo;
            }
            storedPacInfo = res;
            pacInfo.dirty = true;
        }
        const destDir = this.getCacheDirWithUuid(pacInfo.uuid, pacInfo.packOptions.mode);
        emptyDirSync(destDir);
        if (pacInfo.spriteFrameInfos && pacInfo.spriteFrameInfos.length) {
            // TODO 开启子进程打包图集
            const result = await packer(pacInfo.spriteFrameInfos, {
                ...pacInfo.packOptions,
                destDir,
                name: pacInfo.name,
            });
            pacInfo.result = result;
            if (TexturePacker.useCache) {
                storedPacInfo = storedPacInfo || TexturePacker.genNewStoredInfo(pacInfo);
                storedPacInfo.result = result;
                try {
                    outputJSONSync(storedPacInfoPath, storedPacInfo, { spaces: 2 });
                } catch (error) {
                    console.debug('write pac info cache failed');
                    console.error(error);
                }
            }
        }
        return pacInfo;
    }

    private static getStoredPacInfo(pacInfo: PacInfo, storedPacInfoPath?: string): { newStoredPacInfo: IStorePackInfo, storedPacInfo: IStorePackInfo | null } {
        storedPacInfoPath = storedPacInfoPath || TexturePacker.queryPacStoredPath(pacInfo);
        const res = {
            newStoredPacInfo: TexturePacker.genNewStoredInfo(pacInfo),
            storedPacInfo: null,
        };
        if (!existsSync(storedPacInfoPath)) {
            return res;
        }
        try {
            res.storedPacInfo = readJSONSync(storedPacInfoPath);
        } catch (error) {
            console.debug(error);
        }

        return res;
    }

    private static genNewStoredInfo(pacInfo: PacInfo): IStorePackInfo {
        const newStoredPacInfo: IStorePackInfo = {
            md5: '',
            versionDev,
            sharpMd5: calcMd5(JSON.stringify(require('sharp').versions)),
        };
        // 对图片进行排序，确保每次重新计算 md5 一致
        pacInfo.storeInfo.sprites = lodash.sortBy(pacInfo.storeInfo.sprites, 'uuid');
        // TODO 字符串计算 md5 可能导致计算结果不稳定
        newStoredPacInfo.md5 = calcMd5(JSON.stringify({
            packStoreInfo: pacInfo.storeInfo,
            versionDev,
            sharpMd5: newStoredPacInfo.sharpMd5,
        }));
        return newStoredPacInfo;
    }

    private static getPacResFromCache(pacInfo: PacInfo, storedPacInfoPath: string): IStorePackInfo {
        const { storedPacInfo, newStoredPacInfo } = TexturePacker.getStoredPacInfo(pacInfo, storedPacInfoPath);
        let dirty = (!storedPacInfo || newStoredPacInfo.md5 !== storedPacInfo.md5);
        if (dirty) {
            return newStoredPacInfo;
        }
        try {
            for (const atlas of storedPacInfo!.result!.atlases) {
                // 需要检查所有缓存的图集资源是否依旧正常存在
                if (!existsSync(atlas.imagePath)) {
                    dirty = true;
                    break;
                }
            }
            newStoredPacInfo.result = storedPacInfo!.result!;
        } catch (error) {
            console.warn(`Get Cache info of pac failed {asset(${pacInfo.uuid})}`);
            console.warn(error);
        }
        console.debug(`Get Cache info of pac success {asset(${pacInfo.uuid})}`);
        return newStoredPacInfo;
    }

    public static async queryPacCache(pacUuid: string): Promise<PreviewPackResult | null> {
        const pacInfo = new PacInfo(buildAssetLibrary.getAsset(pacUuid));
        // 将会决定获取的缓存位置
        pacInfo.packOptions.mode = 'preview';
        // 由于此接口还要获取最新的图集信息对比缓存是否失效，因而此处虽不需要生成预览图但需要初始化
        await pacInfo.initSpriteFramesWithRange();
        const cacheInfo = TexturePacker.getStoredPacInfo(pacInfo);
        if (!cacheInfo || !cacheInfo.storedPacInfo || !cacheInfo.storedPacInfo.result || cacheInfo.storedPacInfo.md5 !== cacheInfo.newStoredPacInfo.md5) {
            return null;
        }
        const pacRes = cacheInfo.storedPacInfo.result;
        return {
            unpackedImages: pacRes.unpackedImages,
            dirty: false,
            atlasImagePaths: cacheInfo.storedPacInfo.result.atlases.map((info) => info.imagePath),
            atlases: cacheInfo.storedPacInfo.result.atlases,
            storeInfo: pacInfo.storeInfo,
        };
    }
}

export async function packAutoAtlas(pacUuid: string, option?: Partial<IPackOptions>): Promise<PreviewPackResult | null> {
    if (!option) {
        option = {};
    }
    option.mode = 'preview';
    try {
        const pacInfo = await TexturePacker.packSingle(buildAssetLibrary.getAsset(pacUuid), option);
        if (!pacInfo.spriteFrames.length) {
            console.warn(`No invalid SpriteFrame found in folder [{link(${dirname(pacInfo.path)})}]. Please check the AutoAtlas [{link(${pacInfo.path})}].`);
        }
        if (!pacInfo.result) {
            return null;
        }
        const atlasImagePaths = pacInfo.result.atlases.map((info) => info.imagePath);
        return {
            atlasImagePaths,
            unpackedImages: pacInfo.result.unpackedImages,
            dirty: pacInfo.dirty,
            storeInfo: pacInfo.storeInfo,
            atlases: pacInfo.result.atlases,
        };
    } catch (error) {
        console.error(error);
    }

    return null;
}

/**
 * 查询某个图集的预览缓存
 * @param pacUuid 
 */
export function queryAutoAtlasFileCache(pacUuid: string) {
    return TexturePacker.queryPacCache(pacUuid);
}

export async function querySpriteToAutoAtlas(spriteUuid: string): Promise<{
    url: string;
    uuid: string;
} | null> {
    const info = buildAssetLibrary.getAsset(spriteUuid);
    if (info.url.startsWith('db://internal')) {
        return null;
    }

    // 找到小图所在 db 所有的图集信息
    const allPacs = buildAssetLibrary.queryAssetsByOptions({
        pattern: `db://${info._assetDB.options.name}/**/*.pac`,
    });
    if (!allPacs.length) {
        return null;
    }

    const packer = new TexturePacker();
    await packer.init(allPacs);
    const targetPackInfo = packer.pacInfos.find((pacInfo) => !!pacInfo.spriteFrameInfos.find((spriteInfo) => spriteInfo.uuid === spriteUuid));
    if (!targetPackInfo) {
        return null;
    }

    return {
        url: targetPackInfo.path,
        uuid: targetPackInfo.uuid,
    };
}