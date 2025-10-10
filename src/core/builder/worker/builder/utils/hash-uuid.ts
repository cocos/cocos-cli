import { compareUUID } from '../../../share/utils';

import XXH from 'xxhashjs';

// 因为我们计算的哈希值字符串长度不一定一样，所以在后面添加 ID 时要用分隔符隔开，
// 才能避免加了 ID 后又刚好和其它哈希值冲突
const UNIQUE_ID_SEP = '-';

function unique(array: string[]) {
    const counts: any = {};
    for (let i = 0; i < array.length; i++) {
        const hash = array[i];
        const count = counts[hash];
        if (typeof count === 'undefined') {
            counts[hash] = 1;
        } else {
            array[i] = hash + UNIQUE_ID_SEP + (count).toString(16);
            counts[hash] = count + 1;
        }
    }
}

/**
 * 传入多个 uuid 数组，计算出每个数组对应的哈希值（16进制字符串表示），保证每次返回的哈希值之间互不重复。
 * 如果指定了 hashName，保证不同的 hashName 返回的哈希值一定互不重复。
 * @param {String[][]} uuidGroups
 * @param {BuiltinHashType|String} hashName - 如果哈希值会用作文件名，要注意 hashName 不区分大小写并且不能包含非法字符
 * @return {String[][]} hashes
 */
export function calculate(uuidGroups: string[][], hashName: string | number) {
    const H = XXH.h32();
    const hashes = [];
    for (let i = 0; i < uuidGroups.length; i++) {
        let uuids = uuidGroups[i];
        // @ts-ignore
        uuids = uuids.slice().sort(compareUUID);
        for (let j = 0; j < uuids.length; j++) {
            H.update(uuids[j]);
        }
        const hash = H.digest().toString(16).padEnd(8, '0');
        hashes.push(hash);
    }

    unique(hashes);

    // add prefix
    if (typeof hashName === 'string') {
        if (hashName.length < 2) {
            console.error('hashName string length must >= 2');
            return hashes;
        }
    } else {
        hashName = '0123456789abcdef'[hashName];
        if (!hashName) {
            console.error('Invalid hashName');
            return hashes;
        }
    }
    return hashes.map((x) => {
        return hashName + x;
    });
}

export const BuiltinHashType = {
    PackedAssets: 0,
    AutoAtlasImage: 1,
};
