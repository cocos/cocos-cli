import { IProperty } from '../../../../@types/public';

import { DumpInterface } from './dump-interface';

/**
 * 判断 dump 的属性类型是否为脚本资产（`cc.Script` 及其子类）。
 *
 * 脚本资产在 Cocos 4.0 中不再是可加载资源：asset library 里没有脚本条目，
 * 引擎也没有 `cc.Script` 的加载处理器，`loadAny` 必然失败。只能按属性类型判定。
 */
function isScriptAssetDump(dump: any): boolean {
    if (!dump) {
        return false;
    }
    if (dump.type === 'cc.Script') {
        return true;
    }
    const extendsList: unknown = dump.extends;
    return Array.isArray(extendsList) && extendsList.includes('cc.Script');
}

/**
 * 为脚本资产构造占位实例：保留 uuid，但不加载脚本本体。
 *
 * 引用信息（uuid）必须保留，否则场景重新打开后属性会退化成 null；
 * 脚本对应的类由场景运行时的脚本注册表解析（uuid → cid → `cc.js.getClassById`）。
 */
function createScriptAssetPlaceholder(uuid: string): any {
    const ScriptCtor = cc.js.getClassByName('cc.Script');
    if (!ScriptCtor) {
        return null;
    }
    const placeholder = new ScriptCtor();
    placeholder.initDefault(uuid);
    return placeholder;
}

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
                        // 脚本资产无法 loadAny，用带 uuid 的占位实例保留引用。
                        const scriptPlaceHolder = isScriptAssetDump(dump)
                            ? createScriptAssetPlaceholder(data.value.uuid)
                            : null;
                        if (scriptPlaceHolder) {
                            result[i] = scriptPlaceHolder;
                        } else {
                            // @ts-ignore
                            const placeHolder = EditorExtends.serialize.asAsset(dump.value.uuid, cc.js.getClassById(dump.type));
                            placeHolder.initDefault();
                            result[i] = placeHolder;
                        }
                    }

                }
            }
            data[info.key] = result;
        } else {
            // TODO: 这是 Hack 做法，避开类似 uuid = 'ui-sprite-material' 资源加载失败的报错
            if (!dump.value || !dump.value.uuid || dump.value.uuid.startsWith('ui-')) {
                if (opts?.suppressError != undefined && opts?.suppressError == true) {
                    data[info.key] = null;
                } else {
                    throw new Error(`The UUID is empty or starts with '-ui'`);
                }
            } else {
                const asset = await new Promise((resolve) => {
                    cc.assetManager.loadAny(dump.value.uuid, (error: any, asset: any) => {
                        if (error) {
                            resolve(null);
                        } else {
                            resolve(asset);
                        }
                    });
                });
                if (asset) {
                    data[info.key] = asset;
                } else {
                    // 脚本资产无法 loadAny，用带 uuid 的占位实例保留引用，
                    // 避免整份场景因一次资源加载失败而打不开。
                    const scriptPlaceHolder = isScriptAssetDump(dump)
                        ? createScriptAssetPlaceholder(dump.value.uuid)
                        : null;
                    if (scriptPlaceHolder) {
                        data[info.key] = scriptPlaceHolder;
                    } else if (opts?.suppressError != undefined && opts?.suppressError == true) {
                        // @ts-ignore
                        const placeHolder = EditorExtends.serialize.asAsset(dump.value.uuid, cc.js.getClassById(dump.type));
                        placeHolder.initDefault();
                        data[info.key] = placeHolder;
                    } else {
                        console.error(`Failed to load asset using the UUID:${dump.value.uuid}`);
                        throw new Error(`Failed to load asset using the UUID:${dump.value.uuid}`);
                    }
                }
            }
        }
    }
}

export const assetDump = new AssetDump();
