import { join } from 'path';
import { buildAssetLibrary } from '../../manager/asset-library';
import { getCCONFormatAssetInLibrary } from '../../utils/cconb';
import { outputFile, readFile, stat } from 'fs-extra';
import * as HashUuid from '../../utils/hash-uuid';
import { compareUUID } from '../../../../share/utils';
import { binPackagePack } from './bin-package-pack';
import { IAsset } from '../../../../../assets/@types/protected';
import { IBinGroupConfig } from '../../../../@types';
import { IBundle, IGroup } from '../../../../@types/protected';

const PACK_FILE_TYPE_LIST = ['cc.AnimationClip'];
const KB = 1024;

// 预览bundle对bin文件合并以后的效果, 可用于调试, 也可用于以后editor做界面预览展示给用户查看合并效果
export async function previewBinGroup(bundle: IBundle, threshold: number): Promise<{ uuidList: string[], sizeList: number[], totalSize: number }> {
    const uuidList: string[] = [];
    const sizeList: number[] = [];
    let totalSize = 0;
    const analyzeResult = await Promise.all(bundle.assetsWithoutRedirect.map(uuid => analyzePack(uuid, threshold)));
    analyzeResult.forEach(output => {
        if (!output.shouldPack) return;
        uuidList.push(output.uuid);
        sizeList.push(output.size);
        totalSize += output.size;
    });
    return { uuidList, sizeList, totalSize };
}

export async function handleBinGroup(bundle: IBundle, config?: IBinGroupConfig) {
    if (!config || !config.enable) {
        return;
    }
    console.debug(`Handle binary group in bundle ${bundle.name}: start`);
    const threshold = config.threshold * KB;
    const uuids = (await previewBinGroup(bundle, threshold)).uuidList;
    if (uuids.length <= 1) {
        console.debug(`Handle binary group in bundle ${bundle.name}: no need to handle`);
        return;
    }
    uuids.sort(compareUUID);
    bundle.addGroup('BIN', uuids, HashUuid.calculate([uuids], HashUuid.BuiltinHashType.PackedAssets)[0]);
    console.debug(`Handle binary group in bundle ${bundle.name}: success`);
}

export async function outputBinGroup(bundle: IBundle, config?: IBinGroupConfig) {
    if (!config || !config.enable) {
        return;
    }
    const group = bundle.groups.find(group => group.type == 'BIN');
    if (!group) {
        return;
    }
    await outputOneBinGroup(group, bundle);
}

async function getAssetSize(asset: IAsset): Promise<number> {
    const path = getCCONFormatAssetInLibrary(asset);
    return (await stat(path)).size;
}

async function analyzePack(uuid: string, threshold: number): Promise<{ uuid: string, shouldPack: boolean, size: number }> {
    const asset = buildAssetLibrary.getAsset(uuid);
    const assetType = buildAssetLibrary.getAssetProperty(asset, 'type');

    if (!PACK_FILE_TYPE_LIST.includes(assetType)) {
        return { uuid, shouldPack: false, size: 0 };
    }
    const size = await getAssetSize(asset);
    return { uuid, shouldPack: size <= threshold, size };
}

function getOutputFilePath(bundle: IBundle, uuid: string) {
    return join(bundle.dest, bundle.importBase, uuid.slice(0, 2), uuid + '.bin');
}

async function outputOneBinGroup(group: IGroup, bundle: IBundle) {
    console.debug(`output bin groups in bundle ${bundle.name} start`);
    bundle.addAssetWithUuid(group.name);
    const buffers = await Promise.all(group.uuids.map(uuid => {
        const asset = buildAssetLibrary.getAsset(uuid);
        const path = getCCONFormatAssetInLibrary(asset);
        return readFile(path);
    }));
    const packedBin = binPackagePack(buffers.map(buffer => new Uint8Array(buffer).buffer));
    await outputFile(getOutputFilePath(bundle, group.name), new Uint8Array(packedBin));
}
