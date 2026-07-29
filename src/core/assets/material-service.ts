'use strict';

declare const cc: any;

import { readJSON } from 'fs-extra';
import type { EffectAsset } from 'cc';
import type { IAsset } from './@types/protected';
import type { IAssetInfo, IProperty } from './@types/public';
import { deserialize as deserializeAssetSource } from './asset-handler/utils';
import { encodeSerializedObject } from './serialized-data';
import assetOperation from './manager/operation';
import assetQuery from './manager/query';
import { serialize as editorSerialize } from '../engine/editor-extends';
import i18n from '../base/i18n';

export interface MaterialEffectInfo {
    uuid: string;
    name: string;
    hideInEditor?: boolean;
    assetPath: string;
}

export interface MaterialPassDump {
    index: number;
    name?: string;
    phase?: string;
    switch?: IProperty;
    propertyIndex: IProperty;
    props: IProperty[];
    defines: IProperty[];
    states: IProperty;
}

export interface MaterialTechniqueDump {
    name?: string;
    passes: MaterialPassDump[];
}

export interface MaterialDump {
    effect: string;
    technique: number;
    data: MaterialTechniqueDump[];
}

const BASIC_VALUE_TYPE_MAP: Record<string | number, string> = {
    boolean: 'Boolean',
    number: 'Number',
    string: 'String',
};

const INSPECTOR_ATTRIBUTE_PROPS = ['visible', 'displayName', 'min', 'max', 'step', 'slide', 'tooltip', 'range'];

export async function queryAllEffects(): Promise<Record<string, MaterialEffectInfo>> {
    const effectAssets = queryEffectAssets();
    const result: Record<string, MaterialEffectInfo> = {};

    for (const asset of effectAssets) {
        try {
            const effect = await loadEffectAsset(asset);
            const info = assetQuery.encodeAsset(asset, []);
            result[asset.uuid] = {
                uuid: asset.uuid,
                name: effect.name || getEffectFallbackName(info),
                hideInEditor: !!effect.hideInEditor,
                assetPath: info.url || info.file,
            };
        } catch (error) {
            warnEffectLoadFailure(asset, error);
        }
    }

    return result;
}

export async function queryEffect(effectNameOrUuid: string): Promise<MaterialTechniqueDump[]> {
    const { asset, effect } = await resolveEffectAsset(effectNameOrUuid);
    if (!effect) {
        throw new Error(`Effect asset can not be found: ${effectNameOrUuid}. Please refresh/reimport effect.`);
    }
    return encodeEffect(effect, asset.uuid);
}

export async function queryMaterial(uuidOrUrlOrPath: string): Promise<MaterialDump> {
    const { asset } = resolveMaterialAsset(uuidOrUrlOrPath);
    const source = await readJSON(asset.source);
    const material = deserializeMaterialSource(source, asset);
    const effectUuid = extractUuid(source?._effectAsset) || extractUuid(material?._effectAsset);

    if (!effectUuid) {
        throw new Error(`Material effect can not be found: ${uuidOrUrlOrPath}. Please refresh/reimport material.`);
    }

    const { asset: effectAsset, effect } = await resolveEffectAsset(effectUuid);
    const data = encodeEffect(effect, effectAsset.uuid);
    const techniqueIndex = Number.isInteger(material._techIdx) ? material._techIdx : (source._techIdx || 0);
    const technique = data[techniqueIndex];

    if (technique) {
        mergeMaterialOverrides(technique, material);
    }

    return {
        effect: effectAsset.uuid,
        technique: techniqueIndex,
        data,
    };
}

export async function saveMaterial(uuidOrUrlOrPath: string, dump: MaterialDump): Promise<void> {
    const { asset } = resolveMaterialAsset(uuidOrUrlOrPath);
    const serialized = await decodeMaterial(dump);
    await assetOperation.saveAsset(asset.uuid, formatSerializedContent(serialized));
}

