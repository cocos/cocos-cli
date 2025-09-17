
// 实现序列化的运行时数据格式
// 参考文档：https://github.com/cocos-creator/3d-tasks/tree/master/design-docs/data-structure/data-structures-serialization.md

import {
    ValueType,
    deserialize,
} from 'cc';
import * as cc from 'cc';
import {
    serializeBuiltinValueType,
} from 'cc/editor/serialization';

import { ArrayNode, Node, ClassNode, CustomClassNode, DictNode, IRefsBuilder, TraceableDict } from './types';
import {
    PropertyOptions,
    IArrayOptions,
    IClassOptions,
    ICustomClassOptions,
    IObjParsingInfo,
} from '../parser';
import dumpClasses from './create-class-mask';

// import deserializer types
import D = deserialize.Internal;
type Empty = D.Empty_;
import DataTypeID = D.DataTypeID_;
import File = D.File_;
type ICustomObjectData = D.ICustomObjectData_;
type IFileData = D.IFileData_;
type InstanceIndex = D.InstanceIndex_;
type IRefs = D.IRefs_;
type ITRSData = D.ITRSData_;
import Refs = D.Refs_;
import { Builder, IBuilderOptions } from '../base-builder';
type SharedString = D.SharedString_;
type AnyCCClass = D.AnyCCClass_;

const {
    EMPTY_PLACEHOLDER,
    CUSTOM_OBJ_DATA_CLASS,
    CUSTOM_OBJ_DATA_CONTENT,
} = deserialize._macros;

export const FORMAT_VERSION = 1;

// 序列化为任意值即可，反序列化时才会解析出来的对象
const INNER_OBJ_PLACEHOLDER = 0;

namespace RefsBuilder {

    type RefRecord = [
        // [Refs.OWNER_OFFSET] - 谁指向目标对象
        InstanceIndex,
        // [Refs.KEY_OFFSET] - 指向目标对象的属性名或者数组索引
        string | number,
        // [Refs.TARGET_OFFSET] - 指向的目标对象
        InstanceIndex
    ];

    export class Impl implements IRefsBuilder {
        private beforeOffsetRefs = new Array<RefRecord>();
        private afterOffsetRefs = new Array<RefRecord>();
        private ctx: CompiledBuilder;

        constructor(ctx: CompiledBuilder) {
            this.ctx = ctx;
        }

        addRef(owner: Node, key: string | number, target: Node): number {
            const canRefDirectly = (target.instanceIndex < owner.instanceIndex);
            if (canRefDirectly) {
                return target.instanceIndex;
            }

            const record = [NaN, key, target.instanceIndex] as RefRecord;

            if (owner.indexed) {
                record[Refs.OWNER_OFFSET] = owner.instanceIndex;
                this.afterOffsetRefs.push(record);
                return NaN;
            }
            else {
                record[Refs.OWNER_OFFSET] = INNER_OBJ_PLACEHOLDER;
                this.beforeOffsetRefs.push(record);
                // 返回对象需要在反序列化过程中赋值给 refs 数组的索引（运行时索引会 * 3）
                return ~(this.beforeOffsetRefs.length - 1);
            }
        }

        build(): IRefs | null {
            if (this.beforeOffsetRefs.length === 0 && this.afterOffsetRefs.length === 0) {
                return null;
            }
            const offset = this.beforeOffsetRefs.length;
            const allRefs = this.beforeOffsetRefs.concat(this.afterOffsetRefs);
            const res = new Array<number>(allRefs.length * Refs.EACH_RECORD_LENGTH + 1);

            let i = 0;
            for (const ref of allRefs) {
                res[i++] = ref[Refs.OWNER_OFFSET];
                const key = ref[Refs.KEY_OFFSET];
                if (typeof key === 'number') {
                    res[i++] = ~key;
                }
                else {
                    this.ctx.sharedStrings.traceString(key, res, i++);
                }
                res[i++] = ref[Refs.TARGET_OFFSET];
            }
            res[i] = offset;
            return res as IRefs;
        }
    }
}

export function reduceEmptyArray<T extends any[]>(array: T): T | Empty {
    return (array && array.length > 0) ? array : EMPTY_PLACEHOLDER;
}

