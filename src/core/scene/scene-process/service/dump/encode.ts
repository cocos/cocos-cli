'use strict';

declare const cc: any;

import dumpUtil from './utils';

import { DumpDefines } from './dump-defines';
import { IProperty } from '../../../@types/public';
import { IComponent } from '../../../common';
import compMgr from '../component/index';

/**
 * 编码一个 component
 * @param component
 */
export function encodeComponent(component: any): IComponent {
    const ctor = component.constructor;

    const data: IComponent = {
        properties: {},
        path: compMgr.getPathFromUuid(component.uuid) || '',
        uuid: component.uuid,
        name: component.name,
        enabled: component.enabled,
        type: dumpUtil.getTypeName(ctor),
        cid: component.__cid__,
        prefab: component.__prefab
    };

    // 遍历组件内所有属性
    ctor.__props__.forEach((key: string) => {
        try {
            if (key in component) {
                /**
                 * 过滤私有属性与内置属性
                 */
                if (key.startsWith('_') || key.startsWith('__')) {
                    return;
                }
                /**
                 * 此处 cc.Class.attr(component, key) 中的 component 不能用 ctor 替代
                 * 因为 ctor 是基类定义，component 是子类，子类的 __attr__ 存了一些自己数据了
                 * 比如 sp.Skeleton 当 skeletonData 属性有数据时取 _animationIndex 属性的 enumList 数据  
                 */
                const attrs = cc.Class.attr(component, key);
                const dumpData = encodeObject(component[key], attrs, component, key);
                if (dumpData.type !== 'Unknown') {
                    data.properties[key] = dumpData;
                }
                _checkConstructorRewriteType(dumpData, component[key], attrs);
            }
        } catch (error) {
            // tslint:disable-next-line:max-line-length
            console.warn(
                `Component property dump failed:\n  Node: ${component.node.name}(${component.node.uuid})\n Component: ${data.type}(${component.uuid})\n Property: ${key}`,
            );
            console.warn(error);
            delete data.properties[key];
        }
    });

    return data;
}

/**
 * 属性（非数组）的现有值类型和所在组件对其定义的类型进行比较，
 * 不一致时需要在 inspector 上显示 reset 按钮
 * @param data 
 * @param object 
 * @param attributes 
 */
function _checkConstructorRewriteType(data: IProperty, object: any, attributes: any) {
    if (object && typeof object === 'object' && !Array.isArray(object) && object.constructor && attributes && attributes.ctor && !(object instanceof attributes.ctor)) {
        data.type = 'Unknown';
    }
}

function _checkAttributes(data: IProperty, attributes: any) {
    if (!attributes.ctor && attributes.type) {
        data.type = '' + attributes.type;
    }

    if ('enumList' in attributes && attributes.type === 'Enum') {
        data.type = 'Enum';
    }

    // 现在跟默认值没关系，明确只有 get 没有 set 的情况下为只读
    if (attributes && attributes.hasGetter && !attributes.hasSetter) {
        data.readonly = true;
    }
}

function _encodeByType(type: string | undefined, object: any, data: IProperty, opts?: any) {
    type = type || '';
    const dumpType = DumpDefines[type];
    if (dumpType) {
        dumpType.encode(object, data, opts);
        return true;
    }

    return false;
}


/**
 * 编码一个对象
 * @param object 编码对象
 * @param attributes 属性描述
 * @param owner 编码对象所属的对象
 * @param objectKey 输出有效信息，当前数据 key，以便问题排查
 */
