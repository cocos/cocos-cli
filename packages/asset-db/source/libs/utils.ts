'use strict';

import { readdir, stat, existsSync, Stats, statSync, readdirSync } from 'fs-extra';
import { isAbsolute, resolve, normalize, join, relative } from 'path';
import { createHash } from 'crypto';
import { isSubPath } from './path-identity';

export { isSamePath, isSubPath, toPathKey } from './path-identity';

/**
 * 将一个 path 转成绝对地址
 * 如果传入数据不存在，则返回 ''
 * @param path
 */
export function absolutePath (path: string | undefined) {
    if (!path) {
        return '';
    }
    if (isAbsolute(path) && /^[A-Za-z]:/.test(path)) {
        return normalize(path);
    }
    return resolve(path);
};

/**
 * 比对版本号
 * A > B => 1
 * A = B => 0
 * A < B => -1
 * @param versionA
 * @param versionB
 */
export function compareVersion (versionA, versionB) {
    const a = versionA.split('.');
    const b = versionB.split('.');

    const length = Math.max(a.length, b.length);

    for (let i=0; i<length; i++) {
        const an = a[i] || 0;
        const bn = b[i] || 0;
        if (Number(an) < Number(bn)) {
            return -1;
        }

        if (Number(an) > Number(bn)) {
            return 1;
        }
    }

    return 0;
};

const _extendIndex = [
    1, 2, 3, 4, 5,
    7, 8, 9, 10, 11, 12, 13, 14, 15,
    17, 18, 19, 20, 21, 22, 23, 24,
    26, 27, 28, 29, 30
];

/**
 * 从一个名字转换成一个 id
 * 这是个有损压缩，并不能够还原成原来的名字
 * @param id
 * @param extend
 */
export function nameToId(name: string, extend?: number) {
    if (!extend) {
        extend = 0;
    }
    const md5 = createHash('md5').update(name).digest('hex');
    let id = md5[0] + md5[6] + md5[16] + md5[25] + md5[31];
    for (let i = 0; i < extend; i++) {
        id += md5[_extendIndex[i]];
    }
    return id;
}
