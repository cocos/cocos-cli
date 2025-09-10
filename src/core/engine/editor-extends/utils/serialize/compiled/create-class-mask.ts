import {
    deserialize,
} from 'cc';

// import deserializer types
import D = deserialize.Internal;
import DataTypeID = D.DataTypeID_;
type IClass = D.IClass_;
type IClassObjectData = D.IClassObjectData_;
type IMask = D.IMask_;

import { ClassNode, CustomClassNode, TraceableDict, TraceableItem } from './types';

const {
    CLASS_PROP_TYPE_OFFSET,
    MASK_CLASS,
    OBJ_DATA_MASK,
    CUSTOM_OBJ_DATA_CLASS,
} = deserialize._macros;

// 同一个构造函数，生成的类型可能有多个，每个类型叫作一个 Type。
class Type {
    properties = new Map<string, DataTypeID>();
    nodes = new Array<ClassNode>();

    constructor(node: ClassNode) {
        this.setNodeProperties(node);
        this.nodes.push(node);
    }

    private setNodeProperties(node: ClassNode) {
        const properties = this.properties;
        for (const simpleKey of node.simpleKeys) {
            properties.set(simpleKey, DataTypeID.SimpleType);
        }
        for (let i = 0; i < node.advanceds.length; i += 2) {
            const key = node.advanceds[i] as string;
            properties.set(key, node.advanceds[i + 1] as DataTypeID);
        }
    }

    addNode(node: ClassNode): boolean {
        const properties = this.properties;
        let lackProperty = false;
        for (const simpleKey of node.simpleKeys) {
            if (properties.has(simpleKey)) {
                if (properties.get(simpleKey) !== DataTypeID.SimpleType) {
                    // 当前类的某个属性类型和目标对象的不同
                    return false;
                }
            }
            else {
                lackProperty = true;
            }
        }
        for (let i = 0; i < node.advanceds.length; i += 2) {
            const key = node.advanceds[i] as string;
            if (properties.has(key)) {
                if (properties.get(key) !== node.advanceds[i + 1]) {
                    // 当前类的某个属性类型和目标对象的不同
                    return false;
                }
            }
            else {
                lackProperty = true;
            }
        }

        if (lackProperty) {
            // 当前类的属性和类型是目标对象的子集
            this.setNodeProperties(node);
            this.nodes.push(node);
            return true;
        }
        else {
            // 当前类包含了目标对象的所有属性及类型
            this.nodes.push(node);
            return true;
        }
    }

    static shouldUseSameMask(this: ClassNode, rhs: ClassNode): boolean {
        const lhs = this;

        const ls = lhs.simpleKeys;
        const rs = rhs.simpleKeys;
        const la = lhs.advanceds;
        const ra = rhs.advanceds;

        if (ls.length !== rs.length || la.length !== ra.length) {
            return false;
        }
        for (let i = 0; i < ls.length; ++i) {
            if (ls[i] !== rs[i]) {
                return false;
            }
        }
        for (let i = 0; i < la.length; i += 2) {
            if (la[i] !== ra[i]) {
                return false;
            }
        }
        return true;
    }

    dump(classId: string, sharedClasses: TraceableDict<IClass|string>, sharedMasks: TraceableDict<IMask>) {
        // 缓存待生成的属性列表
        const simples = new TraceableDict<string>();
        const advanceds = new TraceableDict<string>();

        // 缓存待生成的 mask 数据，由于每个 mask 都有与其完全匹配的对象结构，因此直接使用对象本身做为缓存就行
        const maskNodes = new Array<ClassNode>();

        // dump mask
        for (let i = 0; i < this.nodes.length; ++i) {
            const node = this.nodes[i];
            const maskNode = maskNodes.find(Type.shouldUseSameMask, node);
            if (maskNode) {
                sharedMasks.trace(maskNode, node.dumped as IClassObjectData, OBJ_DATA_MASK);
            }
            else {
                // new mask
                const maskData = [TraceableDict.PLACEHOLDER] as IMask;
                for (let i = 0; i < node.simpleKeys.length; ++i) {
                    const key = node.simpleKeys[i];
                    simples.traceString(key, maskData, maskData.length);
                    maskData.push(TraceableDict.PLACEHOLDER);
                }
                const offset = maskData.length;
                for (let i = 0; i < node.advanceds.length; i += 2) {
                    const key = node.advanceds[i] as string;
                    advanceds.traceString(key, maskData, maskData.length);
                    maskData.push(TraceableDict.PLACEHOLDER);
                }
                maskData.push(offset);
                sharedClasses.trace(this, maskData, MASK_CLASS);
                // register mask
                const item = sharedMasks.trace(node, node.dumped as IClassObjectData, OBJ_DATA_MASK);
                item.result = maskData;
                maskNodes.push(node);
            }
        }

        // dump class

        const simpleKeys = simples.dump();
        const advancedKeys = advanceds.dump(simpleKeys.length);
        const keys = simpleKeys.concat(advancedKeys);

        const offset = CLASS_PROP_TYPE_OFFSET + 1 - simpleKeys.length;
        const dataTypes = advancedKeys.map((x) => this.properties.get(x));
        const classData = [classId, keys, offset, ...dataTypes] as IClass;

        (sharedClasses.get(this) as TraceableItem).result = classData;
    }
}

function registerType(types: Type[], node: ClassNode) {
    for (const type of types) {
        if (type.addNode(node)) {
            return;
        }
    }
    const type = new Type(node);
    types.push(type);
}

export default function(classNodes: (ClassNode|CustomClassNode)[]): {
    sharedClasses: (IClass|string)[],
    sharedMasks: IMask[],
} {
    const sharedClasses = new TraceableDict<IClass|string>();
    const sharedMasks = new TraceableDict<IMask>();
    const ctors = new Map<string, Type[]>();

    // generate types
    for (let i = 0; i < classNodes.length; ++i) {
        const node = classNodes[i];
        const classId = node.ctor;
        if (node instanceof CustomClassNode) {
            sharedClasses.traceString(classId, node.dumped as object, CUSTOM_OBJ_DATA_CLASS);
            continue;
        }

        let types = ctors.get(classId);
        if (!types) {
            types = [];
            ctors.set(classId, types);
        }
        registerType(types, node);
    }

    // generate class/mask
    for (const [classId, types] of ctors) {
        // let types = ctors.get(classId) as Type[];
        for (const type of types) {
            type.dump(classId, sharedClasses, sharedMasks);
        }
    }

    return {
        sharedClasses: sharedClasses.dump(),
        sharedMasks: sharedMasks.dump(),
    };
}
