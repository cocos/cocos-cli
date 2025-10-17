import {
    IProperty,
} from '../../../../@types/public';

import { DumpInterface } from './dump-interface';

// 转换数据，防止因为 js 弱类型导致数据类型被更改
class NumberDump implements DumpInterface {
    public encode(object: any, data: IProperty, opts?: any): void {
        data.value = object;
    }

    public decode(data: any, info: any, dump: any, opts?: any): void {
        // ENUM 可能是字符串，所以不能强制转成数字
        const t = dump.value - 0;
        if (!isNaN(t)) {
            dump.value = t;
        }
        data[info.key] = dump.value;
    }
}

export const numberDump = new NumberDump();