export default class CompiledBuilder extends Builder {
    noNativeDep: boolean;

    sharedUuids = new TraceableDict<SharedString>();
    sharedStrings = new TraceableDict<SharedString>();

    refsBuilder: RefsBuilder.Impl;

    // 缓存资源使用情况
    // [item1, key1, uuid1, item2, key2, uuid2, ...]
    dependAssets = new Array<Node | string | number>();

    private rootNode: Node | undefined;
    private normalNodes = new Array<ClassNode>();
    private advancedNodes = new Array<CustomClassNode | ArrayNode | DictNode>();
    private classNodes = new Array<ClassNode | CustomClassNode>();

    private data = new Array<any>(File.ARRAY_LENGTH) as IFileData;

    constructor(options: IBuilderOptions) {
        super(options);

        if (options.forceInline) {
            throw new Error('CompiledBuilder doesn\'t support `forceInline`');
        }

        this.noNativeDep = !!('noNativeDep' in options ? options.noNativeDep : true);

        this.refsBuilder = new RefsBuilder.Impl(this);
    }

    // Object Nodes，将来如有复用则会变成 InstanceRef

    setProperty_Array(owner: object | null, ownerInfo: IObjParsingInfo | null, key: string | number, options: IArrayOptions): IObjParsingInfo {
        const node = new ArrayNode(options.writeOnlyArray.length);
        this.advancedNodes.push(node);
        this.setDynamicProperty(ownerInfo, key, node);
        return node;
    }

    setProperty_Dict(owner: object | null, ownerInfo: IObjParsingInfo | null, key: string | number, options: PropertyOptions): IObjParsingInfo {
        const node = new DictNode();
        this.advancedNodes.push(node);
        this.setDynamicProperty(ownerInfo, key, node);
        return node;
    }

    setProperty_Class(owner: object | null, ownerInfo: IObjParsingInfo | null, key: string | number, options: IClassOptions): IObjParsingInfo {
        const node = new ClassNode(options.type);
        this.normalNodes.push(node);
        this.classNodes.push(node);
        this.setDynamicProperty(ownerInfo, key, node);
        return node;
    }

    setProperty_CustomizedClass(owner: object | null, ownerInfo: IObjParsingInfo | null, key: string | number, options: ICustomClassOptions): IObjParsingInfo {
        const node = new CustomClassNode(options.type, options.content);
        this.advancedNodes.push(node);
        this.classNodes.push(node);
        this.setDynamicProperty(ownerInfo, key, node);
        return node;
    }

    // parsed

    setProperty_ParsedObject(ownerInfo: IObjParsingInfo, key: string | number, valueInfo: IObjParsingInfo, formerlySerializedAs: string | null): void {
        (ownerInfo as Node).setDynamic((valueInfo as Node), key);
    }

    // Static Values

    setProperty_Raw(owner: object, ownerInfo: IObjParsingInfo, key: string | number, value: any, options: PropertyOptions): void {
        (ownerInfo as Node).setStatic(key, DataTypeID.SimpleType, value);
    }

    setProperty_ValueType(owner: object | null, ownerInfo: IObjParsingInfo | null, key: string | number, value: ValueType, options: PropertyOptions): IObjParsingInfo | null {
        if (!ownerInfo) {
            throw new Error('CompiledBulider: Not support serializing ValueType as root object.');
        }
        const data = serializeBuiltinValueType(value);
        if (!data) {
            // not built-in value type, just serialize as normal class
            return null;
        }
        let dataTypeID = DataTypeID.ValueType;
        if (options && options.defaultValue instanceof cc.ValueType) {
            dataTypeID = DataTypeID.ValueTypeCreated;
        }
        (ownerInfo as Node).setStatic(key, dataTypeID, data);
        return data;
    }

