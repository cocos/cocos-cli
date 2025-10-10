import {
    Asset,
    ValueType,
    js,
    deserialize,
    error,
    Constructor,
} from 'cc';

import {
    PropertyOptions,
    IArrayOptions,
    IClassOptions,
    ICustomClassOptions,
    IObjParsingInfo,
} from './parser';

// import deserializer types
import D = deserialize.Internal;
import { Builder, IBuilderOptions } from './base-builder';
type AnyCCClass = D.AnyCCClass_;

namespace Format {
    export interface Class {
        __type__: string;
        [prop: string]: AnyItem;
    }
    export interface CustomizedClass extends Class {
        content: any;
    }
    export interface TypedArray extends Class {
        __type__: 'TypedArray',
        ctor: string,
        array: any[],
    }
    export interface InstanceReference {
        __id__: number;
    }
    export interface AssetReference {
        __uuid__: string;
    }

    type RawItem = number | string | boolean | null;
    type Item = Class | InstanceReference | RawItem;
    type Dict = {
        [key in string]: AnyItem;
    };
    type Array = AnyItem[];

    export type Object = Class | Dict | Array;
    export type AnyItem = Item | Dict | Array;
}

interface IObjAndId extends IObjParsingInfo {
    // serializedList 中的序列化结果
    data: Format.AnyItem,
    // __id__，为负则说明不在 serializedList
    id: number,
}

export default class DynamicBuilder extends Builder {
    forceInline: boolean;

    // list of serialized data
    private serializedList: any[] = [];

    constructor(options: IBuilderOptions) {
        super(options);
        this.forceInline = !!options.forceInline;
    }

    setProperty_Array(owner: object | null, ownerInfo: IObjAndId | null, key: string | number, options: IArrayOptions): IObjAndId {
        return this.addObject(options.writeOnlyArray, ownerInfo, key, options.formerlySerializedAs, false);
    }

    setProperty_Dict(owner: object | null, ownerInfo: IObjAndId | null, key: string | number, options: PropertyOptions): IObjAndId {
        return this.addObject({}, ownerInfo, key, options?.formerlySerializedAs, false);
    }

    private addObject(data: Format.Object, ownerInfo: IObjAndId | null, key: string | number, formerlySerializedAs: string | undefined, forceIndexed: boolean): IObjAndId {
        let id = -1;
        let refData: Format.AnyItem = data;
        const isRoot = !ownerInfo;
        if ((!this.forceInline && forceIndexed) || isRoot) {
            id = this.serializedList.length;
            this.serializedList.push(data);
            if (!this.forceInline) {
                refData = { __id__: id } as Format.InstanceReference;
            }
        }
        if (ownerInfo) {
            (ownerInfo.data as any)[key] = refData;
            if (formerlySerializedAs) {
                (ownerInfo.data as any)[formerlySerializedAs] = refData;
            }
        }
        return { data, id };
    }

    setProperty_Class(owner: object | null, ownerInfo: IObjAndId | null, key: string | number, options: IClassOptions): IObjAndId {
        const data = {
            __type__: options.type,
        } as Format.Class;
        return this.addObject(data, ownerInfo, key, options.formerlySerializedAs, !(options.uniquelyReferenced ?? false));
    }

    setProperty_CustomizedClass(owner: object | null, ownerInfo: IObjAndId | null, key: string | number, options: ICustomClassOptions): IObjAndId {
        const data = {
            __type__: options.type,
            content: options.content,
        } as Format.CustomizedClass;
        return this.addObject(data, ownerInfo, key, options.formerlySerializedAs, true);
    }

    // parsed

    setProperty_ParsedObject(ownerInfo: IObjAndId, key: string | number, valueInfo: IObjAndId, formerlySerializedAs: string | null): void {
        if (!this.forceInline && valueInfo.id >= 0) {
            // 可索引对象
            (ownerInfo.data as any)[key] = { __id__: valueInfo.id } as Format.InstanceReference;
        }
        else {
            // 不可索引对象，直接内联数据
            (ownerInfo.data as any)[key] = valueInfo.data;
        }
        if (formerlySerializedAs) {
            (ownerInfo.data as any)[formerlySerializedAs] = (ownerInfo.data as any)[key];
        }
    }

