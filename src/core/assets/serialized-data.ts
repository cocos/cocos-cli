'use strict';

declare const cc: any;

import { readJSON } from 'fs-extra';
import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import { deserialize as deserializeAssetSource } from './asset-handler/utils';
import type { IAsset } from './@types/protected';
import type { IAssetInfo } from './@types/public';
import type { IProperty } from '../scene/@types/public';
import assetOperation from './manager/operation';
import assetQuery from './manager/query';
import { serialize as editorSerialize } from '../engine/editor-extends';
import i18n from '../base/i18n';

export type SerializedAssetDump = Record<string, IProperty> | IProperty;
export type SerializedAssetPatch = SerializedAssetDump | Partial<Record<string, IProperty | unknown>>;

export interface SerializedAssetQueryResult {
    uuid: string;
    url: string;
    type: string;
    importer: string;
    dump: SerializedAssetDump;
}

const SUPPORTED_TYPES = new Set(['cc.PhysicsMaterial', 'cc.RenderPipeline']);

const RENDER_PIPELINE_CHANGE_TYPES: Record<string, { componentKey: string; optionalTypes: string[] }> = {
    _flows: {
        componentKey: 'flow',
        optionalTypes: [],
    },
    _stages: {
        componentKey: 'stage',
        optionalTypes: [],
    },
};

const ATTRIBUTE_PROPS = [
    'enumList',
    'radioGroup',
    'bitmaskList',
    'displayName',
    'group',
    'multiline',
    'step',
    'slide',
    'tooltip',
    'animatable',
    'unit',
    'radian',
    'displayOrder',
];

const AUTO_I18N_ATTRIBUTE_NAMES = [
    'displayName',
    'tooltip',
] as const;

const MAX_CLASS_NAME_LOOKUP_DEPTH = 10;
const AUTO_I18N_CLASS_PREFIXES = ['cc.', 'sp.'];

export async function querySerializedData(uuidOrUrlOrPath: string): Promise<SerializedAssetQueryResult> {
    const { asset, assetInfo } = resolveSerializedAsset(uuidOrUrlOrPath);
    const instance = await loadSerializedAssetInstance(asset);

    return {
        uuid: asset.uuid,
        url: assetInfo.url,
        type: assetInfo.type,
        importer: assetInfo.importer,
        dump: await encodeSerializedAssetDump(instance, assetInfo.type),
    };
}

export async function saveSerializedData(
    uuidOrUrlOrPath: string,
    patch: SerializedAssetPatch,
): Promise<SerializedAssetQueryResult> {
    const { asset, assetInfo } = resolveSerializedAsset(uuidOrUrlOrPath);
    const instance = await loadSerializedAssetInstance(asset);
    let normalizedInstance = instance;

    if (assetInfo.type === 'cc.RenderPipeline' && isPropertyLike(patch)) {
        normalizedInstance = createRenderPipelineInstanceIfNeeded(normalizedInstance, patch);
    }

    const currentDump = await encodeSerializedAssetDump(normalizedInstance, assetInfo.type);
    const currentFieldDump = getFieldDumpFromAssetDump(assetInfo.type, currentDump);
    const patchFieldDump = normalizePatchFieldDump(assetInfo.type, currentFieldDump, patch);

    await applyFieldDumpPatch(normalizedInstance, currentFieldDump, patchFieldDump);

    const serialized = getEditorSerialize()(normalizedInstance);
    await assetOperation.saveAsset(asset.uuid, formatSerializedContent(serialized));

    return querySerializedData(asset.uuid);
}

function resolveSerializedAsset(uuidOrUrlOrPath: string): { asset: IAsset; assetInfo: IAssetInfo } {
    const asset = assetQuery.queryAsset(uuidOrUrlOrPath);
    if (!asset) {
        throw new Error(`Serialized asset can not be found: ${uuidOrUrlOrPath}`);
    }

    const assetInfo = assetQuery.encodeAsset(asset);
    if (!SUPPORTED_TYPES.has(assetInfo.type)) {
        throw new Error(`Unsupported serialized asset type: ${assetInfo.type}. Only cc.PhysicsMaterial and cc.RenderPipeline are supported.`);
    }

    if (!asset.source) {
        throw new Error(`Serialized asset has no source file: ${uuidOrUrlOrPath}`);
    }

    return { asset, assetInfo };
}

