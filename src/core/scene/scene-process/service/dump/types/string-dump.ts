import {
    IProperty,
} from '../../../../@types/public';

import { DumpInterface } from './dump-interface';

// 转换数据，防止因为 js 弱类型导致数据类型被更改
class StringDump implements DumpInterface {
    public encode(object: any, data: IProperty, opts?: any): void {
        data.value = object;
    }

    public decode(data: any, info: any, dump: any, opts?: any): void {
        dump.value += '';
        data[info.key] = dump.value;
    }
}

export const stringDump = new StringDump();
