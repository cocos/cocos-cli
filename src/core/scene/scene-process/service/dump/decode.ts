'use strcit';

declare const cc: any;

import { ccClassAttrPropertyDefaultValue, getDefault, getTypeInheritanceChain, getTypeName, parsingPath } from './utils';

import lodash from 'lodash';
const { get, set } = lodash;
import { DumpDefines } from './dump-defines';
import { assetManager, Component, editorExtrasTag, Node, Prefab, Vec3, MobilityMode, Quat, Animation, AnimationState } from 'cc';
import { promisify } from 'util';
import { INode, IProperty } from '../../../@types/public';
import { IComponent, IComponentInfo } from '../../../common'
import ComponentManager from '../component/index';
import {
    MissingScript,
} from 'cc';
const NodeMgr = EditorExtends.Node;

type TargetOverrideInfo = Prefab._utils.TargetOverrideInfo;
const TargetOverrideInfo = Prefab._utils.TargetOverrideInfo;
type TargetInfo = Prefab._utils.TargetInfo;
const TargetInfo = Prefab._utils.TargetInfo;
type PrefabInfo = Prefab._utils.PrefabInfo;
const PrefabInfo = Prefab._utils.PrefabInfo;


function addComponentAt(node: Node, comp: Component, index: number): boolean {
    if (!node || !comp || index < 0) {
        return false;
    }

    if (comp instanceof MissingScript && !comp._$erialized) {
        return false;
    }

    // @ts-ignore
    node._addComponentAt(comp, index);
    return true;
}

function decodeChildren(children: any[], node: any) {
    const dumpChildrenUuids: string[] = children.map((child: any) => child.value.uuid);
    const nodeChildrenUuids: string[] = node.children.map((child: INode) => child.uuid);

    /**
     * 出于性能考虑，不去移动两个数组共有的节点
     * 移除在 node 中且不在 dump 中的 uuid
     * 添加在 dump 中且不在 node 中的 uuid
     * 按照 dump 中的顺序重新排列
     */
    nodeChildrenUuids.forEach((uuid: string) => {
        // 删除不存在的节点
        if (!dumpChildrenUuids.includes(uuid)) {
            const child = NodeMgr.getNode(uuid);
            // 重要：过滤隐藏节点 或 无效节点
            if (!child || child.objFlags & cc.Object.Flags.HideInHierarchy) {
                return;
            }
            child.parent = null;
        }
    });

    dumpChildrenUuids.forEach((uuid: string, i: number) => {
        const child = NodeMgr.getNode(uuid);
        // 重要：过滤无效节点
        if (!child) {
            return;
        }

        // 重置对象状态位,后续应该提供还原的方法
        child.walk((node: Node) => {
            node._objFlags &= cc.Object.Flags.PersistentMask;
            node._objFlags &= (~cc.Object.Flags.Destroyed);
        });

        // 节点挂靠父级
        if (!nodeChildrenUuids.includes(uuid)) {
            child.parent = node;
        }

        // 按新的顺序排列
        child.setSiblingIndex(i);
    });
}

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