    setProperty_TypedArray(owner: object, ownerInfo: IObjParsingInfo, key: string | number, value: any, options: PropertyOptions): void {
        if (!(owner instanceof cc.Node) || key !== '_trs') {
            throw new Error('Not support to serialize TypedArray yet. Can only use TypedArray in TRS.');
        }
        if (value.length !== 10) {
            throw new Error(`TRS ${value} should contains 10 elements.`);
        }
        const data = Array.from(value) as ITRSData;
        (ownerInfo as Node).setStatic(key, DataTypeID.TRS, data);
    }

    setProperty_AssetUuid(owner: object, ownerInfo: IObjParsingInfo, key: string | number, uuid: string, options: PropertyOptions): void {
        // 先缓存到 dependAssets，最后 ownerItem 如做为嵌套对象将改成 AssetRefByInnerObj
        const ownerNode = (ownerInfo as Node);
        this.dependAssets.push(ownerNode, key, uuid);
        if (ownerNode instanceof CustomClassNode) {
            ownerNode.shouldBeIndexed = true;
        }
    }

    setRoot(objInfo: IObjParsingInfo): void {
        this.rootNode = objInfo as Node;
    }

    // markAsSharedObj (obj: any): void {}

    private setDynamicProperty(ownerInfo: IObjParsingInfo | null, key: string | number, node: Node) {
        ownerInfo && (ownerInfo as Node).setDynamic(node, key);
    }

    private collectInstances() {
        this.normalNodes = this.normalNodes.filter((x) => x.refCount > 1);
        this.normalNodes.sort(Node.compareByRefCount);
        this.advancedNodes = this.advancedNodes.filter((x) => x.shouldBeIndexed || x.refCount > 1);
        this.advancedNodes.sort(Node.compareByRefCount);

        const rootNode = this.rootNode;
        if (rootNode instanceof ClassNode) {
            // root is normal
            const rootIndex = this.normalNodes.indexOf(rootNode);
            if (rootIndex !== -1) {
                this.normalNodes.splice(rootIndex, 1);
            }
            else {
                // root.refCount <= 1
            }
            this.normalNodes.unshift(rootNode);
        }
        else {
            // root is advanced
            // @ts-ignore
            const rootIndex = this.advancedNodes.indexOf(rootNode);
            if (rootIndex === -1) {
                // root.refCount <= 1
                this.advancedNodes.length;
                // @ts-ignore
                this.advancedNodes.push(rootNode);
            }
        }

        const normalCount = this.normalNodes.length;
        for (let i = 0; i < normalCount; ++i) {
            const obj = this.normalNodes[i];
            obj.instanceIndex = i;
            obj.indexed = true;
        }
        for (let i = 0; i < this.advancedNodes.length; ++i) {
            const obj = this.advancedNodes[i];
            obj.instanceIndex = normalCount + i;
            obj.indexed = true;
        }

        // TODO - 数组尽量特化为 Array_InstanceRef 以加快反序列化性能（但是又会增加索引数量及索引类型）
        // TODO - 分析引用关系，让相互引用的对象尽量同时反序列化，提升内存命中率。
        // TODO - 分析引用关系，让被依赖的对象尽量提前序列化，减少 refs 数据量的开销（多生成 owner、key 的索引），以及设置内嵌对象实例到 owner 的开销
    }

    // 生成 Instances
    private dumpInstances() {
        const objCount = this.normalNodes.length + this.advancedNodes.length;
        const instances = new Array(objCount);

        const normalCount = this.normalNodes.length;
        for (let i = 0; i < normalCount; ++i) {
            const obj = this.normalNodes[i];
            instances[i] = obj.dumpRecursively(this.refsBuilder);
        }

        for (let i = 0; i < this.advancedNodes.length; ++i) {
            const obj = this.advancedNodes[i];
            const dumped = obj.dumpRecursively(this.refsBuilder);
            if (obj instanceof CustomClassNode) {
                instances[normalCount + i] = (dumped as ICustomObjectData)[CUSTOM_OBJ_DATA_CONTENT];
            }
            else {
                instances[normalCount + i] = dumped;
            }
        }

        if ((this.rootNode as Node).instanceIndex !== 0 ||
            typeof instances[instances.length - 1] === 'number' || // 防止最后一个数字被错当 rootInfo
            !this.noNativeDep
        ) {
            const rootIndex = (this.rootNode as Node).instanceIndex;
            instances.push(this.noNativeDep ? rootIndex : ~rootIndex);
        }

        this.data[File.Instances] = instances;
    }