async function loadSerializedAssetInstance(asset: IAsset): Promise<any> {
    const source = await readJSON(asset.source);
    const instance = deserializeAssetSource(source);
    if (!instance) {
        throw new Error(`Deserialize serialized asset failed: ${asset.url || asset.uuid}`);
    }
    if ('_uuid' in instance) {
        instance._uuid = asset.uuid;
    }
    return instance;
}

async function encodeSerializedAssetDump(instance: any, type: string): Promise<SerializedAssetDump> {
    if (type === 'cc.RenderPipeline') {
        const dump = encodeComponentAsset(instance, modifyRenderPipelineProp);
        return {
            name: 'Pipeline',
            type: instance.constructor.name,
            value: dump,
            visible: true,
            readonly: false,
            optionalTypes: queryRenderComponents('pipeline'),
            path: '',
        };
    }

    return encodeComponentAsset(instance, modifyPropName);
}

function encodeComponentAsset(
    instance: any,
    modifyProp: (prop: IProperty, name?: string) => void,
): Record<string, IProperty> {
    const ctor = instance.constructor;
    if (!ctor.__props__) {
        throw new Error(`Serialized asset type has no editable properties: ${ctor.name || 'Unknown'}`);
    }

    const value: Record<string, IProperty> = {};
    ctor.__props__.forEach((key: string) => {
        try {
            if (!(key in instance)) {
                return;
            }
            const attrs = cc.Class.attr(ctor, key);
            const dumpData = encodeSerializedObject(instance[key], attrs, instance, key);
            if (dumpData.type !== 'Unknown') {
                value[key] = dumpData;
                modifyProp(value[key], key);
            }
        } catch (error) {
            console.warn(`Asset property dump failed:\n Asset: ${ctor.name}\n Property: ${key}`);
            console.warn(error);
            delete value[key];
        }
    });
    return value;
}

