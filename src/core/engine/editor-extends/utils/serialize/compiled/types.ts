import {
    deserialize,
} from 'cc';

// import deserializer types
import D = deserialize.Internal;
type OtherObjectData = D.OtherObjectData_;
type AnyData = D.AnyData_;
import DataTypeID = D.DataTypeID_;
type DataTypes = D.DataTypes_;
type IArrayData = D.IArrayData_;
type IClassObjectData = D.IClassObjectData_;
type ICustomObjectData = D.ICustomObjectData_;
type ICustomObjectDataContent = D.ICustomObjectDataContent_;
type IDictData = D.IDictData_;
type IMask = D.IMask_;
type IClass = D.IClass_;

const {
    DICT_JSON_LAYOUT,
    CLASS_TYPE,
    CLASS_KEYS,
    CLASS_PROP_TYPE_OFFSET,
    CUSTOM_OBJ_DATA_CONTENT,
    MASK_CLASS,
} = deserialize._macros;

export class TraceableItem {
   
    // dataTypeID: DataTypeID | undefined = undefined;

    // 引用关系。这里不考虑定义引用对象了，改用两个数组。因为引用对象使用者也会被耦合，而且使用者创建的临时对象会更多
    private tracers: any[] = [];
    private keys: (string|number)[] = [];

    // get isSerialized (): boolean {
    //     return this.result !== TraceableItem.NO_RESULT;
    // };

    public static compareByRefCount(lhs: TraceableItem, rhs: TraceableItem): number {
        return rhs.tracers.length - lhs.tracers.length;
    }

    private static readonly NO_RESULT = Object.create(null);

    // 需要追踪的数据
    result: any = TraceableItem.NO_RESULT;

    constructor() {
        // this.source = source;
        // this.serialized = serialized;
    }
    traceBy(tracer: object, key: (string|number)) {
        this.tracers.push(tracer);
        this.keys.push(key);
    }
    movedTo(index: number) {
        for (let i = 0; i < this.tracers.length; i++) {
            this.tracers[i][this.keys[i]] = index;
        }
    }
}

export class TraceableDict<T> {
    // 当某个索引将会被延迟赋值时，使用这个字段来占坑
    public static readonly PLACEHOLDER = 0;

    private values = new Map<any, TraceableItem>();

    trace(source: any, tracer: object, key: (string|number)): TraceableItem {
        let item = this.values.get(source);
        if (!item) {
            item = new TraceableItem();
            this.values.set(source, item);
        }
        item.traceBy(tracer, key);
        return item;
    }
    traceString(source: string, tracer: object, key: (string|number)): void {
        const item = this.trace(source, tracer, key);
        // if (!item.isSerialized) {
        item.result = source;
        // }
    }
    get(source: any): TraceableItem | undefined {
        return this.values.get(source);
    }
    getSortedItems(): TraceableItem[] {
        const array = Array.from(this.values.values());
        array.sort(TraceableItem.compareByRefCount);
        return array;
    }
    dump(offset = 0): T[] {
        const array = this.getSortedItems();
        for (let i = 0; i < array.length; i++) {
            array[i].movedTo(offset + i);
        }
        return array.map((x) => x.result);
    }
}

export interface IRefsBuilder {
    // 如果返回 NaN 则说明属性会被延迟赋值，无需保存在对象上
    addRef (owner: Node, key: string | number, target: Node): number;
}

// class RootedTraceableDict<T> extends TraceableDict<T> {
//     private root: any;
//
//     setRoot (source: any) {
//         this.root = source;
//     }
//     dump (): (T|number)[] {
//         let array = super.getSortedItems();
//         for (let i = 0; i < array.length; i++) {
//             array[i].movedTo(i);
//         }
//         let res = array.map(x => x.result);
//
//         let rootItem = this.get(this.root);
//         if (!rootItem) {
//             throw new Error('Failed to serialize, root item is not defined.');
//         }
//         let rootIndex = array.indexOf(rootItem);
//
//         res.push(rootIndex);
//         return res;
//     }
// }

