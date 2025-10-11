import { CCClass, Node, SceneAsset, Prefab, Asset, CCObject, js } from 'cc';

const DELIMETER = cc.Class.Attr.DELIMETER;
const debugInfo: string[] = [];
const nodeExcludeProps = [
    '_parent',
    '_children',
    '_prefab',
    '_components',
];

const checkedObjectSet = new Set();

function checkComponents(node: Node, prefix = '') {
    const components = node.components;
    if (!Array.isArray(components)) {
        debugInfo.push(`${node.getPathInHierarchy()}'s components is not array`);
        return;
    }
    for (let i = components.length - 1; i >= 0; i--) {
        const comp = components[i];
        if (comp) {
            if (comp.node !== node) {
                comp.node = node;
                debugInfo.push();
            }
            if (checkedObjectSet.has(comp)) return;
            checkedObjectSet.add(comp);
            checkSerializableProperties(comp, `${prefix}:${comp.name}`);
        } else {
            //comp中不能出现空值
            components.splice(i, 1);
        }
    }
}

const baseTypeMap: Map<any, Record<string, any>> = new Map();

function checkBaseType(obj: any, attrs: any[], prefix = ''){
    // color\vec\等基础值
    if (cc.js.isChildClassOf(obj.constructor, cc.ValueType)) {
        const map = getDefaultMap(obj.constructor);
        for (const key of attrs) {
            if (typeof obj[key] !== typeof map[key]) {
                debugInfo.push(`${prefix}|${key}'s value:${obj[key]} is illegal,attr:${map[key]}`);

            }
        }
        return true;
    }
    return false;
}

function getDefaultMap(ctor: any){
    let map = baseTypeMap.get(ctor);
    if (!map) {
        map = {};
        baseTypeMap.set(ctor, map);
        const realAttrs = ctor.__attrs__;
        ctor.__values__.forEach((key: string) => {
            const attrKey = `${key}${DELIMETER}default`;
            // @ts-ignore
            map[key] = realAttrs[attrKey];
        });
    }
    return map;
}

function checkSerializableProperties(obj: any, prefix = '', attrs?: any[]) {
    const ctor = obj.constructor;

    // 通用校验逻辑
    const serializeProps = attrs ?? ctor.__values__;

    const map = getDefaultMap(ctor);
        
    for (const key of serializeProps) {
        const curPropValue = obj[key];
        const valueType = typeof curPropValue;
        if (curPropValue && curPropValue.constructor && curPropValue.constructor.__values__) {  
            if (checkedObjectSet.has(curPropValue)) return;
            checkedObjectSet.add(curPropValue);
            checkSerializableProperties(curPropValue, `${prefix}.${key}`);
        } else {
            if (valueType === 'object') {
                Object.keys(curPropValue).forEach((key: string) => {
                    const value = curPropValue[key];
                    const ctor = value ? value.constructor : undefined;
                    if (ctor && ctor.__values__){
                        if (checkedObjectSet.has(value)) return;
                        checkedObjectSet.add(value);
                        
                        checkSerializableProperties(value, `${prefix}.${key}`);
                    }
                });
            } else {
                // 只校验普通类型
                const checkFailed = valueType !== typeof map[key];
                if (checkFailed) {
                    debugInfo.push(`${prefix}.${key}'s value:${obj[key]} is illegal,attr:${map[key]}`);
                    obj[key] = map[key];
                }
            }
        }
    }    
}

// 检查预制体信息的合法性
function checkPrefabInfo(root: Node) {
    const rootPrefab = root['_prefab'];
    if (rootPrefab) {
        // 嵌套预制体的prefabInstanceFileId不能一样;
        const instanceFileId: Record<string, boolean> = {};
        const nestedPrefabInstanceRoots = rootPrefab.nestedPrefabInstanceRoots;
        if (nestedPrefabInstanceRoots) {
            for (let i = nestedPrefabInstanceRoots.length - 1; i >= 0; i--) {
                const nestNode = nestedPrefabInstanceRoots[i];
                const prefab = nestNode['_prefab'];
                if (prefab?.instance) {
                    if (instanceFileId[prefab.instance.fileId]) {
                        debugInfo.push(`${nestNode.getPathInHierarchy()} prefabInstanceFileId is not unique`);
                        prefab.instance.fileId = EditorExtends.UuidUtils.uuid();
                    }
                    instanceFileId[prefab.instance.fileId] = true;
                }
            }
        }
    }
}

function checkNode(parent: Node, attrs?: any[], path = ''){
    const children = parent.children;
    if (!Array.isArray(children)) {
        debugInfo.push(`${path}/${parent.name} children is not an array`);
        return;
    }
    const prefix = `${path}/${parent.name}`;
    if (checkedObjectSet.has(parent)) return;
    checkedObjectSet.add(parent);

    // 完整的校验后续开放
    // checkSerializableProperties(parent, undefined, prefix, attrs);
    // checkComponents(parent, prefix);

    for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (child && !(child.objFlags & CCObject.Flags.HideInHierarchy)) {
            if (child.parent !== parent) {
                debugInfo.push(`${prefix}/${child.name} parent is illegal ${child.parent?.name}`);
                child.parent = parent;
            }
            checkNode(child, attrs, prefix);
        } else if (child === null || child === undefined) {
            // 移除children中的空节点
            children.splice(i, 1);
        }
    }
}

function checkScene(asset: Asset) {
    let root;
    if (asset instanceof SceneAsset) {
        root = asset.scene;
    } else if (asset instanceof Prefab) {
        root = asset.data;
    }

    if (root) {
        // @ts-ignore 
        const nodeCtorValues = root.constructor.__values__;
        const attrs = nodeCtorValues.slice().filter((attr: string) => !nodeExcludeProps.includes(attr));
        checkNode(root, attrs);
        checkPrefabInfo(root);
    }
}

export function serializeSafe(asset: Asset, options?: any){
    // const tag = `serializeSafe`;
    // console.profile(tag);

    // clear
    // debugInfo.length = 0;
    // checkedObjectSet.clear();
    // baseTypeMap.clear();
    // const time1 = performance.now();
    
    // checkScene(asset);

    // if (debugInfo.length > 0) {
    //     console.debug(`${asset.name}:${asset.uuid} serialize Error:\n` + debugInfo.join('\n'));
    // }
    // console.log(`checkedObjectSet size：${checkedObjectSet.size};baseTypeMap size ${baseTypeMap.size}`);
    // console.debug(`serializeSafe ${asset.name}`, performance.now() - time1);
    
    // console.profileEnd(tag);
    
    return cce.Utils.serialize(asset, options);
}

export function serialize(asset: any, options?: any) {
    return cce.Utils.serialize(asset, options);
}