    // Static Values

    setProperty_Raw(owner: object, ownerInfo: IObjAndId, key: string | number, value: any, options: PropertyOptions): void {
        (ownerInfo.data as any)[key] = value;
        if (options?.formerlySerializedAs) {
            (ownerInfo.data as any)[options.formerlySerializedAs] = value;
        }
    }

    setProperty_ValueType(owner: object | null, ownerInfo: IObjAndId | null, key: string | number, value: ValueType, options: PropertyOptions): IObjAndId {
        const data = {
            __type__: js.getClassId(value, false),
        } as Format.Class;

        const props = (value.constructor as AnyCCClass).__values__;
        if (props) {
            for (let p = 0; p < props.length; p++) {
                const propName = props[p];
                data[propName] = (value as any)[propName];
            }
        }

        if (ownerInfo) {
            (ownerInfo.data as any)[key] = data;
            if (options?.formerlySerializedAs) {
                (ownerInfo.data as any)[options.formerlySerializedAs] = data;
            }
            return { data, id: -1 };
        }
        else {
            this.serializedList.push(data);
            return { data, id: 0 };
        }
    }

    setProperty_TypedArray(owner: object, ownerInfo: IObjAndId, key: string | number, value: any, options: PropertyOptions): void {
        let data;
        if (this.hasBinaryBuffer) {
            const isDataView = value instanceof DataView;
            if (!isDataView) {
                this.mainBufferBuilder.alignAs(value.constructor.BYTES_PER_ELEMENT);
            }
            const offset = this.mainBufferBuilder.append(value);
            data = {
                __type__: 'TypedArrayRef',
                ctor: value.constructor.name,
                offset,
                length: isDataView ? value.byteLength : value.length,
            };
        } else {
            data = {
                __type__: 'TypedArray',
                ctor: value.constructor.name,
                array: Array.from(value),
            } as Format.TypedArray;
        }

        if (ownerInfo) {
            (ownerInfo.data as any)[key] = data;
            if (options?.formerlySerializedAs) {
                (ownerInfo.data as any)[options.formerlySerializedAs] = data;
            }
        } else {
            this.serializedList.push(data);
        }
    }

    setProperty_AssetUuid(owner: object, ownerInfo: IObjAndId, key: string | number, uuid: string, options: PropertyOptions): void {
        (ownerInfo.data as any)[key] = { __uuid__: uuid } as Format.AssetReference;
        if (options?.formerlySerializedAs) {
            (ownerInfo.data as any)[options.formerlySerializedAs] = (ownerInfo.data as any)[key];
        }
        if (options?.expectedType) {
            (ownerInfo.data as any)[key].__expectedType__ = options.expectedType;
        }
    }

    setRoot(objInfo: IObjAndId): void {
        assert(objInfo.id === 0, `Wrong root object to serialize, id is ${objInfo.id}`);
    }

    protected finalizeJsonPart() {
        const serializedList = this.serializedList;
        let serializedData;
        if (serializedList.length === 1 && !Array.isArray(serializedList[0])) {
            serializedData = serializedList[0];
        } else {
            serializedData = serializedList;
        }
        return serializedData;
    }
}

/**
 * Create a pseudo object which will be force serialized as a reference to any asset by specified uuid.
 */
export function asAsset(uuid: string, type: Constructor<Asset> = Asset): Asset | null {
    if (!uuid) {
        error('[EditorExtends.serialize.asAsset] The uuid must be non-nil!');
        return null;
    }
    const pseudoAsset = new type();
    pseudoAsset._uuid = uuid;
    return pseudoAsset;
}

/**
 * Set the asset's name directly in JSON object
 */
export function setName(data: Format.AnyItem, name: string) {
    if (Array.isArray(data)) {
        (data[0] as any)._name = name;
    } else {
        (data as any)._name = name;
    }
}

export function findRootObject(data: Format.AnyItem, type: string) {
    if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
            const obj = data[i] as Format.Class;
            if (obj.__type__ === type) {
                return obj;
            }
        }
    }
    else if ((data as Format.Class).__type__ === type) {
        return data;
    }
    return null;
}

export function assert(condition: any, message?: string): void {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}