type DynamicType = DataTypeID.Array | DataTypeID.Dict | DataTypeID.Class | DataTypeID.CustomizedClass;
type DerivedType = DataTypeID.InstanceRef | // 被多个对象复用时
    DataTypeID.SimpleType | // 可以完美被 json 序列化时
    DataTypeID.Array_AssetRefByInnerObj | DataTypeID.Array_Class | DataTypeID.Array_InstanceRef;
type StaticType = DataTypeID.SimpleType | DataTypeID.ValueType | DataTypeID.ValueTypeCreated | DataTypeID.TRS | DataTypeID.AssetRefByInnerObj;

// 保存场景对象结构，此 Node 非 cc.Node，而是用来表示关系对象关系图中的节点。这些节点会组织成有向有环图。
export class Node {
    // 自身序列化时需要用的实际类型
    selfType: DynamicType | DerivedType;
    // 此对象被引用的次数，决定了是否必须放到 instances，以及后续的优化权重
    refCount = 0;
    // 当前节点是否在 instances 中
    indexed = false;
    // 当前节点只能放在 instances 中
    shouldBeIndexed = false;

    // 当前节点在 instances 中的索引，如果当前节点不在 instances 中则返回持有当前节点的祖先节点的索引
    private _index = -1;
    get instanceIndex(): number {
        return this._index;
    }
    set instanceIndex(val: number) {
        if (this.indexed) {
            throw new Error('Should not change instanceIndex on indexed object');
        }
        this._index = val;
    }

    // 被其它对象引用时的类型
    get refType(): DynamicType | DerivedType {
        return this.indexed ? DataTypeID.InstanceRef : this.selfType;
    }

    public static compareByRefCount(lhs: Node, rhs: Node): number {
        return rhs.refCount - lhs.refCount;
    }

    constructor(dataTypeID: DynamicType) {
        this.selfType = dataTypeID;
    }
    setStatic<T extends StaticType>(key: string|number, dataTypeID: T, data: DataTypes[T]) {
    }
    setDynamic(target: Node, key?: string|number) {
        ++target.refCount;
    }

    static readonly AssetPlaceholderType = DataTypeID.SimpleType;
    static readonly AssetPlaceholderValue = null;
    setAssetRefPlaceholderOnIndexed(key: string|number) {
        // 设置会被延迟初始化的资源默认值
        // 只有不为 AssetRefByInnerObj / Array_AssetRefByInnerObj 的属性才要多设置这个 placeholder
        // 实际上只有数组需要提前初始化，因为如果赋值顺序不递增，会产生空洞，导致数组退化为字典，影响性能
        // 类对象在构造函数已经预分配了，不需要在反序列化重新分配
        // 字典对象不常用就不纠结了
    }

    dumpRecursively(refsBuilder: IRefsBuilder): (IClassObjectData|OtherObjectData) {
        // 递归调用所有除了 DataTypeID.InstanceRef 类型的关联节点的 dumpRecursively。
        // 由于所有可能产生循环引用的节点，都提前转换成了 DataTypeID.InstanceRef 类型，
        // 所以这里直接递归就行，不会死循环。
    }
}

export class ArrayNode extends Node {
    types: (DataTypeID | undefined)[];
    datas: (AnyData | Node)[];

    static DeriveTypes = [
        [DataTypeID.SimpleType, DataTypeID.SimpleType],
        [DataTypeID.Class, DataTypeID.Array_Class],
        [DataTypeID.AssetRefByInnerObj, DataTypeID.Array_AssetRefByInnerObj],
        [DataTypeID.InstanceRef, DataTypeID.Array_InstanceRef],
    ];