export function encodeEffect(effect: EffectAsset, effectUuid?: string): MaterialTechniqueDump[] {
    return (effect.techniques || []).map((tech: any) => {
        const passes = (tech.passes || []).map((pass: any, index: number): MaterialPassDump => {
            const props: IProperty[] = [];
            const defines: IProperty[] = [];
            const prog = (effect.shaders || []).find((shader: any) => shader.name === pass.program);

            for (const define of (prog?.defines || []) as any[]) {
                if (typeof define.name === 'string' && define.name.startsWith('CC_')) {
                    continue;
                }

                const type = getGfxValueType(define.type);
                let value: any;
                switch (type) {
                    case 'Number':
                    case 'Integer':
                    case 'Float':
                        value = Array.isArray(define.range) ? define.range[0] : 0;
                        break;
                    case 'String':
                        value = Array.isArray(define.options) ? define.options[0] : '';
                        break;
                    default:
                        value = false;
                        break;
                }

                const dump = encodeSerializedObject(value, { default: value });
                const tooltip = tryGetEffectTooltip(define.name, define.editor?.tooltip);
                Object.assign(dump, {
                    name: define.name,
                    defines: define.defines,
                    type,
                    options: define.options,
                    range: define.range,
                    default: dump.value,
                    tooltip,
                });
                defines.push(dump);
            }

            getObjectKeys(pass.properties).forEach((name) => {
                const prop = pass.properties[name];
                if (prop?.editor?.deprecated) {
                    return;
                }

                const uniformName = prop?.handleInfo?.[0] || name;
                const propData = getPropData(uniformName, prog);
                let customDefines = prop?.editor?.parent;
                if (customDefines && !Array.isArray(customDefines)) {
                    customDefines = [customDefines];
                }

                let type = getGfxValueType(prop.type);
                if (prop?.editor?.type === 'color') {
                    type = 'cc.Color';
                }

                let value = getDefaultValue(type, prop.value);
                if (propData.count && propData.count > 1) {
                    value = Array.from({ length: propData.count }, () => cloneDefaultValue(value));
                }

                const inspectorAttr = prop?.editor ? checkInspectorAttr(prop.editor) : {};
                const tooltip = tryGetEffectTooltip(name, prop?.editor?.tooltip);
                const dump = encodeSerializedObject(value, {
                    default: value,
                    displayName: prop?.editor?.displayName,
                    visible: prop?.editor?.visible,
                    tooltip,
                    range: prop?.editor?.range,
                    type,
                    ...inspectorAttr,
                });

                if (Array.isArray(dump.value)) {
                    dump.value.forEach((elem: any) => {
                        elem.default = elem.value;
                    });
                }

                Object.assign(dump, {
                    name,
                    defines: customDefines || propData.defines,
                    default: dump.value,
                });
                props.push(dump);
            });

            const passState = changePassStateToCCClass(pass);
            const states = encodeSerializedObject(passState, {});
            patchDumpData(states, 'pipelineStates');

            const needHide = pass.propertyIndex !== undefined && pass.propertyIndex !== index;
            return {
                index,
                name: pass.name,
                phase: pass.phase,
                switch: {
                    name: pass.switch,
                    value: false,
                    default: false,
                    type: 'Boolean',
                    visible: true,
                    readonly: false,
                    path: '',
                },
                propertyIndex: {
                    name: 'propertyIndex',
                    value: pass.propertyIndex === undefined ? index : pass.propertyIndex,
                    default: pass.propertyIndex === undefined ? index : pass.propertyIndex,
                    type: 'Integer',
                    visible: false,
                    readonly: false,
                    path: '',
                },
                props: needHide ? [] : props,
                defines: needHide ? [] : defines,
                states,
            };
        });

        return {
            name: tech.name,
            passes,
        };
    });
}