function encodeSerializedObject(
    object: any,
    attributes: any,
    owner: any = null,
    objectKey?: string,
    isTemplate?: boolean,
): IProperty {
    attributes = attributes || {};
    const ctor = getPropertyConstructor(object, attributes);
    let defValue = getPropertyDefault(attributes);

    if (defValue && typeof defValue === 'object' && defValue.constructor && Array.isArray(defValue.constructor.__props__)) {
        const result: { type: string; value: Record<string, IProperty> } = {
            type: getTypeName(defValue.constructor),
            value: {},
        };
        defValue.constructor.__props__.forEach((key: string) => {
            const attrs = cc.Class.attr(defValue.constructor, key);
            const dumpData = encodeSerializedObject(defValue[key], attrs, defValue, key);
            if (dumpData.type !== 'Unknown') {
                result.value[key] = dumpData;
            }
        });
        defValue = result;
    }

    let type = getTypeName(ctor);
    if (owner === null && attributes.default !== null && attributes.default !== undefined) {
        const defCtor = getPropertyConstructor(attributes.default, attributes);
        const defType = getTypeName(defCtor);
        if (defType !== type) {
            type = 'Unknown';
        }
    }

    const data: IProperty = {
        name: objectKey,
        value: null,
        default: defValue,
        type,
        path: '',
        readonly: !!attributes.readonly,
        visible: attributes.visible ?? true,
        animatable: attributes.animatable === undefined ? true : !!attributes.animatable,
    };

    if (attributes.userData) {
        data.userData = attributes.userData;
    }

    applyPropertyAttributes(data, attributes, owner);

    if (Array.isArray(defValue) || Array.isArray(object)) {
        data.isArray = true;
    }

    if (data.isArray) {
        if (!Array.isArray(object) || data.type === 'Array') {
            data.type = 'Unknown';
        } else {
            const childAttribute: any = { ...attributes, visible: true };
            if (childAttribute.readonly && childAttribute.readonly.deep !== undefined) {
                childAttribute.readonly = childAttribute.readonly.deep;
            }

            const propertyDefaultValue = getPropertyDefaultValue(attributes);
            childAttribute.default = getElementDefaultValue(attributes, propertyDefaultValue);

            if (!isTemplate) {
                data.elementTypeData = encodeSerializedObject(childAttribute.default, childAttribute, propertyDefaultValue, undefined, true);
            }

            const resultValue: IProperty[] = [];
            for (let i = 0; i < object.length; i++) {
                const item = object[i];
                if (item && item.constructor) {
                    childAttribute.ctor = item.constructor;
                }

                const result = encodeSerializedObject(item, childAttribute, owner);
                if (result.type !== 'Unknown') {
                    resultValue.push(result);
                } else if (data.elementTypeData) {
                    resultValue.push(data.elementTypeData);
                }
            }
            data.value = resultValue;
        }
    } else if (encodeKnownPropertyType(data.type, object, data, { ctor })) {
        // Encoded by known type handler.
    } else if (ArrayBuffer.isView(object)) {
        encodeKnownPropertyType('TypedArray', object, data, { ctor });
    } else if (isChildClassOf(ctor, cc.ValueType)) {
        encodeKnownPropertyType('cc.ValueType', object, data, { ctor });
    } else if (isChildClassOf(ctor, cc.Node)) {
        encodeKnownPropertyType('cc.Node', object, data, { ctor });
    } else if (isChildClassOf(ctor, cc.Component)) {
        encodeKnownPropertyType('cc.Component', object, data, { ctor });
    } else if (isChildClassOf(ctor, cc.Asset)) {
        encodeKnownPropertyType('cc.Asset', object, data, { ctor });
    } else if (ctor && ctor.__props__) {
        if (object) {
            const result: Record<string, IProperty> = {};
            ctor.__props__.forEach((key: string) => {
                const attrs = cc.Class.attr(object, key);
                if (attributes.readonly && attributes.readonly.deep) {
                    attrs.readonly = { deep: true };
                }

                const dumpData = encodeSerializedObject(object[key], attrs, object, key);
                if (dumpData.type !== 'Unknown') {
                    result[key] = dumpData;
                }
                applyConstructorRewriteType(dumpData, object[key], attrs);
            });
            data.value = result;
        } else {
            data.value = null;
        }
    } else if (data.type !== 'Unknown') {
        data.value = object;
    }

    if (ctor) {
        data.extends = getTypeInheritanceChain(ctor);
    }

    return data;
}

function getPropertyDefault(attribute: any) {
    return typeof attribute.default === 'function' ? attribute.default() : attribute.default;
}

function getPropertyConstructor(object: any, attribute: any) {
    if (attribute && attribute.ctor) {
        return attribute.ctor;
    }
    return object === null || object === undefined ? null : object.constructor;
}

function getTypeName(ctor: any) {
    return ctor ? cc.js.getClassName(ctor) || ctor.name || 'Unknown' : 'Unknown';
}

function getTypeInheritanceChain(ctor: any) {
    return cc.Class.getInheritanceChain(ctor)
        .map((itemCtor: any) => getTypeName(itemCtor))
        .filter(Boolean);
}

function applyPropertyAttributes(data: IProperty, attributes: any, owner: any) {
    ['visible', 'min', 'max'].forEach((name) => {
        const value = resolveAttributeValue(name, attributes, owner);
        if (value !== undefined) {
            (data as any)[name] = value;
        }
    });

    if (!attributes.ctor && attributes.type) {
        data.type = `${attributes.type}`;
    }

    if ('enumList' in attributes && attributes.type === 'Enum') {
        data.type = 'Enum';
    }

    if (attributes.hasGetter && !attributes.hasSetter) {
        data.readonly = true;
    }

    ATTRIBUTE_PROPS.forEach((propName) => {
        if (Object.prototype.hasOwnProperty.call(attributes, propName)) {
            (data as any)[propName] = attributes[propName];
        }
    });

    applyAutoI18nAttributes(data, attributes, owner);
    translateI18nStringsDeep(data);
}

