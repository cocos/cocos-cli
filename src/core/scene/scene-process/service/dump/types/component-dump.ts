import {
    IProperty,
} from '../../../../@types/public';

import { DumpInterface } from './dump-interface';
import ComponentManager from '../../component/index';

// valueType直接使用引擎序列化
class ComponentDump implements DumpInterface {
    public encode(object: any, data: IProperty, opts?: any): void {
        data.value = {
            uuid: object ? object.uuid || '' : '',
        };
    }

    public decode(data: any, info: any, dump: any, opts?: any): void {
        data[info.key] = ComponentManager.query(dump.value.uuid);
    }
}

export const componentDump = new ComponentDump();