async function decodeMaterial(dump: MaterialDump): Promise<string | object> {
    const { asset: effectAsset, effect } = await resolveEffectAsset(dump.effect);
    const MaterialCtor = getMaterialCtor();
    const material: any = new MaterialCtor();
    material._effectAsset = effect;
    material._props = [];
    material._defines = [];
    material._states = [];
    material._techIdx = dump.technique || 0;

    if ('_uuid' in material._effectAsset) {
        material._effectAsset._uuid = effectAsset.uuid;
    }

    const technique = dump.data?.[material._techIdx];
    const passes = technique?.passes || [];
    const matProps: Record<string, any>[] = [];
    const matDefines: Record<string, any>[] = [];
    const matStates: Record<string, any>[] = [];

    const compareAndDecode = (dumpData: any, dstData: Record<string, any>): boolean => {
        if (!dumpData) {
            return false;
        }

        if (dumpData.isObject) {
            const decoded = decodeChangedObjectDump(dumpData);
            if (Object.keys(decoded).length === 0) {
                return false;
            }
            dstData[dumpData.name] = decoded;
            return true;
        }

        if (!hasModifiedDump(dumpData)) {
            return false;
        }

        dstData[dumpData.name] = decodeMaterialDumpValue(dumpData);
        return true;
    };

    for (let i = 0; i < passes.length; i++) {
        const current = passes[i];
        matProps[i] = {};
        matDefines[i] = {};
        matStates[i] = {};

        if (current.switch?.name && current.switch.value) {
            matDefines[i][current.switch.name] = current.switch.value;
        }

        for (const define of current.defines || []) {
            compareAndDecode(define, matDefines[i]);
        }

        for (const prop of current.props || []) {
            compareAndDecode(prop, matProps[i]);
        }

        const states = current.states?.value && typeof current.states.value === 'object'
            ? Object.values(current.states.value)
            : [];
        for (const state of states) {
            compareAndDecode(state, matStates[i]);
        }
    }

    material._props = matProps;
    material._defines = matDefines;
    material._states = matStates;

    const tech = effect.techniques?.[material._techIdx];
    if (tech) {
        for (let i = tech.passes.length - 1; i >= 0; i--) {
            const current = tech.passes[i];
            if (current.propertyIndex !== undefined && current.propertyIndex !== i) {
                material._props[i] = {};
                material._defines[i] = {};
            }
        }
    }

    return getEditorSerialize()(material);
}

function resolveMaterialAsset(uuidOrUrlOrPath: string): { asset: IAsset; assetInfo: IAssetInfo } {
    const asset = assetQuery.queryAsset(uuidOrUrlOrPath);
    if (!asset) {
        throw new Error(`Material can not be found: ${uuidOrUrlOrPath}. Please refresh asset db and try again.`);
    }

    const assetInfo = assetQuery.encodeAsset(asset, []);
    if (assetInfo.type !== 'cc.Material') {
        throw new Error(`Asset is not a material: ${uuidOrUrlOrPath}. Current type: ${assetInfo.type}.`);
    }

    if (!asset.source) {
        throw new Error(`Material has no source file: ${uuidOrUrlOrPath}.`);
    }

    return { asset, assetInfo };
}

async function resolveEffectAsset(effectNameOrUuid: string): Promise<{ asset: IAsset; assetInfo: IAssetInfo; effect: EffectAsset }> {
    const direct = assetQuery.queryAsset(effectNameOrUuid);
    if (direct) {
        const directInfo = assetQuery.encodeAsset(direct, []);
        if (directInfo.type === 'cc.EffectAsset') {
            return {
                asset: direct,
                assetInfo: directInfo,
                effect: await loadEffectAsset(direct),
            };
        }
    }

    const effectAssets = queryEffectAssets();
    for (const asset of effectAssets) {
        const assetInfo = assetQuery.encodeAsset(asset, []);
        if (matchesEffectAssetKey(effectNameOrUuid, assetInfo)) {
            return {
                asset,
                assetInfo,
                effect: await loadEffectAsset(asset),
            };
        }
    }

    for (const asset of effectAssets) {
        try {
            const effect = await loadEffectAsset(asset);
            const assetInfo = assetQuery.encodeAsset(asset, []);
            if (effect.name === effectNameOrUuid) {
                return { asset, assetInfo, effect };
            }
        } catch (error) {
            warnEffectLoadFailure(asset, error);
        }
    }

    throw new Error(`Effect asset can not be found: ${effectNameOrUuid}. Please refresh/reimport effect.`);
}

function queryEffectAssets(): IAsset[] {
    return assetQuery.queryAssets({ ccType: 'cc.EffectAsset' });
}

