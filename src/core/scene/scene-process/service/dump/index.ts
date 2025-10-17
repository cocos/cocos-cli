'use strict';
import { Node, Component, js, CCClass } from 'cc';
import { INode } from '../../../@types/public';
import { parsingPath } from './utils';
import AssetUtil from './asset';
import { decodePatch, decodeNode, resetProperty, updatePropertyFromNull } from './decode';
import { encodeObject, encodeNode, encodeComponent } from './encode';
import { IComponentInfo } from '../../../common';

// import * as dumpDecode from './decode';
const { get, set } = require('lodash');

// dump接口,统一下全局引用
class DumpUtil {
    // 获取节点的某个属性
    dumpProperty(node: Node, path: string) {
        if (path === '') {
            return this.dumpNode(node);
        }
        // 通过路径找到对象，然后dump这个对象
        const info = parsingPath(path, node);
        const parentInfo = parsingPath(info.search, node);
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
    dumpNode(node: Node): INode | null {
        if (!node) {
            return null;
        }
        return encodeNode(node);

    }
    // 生成一个component的dump数据
    dumpComponent(comp: Component): IComponentInfo;
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
    async restoreProperty(node: Node | Component, path: string, dump: any) {
        // 还原整个 component
        if (/^__comps__\.\d+$/.test(path)) {
            if (typeof dump.value === 'object') {
                for (const key in dump.value) {
                    // @ts-ignore
                    await decodePatch(`${path}.${key}`, dump.value[key], node);
                }
            }
        } else {
            // 还原单个属性
            return decodePatch(path, dump, node);
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

    // 获取节点上某个属性的路径
    generatePath(node: Node, property: any) {
        // return generatePath(node, property);
    }

    /**
     * encodeObject
     */
    encodeObject(object: any, attributes: any, owner: any = null, objectKey?: string, isTemplate?: boolean) {
        return encodeObject(object, attributes, owner, objectKey, isTemplate);
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

export default new DumpUtil();
