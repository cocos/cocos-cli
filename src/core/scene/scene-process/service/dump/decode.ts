'use strict';

declare const cc: any;

import { ccClassAttrPropertyDefaultValue, getDefault, getTypeInheritanceChain, parsingPath } from './utils';

import lodash from 'lodash';
const { get, set } = lodash;
import { DumpDefines } from './dump-defines';
import { Component, editorExtrasTag, Node, Vec3, MobilityMode } from 'cc';
const NodeMgr = EditorExtends.Node;

// 还原mountedRoot
export function decodeMountedRoot(compOrNode: Node | Component, mountedRoot?: string) {
    if (!compOrNode) {
        return;
    }
    if (typeof mountedRoot === 'undefined') {
        return null;
    }
    const mountedRootNode = NodeMgr.getNode(mountedRoot);
    if (mountedRootNode) {
        if (!compOrNode[editorExtrasTag]) {
            compOrNode[editorExtrasTag] = {};
        }
        compOrNode[editorExtrasTag].mountedRoot = mountedRootNode;
    } else {
        if (compOrNode[editorExtrasTag]) {
            compOrNode[editorExtrasTag].mountedRoot = undefined;
        }
    }
}

async function _decodeByType(type: string, node: any, info: any, dump: any, opts?: any) {
    const dumpType = DumpDefines[type];

    if (dumpType) {
        await dumpType.decode(node, info, dump, opts);
        return true;
    }

    return false;
}
/**
 * 解码一个 dump 补丁到指定的 node 上
 * @param path
 * @param dump
 * @param node
 */
export async function decodePatch(path: string, dump: any, node: any) {
    // 将 dump path 转成实际的 node search path
    const info = parsingPath(path, node);
    const parentInfo = parsingPath(info.search, node);

    const forbidUserChanges = [
        editorExtrasTag,
        '__scriptAsset',
        'node',
        'uuid',
    ];

    // 获取需要修改的数据
    const data = info.search ? get(node, info.search) : node;

    if (!data) {
        throw new Error(`Failed to decodePatch: Target component not found. path=${path}, info=${JSON.stringify(info)}`);
    }

    if (data instanceof Component && forbidUserChanges.includes(info.key)) {
        throw new Error(`Failed to decodePatch: Property(${info.key}) modification not allowed`);
    }

    if (Object.prototype.toString.call(data) === '[object Object]') {
        // 只对 json 格式处理，array 等其他数据放行
        // 判断属性是否为 readonly,是则跳过还原步骤
        let propertyConfig: any = Object.getOwnPropertyDescriptor(data, info.key);
        if (propertyConfig === undefined) {
            // 原型链上的判断
            propertyConfig = cc.Class.attr(data, info.key);
            if (!propertyConfig || !propertyConfig.hasSetter) {
                // 如果是一个没有经过修饰器的数据，就会进这里
                // 经过 2020/08/25 引擎修饰情整理后，getter 都不会带修饰器，所以需要直接赋值
                // 例如 enabled
                // 如果 propertyConfig.hasGetter 为 true，说明是一个只读的 ccclass 属性
                if (info.key in data && (!propertyConfig || propertyConfig.hasGetter !== true)) {
                    data[info.key] = dump.value;
                }
                return;
            }
        } else if (!propertyConfig.writable && !propertyConfig.set) {
            throw new Error(`Failed to decodePatch: Property(${info.key}) is read-only or has no setter`);
        }
    }

    const parentData = parentInfo.search ? get(node, parentInfo.search) : node;

    // 如果 dump.value 为 null，则需要自动填充默认数据
    if (!('value' in dump) || dump.type === 'Unknown') {
        let attr = cc.Class.attr(data, info.key);
        if (Array.isArray(parentData) && parentInfo.search !== '_components') {
            const grandInfo = parsingPath(parentInfo.search, node);
            const grandData = grandInfo.search ? get(node, grandInfo.search) : node;
            attr = cc.Class.attr(grandData, grandInfo.key);
            attr = cc.Class.attr(attr.ctor, info.key);
        }

        const value = getDefaultAttrData(attr);
        data[info.key] = value;

        return value;
    }

    // 获取数据的类型
    const ccType = cc.js.getClassByName(dump.type);
    const ccExtends = ccType ? getTypeInheritanceChain(ccType) : [];
    const sceneType = 'cc.Scene';
    const nodeType = 'cc.Node';
    const componentType = 'cc.Component';
    const assetType = 'cc.Asset';
    const valueType = 'cc.ValueType';

    // 实际修改数据
    if (dump.isArray) {
        // 需要对数组内部填充准确的默认值，新值可能是一个 ccClass 类
        if (Array.isArray(dump.value)) {
            const arrayValue: any = [];

            const attr = cc.Class.attr(data.constructor, info.key);
            for (let i = 0; i < dump.value.length; i++) {
                /**
                 * 这个是历史遗留赋值一个初始值，可能没有需要，
                 * 观察一段时间
                 * 如果后续发现真的有一些场景需要请修改本条注释
                 */
                arrayValue[i] = ccClassAttrPropertyDefaultValue(attr);
                const dumpItem = {
                    type: dump.type,
                    value: dump.value[i]
                };
                await decodePatch(`${i}`, dumpItem, arrayValue);
            }

            data[info.key] = arrayValue;
        } else {
            data[info.key] = [];
        }
    } else {
        const opts: any = {};
        opts.ccType = ccType;
        // 特殊属性
        if (info.key in nodeSpecialPropertyDefaultValue) {
            setNodeSpecialProperty(node, info.key, dump.value);
        } else if (await _decodeByType(dump.type, data, info, dump, opts)) {
            // empty
        } else if (sceneType === dump.type) {
            _decodeByType(nodeType, data, info, dump, opts);
        } else if (ArrayBuffer.isView(dump.value)) {
            _decodeByType('TypedArray', data, info, dump, opts);
        } else if (ccExtends.includes(nodeType) || nodeType === dump.type) {
            _decodeByType(nodeType, data, info, dump, opts);
        } else if (ccExtends.includes(assetType) || assetType === dump.type) {
            await _decodeByType(assetType, data, info, dump, opts);
        } else if (ccExtends.includes(componentType) || componentType === dump.type) {
            _decodeByType(componentType, data, info, dump, opts);
        } else if (ccExtends.includes(valueType)) {
            _decodeByType(valueType, data, info, dump, opts);
        } else if (info.key === 'length' && dump.type === 'Array') {
            // 更改数组长度时造的数据
            while (data.length > dump.value) {
                data.pop();
            }
            const parentData = get(node, parentInfo.search);
            const attr = cc.Class.attr(parentData, parentInfo.key);
            for (let i = data.length; i < dump.value; i++) {
                data[i] = ccClassAttrPropertyDefaultValue(attr);
            }
            set(node, info.search, data);
        } else {
            if (ccType && !data[info.key] && dump.value !== null) {
                data[info.key] = new ccType();
                for (let i = 0; i < ccType.__props__.length; i++) {
                    const key = ccType.__props__[i];
                    const item = dump.value[key];
                    if (item) {
                        await decodePatch(`${path}.${key}`, item, node);
                    }
                }
            } else if (dump.value === null) {
                // 下一行的 typeof null === 'object' , 这行增加容错
                data[info.key] = dump.value;
            } else if (typeof dump.value === 'object') {
                for (const key in dump.value) {
                    if (dump.value[key] === undefined) {
                        continue;
                    }

                    await decodePatch(key, dump.value[key], data[info.key]);
                }
            } else {
                data[info.key] = dump.value;
            }
        }
    }

    info.search && set(node, info.search, data);
    if (parentInfo && parentInfo.search) {
        const data = get(node, parentInfo.search);
        // 对组件下的自定义类型进行还原时，可能存在没有setter的情况
        if (data instanceof Object && cc.Class.attr(data, info.key)?.hasSetter) {
            // eslint-disable-next-line no-self-assign
            data[parentInfo.key] = data[parentInfo.key];
        }
    }
}