function resolveAttributeValue(attributeName: string, attributes: any, owner: any) {
    const attribute = attributes[attributeName];
    if (attribute === undefined) {
        return undefined;
    }
    if (typeof attribute === 'function') {
        if (!owner) {
            return undefined;
        }
        const value = attribute.call(owner);
        return typeof value === 'boolean' ? !!value : value;
    }
    return typeof attribute === 'boolean' ? !!attribute : attribute;
}

function encodeKnownPropertyType(type: string | undefined, object: any, data: IProperty, opts: any) {
    switch (type || '') {
        case 'Number':
        case 'Enum':
        case 'String':
            data.value = object;
            return true;
        case 'TypedArray':
            data.value = object ? new (object.constructor)(object) : object;
            return true;
        case 'cc.ValueType': {
            try {
                const dump = getEditorSerialize()(object, { stringify: false, forceInline: true }) as any;
                delete dump.__type__;
                data.value = dump;
            } catch (error) {
                console.warn('Value dump failed.');
                console.warn(error);

                const dump = getEditorSerialize()(new opts.ctor(), { stringify: false, forceInline: true }) as any;
                delete dump.__type__;
                data.value = dump;
            }
            return true;
        }
        case 'cc.Node':
        case 'cc.Component':
            data.value = { uuid: object ? object.uuid || '' : '' };
            return true;
        case 'cc.Asset': {
            const uuid = object ? object._uuid || '' : '';
            data.value = { uuid: uuid.startsWith('pm_') ? '' : uuid };
            return true;
        }
        default:
            return false;
    }
}

function applyAutoI18nAttributes(data: IProperty, attributes: any, owner: any) {
    if (typeof data.name !== 'string' || !owner || typeof owner !== 'object') {
        return;
    }

    const ownerTypeName = findClassName(owner, data.name);
    if (!ownerTypeName) {
        return;
    }

    AUTO_I18N_ATTRIBUTE_NAMES.forEach((attributeName) => {
        if (Object.prototype.hasOwnProperty.call(attributes, attributeName)) {
            return;
        }
        (data as any)[attributeName] = `i18n:ENGINE.classes.${ownerTypeName}.properties.${data.name}.${attributeName}`;
    });
}

function findClassName(ccClassObject: any, property: string): string {
    let depth = 0;
    let proto = ccClassObject;
    while (proto && depth < MAX_CLASS_NAME_LOOKUP_DEPTH) {
        const className = cc.js.getClassName(proto);
        if (
            className
            && AUTO_I18N_CLASS_PREFIXES.some((prefix) => className.startsWith(prefix))
            && Object.prototype.hasOwnProperty.call(proto, property)
        ) {
            return className;
        }
        proto = Object.getPrototypeOf(proto);
        depth++;
    }

    return '';
}

function translateI18nStringsDeep(obj: any, depth = 0): void {
    if (!obj || typeof obj !== 'object') {
        return;
    }
    if (depth > 10) {
        console.warn('[translateI18nStringsDeep] Max recursion depth exceeded; nested i18n strings at this level will not be translated:', obj);
        return;
    }
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (typeof value === 'string') {
            obj[key] = i18n.transI18nName(value);
        } else if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                if (typeof value[i] === 'string') {
                    value[i] = i18n.transI18nName(value[i]);
                } else {
                    translateI18nStringsDeep(value[i], depth + 1);
                }
            }
        } else {
            translateI18nStringsDeep(value, depth + 1);
        }
    }
}

function isChildClassOf(ctor: any, base: any) {
    return !!ctor && !!base && cc.js.isChildClassOf(ctor, base);
}

function applyConstructorRewriteType(data: IProperty, object: any, attributes: any) {
    if (object && typeof object === 'object' && !Array.isArray(object) && object.constructor && attributes?.ctor && !(object instanceof attributes.ctor)) {
        data.type = 'Unknown';
    }
}

function getElementDefaultValue(parentAttrs: any, parentInitializer: unknown) {
    if (parentAttrs.type) {
        return getPropertyDefaultValue(parentAttrs);
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
        default: return null;
    }
}

