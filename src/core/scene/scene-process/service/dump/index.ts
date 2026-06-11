'use strict';
import { Node, Component, js, CCClass, Scene } from 'cc';
import { parsingPath } from './utils';
import get from 'lodash/get';
import AssetUtil from './asset';
import { decodePatch, decodeNode, decodeScene, resetProperty, updatePropertyFromNull } from './decode';
import { encodeObject, encodeComponent, encodeScene, encodeNode } from './encode';
import { IComponent, INode, IScene } from '../../../common';
import { NODE_SNAPSHOT_RESTORE_PROPERTY_PATHS, COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS } from './restore-policy';

// dump接口,统一下全局引用
class DumpUtil {
    // 获取节点的某个属性
    dumpProperty(node: Node, path: string) {
        if (path === '') {
            return this.dumpNode(node);
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
    dumpNode(node: Node, options: { includeComponents?: boolean } = {}): INode | IScene | null {
        if (!node) {
            return null;
        }
        if (node instanceof Scene) {
            return encodeScene(node);
        }
        return encodeNode(node, options);

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

    /**
     * 恢复 node snapshot 中的可编辑属性（白名单由 restore-policy 定义）。
     * 仅处理 dump 数据的属性恢复；name 通知、locked 标志位等 undo 层逻辑不在此处。
     * @see NODE_SNAPSHOT_RESTORE_PROPERTY_PATHS
     */
    async restoreNodeSnapshotProperties(node: Node, dump: any) {
        for (const path of NODE_SNAPSHOT_RESTORE_PROPERTY_PATHS) {
            if (dump[path]) {
                await this.restoreProperty(node, path, dump[path]);
            }
        }
    }

    /**
     * 恢复 component snapshot 中的用户属性（跳过身份/编辑器字段，黑名单由 restore-policy 定义）。
     * 不包含 onRestore 生命周期调用等 undo 层逻辑。
     * @see COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS
     */
    async restoreComponentSnapshotProperties(component: Component, dump: any) {
        if (!dump?.value) {
            return;
        }
        for (const key in dump.value) {
            if (COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS.includes(key as typeof COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS[number])) {
                continue;
            }
            await this.restoreProperty(component, key, dump.value[key]);
        }
    }

}

export default new DumpUtil();
