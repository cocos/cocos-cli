'use strict';

declare const cc: any;
declare const EditorExtends: any;

import dumpUtil from './utils';

import { DumpDefines } from './dump-defines';
import { IProperty } from '../../../@types/public';
import { IComponent, IComponentForEditor, INodeForEditor, ISceneForEditor, ITargetOverrideInfoForEditor } from '../../../common';
import compMgr from '../component/index';
import { prefabUtils } from './../prefab/utils';
import { Service } from './../core';
import { MobilityMode, Node, Prefab, Component, js } from 'cc';

/**
 * 编码一个 node 数据
 * @param node
 */
export function encodeNode(node: Node): INodeForEditor {
    const ctor = node.constructor;

    const LayersEnumList = Object.keys(cc.Layers.Enum).map((key, index) => {
        return { name: key, value: cc.Layers.Enum[key] };
    });
    LayersEnumList.sort((a, b) => {
        return a.value - b.value;
    });

    const MobilityModeEnumList = Object.keys(MobilityMode).map((key, index) => {
        return { name: key, value: MobilityMode[key as keyof typeof MobilityMode] };
    });

    // FIXME: avoid using private field
    // TODO：这里的需要知道当前场景是 2D 还是 3D
    //const is2DProject = cce.SceneFacadeManager['_projectType'] === '2d';
    const is2DProject = true;

    const data: INodeForEditor = {
        active: encodeObject(node.active, { displayName: 'Active', default: null }, node),
        locked: encodeObject(Boolean(node.objFlags & cc.Object.Flags.LockedInEditor), { displayName: 'Locked', default: false, animatable: false }, node),
        name: encodeObject(node.name, { displayName: 'Name', default: null, animatable: false }, node),
        position: encodeObject(
            node.position,
            {
                displayName: 'i18n:scene.cc.Node.properties.position.displayName',
                default: new cc.math.Vec3(),
                tooltip: 'i18n:scene.cc.Node.properties.position.tooltip',
            },
            node,
            'position',
        ),
        rotation: encodeObject(
            node.eulerAngles,
            {
                name: 'eulerAngles',
                displayName: 'i18n:scene.cc.Node.properties.eulerAngles.displayName',
                default: new cc.math.Vec3(),
                tooltip: `i18n:scene.cc.Node.properties.eulerAngles.${is2DProject ? 'tooltip2D' : 'tooltip3D'}`,
            },
            node,
            is2DProject ? 'angle' : 'eulerAngles',
        ),
        scale: encodeObject(
            node.scale,
            {
                displayName: 'i18n:scene.cc.Node.properties.scale.displayName',
                default: new cc.math.Vec3(1, 1, 1),
                tooltip: 'i18n:scene.cc.Node.properties.scale.tooltip',
            },
            node,
            'scale',
        ),
        mobility: encodeObject(
            node.mobility,
            {
                displayName: 'i18n:scene.cc.Node.properties.mobility.displayName',
                tooltip: 'i18n:scene.cc.Node.properties.mobility.tooltip',
                default: 0,
                type: 'Enum',
                enumList: MobilityModeEnumList,
            },
            node,
            'mobility',
        ),
        layer: encodeObject(
            node.layer, {
            displayName: 'i18n:scene.cc.Node.properties.layer.displayName',
            tooltip: 'i18n:scene.cc.Node.properties.layer.tooltip',
            default: 1073741824,
            type: 'Enum',
            enumList: LayersEnumList,
            readonly: false,
            animatable: false,
        },
            node,
            'layer',
        ),
        uuid: encodeObject(node.uuid, { displayName: 'UUID', default: null, animatable: false }, node),

        parent: encodeObject(
            node.parent,
            {
                ctor: cc.Node,
            },
            node,
        ),

        children: node.children
            .map((child: any) => {
                if (!child || child.objFlags & cc.Object.Flags.HideInHierarchy) {
                    return;
                }

                return encodeObject(
                    child,
                    {
                        ctor: cc.Node,
                    },
                    node,
                );
            })
            .filter(Boolean),

        __type__: dumpUtil.getTypeName(ctor),
        __comps__: node['_components'].map((comp: any) => {
            return encodeComponentForEditor(comp);
        }),

        mountedRoot: prefabUtils.getMountedRoot(node)?.uuid,
    };

    if (node['_prefab']) {
        const prefabStateInfo = prefabUtils.getPrefabStateInfo(node);
        data.__prefab__ = {
            uuid: (node['_prefab'].asset && node['_prefab'].asset._uuid) || '',
            fileId: node['_prefab'].fileId,
            rootUuid: node['_prefab'].root && node['_prefab'].root.uuid,
            sync: true,
            prefabStateInfo,
        };

        if (node['_prefab'].targetOverrides) {
            data.__prefab__.targetOverrides = encodeTargetOverrides(node['_prefab'].targetOverrides);
        }

        if (node['_prefab'].instance) {
            data.__prefab__.instance = encodeObject(node['_prefab'].instance, { default: null }, node);
        }

        const removedComponents = prefabUtils.getRemovedComponents(node);
        if (removedComponents.length > 0) {
            data.removedComponents = removedComponents.map((comp: Component) => {
                return { name: js.getClassName(comp), fileID: comp.__prefab!.fileId };
            });
        }
    }

    // 根据 flag 调整 readyonly
    _checkObjFlags(node, data);

    return data;
}