    constructor(length: number) {
        super(DataTypeID.Array);
        this.types = new Array(length);
        this.datas = new Array(length);
    }
    setStatic(key: number, dataTypeID: StaticType, data: AnyData) {
        this.types[key] = dataTypeID;
        this.datas[key] = data;
    }
    setDynamic(target: Node, key: number) {
        super.setDynamic(target);
        this.types[key] = undefined;
        this.datas[key] = target;
    }
    setAssetRefPlaceholderOnIndexed(key: number) {
        this.types[key] = Node.AssetPlaceholderType;
        this.datas[key] = Node.AssetPlaceholderValue;
    }
    dumpRecursively(refsBuilder: IRefsBuilder) {
        // 递归依赖节点
        for (let i = 0; i < this.datas.length; ++i) {
            const target = this.datas[i];
            if (target instanceof Node) {
                if (target.indexed) {
                    const refData = refsBuilder.addRef(this, i, target);
                    if (isFinite(refData)) {
                        this.types[i] = DataTypeID.InstanceRef;
                        this.datas[i] = refData;
                    }
                    else {
                        // 先赋值为 null，反序列化后会被 refs 延迟赋值为目标节点
                        // TODO - 这样可能会导致无法特化为 Array_InstanceRef
                        this.types[i] = DataTypeID.SimpleType;
                        this.datas[i] = null;
                    }
                }
                else {
                    target.instanceIndex = this.instanceIndex;
                    const data = target.dumpRecursively(refsBuilder);
                    this.types[i] = target.refType;
                    this.datas[i] = data;
                }
            }
        }
        // 特化数组
        for (let i = 0; i < ArrayNode.DeriveTypes.length; ++i) {
            const [elementType, arrayType] = ArrayNode.DeriveTypes[i];
            if (this.types.every((x) => x === elementType)) {
                this.selfType = arrayType as any;
                return this.datas;
            }
        }
        // 混合数组
        this.selfType = DataTypeID.Array;
        return [this.datas, ...this.types] as IArrayData;
    }
}

export class DictNode extends Node {
    data: IDictData = [null] as any;
    json: Record<string, DataTypes[DataTypeID.SimpleType]> = Object.create(null);
    dynamics: Record<string, Node> = Object.create(null);

    constructor() {
        super(DataTypeID.Dict);
        this.data[DICT_JSON_LAYOUT] = this.json;
    }
    setStatic(key: string, dataTypeID: StaticType, value: AnyData) {
        if (dataTypeID === DataTypeID.SimpleType) {
            this.json[key] = value;
        }
        else {
            this.data.push(key, dataTypeID, value);
        }
    }
    setDynamic(target: Node, key: string) {
        super.setDynamic(target);
        this.dynamics[key] = target;
    }
    dumpRecursively(refsBuilder: IRefsBuilder): IDictData | object {
        for (const key in this.dynamics) {
            const target = this.dynamics[key];
            if (target.indexed) {
                const refData = refsBuilder.addRef(this, key, target);
                if (isFinite(refData)) {
                    this.data.push(key, DataTypeID.InstanceRef, refData);
                }
            }
            else {
                // 由于所有可能产生循环引用的节点，都提前转换成了 DataTypeID.InstanceRef 类型，
                // 所以这里直接递归就行，不会死循环
                target.instanceIndex = this.instanceIndex;
                const data = target.dumpRecursively(refsBuilder);
                if (target.refType === DataTypeID.SimpleType) {
                    this.json[key] = data;
                }
                else {
                    this.data.push(key, target.refType, data);
                }
            }
        }
        const isSimple = this.data.length === 1;
        if (isSimple) {
            this.selfType = DataTypeID.SimpleType;
            return this.json;
        }
        else {
            return this.data;
        }
    }
}

export class ClassNode extends Node {
    ctor: string;
    simpleKeys = new Array<string>();
    private simpleValues: AnyData[] | null = [];
    advanceds = new Array<string|(DataTypeID|undefined)|(AnyData|Node)>();
    // dump 后的结果。dump 后 simpleValues 会被清空，advanceds 中的数据部分也会被删除
    dumped: IClassObjectData|undefined;

    // 从数据直接反向生成一个已经调用过 dumpRecursively 的对象
    static fromData(clazz: IClass, mask: IMask, data: IClassObjectData): ClassNode {
        const ctor = clazz[CLASS_TYPE] as string;
        const res = new ClassNode(ctor);
        res.dumped = data;
        res.simpleValues = null;

        const keys = clazz[CLASS_KEYS] as string[];
        const classTypeOffset = clazz[CLASS_PROP_TYPE_OFFSET] as number;
        const maskTypeOffset = mask[mask.length - 1];

        let i = MASK_CLASS + 1;
        for (; i < maskTypeOffset; ++i) {
            const key = keys[mask[i]];
            res.simpleKeys.push(key);
        }

        for (let i = maskTypeOffset; i < data.length; ++i) {
            const key = keys[mask[i]];
            const type = clazz[mask[i] + classTypeOffset] as DataTypeID;
            res.advanceds.push(key, type);
        }

        return res;
    }