function getPropertyDefaultValue(attrs: any) {
    if (attrs.type === undefined) {
        return attrs.default ? getPropertyDefault(attrs) : null;
    }

    const defaultMap: Record<string, unknown> = {
        Boolean: false,
        String: '',
        Float: 0,
        Integer: 0,
        BitMask: 0,
    };
    if (defaultMap[attrs.type] !== undefined) {
        return defaultMap[attrs.type];
    }

    if (attrs.type === 'Enum') {
        return attrs.enumList?.[0]?.value || 0;
    }

    if (attrs.type === 'Object') {
        const { ctor } = attrs;
        if (isChildClassOf(ctor, cc.Asset) || isChildClassOf(ctor, cc.Node) || isChildClassOf(ctor, cc.Component)) {
            return null;
        }
        if (ctor) {
            try {
                return new ctor();
            } catch (error) {
                console.error(error);
                return null;
            }
        }
    }

    return null;
}

function modifyPropName(prop: IProperty, name?: string) {
    prop.name = name;

    if (prop.value && typeof prop.value === 'object') {
        for (const key in prop.value as Record<string, unknown>) {
            const child = (prop.value as Record<string, unknown>)[key];
            if (child && typeof child === 'object') {
                modifyPropName(child as IProperty, key);
            }
        }
    }
}

function modifyRenderPipelineProp(prop: IProperty, name?: string) {
    prop.name = name;

    if (prop.visible === false) {
        return;
    }

    if (prop.value && typeof prop.value === 'object') {
        const changeType = name ? RENDER_PIPELINE_CHANGE_TYPES[name] : undefined;

        if (changeType) {
            changeType.optionalTypes = queryRenderComponents(changeType.componentKey);
        }

        if (prop.isArray && prop.elementTypeData && changeType) {
            modifyRenderPipelineProp(prop.elementTypeData);
            prop.elementTypeData.optionalTypes = changeType.optionalTypes;
        }

        for (const key in prop.value as Record<string, unknown>) {
            const child = (prop.value as Record<string, unknown>)[key];
            if (child && typeof child === 'object') {
                modifyRenderPipelineProp(child as IProperty, key);

                if (prop.isArray && changeType) {
                    (child as IProperty).optionalTypes = changeType.optionalTypes;
                }
            }
        }
    }
}

function queryRenderComponents(type: string | undefined = undefined): string[] {
    const editorExtends = (globalThis as any).EditorExtends;
    const menus = editorExtends?.Component?.getMenus?.() || [];
    const prefix = `hidden:render_${type}/`;

    return menus
        .map((item: any) => {
            if (!item?.component || typeof item.menuPath !== 'string') {
                return null;
            }
            if (!item.menuPath.includes(prefix)) {
                return null;
            }
            return item.menuPath.replace(prefix, '');
        })
        .filter(Boolean);
}

function getFieldDumpFromAssetDump(type: string, dump: SerializedAssetDump): Record<string, IProperty> {
    if (type === 'cc.RenderPipeline') {
        if (!isPropertyLike(dump) || !isRecord(dump.value)) {
            throw new Error('Invalid RenderPipeline serialized dump.');
        }
        return dump.value as Record<string, IProperty>;
    }
    return dump as Record<string, IProperty>;
}

function normalizePatchFieldDump(
    type: string,
    currentDump: Record<string, IProperty>,
    patch: SerializedAssetPatch,
): Record<string, IProperty> {
    const patchRecord = type === 'cc.RenderPipeline' && isPropertyLike(patch)
        ? patch.value
        : patch;

    if (!isRecord(patchRecord)) {
        throw new Error('Serialized asset patch must be a dump object.');
    }

    const result: Record<string, IProperty> = {};
    for (const [key, value] of Object.entries(patchRecord)) {
        const current = currentDump[key];
        if (!current) {
            throw new Error(`Unknown serialized field: ${key}`);
        }

        const next = isPropertyLike(value)
            ? cloneDeep(value)
            : {
                ...cloneDeep(current),
                value,
            };

        validatePropertyPatch(key, current, next);
        result[key] = next;
    }
    return result;
}

