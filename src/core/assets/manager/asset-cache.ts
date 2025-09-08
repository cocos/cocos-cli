import { copy } from 'fs-extra';
import { extname, join } from 'path';
import { IAsset, IExportOptions } from '../@types/private';

const HASH_LEN = 5;

/**
 * 计算某个数据的 md5 值
 * @param data
 */
export function calcMd5(data: (Buffer | string) | Array<Buffer | string>): string {
    data = Array.isArray(data) ? data : [data];
    const { createHash } = require('crypto');
    const cryptoHash = createHash('md5');
    data.forEach((dataItem) => {
        cryptoHash.update(dataItem);
    });
    return cryptoHash.digest('hex').slice(0, HASH_LEN);
}

export class AssetCache {
    _cacheMap: Record<string, {
        path: string;
        md5Key: string;
    }> = {};
    _tmpDir: string;

    constructor(tmp: string) {
        this._tmpDir = tmp;
    }

    _getCacheFilePath(asset: IAsset, md5Key: string) {
        return join(
            this._tmpDir,
            'asset-db',
            asset.uuid.slice(0, 2),
            asset.uuid,
            md5Key,
        );
    }

    async add(asset: IAsset, options: IExportOptions, path: string) {
        const md5Key = calcMd5(JSON.stringify(options));
        const cachePath = this._getCacheFilePath(asset, md5Key + extname(path));
        try {
            await copy(path, cachePath);
            this._cacheMap[asset.uuid] = {
                path,
                md5Key,
            };
        } catch (error) {
            console.warn(error);
            return false;
        }
        return true;
    }

    query(uuid: string, options: IExportOptions) {
        const md5Key = JSON.stringify(options);
        const cacheInfo = this._cacheMap[uuid];
        if (cacheInfo.md5Key === md5Key) {
            return cacheInfo.path;
        }
        return null;
    }

}
