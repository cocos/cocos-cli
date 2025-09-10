import {
    deserialize,
} from 'cc';

// import deserializer types
import D = deserialize.Internal;
type AnyData = D.AnyData_;
import DataTypeID = D.DataTypeID_;
type IArrayData = D.IArrayData_;
type IClass = D.IClass_;
type IClassObjectData = D.IClassObjectData_;
type ICustomObjectData = D.ICustomObjectData_;
type IDictData = D.IDictData_;
import File = D.File_;
type IFileData = D.IFileData_;
type IMask = D.IMask_;
type IPackedFileData = D.IPackedFileData_;
import Refs = D.Refs_;
type IRefs = D.IRefs_;
type OtherObjectTypeID = D.OtherObjectTypeID_;
type SharedString = D.SharedString_;
type StringIndex = D.StringIndex_;
type StringIndexBnotNumber = D.StringIndexBnotNumber_;

import { ClassNode, CustomClassNode, TraceableDict } from './types';
import { FORMAT_VERSION, reduceEmptyArray } from './builder';
import dumpClasses from './create-class-mask';

const {
    EMPTY_PLACEHOLDER,
    CUSTOM_OBJ_DATA_CLASS,
    ARRAY_ITEM_VALUES,
    CLASS_PROP_TYPE_OFFSET,
    MASK_CLASS,
    OBJ_DATA_MASK,
    DICT_JSON_LAYOUT,
    PACKED_SECTIONS,
} = deserialize._macros;

type ParseFunction<T> = (data: IFileData, value: T, classNodes: (ClassNode|CustomClassNode)[]) => void;

function genArrayParser<T>(parser: ParseFunction<T>): ParseFunction<T[]> {
    return (data: IFileData, value: any[], classNodes: (ClassNode | CustomClassNode)[]) => {
        for (let i = 0; i < value.length; ++i) {
            parser(data, value[i], classNodes);
        }
    };
}

function parseArray(data: IFileData, value: IArrayData, classNodes: (ClassNode|CustomClassNode)[]) {
    const array = value[ARRAY_ITEM_VALUES] as any[];
    for (let i = 0; i < array.length; ++i) {
        const type = value[i + 1] as DataTypeID;
        const op = PARSERS[type];
        if (op) {
            op(data, array[i], classNodes);
        }
    }
}

function parseDict(data: IFileData, value: IDictData, classNodes: (ClassNode|CustomClassNode)[]) {
    for (let i = DICT_JSON_LAYOUT + 1; i < value.length; i += 3) {
        const type = value[i + 1] as DataTypeID;
        const op = PARSERS[type];
        if (op) {
            const subValue = value[i + 2] as AnyData;
            op(data, subValue, classNodes);
        }
    }
}

function parseClass(data: IFileData, value: IClassObjectData, classNodes: (ClassNode|CustomClassNode)[]) {
    const mask = (data[File.SharedMasks] as IMask[])[value[OBJ_DATA_MASK] as number];
    const clazz = data[File.SharedClasses][mask[MASK_CLASS]] as IClass;
    const node = ClassNode.fromData(clazz, mask, value);
    classNodes.push(node);

    const classTypeOffset = clazz[CLASS_PROP_TYPE_OFFSET] as number;
    const maskTypeOffset = mask[mask.length - 1];

    // parse advanced type
    for (let i = maskTypeOffset; i < value.length; ++i) {
        const type = clazz[mask[i] + classTypeOffset] as DataTypeID;
        const op = PARSERS[type];
        if (op) {
            op(data, value[i], classNodes);
        }
    }
}

function parseCustomClass(data: IFileData, value: ICustomObjectData, classNodes: (ClassNode|CustomClassNode)[]) {
    const ctor = data[File.SharedClasses][value[CUSTOM_OBJ_DATA_CLASS]] as string;
    const node = CustomClassNode.fromData(ctor, value);
    classNodes.push(node);
}

const PARSERS = new Array<ParseFunction<any> | null>(DataTypeID.ARRAY_LENGTH);
PARSERS.fill(null);
PARSERS[DataTypeID.Class] = parseClass;
PARSERS[DataTypeID.CustomizedClass] = parseCustomClass;
PARSERS[DataTypeID.Array] = parseArray;
PARSERS[DataTypeID.Array_Class] = genArrayParser(parseClass);
PARSERS[DataTypeID.Dict] = parseDict;