async function loadEffectAsset(asset: IAsset): Promise<EffectAsset> {
    const info = assetQuery.encodeAsset(asset, []);
    const libraryPath = info.library['.json'];
    if (!libraryPath) {
        throw new Error(`Effect library JSON can not be found: ${info.url}. Please refresh/reimport effect.`);
    }

    const effect = deserializeAssetSource(await readJSON(libraryPath)) as EffectAsset;
    if (!effect) {
        throw new Error(`Deserialize effect failed: ${info.url}. Please refresh/reimport effect.`);
    }
    if ('_uuid' in effect) {
        (effect as any)._uuid = asset.uuid;
    }
    return effect;
}

function deserializeMaterialSource(source: any, asset: IAsset): any {
    const material = deserializeAssetSource(source);
    if (!material) {
        throw new Error(`Deserialize material failed: ${asset.url || asset.uuid}. Please refresh/reimport material.`);
    }
    if ('_uuid' in material) {
        material._uuid = asset.uuid;
    }
    return material;
}

function matchesEffectAssetKey(key: string, info: IAssetInfo): boolean {
    const baseName = info.name.replace(/\.effect$/i, '');
    const loadName = info.loadUrl.split('/').pop() || info.loadUrl;
    return key === info.uuid
        || key === info.url
        || key === info.file
        || key === info.name
        || key === baseName
        || key === info.loadUrl
        || key === loadName;
}

function getEffectFallbackName(info: IAssetInfo): string {
    return info.name.replace(/\.effect$/i, '');
}

function getObjectKeys(obj: any): string[] {
    if (!obj) {
        return [];
    }

    if (obj.constructor?.__isJSB) {
        const keys: string[] = [];
        for (const key in obj) {
            keys.push(key);
        }
        return keys;
    }

    return Object.keys(obj);
}

function tryGetEffectTooltip(name: string, rawTooltip?: string) {
    if (typeof rawTooltip === 'string' && rawTooltip !== '') {
        return rawTooltip;
    }

    const tooltip = `ENGINE.assets.effect.propertyTips.${name}`;
    try {
        const translated = i18n.t(tooltip as any);
        if (translated && translated !== tooltip) {
            return `i18n:${tooltip}`;
        }
    } catch {
        // Ignore missing i18n keys.
    }

    return undefined;
}

function warnEffectLoadFailure(asset: IAsset, error: unknown) {
    console.warn(`EffectAsset ${asset.uuid} can not be loaded. Please refresh/reimport effect.`);
    console.warn(error);
}

function deepCopyProperty(dstObj: any, srcObj: any, propName: string | number, propClass?: any) {
    if (!dstObj) {
        return;
    }

    const dstProp = dstObj[propName];
    const srcProp = srcObj?.[propName];
    if (srcProp === undefined) {
        return;
    }

    if (Array.isArray(dstProp)) {
        if (!Array.isArray(srcProp)) {
            return;
        }

        const srcArrayLen = srcProp.length;
        const dstArrayLen = dstProp.length;
        if (propClass && srcArrayLen > dstArrayLen) {
            for (let i = 0; i < srcArrayLen - dstArrayLen; i++) {
                dstProp.push(new propClass());
            }
        }

        for (let i = 0; i < srcProp.length; i++) {
            deepCopyProperty(dstProp, srcProp, i, propClass);
        }
    } else if (dstProp?.constructor?.__props__) {
        const ctor = dstProp.constructor;
        ctor.__props__.forEach((key: string) => {
            if (dstProp[key] === undefined || srcProp[key] === undefined) {
                return;
            }
            const attr = cc.Class.attr(ctor, key);
            const attrCtor = getConstructor(srcProp[key], attr);
            deepCopyProperty(dstProp, srcProp, key, attrCtor);
        });
    } else {
        dstObj[propName] = srcObj[propName];
    }
}

function changePassStateToCCClass(passStateObj: any) {
    const PassStatesEditorCtor = getPassStatesEditorCtor();
    const passState: any = new PassStatesEditorCtor();
    passState.blendState.init(passStateObj.blendState);
    const ctor: any = passState.constructor;
    ctor.__props__.forEach((key: string) => {
        if (passState[key] === undefined || passStateObj[key] === undefined) {
            return;
        }
        const attr = cc.Class.attr(ctor, key);
        const attrCtor = getConstructor(passStateObj[key], attr);
        deepCopyProperty(passState, passStateObj, key, attrCtor);
    });

    return passState;
}