export function encodeObject(object: any, attributes: any, owner: any = null, objectKey?: string): IProperty {
    const ctor = dumpUtil.getConstructor(object, attributes);
    // let defValue = dumpUtil.getDefault(attributes);

    let type = dumpUtil.getTypeName(ctor);

    if (owner === null) {
        // 默认值如果存在，则比对默认值的 ctor 和当前对象的 ctor 是否一致
        if (attributes.default !== null && attributes.default !== undefined) {
            const defCtor = dumpUtil.getConstructor(attributes.default, attributes);
            const defType = dumpUtil.getTypeName(defCtor);
            if (defType !== type) {
                type = 'Unknown';
            }
        }
    }

    const data: IProperty = {
        name: objectKey,
        value: null,
        type: type,
    };

    //如果有 userData 就把 userData 传递过去
    if (attributes.userData) {
        data.userData = attributes.userData;
    }

    _checkAttributes(data, attributes);

    if (!data.isArray && Array.isArray(object)) {
        data.isArray = true;
    }

    if (data.isArray) {
        if (!Array.isArray(object) || data.type === 'Array') {
            data.type = 'Unknown';
        } else {
            // 子元素的定义
            const childAttribute: any = Object.assign({}, attributes);

            // 父级数组属性的修饰器定义不适用于 子元素 的定义，需要调整
            childAttribute.visible = true;
            if (childAttribute.readonly && childAttribute.readonly.deep !== undefined) {
                childAttribute.readonly = childAttribute.readonly.deep;
            }

            const propertyDefaultValue = dumpUtil.ccClassAttrPropertyDefaultValue(attributes);
            // 子元素的类型由父级决定，子元素的默认值跟随父级类型的默认值
            childAttribute.default = getElementDefaultValue(attributes, propertyDefaultValue);

            const resultValue: any = [];
            // 未避免有可能出现的内部数据有空，需要用普通的 for 循环，不要使用 forEach\map 等来遍历
            for (let i = 0; i < object.length; i++) {
                const item = object[i];

                if (item && item.constructor) {
                    childAttribute.ctor = item && item.constructor; // 处理子级的类是继承父级类的情况
                }

                const result = encodeObject(item, childAttribute, owner);
                if (result.type !== 'Unknown') {
                    resultValue.push(result);
                }
            }
            data.value = resultValue;
        }
    } else {
        const opts: any = {};
        opts.ctor = ctor;

        if (_encodeByType(data.type, object, data, opts)) {
            // empty
        } else if (ArrayBuffer.isView(object)) {
            _encodeByType('TypedArray', object, data, opts);
        } else if (cc.js.isChildClassOf(ctor, cc.ValueType)) {
            _encodeByType('cc.ValueType', object, data, opts);
        } else if (cc.js.isChildClassOf(ctor, cc.Node)) {
            // 如果是节点、资源、组件，则生成链接到对象的 uuid
            _encodeByType('cc.Node', object, data, opts);
        } else if (cc.js.isChildClassOf(ctor, cc.Component)) {
            _encodeByType('cc.Component', object, data, opts);
        } else if (cc.js.isChildClassOf(ctor, cc.Asset)) {
            _encodeByType('cc.Asset', object, data, opts);
        } else if (ctor && ctor.__props__) {
            // 如果构造器存在，且带有 __props__，则开始递归序列化内部属性
            if (object) {
                // 构造器存在，属性也存在
                const result: { [key: string]: any } = {};
                ctor.__props__.forEach((key: string) => {
                    const attrs = cc.Class.attr(object, key); // object 是实例，可能有自定义的 attrs

                    if (attributes.readonly && attributes.readonly.deep) {
                        attrs.readonly = { deep: true };
                    }

                    const dumpData = encodeObject(object[key], attrs, object, key);
                    if (dumpData.type !== 'Unknown') {
                        result[key] = dumpData;
                    }
                    _checkConstructorRewriteType(dumpData, object[key], attrs);
                });
                data.value = result;
            } else {
                // 构造器存在，但是属性不存在，无法继续递归序列化内部属性
                data.value = null;
            }
        } else {
            // 上述判断都无法适用的情况下, 直接将 object 赋值给 value
            if (data.type !== 'Unknown') {
                data.value = object;
            }
        }
    }

    return data;
}

function getElementDefaultValue(parentAttrs: any, parentInitializer: unknown) {
    if (parentAttrs.type) {
        return dumpUtil.ccClassAttrPropertyDefaultValue(parentAttrs);
    }
    return getElementDefaultValueFromParentInitializer(parentInitializer);
}

function getElementDefaultValueFromParentInitializer(parentInitializer: unknown) {
    if (!parentInitializer || !Array.isArray(parentInitializer) || parentInitializer.length === 0) {
        return null;
    }

    const firstElement = parentInitializer[0];
    switch (typeof firstElement) {
        case 'number': return 0;
        case 'string': return '';
        case 'boolean': return false;
    }

    return null;
}

export default {
    encodeComponent,
    encodeObject,
};