function validatePropertyPatch(path: string, current: IProperty, next: IProperty) {
    const changed = !isEqual(current.value, next.value);
    if ((current.visible === false || current.readonly === true) && changed) {
        throw new Error(`Serialized field is readonly or hidden and can not be modified: ${path}`);
    }

    if (Array.isArray(current.value) && Array.isArray(next.value)) {
        for (let i = 0; i < next.value.length; i++) {
            const nextChild = next.value[i];
            const currentChild = findCurrentArrayChild(current.value, nextChild, i);
            if (!currentChild) {
                continue;
            }
            if (isPropertyLike(currentChild) && isPropertyLike(nextChild)) {
                validatePropertyPatch(`${path}.${i}`, currentChild, nextChild);
            }
        }
        return;
    }

    if (!isRecord(current.value) || !isRecord(next.value)) {
        return;
    }

    for (const [key, value] of Object.entries(next.value)) {
        const currentChild = current.value[key];
        if (!currentChild) {
            throw new Error(`Unknown serialized field: ${path}.${key}`);
        }
        if (isPropertyLike(currentChild) && isPropertyLike(value)) {
            validatePropertyPatch(`${path}.${key}`, currentChild, value);
        }
    }
}

function findCurrentArrayChild(currentValue: unknown[], nextChild: unknown, index: number): unknown {
    if (isPropertyLike(nextChild) && typeof nextChild.name === 'string') {
        const originalIndex = Number(nextChild.name);
        if (Number.isInteger(originalIndex) && originalIndex >= 0 && originalIndex < currentValue.length) {
            return currentValue[originalIndex];
        }
    }
    return currentValue[index];
}

async function applyFieldDumpPatch(
    instance: any,
    currentDump: Record<string, IProperty>,
    patchDump: Record<string, IProperty>,
) {
    for (const key in patchDump) {
        const current = currentDump[key];
        if (current.visible === false || current.readonly === true) {
            continue;
        }
        await setValue(instance, patchDump, key);
    }
}

async function setValue(prop: any, dump: Record<string, any> | any, key: string) {
    if (!dump) {
        return;
    }

    if (typeof dump !== 'object') {
        if (key === 'uuid' && '_uuid' in prop) {
            prop._uuid = dump;
            return;
        }
        prop[key] = dump;
        return;
    }

    if (!dump[key].isArray) {
        if (dump[key].value === null || typeof dump[key].value !== 'object') {
            prop[key] = dump[key].value;
        } else {
            const names = Object.keys(dump[key].value);
            for (const name of names) {
                if (name === 'uuid') {
                    const uuid = extractUuidValue(dump[key].value[name]);
                    prop[key] = uuid ? createAssetReference(uuid, dump[key].type) : null;
                } else {
                    await setValue(prop[key], dump[key].value, name);
                }
            }
        }
    } else {
        const propKeyAttr = cc.Class.attr(prop.constructor, key);

        if (!Array.isArray(prop[key])) {
            prop[key] = getPropertyDefaultValue(propKeyAttr);
        }

        if (!Array.isArray(prop[key])) {
            delete prop[key];
        } else {
            const oldLength = prop[key].length;
            const newLength = Array.isArray(dump[key].value) ? dump[key].value.length : 0;
            if (newLength > oldLength) {
                for (let i = oldLength; i < newLength; i++) {
                    prop[key][i] = createValueForDumpItem(dump[key].value[i]);
                    await setValue(prop[key], dump[key].value, i.toString());
                }
            } else if (newLength < oldLength) {
                while (prop[key].length > newLength) {
                    prop[key].pop();
                }
            } else if (oldLength) {
                const arrayClone = prop[key].slice();
                prop[key] = [];
                for (let i = 0; i < oldLength; i++) {
                    if (dump[key].value[i] === undefined) {
                        continue;
                    }
                    prop[key][i] = arrayClone[dump[key].value[i].name];
                }
            }

            for (let i = 0; i < prop[key].length; i++) {
                const itemDump = dump[key].value[i];
                if (itemDump?.type && (!prop[key][i] || itemDump.type !== prop[key][i].constructor.name)) {
                    const typeClass = cc.js.getClassByName(itemDump.type);
                    if (typeClass) {
                        prop[key][i] = new typeClass();
                    }
                }

                await setValue(prop[key], dump[key].value, i.toString());
            }
        }
    }
}