function parseInstances(data: IFileData, classNodes: (ClassNode|CustomClassNode)[]) {
    const sharedClasses = data[File.SharedClasses];
    const instances = data[File.Instances];
    const instanceTypes = data[File.InstanceTypes];

    const instanceTypesLen = instanceTypes === EMPTY_PLACEHOLDER ? 0 : (instanceTypes as any[]).length;
    const rootInfo = instances[instances.length - 1];
    let normalObjectCount = instances.length - instanceTypesLen;
    if (typeof rootInfo === 'number') {
        --normalObjectCount;
    }

    let insIndex = 0;
    for (; insIndex < normalObjectCount; ++insIndex) {
        const eachData = instances[insIndex] as IClassObjectData;
        parseClass(data, eachData, classNodes);
    }

    if (instanceTypes) {
        for (let typeIndex = 0; typeIndex < instanceTypesLen; ++typeIndex, ++insIndex) {
            let type = instanceTypes[typeIndex] as OtherObjectTypeID;
            const eachData = instances[insIndex];
            if (type >= 0) {
                // class index for DataTypeID.CustomizedClass
                const classId = sharedClasses[type] as string;
                const node = CustomClassNode.fromData(classId, [type, eachData]);
                node.instanceIndex = insIndex;
                classNodes.push(node);

                // @ts-ignore: 用于将类型更新到对应的 InstanceTypes
                instanceTypes[typeIndex] = node;
            }
            else {
                // Other
                type = ~type;
                const op = PARSERS[type];
                if (op) {
                    // @ts-ignore
                    op(data, eachData, classNodes);
                }
            }
        }
    }
}

function parseJSON(data: IFileData,
    packedUuids: TraceableDict<SharedString>, packedStrings: TraceableDict<SharedString>,
    classNodes: (ClassNode|CustomClassNode)[]
) {
    const sharedUuids = data[File.SharedUuids];
    const sharedStrings = data[File.SharedStrings];

    // merge uuids

    const uuidIndices = data[File.DependUuidIndices];
    for (let j = 0; j < uuidIndices.length; ++j) {
        const uuid = (sharedUuids as SharedString[])[uuidIndices[j] as StringIndex];
        packedUuids.traceString(uuid, uuidIndices, j);
    }

    // merge strings

    if (data[File.Refs]) {
        const refs = data[File.Refs] as IRefs;
        const dataLength = refs.length - 1;
        for (let i = 0; i < dataLength; i += Refs.EACH_RECORD_LENGTH) {
            const key = refs[i + Refs.KEY_OFFSET] as StringIndexBnotNumber;
            if (key >= 0) {
                const str = (sharedStrings as SharedString[])[key];
                packedStrings.traceString(str, refs, i + Refs.KEY_OFFSET);
            }
        }
    }
    const dependKeys = data[File.DependKeys];
    for (let i = 0; i < dependKeys.length; ++i) {
        const key = dependKeys[i] as number;
        if (key >= 0) {
            const str = (sharedStrings as SharedString[])[key];
            packedStrings.traceString(str, dependKeys, i);
        }
    }

    // merge classes/masks

    parseInstances(data, classNodes);
}

// 此函数会修改传入的 datas
export default function packJSONs(datas: IFileData[]): IPackedFileData {
    const packedUuids = new TraceableDict<SharedString>();
    const packedStrings = new TraceableDict<SharedString>();
    const classNodes = new Array<ClassNode|CustomClassNode>();

    // 重建所有 dump 后的 ClassNode/CustomClassNode
    for (let i = 0; i < datas.length; ++i) {
        parseJSON(datas[i], packedUuids, packedStrings, classNodes);
    }

    // 重新生成所有 class/mask
    const { sharedClasses: packedClasses, sharedMasks: packedMasks } = dumpClasses(classNodes);

    for (let i = 0; i < datas.length; ++i) {
        const data = datas[i];
        // 更新 InstanceTypes 类型的信息
        const instanceTypes = data[File.InstanceTypes];
        if (instanceTypes) {
            for (let i = 0; i < instanceTypes.length; ++i) {
                const type = instanceTypes[i] as any;
                if (type instanceof CustomClassNode) {
                    instanceTypes[i] = (type.dumped as ICustomObjectData)[CUSTOM_OBJ_DATA_CLASS];
                }
            }
        }
        // 抹去原有的共享信息
        data.splice(0, 5);
    }

    // @ts-ignore
    const res: IPackedFileData = new Array<any>(PACKED_SECTIONS + 1);
    res[File.Version] = FORMAT_VERSION;
    res[File.SharedUuids] = reduceEmptyArray(packedUuids.dump());
    res[File.SharedStrings] = reduceEmptyArray(packedStrings.dump());
    res[File.SharedClasses] = packedClasses;
    res[File.SharedMasks] = reduceEmptyArray(packedMasks);
    // @ts-ignore
    res[PACKED_SECTIONS] = datas;

    return res;
}
