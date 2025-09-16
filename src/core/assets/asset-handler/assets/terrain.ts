'use strict';

import * as fs from 'fs-extra';
import { Asset } from '@editor/asset-db';
import { version } from './scene/index';
import { TerrainAsset, TerrainLayerInfo, Texture2D } from 'cc';

import { getDependUUIDList } from '../utils';
import { AssetHandler } from '../../@types/protected';

export const TerrainHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'terrain',
    // 引擎内对应的类型
    assetType: 'cc.TerrainAsset',
    createInfo: {
        generateMenuInfo() {
            return [
                {
                    label: 'i18n:ENGINE.assets.newTerrain',
                    fullFileName: 'terrain.terrain',
                    template: `db://internal/default_file_content/${TerrainHandler.name}/default.terrain`,
                },
            ];
        },
    },

    importer: {
        version,

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
            await asset.copyToLibrary('.bin', asset.source);

            const terrainAsset = new TerrainAsset();
            if (terrainAsset._loadNativeData(new Uint8Array(fs.readFileSync(asset.source)))) {
                terrainAsset.layerInfos.length = terrainAsset.layerBinaryInfos.length;
                for (let i = 0; i < terrainAsset.layerInfos.length; ++i) {
                    const binaryLayer = terrainAsset.layerBinaryInfos[i];
                    const layer = new TerrainLayerInfo();
                    layer.slot = binaryLayer.slot;
                    layer.tileSize = binaryLayer.tileSize;
                    if (binaryLayer.detailMapId && binaryLayer.detailMapId != '') {
                        // @ts-ignore
                        layer.detailMap = EditorExtends.serialize.asAsset(binaryLayer.detailMapId, Texture2D);
                    }
                    if (binaryLayer.normalMapId && binaryLayer.normalMapId != '') {
                        // @ts-ignore
                        layer.normalMap = EditorExtends.serialize.asAsset(binaryLayer.normalMapId, Texture2D);
                    }
                    layer.metallic = binaryLayer.metallic;
                    layer.roughness = binaryLayer.roughness;
                    terrainAsset.layerInfos[i] = layer;
                }
            }

            terrainAsset.name = asset.basename;
            terrainAsset._setRawAsset('.bin');

            const serializeJSON = EditorExtends.serialize(terrainAsset);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default TerrainHandler;