    constructor(ctor: string) {
        super (DataTypeID.Class);
        this.ctor = ctor;
    }
    setStatic(key: string, dataTypeID: StaticType, value: AnyData) {
        if (dataTypeID === DataTypeID.SimpleType) {
            this.simpleKeys.push(key);
            // @ts-ignore
            this.simpleValues.push(value);
        }
        else {
            this.advanceds.push(key, dataTypeID, value);
        }
        // this.metas.push(key, dataTypeID);
        // this.datas.push(value);
    }
    setDynamic(target: Node, key: string) {
        super.setDynamic(target);
        this.advanceds.push(key, undefined, target);
    }
    dumpRecursively(refsBuilder: IRefsBuilder): IClassObjectData {
        const advanceds = this.advanceds;
        const TYPE_OFFSET = 1;
        const VALUE_OFFSET = 2;
        // dump children
        for (let i = advanceds.length - 3; i >= 0; i -= 3) {
            // let key = this.metas[m];
            // let type = this.metas[m + 1];
            const target = advanceds[i + VALUE_OFFSET];
            if (target instanceof Node) {
                if (target.indexed) {
                    const refData = refsBuilder.addRef(this, advanceds[i] as string, target);
                    if (isFinite(refData)) {
                        advanceds[i + TYPE_OFFSET] = DataTypeID.InstanceRef;
                        advanceds[i + VALUE_OFFSET] = refData;
                    }
                    else {
                        // Remove key-type-value tuple from advanceds
                        advanceds.splice(i, 3);
                    }
                }
                else {
                    target.instanceIndex = this.instanceIndex;
                    const dumped = target.dumpRecursively(refsBuilder);
                    if (target.refType === DataTypeID.SimpleType) {
                        this.simpleKeys.push(advanceds[i] as string);
                        // @ts-ignore
                        this.simpleValues.push(dumped);
                        // Remove key-type-value tuple from advanceds
                        advanceds.splice(i, 3);
                    }
                    else {
                        advanceds[i + TYPE_OFFSET] = target.refType;
                        advanceds[i + VALUE_OFFSET] = dumped;
                    }
                }
            }
        }

        // dump values
        const mask = TraceableDict.PLACEHOLDER;
        // 缓存 dumped 对象，等对象都 dump 后再生成 mask 索引。
        this.dumped = ([mask] as IClassObjectData).concat(this.simpleValues) as IClassObjectData;
        for (let i = 0; i < advanceds.length; i += 3) {
            this.dumped.push(advanceds[i + VALUE_OFFSET] as AnyData);
        }

        this.simpleValues = null;
        this.advanceds = this.advanceds.filter((x, index) => index % 3 !== 2);

        return this.dumped;
    }
}

export class CustomClassNode extends Node {
    ctor: string;
    content: ICustomObjectDataContent;
    dumped: ICustomObjectData|undefined;

    // 从数据直接反向生成一个已经调用过 dumpRecursively 的对象
    static fromData(ctor: string, data: ICustomObjectData): CustomClassNode {
        const content = data[CUSTOM_OBJ_DATA_CONTENT];
        const res = new CustomClassNode(ctor, content);
        res.dumped = data;
        return res;
    }

    constructor(ctor: string, content: ICustomObjectDataContent) {
        super (DataTypeID.CustomizedClass);
        this.ctor = ctor;
        this.content = content;
    }
    setStatic(key: string, dataTypeID: StaticType, value: AnyData) {
        throw new Error('Should not set property of CustomClass');
    }
    setDynamic(target: Node, key: string) {
        throw new Error('Should not set property of CustomClass');
    }
    dumpRecursively(refsBuilder: IRefsBuilder): ICustomObjectData {
        const CLASS = TraceableDict.PLACEHOLDER;
        this.dumped = [CLASS, this.content];
        // 通过保存 dumped 对象，等对象都 dump 后再生成 mask 索引。
        return this.dumped;
    }
}
