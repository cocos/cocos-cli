import { Asset } from '@editor/asset-db';
import fs from 'fs-extra';

type TypedObjectVisitor = (serialized: any) => void;

const archiveProxyWatchedTag = Symbol('ArchiveProxyWatched');

export class Archive {
    constructor(data: unknown = null) {
        deIndex(data, data);
        this._originalData = data;
        this._root = Array.isArray(data) ? data[0] : data;
        const proxyHandler: ProxyHandler<object> = {
            get(target, property, receiver) {
                if (property === archiveProxyWatchedTag) {
                    return target;
                }
                const value = Reflect.get(target, property, receiver);
                if (value === null || value === undefined || typeof value !== 'object') {
                    return value;
                }
                const v = value[refTag] !== undefined ? value[refTag] : value;
                return new Proxy(v, proxyHandler);
            },

            set(target, property, value, receiver) {
                const realValue = typeof value === 'object' && value ? value[archiveProxyWatchedTag] ?? value : value;
                const v = !Array.isArray(value) && typeof value === 'object' && value ? { [refTag]: realValue } : realValue;
                return Reflect.set(target, property, v, receiver);
            },
        };
        this._proxyHandler = proxyHandler;
    }

    get root() {
        return new Proxy(this._root, this._proxyHandler);
    }

    public get(value?: object) {
        const object = typeof value === 'object' && value ? (value as any)[archiveProxyWatchedTag] ?? value : this._root;
        const objects: unknown[] = [object];
        reIndex(object, objects);
        return objects.length === 1 ? objects[0] : objects;
    }

    public addObject() {
        return new Proxy({}, this._proxyHandler);
    }

    public addTypedObject(typeName: string) {
        return new Proxy({ __type__: typeName }, this._proxyHandler);
    }

    public visitTypedObject(className: string, visitor: TypedObjectVisitor) {
        const visited = new Set<object>();
        this._visitTypedObject(className, visitor, this._root, visited);
    }

    public clearObject(object: object) {
        const keys = Object.keys(object);
        for (const key of keys) {
            switch (key) {
                case '__type__':
                    break;
                default:
                    delete (object as any)[key];
                    break;
            }
        }
    }

    private _root: object;
    private _originalData: unknown;
    private _proxyHandler: ProxyHandler<object>;

    private _visitTypedObject(className: string, visitor: TypedObjectVisitor, object: unknown, visited: Set<object>) {
        if (Array.isArray(object)) {
            object.forEach((child: any) => {
                this._visitTypedObject(className, visitor, child, visited);
            });
        } else if (object && typeof object === 'object') {
            if ((object as any)[refTag]) {
                this._visitTypedObject(className, visitor, (object as any)[refTag], visited);
            } else if (!visited.has(object)) {
                visited.add(object);
                type MaybeTyped = { __type__?: string };
                const type = (object as MaybeTyped).__type__;
                if (type === className) {
                    visitor(new Proxy(object, this._proxyHandler));
                }
                for (const value of Object.values(object)) {
                    this._visitTypedObject(className, visitor, value, visited);
                }
            }
        }
    }
}

const refTag = Symbol('Ref');

function deIndex(value: unknown, file: unknown) {
    if (Array.isArray(value)) {
        value.forEach((element) => {
            deIndex(element, file);
        });
    } else if (value && typeof value === 'object') {
        const ref = value as { __id__?: number; [refTag]: object };
        if (typeof ref.__id__ === 'number') {
            const id = ref.__id__;
            ref[refTag] = (file as object[])[id];
        } else {
            Object.values(value).forEach((propertyValue) => deIndex(propertyValue, file));
        }
    }
}

function reIndex(value: unknown, objects: unknown[]) {
    if (Array.isArray(value)) {
        value.forEach((element) => {
            reIndex(element, objects);
        });
    } else if (value && typeof value === 'object') {
        const ref = value as { __id__: number; [refTag]?: object };
        const object = ref[refTag];
        if (object) {
            const id = objects.indexOf(object);
            if (id >= 0) {
                ref.__id__ = id;
            } else {
                ref.__id__ = objects.length;
                objects.push(object);
                reIndex(object, objects);
            }
        } else {
            Object.values(value).forEach((propertyValue) => reIndex(propertyValue, objects));
        }
    }
}

export interface MigrationSwapSpace {
    json: unknown;
}

/**
 * version: 这个版本之前的 scene Handler 都会进行迁移
 * migrate: 在导入前执行的迁移的动作
 */

export const migrationHook = {
    async pre(asset: Asset) {
        const swap = asset.getSwapSpace<MigrationSwapSpace>();
        swap.json = await fs.readJSON(asset.source);
    },
    async post(asset: Asset, num: number) {
        const swap = asset.getSwapSpace<MigrationSwapSpace>();
        if (num > 0) {
            // 请勿使用 writeJson，因为这个接口会在末尾增加空行
            const json = JSON.stringify(swap.json, null, 2);
            await fs.writeFile(asset.source, json);
        }
        delete swap.json;
    },
};