    // 生成 InstanceTypes
    private dumpInstanceTypes() {
        const instanceTypes = this.advancedNodes.map((x) => {
            if (x instanceof CustomClassNode) {
                return (x.dumped as ICustomObjectData)[CUSTOM_OBJ_DATA_CLASS];
            }
            else {
                return ~x.selfType;
            }
        });
        this.data[File.InstanceTypes] = reduceEmptyArray(instanceTypes);
    }

    private dumpDependUuids() {
        const innerDepends = {
            owners: new Array<number>(),
            keys: new Array<string | number>(),
            uuids: new Array<string>(),
        };
        const indexedDepends = {
            owners: new Array<InstanceIndex>(),
            keys: new Array<string | number>(),
            uuids: new Array<string>(),
        };

        const array = this.dependAssets;
        for (let i = 0; i < array.length; i += 3) {
            const owner = array[i] as Node;
            let key = array[i + 1] as string | number;
            const uuid = array[i + 2] as string;
            let depends;
            if (owner.indexed) {
                depends = indexedDepends;
                owner.setAssetRefPlaceholderOnIndexed(key);
                depends.owners.push(owner.instanceIndex);
            }
            else {
                depends = innerDepends;
                owner.setStatic(key, DataTypeID.AssetRefByInnerObj, depends.owners.length);
                depends.owners.push(INNER_OBJ_PLACEHOLDER);
            }
            if (typeof key === 'number') {
                key = ~key;
            }
            depends.keys.push(key);
            depends.uuids.push(uuid);
        }

        this.data[File.DependObjs] = innerDepends.owners.concat(indexedDepends.owners);
        const allKeys = this.data[File.DependKeys] = innerDepends.keys.concat(indexedDepends.keys);
        for (let i = 0; i < allKeys.length; ++i) {
            const key = allKeys[i];
            if (typeof key === 'string') {
                this.sharedStrings.traceString(key, allKeys, i);
            }
        }
        const allUuids = this.data[File.DependUuidIndices] = innerDepends.uuids.concat(indexedDepends.uuids);
        for (let i = 0; i < allUuids.length; ++i) {
            const uuid = allUuids[i];
            this.sharedUuids.traceString(uuid, allUuids, i);
        }
    }

    finalizeJsonPart(): object | string {
        // 1. 遍历所有对象，将 root 和所有引用数超过 1 的对象放到 instances 中，同时将数据转换成引用
        // （如果已经在 instances 中则跳过）
        this.collectInstances();

        // 2. 生成资源依赖关系
        this.dumpDependUuids();

        // 3. 生成所有对象数据
        this.dumpInstances();

        this.data[File.Version] = FORMAT_VERSION;
        // data[File.SharedUuids] = this.dependSharedUuids.dump();
        // data[File.SharedStrings] = this.sharedStrings.dump();

        // 4. 生成 SharedClasses 和 SharedMasks
        const { sharedClasses, sharedMasks } = dumpClasses(this.classNodes);
        this.data[File.SharedClasses] = sharedClasses;
        this.data[File.SharedMasks] = reduceEmptyArray(sharedMasks);

        // 5. 写入 instance 对象类型
        this.dumpInstanceTypes();

        this.data[File.Refs] = this.refsBuilder.build() || EMPTY_PLACEHOLDER;

        const strings = this.sharedStrings.dump();
        this.data[File.SharedStrings] = reduceEmptyArray(strings);

        const uuids = this.sharedUuids.dump();
        this.data[File.SharedUuids] = reduceEmptyArray(uuids);

        return this.data;
    }
}

export function getRootData(data: IFileData): IFileData[File.Instances] {
    const instances = data[File.Instances];
    if (Array.isArray(instances)) {
        const rootInfo = instances[instances.length - 1];
        if (typeof rootInfo === 'number') {
            return instances[rootInfo >= 0 ? rootInfo : ~rootInfo];
        }
        else {
            return instances[0];
        }
    }
    else {
        return instances;
    }
}