function getPassStatesEditorCtor(): any {
    const materialModule = require('cc/editor/material');
    return materialModule.PassStatesEditor;
}

function getMaterialCtor(): any {
    try {
        if (typeof cc !== 'undefined' && cc.Material) {
            return cc.Material;
        }
    } catch {
        // Ignore, cc is initialized lazily in tests and host startup.
    }

    const ccModule = require('cc');
    return ccModule.Material;
}

function hasModifiedDump(dumpData: any): boolean {
    if (!dumpData) {
        return false;
    }

    if (dumpData.isObject && dumpData.value && typeof dumpData.value === 'object') {
        return Object.values(dumpData.value).some((item) => hasModifiedDump(item));
    }

    if (dumpData.isArray && Array.isArray(dumpData.value)) {
        return isModified(dumpData) || dumpData.value.some((item: any) => hasModifiedDump(item));
    }

    return isModified(dumpData);
}

function decodeChangedObjectDump(dumpData: any): Record<string, any> {
    const result: Record<string, any> = {};
    if (!dumpData?.value || typeof dumpData.value !== 'object') {
        return result;
    }

    getObjectKeys(dumpData.value).forEach((key) => {
        const child = dumpData.value[key];
        if (!hasModifiedDump(child)) {
            return;
        }
        result[child.name ?? key] = child.isObject ? decodeChangedObjectDump(child) : decodeMaterialDumpValue(child);
    });
    return result;
}

function decodeMaterialDumpValue(dumpData: any): any {
    if (!dumpData || !('value' in dumpData)) {
        return undefined;
    }

    const value = dumpData.value;
    if (isAssetReferenceDump(dumpData)) {
        return createAssetReference(value.uuid, dumpData.type);
    }

    if (dumpData.isArray) {
        if (!Array.isArray(value)) {
            return [];
        }
        return value.map((item: any) => isPropertyDump(item) ? decodeMaterialDumpValue(item) : cloneSerializedValue(item));
    }

    if (dumpData.isObject) {
        const result: Record<string, any> = {};
        if (value && typeof value === 'object') {
            getObjectKeys(value).forEach((key) => {
                const child = value[key];
                result[child.name ?? key] = isPropertyDump(child) ? decodeMaterialDumpValue(child) : cloneSerializedValue(child);
            });
        }
        return result;
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const ccType = getCCClassByName(dumpData.type);
    if (ccType && ((dumpData.extends || []).includes('cc.ValueType') || Array.isArray(ccType.__props__))) {
        const instance = new ccType();
        const keys = Array.isArray(ccType.__props__) ? ccType.__props__ : getObjectKeys(value);
        keys.forEach((key: string) => {
            if (value[key] === undefined) {
                return;
            }
            instance[key] = isPropertyDump(value[key]) ? decodeMaterialDumpValue(value[key]) : cloneSerializedValue(value[key]);
        });
        return instance;
    }

    const result: Record<string, any> = {};
    getObjectKeys(value).forEach((key) => {
        const child = value[key];
        result[key] = isPropertyDump(child) ? decodeMaterialDumpValue(child) : cloneSerializedValue(child);
    });
    return result;
}

function isAssetReferenceDump(dumpData: any): boolean {
    const value = dumpData?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.uuid !== 'string') {
        return false;
    }

    if ((dumpData.extends || []).includes('cc.Asset')) {
        return true;
    }

    const ccType = getCCClassByName(dumpData.type);
    try {
        if (ccType && cc?.js?.isChildClassOf && cc?.Asset) {
            return cc.js.isChildClassOf(ccType, cc.Asset);
        }
    } catch {
        // Fall back to known material asset property types.
    }

    return ['cc.Asset', 'cc.TextureBase', 'cc.Texture2D', 'cc.TextureCube'].includes(dumpData.type);
}