/**
 * 编码一个场景数据
 * @param scene
 */
export function encodeScene(scene: any): ISceneForEditor {
    const ctor = scene.constructor;

    const data: ISceneForEditor = {
        active: encodeObject(scene.active, { default: null }),
        locked: encodeObject(false, { default: false }),
        name: encodeObject(scene.name || ctor.name, { default: null }),
        uuid: encodeObject(scene.uuid, { default: null }),
        autoReleaseAssets: encodeObject(scene.autoReleaseAssets, { displayName: 'Auto Release Assets', default: false }),
        children: scene.children
            .map((child: any) => {
                if (!child || child.objFlags & cc.Object.Flags.HideInHierarchy) {
                    return;
                }

                return encodeObject(child, {
                    ctor: cc.Node,
                });
            })
            .filter(Boolean),
        parent: '',
        __type__: dumpUtil.getTypeName(ctor),
        _globals: {},
        isScene: true,
    };

    // 遍历 scene._globals 内所有属性
    if (scene._globals) {
        scene._globals.constructor.__props__.map((key: string) => {
            const attrs = cc.Class.attr(scene._globals.constructor, key);
            data._globals[key] = encodeObject(scene._globals[key], attrs, scene._globals);
        });
    }

    if (scene['_prefab']?.targetOverrides) {
        data.targetOverrides = encodeTargetOverrides(scene['_prefab'].targetOverrides);
    }

    return data;
}

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
 * 详细的编码 component
 * @param component
 */