// 差异还原节点上的组件
async function decodeComponents(dumpComps: any, node: Node, excludeComps?: any) {
    if (!dumpComps) {
        // 容错处理
        return;
    }

    // 用于判断 prefabNode 下的 component 复用
    const prefabFileIdToDumpComp: { [key: string]: any } = {};
    const dumpCompsUuids = dumpComps
        .map((comp: any) => {
            if (comp.value.uuid) {
                if (comp.value.__prefab && comp.value.__prefab.value && comp.value.__prefab.value.fileId.value) {
                    prefabFileIdToDumpComp[comp.value.__prefab.value.fileId.value] = comp;
                }

                return comp.value.uuid.value;
            }
            return '';
        })
        .filter(Boolean);

    const componentsUuids = node.components
        .map((component: any) => {
            if (excludeComps) {
                // 需要 exclude 的 component，假装不在 node 上
                const compType = getTypeName(component.constructor);
                if (excludeComps.includes(compType)) {
                    return '';
                }
            }

            // 将 dumpComp 转为现有相同 fileId component 的配置，后面执行值覆盖
            if (component.__prefab && component.__prefab.fileId) {
                const dumpComp = prefabFileIdToDumpComp[component.__prefab.fileId];
                if (dumpComp) {
                    const existIndex = dumpCompsUuids.indexOf(dumpComp.value.uuid.value);
                    if (existIndex !== -1) {
                        dumpCompsUuids.splice(existIndex, 1, component.uuid);
                        dumpComp.value.uuid.value = component.uuid;
                    }
                }
            }

            return component.uuid;
        })
        .filter(Boolean);

    /**
     * 删除现有在 node._compoennts 中但不在 dumpComps 中的 component
     * 2次方: 次数限制的作用：
     * 既能再次删除被依赖而不能被先删除的组件，
     * 又能避免死循环
     */
    let maxLoopTimes = componentsUuids.length ** 2;
    let i = componentsUuids.length - 1;

    do {
        const compUuid = componentsUuids[i];

        if (compUuid && !dumpCompsUuids.includes(compUuid)) {
            // 删除失败会返回 false, 可能是组件被依赖，会下次再删
            if (ComponentManager.removeComponent(compUuid)) {
                componentsUuids.splice(i, 1);
            } else {
                i--;
            }
        } else {
            i--;
        }

        maxLoopTimes--;
    } while (componentsUuids.length !== 0 && maxLoopTimes);

    // 重要：当前帧执行删除，保障下面的排序逻辑和上面的删除处于同一帧
    cc.Object._deferredDestroy();

    // 挂载上新的组件及调整组件的位置
    const components = node.components.slice(); // 下一步会清空，先缓存一份，以用于比较
    node['_components'].length = 0; // 先清空节点上的组件

    for (let i = 0; i < dumpComps.length; i++) {
        const dumpComp: IComponentInfo = dumpComps[i];

        if (!dumpComp.properties || !dumpComp.properties.value.uuid) {
            continue;
        }

        let component = components[i];

        const compUuid = (dumpComp.properties.value.uuid as IProperty).value as string;
        let cacheComp = ComponentManager.query(compUuid);

        if (cacheComp) {
            // 有缓存
            if (component !== cacheComp) {
                /**
                 * 新增场景：组件是从别的节点移过来的，
                 * 例如 prefab 从资源还原时，会先实例化一个临时节点，里面的组件会被移植过来
                 */
                if (cacheComp.node !== node) {
                    _removeDependComponent(cacheComp);
                }

                // 组件已被删除
                if (cacheComp.objFlags & cc.Object.Flags.Destroying || cacheComp.objFlags & cc.Object.Flags.Destroyed) {
                    // 57349 , 5 不会等于 128
                    // 重置 component.objFlags 的状态是为了重新走组件的生命周期
                    cacheComp.objFlags &= cc.Object.Flags.PersistentMask;
                    cacheComp.objFlags &= ~cc.Object.Flags.Destroyed;

                    // 回收站的缓存机制是编辑器的，这里需要将组件从回收站还原
                    // cce.Component.recycle(compUuid);
                }
                component = cacheComp;
            }
            addComponentAt(node, component, i); // 插入新位置
        }


        // 对于原先还在的组件，还原内部的值
        for (const key in dumpComp.properties.value) {
            await decodePatch(key, dumpComp.properties.value[key], component);
        }

        // 还原mountedRoot
        //decodeMountedRoot(component, dumpComp.mountedRoot);

        // TODO: 不知道为啥这个方法是个protected的,应该改成public的
        // @ts-ignore 
        component && component.onRestore && component.onRestore();
    }

    // 按依赖关系的顺序删除组件
    function _removeDependComponent(component: any) {
        // 组件已被删除
        if (component.objFlags & cc.Object.Flags.Destroying || component.objFlags & cc.Object.Flags.Destroyed) {
            // 57349 , 5 不会等于 128
            return;
        }

        // 关系是 dependComponent 依赖 component
        const dependComponent = component.node._getDependComponent(component);
        dependComponent.forEach((dep: any) => {
            _removeDependComponent(dep);
        });

        /**
         * 需要立即执行 cc.Object._deferredDestroy() 动作
         */
        NodeMgr.remove(component.uuid);
        cc.Object._deferredDestroy();
    }
}

/**
 * 解码一个 dump 数据
 * @param dump
 * @param node
 */
export async function decodeNode(dump: INode, node?: Node, excludeComps?: any) {
    if (!dump) {
        return null;
    }

    node = node || new cc.Node();

    if (!node) {
        return null;
    }

    node.name = dump.name.value as string;
    node.active = dump.active.value as boolean;
    node.layer = dump.layer.value as number;
    node.mobility = dump.mobility.value as number;
    node.setPosition(dump.position.value as Vec3);
    const quat = new Quat();
    const vec3 = dump.rotation.value as Vec3;
    Quat.fromEuler(quat, vec3.x, vec3.y, vec3.z);
    node.setRotation(quat);
    node.setScale(dump.scale.value as Vec3);

    //decodeMountedRoot(node, dump.mountedRoot);

    if (dump.parent && dump.parent.value && dump.parent.value.uuid) {
        node.parent = NodeMgr.getNode(dump.parent.value.uuid);
    } else {
        node.parent = null;
    }

    dump.children && decodeChildren(dump.children, node);

    await decodeComponents(dump.__comps__, node, excludeComps);

    return node;
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
        return;
    }

    if (data instanceof Component && forbidUserChanges.includes(info.key)) {
        return;
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
            return;
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

                await decodePatch(`${i}`, dump.value[i], arrayValue);
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
    decodeNode,
    decodePatch,
    resetProperty,
    updatePropertyFromNull,
    decodeMountedRoot,
};
