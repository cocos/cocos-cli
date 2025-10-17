'use strict';

import { Node, Component } from 'cc';

declare const cc: any;

export function getDefault(attribute: any) {
    let result;
    if (typeof attribute.default === 'function') {
        result = attribute.default();
    } else {
        result = attribute.default;
    }
    return result;
}

export function getConstructor(object: any, attribute: any) {
    if (attribute && attribute.ctor) {
        return attribute.ctor;
    }

    if (object === null || object === undefined) {
        return null;
    }

    return object.constructor;
}

export function getType(ctor: any) {
    if (!ctor) {
        return 'Unknown';
    }
    return cc.js.getClassId(ctor) || ctor.name;
}

/**
 * 获取一个类的名字
 * @param ctor
 */
export function getTypeName(ctor: any) {
    const name = cc.js.getClassName(ctor);

    // if (name.startsWith('cc.')) {
    //     name = name.slice(3);
    // }
    return name || 'Unknown';
}

/**
 * 获取一个类的继承链数组
 * @param ctor
 */
export function getTypeInheritanceChain(ctor: any) {
    return cc.Class.getInheritanceChain(ctor)
        .map((itemCtor: any) => {
            return getTypeName(itemCtor);
        })
        .filter(Boolean);
}

export function parsingPath(path: string, data: any) {

    if (data instanceof Node) {
        path = path.replace(/^__comps__/, '_components');

        // path 如果是是 position.x || position.y 实际修改的应该是 node._lpos.x || node._lpos.y
        path = path.replace(/^position$/, '_lpos');
        // 如果修改的是 scale.x || scale.y 实际修改的应该是 node._scale.x || node._scale.y
        path = path.replace(/^scale$/, '_lscale');
        // 如果修改的是 rotation.x || rotation.y 实际修改的应该是 node.eulerAngle.x || node.eulerAngle.y
        path = path.replace(/^rotation$/, 'eulerAngles');
    }

    const keys = (path || '').split('.');
    const key = keys.pop() || '';

    return {
        search: keys.join('.'),
        key,
    };
}

function walkProps(obj: any, property: any, path: string): string|undefined {
    const props = obj?.constructor?.__props__;
    if (props) {
        for (const key of props) {
            if (obj[key] === property) {
                return `${path}.${key}`;
            } else if (obj[key]?.constructor?.__props__) {
                return walkProps(obj[key], property, `${path}.${key}`);// 递归找自定义类型
            }
        }
    }
}

// 这个路径如何获取都是个问题
// 将某个属性转化成对应的dump的路径，主要得解决自定义类型里的数据
export function generatePath(node: Node, comp: Component|null, property: string, value: any): string {
    // @ts-ignore
    const props = node.constructor.__props__;
    
    // @ts-ignore
    if (props.includes(property) && node[property] === value) {
        return property;// 访问的是node的直接节点
    } else {
        // 访问的是node的嵌套的属性
        walkProps(node, property, value);
    }

    for (const key of props) {
        // @ts-ignore
        if (node[key] === property) {
            // paths.push(key);
            
        }
    }
    for (let index = 0; index < node.components.length; index++) {
        const component = node.components[index];
        const path = walkProps(component, property, `__comps__.${index}`);
        if (path) {
            // paths.push(path);
        }
    }
    return '';
}

/**
 * 返回一个类的属性默认值
 * @param attrs 来自 cc.Class.attr(obj.constructor, key);
 */
export function ccClassAttrPropertyDefaultValue(attrs: any) {
    if (attrs.type === undefined) {
        if (attrs.default) {
            return getDefault(attrs);
        }
        return null;
    }

    const DefaultMap: any = {
        Boolean: false,
        String: '',
        Float: 0,
        Integer: 0,
        BitMask: 0,
    };

    const val = DefaultMap[attrs.type];
    if (val !== undefined) {
        return val;
    }

    switch (attrs.type) {
        case 'Enum': {
            return (attrs.enumList[0] && attrs.enumList[0].value) || 0;
        }
        case 'Object': {
            const { ctor } = attrs;

            if (cc.js.isChildClassOf(ctor, cc.Asset) || cc.js.isChildClassOf(ctor, cc.Node) || cc.js.isChildClassOf(ctor, cc.Component)) {
                return null;
            } else {
                try {
                    return new ctor();
                } catch (err) {
                    console.error(err);
                    return null;
                }
            }
        }
    }

    return null;
}

// export * as default from './utils';
export default {
    getDefault,
    getConstructor,
    getType,
    getTypeName,
    getTypeInheritanceChain,
    parsingPath,
    generatePath,
    ccClassAttrPropertyDefaultValue,
};
