/**
 * 将 key 提取到单个文件内
 * @param {*} json
 */
export function compressJson(json: any) {
    if (typeof json !== 'object') {
        return json;
    }
    const keyCounter = {};
    let data = json;
    const keysSet: Set<string> = new Set();
    let keys: string[] = [];
    if (Array.isArray(json)) {
        collectArrayKey(json, keyCounter, keysSet);
        if (keysSet.size < 1) {
            return data;
        }
        keys = Array.from(keys);
        data = renameArrayJson(json, keys);
    } else {
        collectObjectKey(json, keyCounter, keysSet);
        if (keysSet.size < 1) {
            return data;
        }
        keys = Array.from(keysSet);
        data = renameObjectJson(json, keys);
    }
    return {
        keys,
        data,
    };
}
/**
 * 对 json 数据的 key 进行提取
 */
function renameObjectJson(object: any, keys: string[]) {
    if (!object) {
        return object;
    }
    const result = Object.create(null);
    Object.keys(object).forEach((key) => {
        let newKey: string | number = key;
        // 纯数字的关键帧也需要记录进 keys 里
        if (/^\d$/.test(key)) {
            keys.push(key);
        }
        const index = keys.indexOf(key);
        if (index !== -1) {
            newKey = index;
        }
        if (object[key] && typeof (object[key]) === 'object') {
            if (Array.isArray(object[key])) {
                result[newKey] = renameArrayJson(object[key], keys);
            } else {
                result[newKey] = renameObjectJson(object[key], keys);
            }
        } else {
            result[newKey] = object[key];
        }
    });
    return result;
}

/**
 * 根据收集的 key 信息，重命名 json 里的 key
 * @param {*} arr
 * @param {*} keys
 * @param {*} keyCounter
 */
function renameArrayJson(arr: any[], keys: string[]): any[] {
    if (!arr) {
        return arr;
    }
    return arr.map((item: any) => {
        if (item && typeof (item) === 'object') {
            if (Array.isArray(item)) {
                return renameArrayJson(item, keys);
            }
            return renameObjectJson(item, keys);
        }
        return item;
    });
}

function collectObjectKey(object: any, keyCounter: any, keys: Set<string>) {
    if (!object) {
        return;
    }
    Object.keys(object).forEach((key) => {
        if (object[key] === null || object[key] === undefined) {
            return;
        }
        if (keyCounter[key]) {
            keys.add(key);
        } else {
            keyCounter[key] = 1;
        }
        if (typeof (object[key]) === 'object') {
            if (Array.isArray(object[key])) {
                collectArrayKey(object[key], keyCounter, keys);
            } else {
                collectObjectKey(object[key], keyCounter, keys);
            }
        }
    });
}

function collectArrayKey(arr: any[], keyCounter: any, keys: Set<string>) {
    if (!arr) {
        return;
    }
    arr.forEach((item) => {
        if (item && typeof (item) === 'object') {
            if (Array.isArray(item)) {
                collectArrayKey(item, keyCounter, keys);
            } else {
                collectObjectKey(item, keyCounter, keys);
            }
        }
    });
}
