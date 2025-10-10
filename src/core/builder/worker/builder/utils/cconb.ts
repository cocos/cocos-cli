import { CCON, encodeCCONBinary } from 'cc/editor/serialization';
import { outputFile } from 'fs-extra';
import { IAsset } from '../../../../assets/@types/protected';
import { AssetSerializeOptions } from '../../../@types/protected';

export function hasCCONFormatAssetInLibrary(asset: IAsset) {
    // 目前规则：如果一个 asset 只有一个 .bin 文件，那么它是 CCON 格式。 
    const { files } = asset.meta;
    return files.length === 1 && files[0] === '.bin';
}
export function getCCONFormatAssetInLibrary(asset: IAsset) {
    return hasCCONFormatAssetInLibrary(asset) ? (asset.library + '.bin') : '';
}

export function getDesiredCCONExtensionMap(serializeOption: AssetSerializeOptions) {
    return '.cconb';
}

export async function outputCCONFormat(ccon: CCON, fullBaseName: string) {
    await outputFile(`${fullBaseName}.bin`, encodeCCONBinary(ccon));
}
