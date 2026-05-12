'use strict';
import { Node, Component, js, CCClass, Scene } from 'cc';
import { parsingPath } from './utils';
import get from 'lodash/get';
import AssetUtil from './asset';
import { decodePatch, decodeNode, decodeScene, resetProperty, updatePropertyFromNull } from './decode';
import { encodeObject, encodeComponent, encodeScene, encodeNode } from './encode';
import { IComponent, INode, IScene } from '../../../common';
import { Rpc } from '../../rpc';

// dump接口,统一下全局引用
class DumpUtil {
    // 获取节点的某个属性
    dumpProperty(node: Node, path: string) {
        if (path === '') {
            //return this.dumpNode(node);
        }
        // 通过路径找到对象，然后dump这个对象
        const info = parsingPath(path, node);
        // 获取需要修改的数据
        const data = info.search ? get(node, info.search) : node;
        const attr = CCClass.Attr.getClassAttrs(data.constructor);
        const ret = encodeObject(data, attr);
        return ret;
    }

    /**
     * 生成一个 node 的 dump 数据
     * @param {*} node
     */
    dumpNode(node: Node): INode | IScene | null {
        if (!node) {
            return null;
        }
        if (node instanceof Scene) {
            return encodeScene(node);
        }
        return encodeNode(node);

    }

    // 生成一个component的dump数据
    dumpComponent(comp: Component): IComponent;
    dumpComponent(comp: null | undefined): null;
    dumpComponent(comp: Component | null | undefined) {
        if (!comp) {
            return null;
        }
        return encodeComponent(comp);
    }

    /**
     * 恢复一个 dump 数据到 property
     * @param node
     * @param path
     * @param dump
     */
    async restoreProperty(node: Node | Component, path: string, dump: any, forEditor: boolean = false) {
        // 还原整个 component
        if (/^__comps__\.\d+$/.test(path)) {
            if (typeof dump.value === 'object') {
                for (const key in dump.value) {
                    // @ts-ignore
                    await decodePatch(`${path}.${key}`, dump.value[key], node, forEditor);
                }
            }
        } else {
            // 还原单个属性
            return decodePatch(path, dump, node, forEditor);
        }
    }

    /**
     * 恢复某个属性的默认数据
     * @param node
     * @param path
     */
    resetProperty(node: Node | Component, path: string) {
        return resetProperty(node, path);
    }

    /**
     * 将一个属性其现存值与定义类型值不匹配，或者为 null 默认值，改为一个可编辑的值
     * @param node
     * @param path
     */
    updatePropertyFromNull(node: Node | Component, path: string) {
        return updatePropertyFromNull(node, path);
    }

    /**
     * 还原一个节点的全部属性
     * @param {*} node
     * @param {*} dump
     */
    async restoreNode(node: Node, dump: any) {
        if (dump && dump.isScene) {
            return await decodeScene(dump, node);
        }
        return await decodeNode(dump, node);
    }

    /**
     * 解析节点的访问路径
     * @param path 
     * @returns 
     */
    parsingPath(path: string, data: any) {
        return parsingPath(path, data);
    }

    /**
     * encodeObject
     */
    encodeObject(object: any, attributes: any, owner: any = null, objectKey?: string) {
        return encodeObject(object, attributes, owner, objectKey);
    }

    /**
     * 获取类型的默认dump数据
     * @param type 
     * @returns 
     */
    getDefaultValue(type: string | undefined): any {
        if (!type) {
            return null;
        }
        let value = AssetUtil.getDefaultValue(type, null);
        if (!value) {
            const ccType = js.getClassByName(type);
            value = ccType ? new ccType() : null;
        }
        return value;
    }

}

function collectI18nKeys(obj: any, keys: Set<string>) {
    if (!obj || typeof obj !== 'object') return;
    if (typeof obj.displayName === 'string' && obj.displayName.startsWith('i18n:')) {
        keys.add(obj.displayName);
    }
    if (typeof obj.tooltip === 'string' && obj.tooltip.startsWith('i18n:')) {
        keys.add(obj.tooltip);
    }
    if (obj.value && typeof obj.value === 'object') {
        if (Array.isArray(obj.value)) {
            for (const item of obj.value) {
                collectI18nKeys(item, keys);
            }
        } else {
            for (const key in obj.value) {
                collectI18nKeys(obj.value[key], keys);
            }
        }
    }
    if (Array.isArray(obj.__comps__)) {
        for (const comp of obj.__comps__) {
            collectI18nKeys(comp, keys);
        }
    }
}

function applyI18nTranslations(obj: any, translations: Record<string, string>) {
    if (!obj || typeof obj !== 'object') return;
    if (typeof obj.displayName === 'string' && translations[obj.displayName] !== undefined) {
        obj.displayName = translations[obj.displayName];
    }
    if (typeof obj.tooltip === 'string' && translations[obj.tooltip] !== undefined) {
        obj.tooltip = translations[obj.tooltip];
    }
    if (obj.value && typeof obj.value === 'object') {
        if (Array.isArray(obj.value)) {
            for (const item of obj.value) {
                applyI18nTranslations(item, translations);
            }
        } else {
            for (const key in obj.value) {
                applyI18nTranslations(obj.value[key], translations);
            }
        }
    }
    if (Array.isArray(obj.__comps__)) {
        for (const comp of obj.__comps__) {
            applyI18nTranslations(comp, translations);
        }
    }
}

export async function translateDumpI18n<T>(dump: T): Promise<T> {
    if (!dump) return dump;
    const keys = new Set<string>();
    collectI18nKeys(dump, keys);
    if (keys.size === 0) return dump;
    try {
        const translations = await Rpc.getInstance().request('i18n', 'batchTransI18nName', [Array.from(keys)]);
        applyI18nTranslations(dump, translations);
    } catch (e) {
        console.warn('[Dump] Failed to translate i18n keys via RPC:', e);
    }
    return dump;
}

export default new DumpUtil();