function createValueForDumpItem(itemDump: IProperty) {
    if (!itemDump?.type) {
        return null;
    }

    const typeClass = cc.js.getClassByName(itemDump.type);
    if (typeClass) {
        return new typeClass();
    }

    return getDefaultValueByType(itemDump.type);
}

function getDefaultValueByType(type: string, data?: any) {
    switch (type) {
        case 'Boolean':
            return data ? data[0] : false;
        case 'Number':
        case 'Integer':
        case 'Float':
            return data ? data[0] : 0;
        case 'String':
            return data ? data[0] : '';
        case 'cc.Vec2':
            return data ? new cc.math.Vec2(data[0] || 0, data[1] || 0) : new cc.math.Vec2();
        case 'cc.Vec3':
            return data ? new cc.math.Vec3(data[0] || 0, data[1] || 0, data[2] || 0) : new cc.math.Vec3();
        case 'cc.Vec4':
            return data ? new cc.math.Vec4(data[0] || 0, data[1] || 0, data[2] || 0, data[3] || 0) : new cc.math.Vec4();
        case 'cc.Quat':
            return data ? new cc.math.Quat(data[0] || 0, data[1] || 0, data[2] || 0, data[3] || 1) : new cc.Quat();
        case 'cc.Color':
            if (Array.isArray(data)) {
                if (data[3] === undefined) {
                    data[3] = 1;
                }
                return new cc.Color(data[0] * 255, data[1] * 255, data[2] * 255, data[3] * 255);
            }
            return new cc.Color();
        case 'cc.Mat4':
            if (Array.isArray(data)) {
                return new cc.math.Mat4(
                    data[0],
                    data[1],
                    data[2],
                    data[3],
                    data[4],
                    data[5],
                    data[6],
                    data[7],
                    data[8],
                    data[9],
                    data[10],
                    data[11],
                    data[12],
                    data[13],
                    data[14],
                    data[15],
                );
            }
            return new cc.Mat4();
        case 'cc.Asset':
            return new cc.Asset();
        case 'cc.TextureBase':
            return new cc.TextureBase();
        case 'cc.Texture2D':
            return new cc.Texture2D();
        case 'cc.TextureCube':
            return new cc.TextureCube();
        default:
            return false;
    }
}

function createRenderPipelineInstanceIfNeeded(instance: any, patch: IProperty) {
    if (!patch.type || instance.constructor.name === patch.type) {
        return instance;
    }

    const ctor = cc.js.getClassByName(patch.type);
    if (!ctor) {
        throw new Error(`RenderPipeline type can not be found: ${patch.type}`);
    }

    const next = new ctor();
    if ('_uuid' in next && '_uuid' in instance) {
        next._uuid = instance._uuid;
    }
    return next;
}

function extractUuidValue(value: unknown): string {
    if (isPropertyLike(value)) {
        return typeof value.value === 'string' ? value.value : '';
    }
    return typeof value === 'string' ? value : '';
}

function createAssetReference(uuid: string, type?: string) {
    const ctor = type ? cc.js.getClassByName(type) : undefined;
    return getEditorSerialize().asAsset(uuid, ctor);
}

function getEditorSerialize() {
    const serialize = (globalThis as any).EditorExtends?.serialize || editorSerialize;
    if (!serialize) {
        throw new Error('EditorExtends.serialize is not initialized.');
    }
    return serialize;
}

function formatSerializedContent(serialized: string | object) {
    return typeof serialized === 'string'
        ? serialized
        : JSON.stringify(serialized, null, 4);
}

function isPropertyLike(value: unknown): value is IProperty {
    return isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'value');
}

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
