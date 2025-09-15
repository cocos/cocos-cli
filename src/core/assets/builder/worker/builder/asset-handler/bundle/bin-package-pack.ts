/**
 * bin package格式说明.
|PACK_BIN_TYPE - 4bytes|
|VERSION - 4bytes|
|FILES_COUNT - 4bytes|
|FILE_1_OFFSET - 4bytes|
|FILE_1_SIZE - 4bytes|
|FILE_2_OFFSET - 4bytes|
|FILE_2_SIZE - 4bytes|
...
|FILE_N_OFFSET - 4bytes|
|FILE_N_SIZE - 4bytes|
|PACKED_BIN|
 */

// 文件头, cocos的bin文件类型标识, BINP代表bin package格式
const PACK_BIN_TYPE = 'BINP';
// 如果以后格式有变化, 这里VERSION需要递增
const VERSION = 2;

// bin package header需要TypedArray的格式来记录合并文件列表信息
// UNIT_SIZE相当于TypedArray的单位大小(4字节)
// LITTLE_ENDIAN配置大小端
const UNIT_SIZE = 4;
const LITTLE_ENDIAN = true;

const FLOAT32_SIZE = 4;

export function binPackagePack(arrayBuffers: ArrayBuffer[]): ArrayBuffer {
    const headerBin = genHeaderBin(arrayBuffers);
    const packedBin = packBin(arrayBuffers);
    return packBin([headerBin, packedBin]);
}

function getPaddedSize(size: number): number {
    return Math.ceil(size / FLOAT32_SIZE) * FLOAT32_SIZE;
}

function packBin(arrayBuffers: ArrayBuffer[]): ArrayBuffer {
    const totalSize = arrayBuffers.reduce((sum, buffer) => sum + getPaddedSize(buffer.byteLength), 0);
    const packedBin = new Uint8Array(totalSize);
    let offset = 0;
    arrayBuffers.forEach(buffer => {
        packedBin.set(new Uint8Array(buffer), offset);
        offset += getPaddedSize(buffer.byteLength);
    });
    return packedBin.buffer;
}

function genHeaderBin(arrayBuffers: ArrayBuffer[]): ArrayBuffer {
    const filesCount = arrayBuffers.length;
    const ret = new ArrayBuffer(UNIT_SIZE * (3 + filesCount * 2));
    const dataView = new DataView(ret);

    for (let i = 0; i < PACK_BIN_TYPE.length; i++) {
        dataView.setUint8(i, PACK_BIN_TYPE.charCodeAt(i));
    }
    dataView.setUint32(UNIT_SIZE, VERSION, LITTLE_ENDIAN);
    dataView.setUint32(UNIT_SIZE * 2, filesCount, LITTLE_ENDIAN);

    let offset = 0;
    arrayBuffers.forEach((arrayBuffer, index) => {
        dataView.setUint32(UNIT_SIZE * (3 + index * 2), offset, LITTLE_ENDIAN);
        offset += getPaddedSize(arrayBuffer.byteLength);
        dataView.setUint32(UNIT_SIZE * (3 + index * 2 + 1), arrayBuffer.byteLength, LITTLE_ENDIAN);
    });
    
    return ret;
}
