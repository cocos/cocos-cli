import { Asset, assetManager, deserialize } from 'cc';

/**
 * 反序列化指定数据，并处理其中涉及的资源引用。
 * @param serialized 序列化后的数据。
 * @returns 反序列化的结果。
 */
export async function deserializeFull(serialized: unknown) {
    const deserializeDetails = new deserialize.Details();
    deserializeDetails.reset();
    const result = deserialize(serialized, deserializeDetails);
    const uuidList = deserializeDetails.uuidList;
    if (!uuidList) {
        return result;
    }
    if (uuidList.some((uuid) => typeof uuid === 'number')) {
        throw new Error(`Don't know how to handle numeric UUID in ${uuidList}`);
    }
    const uuidToAssetMap: Record<string, unknown> = {};
    await Promise.all((uuidList as string[]).map((uuid) => new Promise<void>((resolve, reject) => {
        assetManager.loadAny(uuid, (err, asset) => {
            if (err) {
                reject(err);
            } else {
                uuidToAssetMap[uuid] = asset;
                resolve();
            }
        });
    })));
    deserializeDetails.assignAssetsBy((uuid, _) => {
        if (!(uuid in uuidToAssetMap)) {
            throw new Error(`Deserialized object is referencing ${uuid} which was not appeared in deserialize details.`);
        }
        const asset = uuidToAssetMap[uuid];
        if (!(asset instanceof Asset)) {
            throw new Error(`Deserialized object is referencing ${uuid} which was appeared in deserialize details but isn't an asset.`);
        }
        return asset;
    });
    return result;
}