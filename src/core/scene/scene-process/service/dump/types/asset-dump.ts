import { IProperty } from '../../../../@types/public';

import { DumpInterface } from './dump-interface';

// valueType直接使用引擎序列化
class AssetDump implements DumpInterface {
    public encode(object: any, data: IProperty, opts?: any) {
        // 物理材质会在内存里创建一个虚拟的资源，这个资源不需要显示出去
        // 暂时性的 hack，后续需要移除
        // 测试方式：新建节点，挂载一个 BoxCollider 组件，观察 material属性是否正常
        const uuid = object ? object._uuid || '' : '';
        data.value = {
            uuid: uuid.startsWith('pm_') ? '' : uuid,
        };
    }

    public async decode(data: any, info: any, dump: any, opts?: any) {
        if (Array.isArray(dump.value)) {
            const result: any = [];
            for (let i = 0; i < dump.value.length; i++) {
                const data = dump.value[i];
                // TODO: 这是 Hack 做法，避开类似 uuid = 'ui-sprite-material' 资源加载失败的报错
                if (!data || !data.value.uuid || data.value.uuid.startsWith('ui-')) {
                    result[i] = null;
                } else {
                    const asset = await new Promise((resolve) => {
                        cc.assetManager.loadAny(data.value.uuid, (error: any, asset: any) => {
                            if (error) {
                                console.error(`asset can't be load:${data.value.uuid}`);
                                resolve(null);
                            } else {
                                resolve(asset);
                            }
                        });
                    });

                    if (asset) {
                        result[i] = asset;
                    } else {
                        // @ts-ignore
                        const placeHolder = EditorExtends.serialize.asAsset(dump.value.uuid, cc.js.getClassById(dump.type));
                        placeHolder.initDefault();
                        result[i] = placeHolder;
                    }

                }
            }
            data[info.key] = result;
        } else {
            // TODO: 这是 Hack 做法，避开类似 uuid = 'ui-sprite-material' 资源加载失败的报错
            if (!dump.value || !dump.value.uuid || dump.value.uuid.startsWith('ui-')) {
                data[info.key] = null;
            } else {
                const asset = await new Promise((resolve) => {
                    cc.assetManager.loadAny(dump.value.uuid, (error: any, asset: any) => {
                        if (error) {
                            console.error(`asset can't be load:${dump.value.uuid}`);
                            resolve(null);
                        } else {
                            resolve(asset);
                        }
                    });
                });
                if (asset) {
                    data[info.key] = asset;
                } else {
                    // @ts-ignore
                    const placeHolder = EditorExtends.serialize.asAsset(dump.value.uuid, cc.js.getClassById(dump.type));
                    placeHolder.initDefault();
                    data[info.key] = placeHolder;
                }
            }
        }
    }
}

export const assetDump = new AssetDump();