function createAssetReference(uuid: string, type?: string) {
    if (!uuid) {
        return null;
    }
    return getEditorSerialize().asAsset(uuid, type ? getCCClassByName(type) : undefined);
}

function getCCClassByName(type?: string): any {
    if (!type) {
        return undefined;
    }
    try {
        return cc.js.getClassByName(type);
    } catch {
        return undefined;
    }
}

function isPropertyDump(value: any): boolean {
    return !!value && typeof value === 'object' && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, 'value');
}

function cloneSerializedValue(value: any): any {
    if (!value || typeof value !== 'object') {
        return value;
    }
    return JSON.parse(JSON.stringify(value));
}

function getConstructor(object: any, attribute: any) {
    if (attribute?.ctor) {
        return attribute.ctor;
    }
    return object === null || object === undefined ? null : object.constructor;
}

function getPassDefaultValue(type: string) {
    const ccType = cc.js.getClassByName(type);
    if (ccType) {
        return new ccType();
    }

    switch (type) {
        case 'Boolean':
            return false;
        case 'Number':
        case 'Float':
        case 'Integer':
        case 'Enum':
            return 0;
        case 'String':
            return '';
        default:
            return null;
    }
}

function patchNameToDump(dump: any, name: string) {
    if (!dump) {
        return;
    }

    dump.name = name;
    const value = dump.value;
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            patchNameToDump(value[i], `${i}`);
        }
    } else if (value && typeof value === 'object') {
        dump.isObject = true;
        Object.keys(value).forEach((key) => {
            patchNameToDump(value[key], key);
        });
    }
}

function patchDumpData(passStateDump: any, name: string) {
    if (!passStateDump) {
        return;
    }

    passStateDump.name = name;
    const value = passStateDump.value;
    if (Array.isArray(value)) {
        const defaultValue = getPassDefaultValue(passStateDump.type);
        passStateDump.elementTypeData = encodeSerializedObject(defaultValue, {
            type: passStateDump.type,
            enumList: passStateDump.enumList,
        });
        patchNameToDump(passStateDump.elementTypeData, name);
        for (let i = 0; i < value.length; i++) {
            patchDumpData(value[i], `${i}`);
        }
    } else if (value && typeof value === 'object' && !(passStateDump.extends || []).includes('cc.ValueType')) {
        passStateDump.isObject = true;
        Object.keys(value).forEach((key) => {
            patchDumpData(value[key], key);
        });
    } else {
        passStateDump.default = value;
    }

    passStateDump.isMat = true;
}

function getPropData(name: string, prog: any) {
    const propData: { defines?: any; count?: number } = {};
    const block = prog?.blocks?.find((b: any) => b.members?.find((u: any) => u.name === name) !== undefined);
    if (block) {
        propData.defines = block.defines;
        const member = block.members.find((m: any) => m.name === name);
        if (member) {
            propData.count = member.count;
        }
    }

    const samplerTexture = prog?.samplerTextures?.find((u: any) => u.name === name);
    if (samplerTexture) {
        propData.defines = samplerTexture.defines;
        propData.count = samplerTexture.count;
    }

    return propData;
}

function checkInspectorAttr(inspector: any) {
    const inspectorAttr: Record<string, any> = {};
    INSPECTOR_ATTRIBUTE_PROPS.forEach((key) => {
        if (inspector?.[key] === undefined) {
            return;
        }
        if (key === 'range') {
            const range = inspector[key];
            if (range.length >= 2) {
                inspectorAttr.min = range[0];
                inspectorAttr.max = range[1];
                if (range.length > 2) {
                    inspectorAttr.step = range[2];
                }
            }
        } else {
            inspectorAttr[key] = inspector[key];
        }
    });

    return inspectorAttr;
}

