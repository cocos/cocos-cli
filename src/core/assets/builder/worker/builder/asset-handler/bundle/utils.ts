/**
 * 提供给 Bundle 一些接口查询的方法
 */

import { basename, join } from 'path';
import { buildAssetLibrary } from '../../manager/asset-library';
import { getLibraryDir, getResImportPath, getResRawAssetsPath, getUuidFromPath } from '../../utils';
import { hasCCONFormatAssetInLibrary } from '../../utils/cconb';
import { IAsset } from '../../../../../@types/protected';
import { IAssetPathInfo, IImportAssetPathInfo } from '../../../../@types';
import { BundleFilterConfig, IBundle } from '../../../../@types/protected';
import { assetManager } from '../../../../../manager';

/**
 * 获取指定 uuid 资源的路径相关信息
 * @return {raw?: string | string[]; json?: string; groupIndex?: number;}
 * @return.raw: 该资源源文件的实际存储位置，存在多个为数组，不存在则为空
 * @return.json: 该资源序列化 json 的实际存储位置，不存在为空
 * @return.groupIndex: 若该资源的序列化 json 在某个 json 分组内，这里标识在分组内的 index，不存在为空
 */
export function getAssetPathInfo(uuid: string, bundle: IBundle): IAssetPathInfo | null {
    if (!bundle.containsAsset(uuid, true)) {
        return null;
    }
    const importInfo = getImportPathInfo(uuid, bundle);
    const rawPaths = getRawAssetPaths(uuid, bundle);
    if (!importInfo && (!rawPaths.length)) {
        return null;
    }
    const result: IAssetPathInfo = {};
    if (importInfo) {
        Object.assign(result, importInfo);
    }

    rawPaths.length && (result.raw = rawPaths);
    return result;
}

export function getJsonPath(uuid: string, bundle: IBundle) {
    return getImportPathInfo(uuid, bundle)?.json || '';
}

/**
 * 指定 uuid 资源的序列化 json 在 bundle 构建后的信息
 * @param uuid
 * @param bundle
 */
export function getImportPathInfo(uuid: string, bundle: IBundle): IImportAssetPathInfo | null {
    if (!bundle.containsAsset(uuid)) {
        return null;
    }

    const assetInfo = buildAssetLibrary.getAsset(uuid);
    // 资源信息存在，且不存在 json 信息或者不是 cconb 类型则直接返回
    if (!assetInfo) {
        return null;
    }
    const extName = getImportExtName(assetInfo);
    if (!extName) {
        return null;
    }
    const group = bundle.groups.find((group) => group.uuids.includes(uuid));
    const path = resolveImportPath(group ? group.name : uuid, bundle, extName);
    if (!group) {
        return {
            import: path,
            [extName.replace('.', '')]: path,
        };
    }
    return {
        import: path,
        [extName.replace('.', '')]: path,
        groupIndex: group.uuids.indexOf(uuid),
    };
}

export function resolveImportPath(name: string, bundle: IBundle, extName?: string) {
    return getResImportPath(bundle.dest, name + (bundle.assetVer.import[name] ? '.' + bundle.assetVer.import[name] : ''), extName);
}

export function resolveNativePath(libraryPath: string, extName: string, bundle: IBundle) {
    const uuid = basename(libraryPath, extName);
    const version = bundle.assetVer.native[uuid];

    const path = libraryPath.replace(getLibraryDir(libraryPath), join(bundle.dest, Build.NATIVE_HEADER));
    return version ? path.replace(extName, `.${version}${extName}`) : path;
}

function getImportExtName(asset: IAsset): string {
    if (hasCCONFormatAssetInLibrary(asset)) {
        return '.bin';
    } else if (asset.meta.files.includes('.json')) {
        return '.json';
    }
    return '';
}

/**
 * 获取指定 uuid 原始资源的存放路径（不包括序列化 json）
 * 自动图集的小图 uuid 和自动图集的 uuid 都将会查询到合图大图的生成路径
 * 实际返回多个路径的情况：查询 uuid 为自动图集资源，且对应图集生成多张大图，纹理压缩会有多个图片格式路径
 */
