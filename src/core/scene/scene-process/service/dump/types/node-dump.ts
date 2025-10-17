import {
    IProperty,
} from '../../../../@types/public';

import { DumpInterface } from './dump-interface';
const NodeMgr = EditorExtends.Node;
// valueType直接使用引擎序列化
class NodeDump implements DumpInterface {
    public encode(object: any, data: IProperty, opts?: any): void {
        data.value = {
            uuid: object ? object.uuid || '' : '',
        };

        // // 当 default 为 Node 的时候，无法生成虚假的 Node，所以 default 重置为 null
        // if (data.default) {
        //     data.default = null;
        // }
    }

    public decode(data: any, info: any, dump: any, opts?: any): void {
        if (!dump.value || !dump.value.uuid) {
            data[info.key] = null;
        } else {
            const node = NodeMgr.getNode(dump.value.uuid);
            if (info.key === 'parent') {
                const keepWorldTransform = 'keepWorldTransform' in dump ? dump.keepWorldTransform : true;
                data.setParent(node, keepWorldTransform);
            } else {
                data[info.key] = node;
            }
        }
    }
}

export const nodeDump = new NodeDump();
