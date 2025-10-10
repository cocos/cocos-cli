import { Asset, queryPath, queryUrl, queryUUID, VirtualAsset } from '@editor/asset-db';
import * as cc from 'cc';
import fs from 'fs-extra';
import path from 'path';
import { GlTFUserData } from '../../meta-schemas/glTF.meta';
import { GltfConverter, IGltfAssetFinder } from '../utils/gltf-converter';
import { DefaultGltfAssetFinder } from './asset-finder';
import { loadAssetSync } from '../utils/load-asset-sync';
import { glTfReaderManager } from './reader-manager';

import { getDependUUIDList, i18nTranslate, mergeMeta } from '../../utils';
import { parse } from 'url';
import { AssetHandler } from '../../../@types/protected';
import { assetDBManager } from '../../../manager/asset-db';
import FbxHandler from '../fbx';
import GltfHandler from '../gltf';

export const GltfMaterialHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'gltf-material',
    // 引擎内对应的类型
    assetType: 'cc.Material',

    /**
     * 允许这种类型的资源进行实例化
     */
    instantiation: '.material',

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.14',
        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否导入成功的 boolean
         * 如果返回 false，则下次启动还会重新导入
         * @param asset
         */
        async import(asset: VirtualAsset) {
            if (!asset.parent) {
                return false;
            }

            // 如果之前的 fbx 有存在相同的 id 材质的编辑数据了，复用之前的数据
            if (asset.parent.meta?.userData?.materials) {
                const previousEditedData = asset.parent.meta.userData.materials[asset.uuid];
                if (previousEditedData) {
                    console.log(`importer: Reuse previously edited material data. ${asset.uuid}`);

                    const serializeJSON = JSON.stringify(previousEditedData);
                    await asset.saveToLibrary('.json', serializeJSON);

                    const depends = getDependUUIDList(serializeJSON);
                    asset.setData('depends', depends);
                    return true;
                }
            }
            let version = GltfHandler.importer.version;
            if (asset.parent.meta.importer === 'fbx') {
                version = FbxHandler.importer.version;
            }
            const gltfConverter = await glTfReaderManager.getOrCreate(asset.parent as Asset, version);

            const gltfUserData = asset.parent.userData as GlTFUserData;
            const material = createMaterial(
                asset.userData.gltfIndex as number,
                gltfConverter,
                new DefaultGltfAssetFinder(gltfUserData.assetFinder),
                gltfUserData,
            );

            const serializeJSON = EditorExtends.serialize(material);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },

    createInfo: {
        async save(asset, content) {
            const materialUuid = asset.uuid;
            if (!content || Buffer.isBuffer(content)) {
                throw new Error(`${i18nTranslate('asset-db.saveAssetMeta.fail.content')}`);
            }

            if (!asset.parent) {
                return false;
            }

            const fbxMeta = asset.parent.meta;
            if (!fbxMeta.userData.materials || typeof fbxMeta.userData.materials !== 'object') {
                fbxMeta.userData.materials = {};
            }

            try {
                fbxMeta.userData.materials[materialUuid] = typeof content === 'string' ? JSON.parse(content) : content;
                mergeMeta(asset.meta, fbxMeta);
                await asset.save();
            } catch (e) {
                console.error(`Save materials({asset(${materialUuid})} data to fbx {asset(${asset.parent.uuid})} failed!`);
                console.error(e);
                return false;
            }
            return true;
        },
    },
};

export default GltfMaterialHandler;

function createMaterial(index: number, gltfConverter: GltfConverter, assetFinder: IGltfAssetFinder, glTFUserData: GlTFUserData) {
    const material = gltfConverter.createMaterial(
        index,
        assetFinder,
        (effectName) => {
            const uuid = queryUUID(effectName);
            return loadAssetSync(uuid, cc.EffectAsset)!;
        },
        {
            useVertexColors: glTFUserData.useVertexColors,
            depthWriteInAlphaModeBlend: glTFUserData.depthWriteInAlphaModeBlend,
            smartMaterialEnabled: glTFUserData.fbx?.smartMaterialEnabled ?? false,
        },
    );
    return material;
}

export async function dumpMaterial(
    asset: Asset,
    assetFinder: DefaultGltfAssetFinder,
    gltfConverter: GltfConverter,
    index: number,
    name: string,
) {
    const glTFUserData = asset.userData as GlTFUserData;
    let materialDumpDir: string | null = null;
    if (glTFUserData.materialDumpDir) {
        materialDumpDir = queryPath(glTFUserData.materialDumpDir);
        if (!materialDumpDir) {
            console.warn('The specified dump directory of materials is not valid. ' + 'Default directory is used.');
        }
    }
    if (!materialDumpDir) {
        materialDumpDir = path.join(path.dirname(asset.source), `Materials_${asset.basename}`);
        // 生成默认值后，填入 userData，防止生成后，重新移动资源位置，导致 material 资源重新生成
        glTFUserData.materialDumpDir = await queryUrl(materialDumpDir);
    }
    fs.ensureDirSync(materialDumpDir);
    const destFileName = name;
    // 需要将 windows 上不支持的路径符号替换掉
    const destFilePath = path.join(materialDumpDir, destFileName.replace(/[\/:*?"<>|]/g, '-'));
    if (!fs.existsSync(destFilePath)) {
        const material = createMaterial(index, gltfConverter, assetFinder, glTFUserData);
        // @ts-ignore
        const serialized = EditorExtends.serialize(material);
        fs.writeFileSync(destFilePath, serialized);
    }
    // 不需要等待导入完成，这里只是想要获取到资源的 uuid
    (findAssetDB(glTFUserData.materialDumpDir) || asset._assetDB).refresh(destFilePath);
    const url = queryUrl(destFilePath);
    if (url) {
        const uuid = queryUUID(url);
        if (uuid && typeof uuid === 'string') {
            return uuid;
        }
    }
    asset.depend(destFilePath);
    return null;
}

function findAssetDB(url?: string) {
    if (!url) {
        return null;
    }
    const uri = parse(url);
    if (!uri.host) {
        return null;
    }
    return assetDBManager.assetDBMap[uri.host];
}