export function getRawAssetPaths(uuid: string, bundle: IBundle): string[] {
    // 图集资源的查询方式比较特殊，图集的序列化资源可能被剔除，但是原图需要能被查询到
    if (!bundle.containsAsset(uuid, true)) {
        return [];
    }
    const assetInfo = buildAssetLibrary.getAsset(uuid);
    if (!assetInfo) {
        console.error(`Can't get assetInfo of uuid {asset(${uuid})}`);
        return [];
    }

    const importExtName = getImportExtName(assetInfo);
    const extNames = assetInfo.meta.files.filter((name) => name !== importExtName);
    // 过滤已生成到 import 内的数据
    const assetType = assetManager.queryAssetProperty(assetInfo, 'type');
    if (assetType === 'cc.Script') {
        return [bundle.scriptDest];
    }

    if (assetType === 'cc.ImageAsset' && bundle.compressRes[uuid]) {
        const version = bundle.assetVer.native[uuid];
        return bundle.compressRes[uuid].map(path => path.replace(uuid, version ? `${uuid}.${version}` : ''));
    }

    // ------------------- 处理合图资源的路径信息 -------------------
    if (['cc.ImageAsset', 'cc.SpriteFrame', 'cc.SpriteAtlas'].includes(assetType)) {
        const imageUuids = (bundle.atlasRes.assetsToImage[uuid] ? [bundle.atlasRes.assetsToImage[uuid]] : bundle.atlasRes.atlasToImages[uuid]) || [];
        if (imageUuids.length) {
            const rawPaths: string[] = [];
            for (const imageUuid of imageUuids) {
                if (!imageUuid || !bundle.containsAsset(imageUuid)) {
                    continue;
                }
                const version = bundle.assetVer.native[imageUuid];
                if (bundle.compressRes[imageUuid]) {
                    rawPaths.push(...bundle.compressRes[imageUuid].map(path => {
                        // 由于有图集，最终输出的 uuid 地址与原始资源可能不一样
                        const imageUuid = getUuidFromPath(path);
                        return path.replace(imageUuid, version ? `${imageUuid}.${version}` : '');
                    }));
                    continue;
                }
                rawPaths.push(getResRawAssetsPath(bundle.dest, imageUuid, version ? `.${version}.png` : '.png'));
            }
            return rawPaths;
        }

    }
    // ----------------- ttf 资源 md5 是加在文件夹上 -----------------
    if (assetType === 'cc.TTFFont' && bundle.assetVer.native[uuid]) {
        return extNames.map((extName) => {
            return getResRawAssetsPath(bundle.dest, `${uuid}.${bundle.assetVer.native[uuid]}/`, extName);
        });
    }
    if (!extNames.length) {
        return [];
    }
    return extNames.map((extName) => {
        return resolveNativePath(assetInfo.library + extName, extName, bundle);
    });
}

/**
 * 由于资源支持文件夹、以及一些特殊的父资源，需要先转换一下配置再走常规的过滤确认方法，常规的过滤方法目前有单元测试保障正确性
 * @param bundleConfigs 
 * @returns 
 */
export function initBundleConfig(bundleConfigs?: BundleFilterConfig[]): BundleFilterConfig[] {
    if (!bundleConfigs || !bundleConfigs.length) {
        return [];
    }
    // 资源进程内获取 meta 数据后的处理如果涉及到数据修改的，需要深拷贝，否则会影响源数据
    const configs: BundleFilterConfig[] = JSON.parse(JSON.stringify(bundleConfigs));
    const newConfigs: BundleFilterConfig[] = [];
    for (const config of configs) {
        if (config.type === 'url' || !config.assets || !config.assets.length) {
            newConfigs.push(config);
            continue;
        }
        const addAssets: Set<string> = new Set();
        const directory = new Set();
        for (const uuid of config.assets) {
            const asset = uuid && assetManager.queryAsset(uuid);
            if (!asset) {
                continue;
            }
            // 文件夹直接转换为 url 配置
            if (asset.isDirectory()) {
                newConfigs.push({
                    type: 'url',
                    range: config.range,
                    patchOption: {
                        patchType: 'glob',
                        value: asset.url + '/**/*',
                    },
                });
                directory.add(asset.uuid);
                continue;
            }

            if (assetManager.queryAssetProperty(asset, 'type') === 'cc.Texture2D') {
                // texture 与 image 目前在编辑器界面是统一的无法分开配置，过滤配置存在 texture 需要将 image 一起剔除
                const fatherAsset = assetManager.queryAsset(uuid.replace('@6c48a', ''))!;
                if (assetManager.queryAssetProperty(fatherAsset, 'type') === 'cc.ImageAsset') {
                    addAssets.add(fatherAsset.uuid);
                }
            }

            // 配置父资源时，子资源也将参与对应的规则
            if (asset.subAssets) {
                Object.values(asset.subAssets).forEach((asset: any) => {
                    addAssets.add(asset.uuid);
                });
            }
        }
        // 剔除文件夹 uuid
        config.assets = config.assets.filter((uuid) => !directory.has(uuid));
        config.assets.push(...Array.from(addAssets));
        // 如果剔除文件夹或者其他资源后，assets 为空，则此配置无效
        if (config.assets.length) {
            newConfigs.push(config);
        }
    }

    return newConfigs;
}
