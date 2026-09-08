'use strict';
import { Node, Component, js, CCClass, Scene, type ParticleSystem } from 'cc';
import { parsingPath } from './utils';
import get from 'lodash/get';
import AssetUtil from './asset';
import { decodePatch, decodeNode, decodeScene, resetProperty, updatePropertyFromNull } from './decode';
import { encodeObject, encodeComponent, encodeScene, encodeNode } from './encode';
import { IComponent, INode, IScene } from '../../../common';
import { restoreParticleSystemSnapshot } from './particle-snapshot';
import {
    NODE_SNAPSHOT_RESTORE_PROPERTY_PATHS,
    SCENE_SNAPSHOT_SPECIAL_PROPERTY_KEYS,
    COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS,
} from './restore-policy';

function isPropertyDump(value: unknown): value is { type: string; value: unknown } {
    return !!value && typeof value === 'object' && !Array.isArray(value) && 'type' in value && 'value' in value;
}

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
     * 恢复 node/scene snapshot 中的可编辑属性。
     *
     * 普通 Node 继续使用白名单，避免把结构字段交给 snapshot command。
     * Scene 的 dump 结构不同：顶层可编辑字段统一编码为 IProperty，
     * `_globals` 则是按属性名索引的 IProperty map，因此已纳入 snapshot command 的
     * Scene 属性可以按 dump 形状统一恢复；是否纳入 undo 不由这里决定。
     * 结构/身份字段和由 undo 层特殊处理的字段会被跳过。
     *
     * @see NODE_SNAPSHOT_RESTORE_PROPERTY_PATHS
     * @see SCENE_SNAPSHOT_SPECIAL_PROPERTY_KEYS
     */
    async restoreNodeSnapshotProperties(node: Node, dump: any) {
        if (dump?.isScene) {
            await this.restoreSceneSnapshotProperties(node, dump);
            return;
        }

        for (const path of NODE_SNAPSHOT_RESTORE_PROPERTY_PATHS) {
            if (dump[path]) {
                await this.restoreProperty(node, path, dump[path]);
            }
        }
    }

    private async restoreSceneSnapshotProperties(node: Node, dump: any) {
        for (const [key, propertyDump] of Object.entries(dump)) {
            if (key === '_globals') {
                if (propertyDump && typeof propertyDump === 'object' && !Array.isArray(propertyDump)) {
                    for (const [globalKey, globalPropertyDump] of Object.entries(propertyDump)) {
                        if (globalPropertyDump) {
                            await this.restoreProperty(node, `_globals.${globalKey}`, globalPropertyDump);
                        }
                    }
                }
                continue;
            }

            if (
                SCENE_SNAPSHOT_SPECIAL_PROPERTY_KEYS.includes(
                    key as typeof SCENE_SNAPSHOT_SPECIAL_PROPERTY_KEYS[number],
                )
            ) {
                continue;
            }

            if (isPropertyDump(propertyDump)) {
                await this.restoreProperty(node, key, propertyDump);
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
        if (js.getClassName(component) === 'cc.ParticleSystem' && dump.value.renderer?.value) {
            await restoreParticleSystemSnapshot(component as ParticleSystem, dump, (target, path, property) => decodePatch(path, property, target));
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