type NodeSpecialProperty = {
    _lpos: () => Vec3;
    eulerAngles: () => Vec3;
    _lscale: () => Vec3;
    mobility: () => number;
};

// 节点特殊属性需要另外用 method 设置
const nodeSpecialPropertyDefaultValue: NodeSpecialProperty = {
    _lpos() {
        return new Vec3(0, 0, 0);
    },
    eulerAngles() {
        return new Vec3(0, 0, 0);
    },
    _lscale() {
        return new Vec3(1, 1, 1);
    },
    mobility() {
        return MobilityMode.Static;
    },
};

function setNodeSpecialProperty(node: any, key: string, value: any) {
    if (node instanceof cc.Node) {
        switch (key) {
            case '_lpos':
                node.position = value;
                break;
            case 'eulerAngles':
                node.eulerAngles = value;
                break;
            case '_lscale':
                node.scale = value;
                break;
            case 'mobility':
                node.mobility = value;
                break;
        }
    }
}

function getDefaultAttrData(attr: any) {
    let value = getDefault(attr);
    if (typeof value === 'object' && value) {
        if (typeof value.clone === 'function') {
            value = value.clone();
        } else if (Array.isArray(value)) {
            value = [];
        }
    }
    return value;
}

export function resetProperty(node: any, path: string) {
    // 将 dump path 转成实际的 node search path
    const info = parsingPath(path, node);
    // 获取需要修改的数据
    const data = info.search ? get(node, info.search) : node;

    if (!data) {
        return;
    }

    if (info.key in nodeSpecialPropertyDefaultValue) {
        const value = nodeSpecialPropertyDefaultValue[info.key as keyof NodeSpecialProperty]();
        setNodeSpecialProperty(data, info.key, value);
    } else {
        const attr = cc.Class.attr(data.constructor, info.key);
        data[info.key] = getDefaultAttrData(attr);
    }
}

// 将一个属性其现存值与定义类型值不匹配，或者为 null 默认值，改为一个可编辑的值
export function updatePropertyFromNull(node: any, path: string) {
    // 将 dump path 转成实际的 node search path
    const info = parsingPath(path, node);
    // 获取需要修改的数据
    const data = info.search ? get(node, info.search) : node;

    if (!data) {
        return;
    }

    const attr = cc.Class.attr(data.constructor, info.key);
    data[info.key] = getDefaultAttrData(attr);

    if ((data[info.key] === null || data[info.key] === undefined) && attr.ctor) {
        data[info.key] = new attr.ctor();
    }
}

export default {
    decodePatch,
    resetProperty,
    updatePropertyFromNull,
    decodeMountedRoot,
};