export function encodeComponentForEditor(component: any): IComponentForEditor {
    const ctor = component.constructor;
    // 嵌套预制体中的mountedComponent并不是mounted;需要做区分
    const mountedRootNode = prefabUtils.getMountedRoot(component);
    let mountedRoot: string | undefined = mountedRootNode?.uuid;
    if (mountedRootNode) {
        const prefabInfo = mountedRootNode['_prefab'];
        if (prefabInfo && prefabInfo.root) {
            const prefabRootNode = prefabInfo.root['_prefab']?.instance?.prefabRootNode;
            // 判断下是否是嵌套预制体且由父预制体引入到当前场景（避免在预制体编辑模式中误判）
            if (prefabRootNode && prefabRootNode !== Service.Editor.getRootNode()) {
                mountedRoot = undefined;
            }
        }
    }
    const data: IComponentForEditor = {
        value: {
            uuid: encodeObject(component.uuid, { default: null, visible: false }, component),
            name: encodeObject(component.name, { default: null, visible: false }, component),
            enabled: encodeObject(component.enabled, { default: null, visible: false }, component),
        },
        default: undefined,
        type: dumpUtil.getTypeName(ctor),
        readonly: false,
        visible: true,
        cid: component.__cid__,

        mountedRoot: mountedRoot,
    };

    // 遍历组件内所有属性
    ctor.__props__.forEach((key: string) => {
        if (!data.value) {
            return;
        }

        try {
            if (key in component) {
                /**
                 * 此处 cc.Class.attr(component, key) 中的 component 不能用 ctor 替代
                 * 因为 ctor 是基类定义，component 是子类，子类的 __attr__ 存了一些自己数据了
                 * 比如 sp.Skeleton 当 skeletonData 属性有数据时取 _animationIndex 属性的 enumList 数据  
                 */
                const attrs = cc.Class.attr(component, key);
                const dumpData = encodeObject(component[key], attrs, component, key);
                if (dumpData.type !== 'Unknown') {
                    data.value[key] = dumpData;
                }
                _checkConstructorRewriteType(dumpData, component[key], attrs);
            }
        } catch (error) {
            // tslint:disable-next-line:max-line-length
            console.warn(
                `Component property dump failed:\n  Node: ${component.node.name}(${component.node.uuid})\n Component: ${data.type}(${component.uuid})\n Property: ${key}`,
            );
            console.warn(error);
            delete data.value[key];
        }
    });

    // editor 附加数据
    data.editor = {
        inspector: ctor._inspector || '',
        icon: ctor._icon || '',
        help: ctor._help || '',
        _showTick:
            typeof component.start === 'function' ||
            typeof component.update === 'function' ||
            typeof component.lateUpdate === 'function' ||
            typeof component.onEnable === 'function' ||
            typeof component.onDisable === 'function',
    };

    // __scriptUuid
    if (data.value && typeof data.value === 'object' && !Array.isArray(data.value)) {
        const scriptType: any = (data.value as Record<string, any>).__scriptAsset;
        if (component instanceof cc._MissingScript) {
            const compData = component['_$erialized'];
            let uuid = compData && compData['__type__'];
            uuid = uuid && EditorExtends.UuidUtils.decompressUuid(component._$erialized.__type__);
            scriptType.visible = !!(uuid && EditorExtends.UuidUtils.isUuid(uuid));
            scriptType.value = { uuid };
        } else {
            scriptType.visible = !!component.__scriptUuid;
            scriptType.value = { uuid: component.__scriptUuid };
        }
        scriptType.displayOrder = -999;
    }

    // 继承链
    if (ctor) {
        data.extends = dumpUtil.getTypeInheritanceChain(ctor);
    }

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
 * hack：处理 component 的 .objFlags 设置，需要传递给 node
 * 比如 Canvas 的 IsPositionLocked 要传给 node，position.readonly = true
 * 比如 Canvas 的 IsSizeLocked 要传给 UITransform, contentsize = true
 * 暂时处理以下逻辑，后续可增删
 */
function _checkObjFlags(node: any, data: INodeForEditor) {
    let IsPositionLocked = false;
    let IsSizeLocked = false;
    let IsAnchorLocked = false;
    let IsScaleLocked = false;
    let IsRotationLocked = false;
    node['_components'].forEach((component: any) => {
        if (component.objFlags & cc.Object.Flags.IsPositionLocked) {
            IsPositionLocked = true;
        }

        if (component.objFlags & cc.Object.Flags.IsSizeLocked) {
            IsSizeLocked = true;
        }

        if (component.objFlags & cc.Object.Flags.IsAnchorLocked) {
            IsAnchorLocked = true;
        }

        if (component.objFlags & cc.Object.Flags.IsScaleLocked) {
            IsScaleLocked = true;
        }

        if (component.objFlags & cc.Object.Flags.IsRotationLocked) {
            IsRotationLocked = true;
        }
    });

    if (IsPositionLocked) {
        data.position.readonly = true;
    }
    if (IsScaleLocked) {
        data.scale.readonly = true;
    }

    if (IsRotationLocked) {
        data.rotation.readonly = true;
    }

    const uiTransformComponents: any = [];
    data.__comps__.forEach((comp: any) => {
        if (comp.cid === 'cc.UITransform') {
            uiTransformComponents.push(comp);
        }
    });

    if (uiTransformComponents.length) {
        if (IsSizeLocked) {
            uiTransformComponents.forEach((comp: any) => {
                comp.value.contentSize.readonly = true;
            });
        }
        if (IsAnchorLocked) {
            uiTransformComponents.forEach((comp: any) => {
                comp.value.anchorPoint.readonly = true;
            });
        }
    }
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


function encodeTargetOverrides(targetOverrides: any) {
    if (!targetOverrides || targetOverrides.length <= 0) {
        return null;
    }

    const dumpedTargetOverrides: ITargetOverrideInfoForEditor[] = [];
    targetOverrides.forEach((itr: Prefab._utils.TargetOverrideInfo) => {
        if (!itr.source || !itr.target) {
            return;
        }
        const dumpOverride = {
            source: itr.source.uuid,
            sourceInfo: itr.sourceInfo ? itr.sourceInfo.localID : undefined,
            propertyPath: itr.propertyPath,
            target: itr.target.uuid,
            targetInfo: itr.targetInfo ? itr.targetInfo.localID : undefined,
        };

        dumpedTargetOverrides.push(dumpOverride);
    });

    return dumpedTargetOverrides;
}

export default {
    encodeNode,
    encodeScene,
    encodeComponent,
    encodeComponentForEditor,
    encodeObject,
};