function getGfxValueType(type: string | number): string {
    const mappedBasic = BASIC_VALUE_TYPE_MAP[type];
    if (mappedBasic) {
        return mappedBasic;
    }

    const gfxType = getGfxTypeEnum();
    const mappedGfx: Record<string | number, string> = gfxType ? {
        [gfxType.INT]: 'Integer',
        [gfxType.INT2]: 'cc.Vec2',
        [gfxType.INT3]: 'cc.Vec3',
        [gfxType.INT4]: 'cc.Vec4',
        [gfxType.FLOAT]: 'Float',
        [gfxType.FLOAT2]: 'cc.Vec2',
        [gfxType.FLOAT3]: 'cc.Vec3',
        [gfxType.FLOAT4]: 'cc.Vec4',
        [gfxType.MAT4]: 'cc.Mat4',
        [gfxType.SAMPLER2D]: 'cc.TextureBase',
        [gfxType.SAMPLER_CUBE]: 'cc.TextureCube',
    } : {};

    return mappedGfx[type] || `${type}`;
}

function getGfxTypeEnum(): any {
    try {
        if (typeof cc !== 'undefined' && cc.gfx?.Type) {
            return cc.gfx.Type;
        }
    } catch {
        // Ignore, cc is initialized lazily in tests and host startup.
    }

    try {
        return require('cc').gfx?.Type;
    } catch {
        return undefined;
    }
}

function getDefaultValue(type: string, data?: any) {
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
            return data ? new cc.math.Vec2(data[0] || 0, data[1] || 0) : new cc.Vec2();
        case 'cc.Vec3':
            return data ? new cc.math.Vec3(data[0] || 0, data[1] || 0, data[2] || 0) : new cc.Vec3();
        case 'cc.Vec4':
            return data ? new cc.math.Vec4(data[0] || 0, data[1] || 0, data[2] || 0, data[3] || 0) : new cc.Vec4();
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

function cloneDefaultValue(value: any) {
    if (!value || typeof value !== 'object') {
        return value;
    }
    if (typeof value.clone === 'function') {
        return value.clone();
    }
    return JSON.parse(JSON.stringify(value));
}

function mergeMaterialOverrides(technique: MaterialTechniqueDump, material: any) {
    technique.passes.forEach((pass, index) => {
        getObjectKeys(material._defines?.[index]).forEach((name) => {
            const item = pass.defines.find((define) => define.name === name);
            if (!item) {
                if (pass.switch?.name === name) {
                    pass.switch.value = material._defines[index][name];
                }
                return;
            }
            overrideDataWithAsset(item, material._defines[index][name]);
        });

        getObjectKeys(material._props?.[index]).forEach((name) => {
            const item = pass.props.find((prop) => prop.name === name);
            if (!item) {
                return;
            }
            overrideDataWithAsset(item, material._props[index][name]);
        });

        getObjectKeys(material._states?.[index]).forEach((name) => {
            const stateValue = pass.states.value;
            if (!stateValue || typeof stateValue !== 'object' || Array.isArray(stateValue)) {
                return;
            }
            const item = Object.values(stateValue).find((prop: any) => prop.name === name) as IProperty | undefined;
            if (!item) {
                return;
            }
            overrideDataWithAsset(item, material._states[index][name]);
        });
    });
}

function overrideDataWithAsset(defaultData: any, assetData: any) {
    if (defaultData === undefined || assetData === undefined) {
        return;
    }

    if (defaultData.isObject) {
        getObjectKeys(assetData).forEach((key) => {
            overrideDataWithAsset(defaultData.value?.[key], assetData[key]);
        });
    } else if (defaultData.isArray) {
        if (!Array.isArray(assetData)) {
            return;
        }
        while (assetData.length > defaultData.value.length && defaultData.elementTypeData) {
            const newValue = JSON.parse(JSON.stringify(defaultData.elementTypeData));
            newValue.name = `${defaultData.value.length}`;
            newValue.displayName = `${defaultData.value.length}`;
            defaultData.value.push(newValue);
        }
        for (let i = 0; i < assetData.length; i++) {
            overrideDataWithAsset(defaultData.value[i], assetData[i]);
        }
    } else {
        const dump = encodeSerializedObject(assetData, {});
        if (dump.type !== 'Unknown') {
            defaultData.value = dump.value;
        }
    }
}

function isModified(dumpData: any) {
    return dumpData.default !== dumpData.value && JSON.stringify(dumpData.default) !== JSON.stringify(dumpData.value);
}

function extractUuid(value: any): string {
    if (!value) {
        return '';
    }
    return value.__uuid__ || value._uuid || value.uuid || '';
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
