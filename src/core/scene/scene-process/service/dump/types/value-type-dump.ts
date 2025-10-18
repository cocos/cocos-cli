import {
    IProperty,
} from '../../../../@types/public';

import { DumpInterface } from './dump-interface';

// valueType直接使用引擎序列化
class ValueTypeDump implements DumpInterface {
    public encode(object: any, data: IProperty, opts?: any): void {
        try {
            const dump = EditorExtends.serialize(object, { stringify: false, forceInline: true }) as any;
            delete dump.__type__;
            data.value = dump;
        } catch (error) {
            console.warn('Value dump failed.');
            console.warn(error);

            const ctor = opts.ctor;
            const dump = EditorExtends.serialize(new ctor(), { stringify: false, forceInline: true }) as any;
            delete dump.__type__;
            data.value = dump;
        }
    }

    public decode(data: any, info: any, dump: any, opts?: any): void {
        const ccType = opts.ccType;
        const value = new ccType();
        ccType.__props__.forEach((key: string) => {
            if (dump.value[key] === undefined) {
                value[key] = data[info.key][key];
                return;
            }
            value[key] = dump.value[key];
        });
        data[info.key] = value;
    }
}

export const valueTypeDump = new ValueTypeDump();
