'use strict';

import type { Node } from 'cc';
import { EventEmitter } from 'events';

import * as ObjectWalker from '../missing-reporter/object-walker';
import utils from '../../../base/utils';

const lodash = require('lodash');

export default class NodeManager extends EventEmitter {
    // 当前在场景树中的节点集合,包括在层级管理器中隐藏的
    allow = false;

    _map: { [index: string]: any } = {};


    private _uuidToPath: Map<string, string> = new Map();          // UUID -> 路径
    private _pathToUuid: Map<string, string> = new Map();          // 路径 -> UUID
    private _parentChildren: Map<string, Set<string>> = new Map(); // 父节点UUID -> 子节点UUID集合
    private _nodeNames: Map<string, Map<string, number>> = new Map(); // 父节点UUID -> (节点名 -> 计数)

    // 被删除节点集合,为了undo，编辑器不会把Node删除
    // _recycle: { [index: string]: any } = {};

    /**
     * 新增一个节点，当引擎将一个节点添加到场景树中，同时会遍历子节点，递归的调用这个方法。
     * @param uuid
     * @param node
     */
    add(uuid: string, node: Node) {
        if (!this.allow) {
            return;
        }
        this._map[uuid] = node;

        const parentUuid = node.parent ? node.parent.uuid : undefined;
        // 生成唯一路径
        const path = this._generateUniquePath(uuid, node.name, parentUuid);
        this._uuidToPath.set(uuid, path);
        this._pathToUuid.set(path, uuid);

        // 维护父子关系
        if (parentUuid) {
            if (!this._parentChildren.has(parentUuid)) {
                this._parentChildren.set(parentUuid, new Set());
            }
            this._parentChildren.get(parentUuid)!.add(uuid);
        }

        try {
            this.emit('add', uuid, node);
        } catch (error) {
            console.error(error);
        }
    }

    /**
     * 删除一个节点，当引擎将一个节点从场景树中移除，同时会遍历子节点，递归的调用这个方法。
     * @param uuid
     */
    remove(uuid: string) {
        if (!this.allow) {
            return;
        }
        if (!this._map[uuid]) {
            return;
        }
        const node = this._map[uuid];
        // this._recycle[uuid] = this._map[uuid];
        delete this._map[uuid];

        const path = this._uuidToPath.get(uuid);
        if (path) {
            this._pathToUuid.delete(path);
        }
        this._uuidToPath.delete(uuid);

        // 清理父子关系
        this._cleanupParentRelations(uuid);
        try {
            this.emit('remove', uuid, node);
        } catch (error) {
            console.error(error);
        }
    }

    /**
     * 清空所有数据
     */
    clear() {
        if (!this.allow) {
            return;
        }
        this._map = {};
        this._uuidToPath.clear();
        this._pathToUuid.clear();
        this._parentChildren.clear();
        this._nodeNames.clear();
        // this._recycle = {};
    }


    /**
     * 更新节点名称和路径
     */
    updateNodeName(uuid: string, newName: string) {
        if (!this._map[uuid]) {
            return;
        }

        const oldPath = this._uuidToPath.get(uuid);
        const node = this._map[uuid];

        // 获取父节点UUID
        const parentUuid = this._getParentUuid(uuid);

        // 生成新的唯一路径
        const newPath = this._generateUniquePath(uuid, newName, parentUuid);

        // 更新路径映射
        this._uuidToPath.set(uuid, newPath);
        this._pathToUuid.delete(oldPath!);
        this._pathToUuid.set(newPath, uuid);

        // 更新节点名称计数
        if (parentUuid) {
            this._updateNameCount(parentUuid, node.name, newName);
        }

        // 更新节点对象的名称
        node.name = newName;
    }

    /**
     * 获取一个节点数据，查的范围包括被删除的节点
     * @param uuid
     */
    getNode(uuid: string): Node | null {
        return this._map[uuid] ?? null;
    }

    getNodeByPath(path: string): Node | null {
        const uuid = this._pathToUuid.get(path);
        if (uuid) {
            return this.getNode(uuid);
        }
        return null;
    }

    getNodePath(node: Node): string {
        return this._uuidToPath.get(node.uuid) || "";
    }

    /**
     * 获取所有的节点数据
     */
    getNodes() {
        return this._map;
    }

    /**
     * 获取场景中使用了某个资源的节点
     * @param uuid asset uuid
     */
    getNodesByAsset(uuid: string) {
        const nodesUuid: string[] = [];

        if (!uuid) {
            return nodesUuid;
        }

        ObjectWalker.walkProperties(
            cc.director.getScene().children,
            (obj: any, key: any, value: any, parsedObjects: any) => {
                let isAsset = false;
                if (value._uuid) {
                    isAsset = value._uuid.includes(uuid) || utils.UUID.compressUUID(value._uuid, true).includes(uuid);
                }

                let isScript = false;
                if (value.__scriptUuid) {
                    isScript = value.__scriptUuid.includes(uuid) || utils.UUID.compressUUID(value.__scriptUuid, false).includes(uuid);
                }

                if (isAsset || isScript) {
                    const node = lodash.findLast(parsedObjects, (item: any) => item instanceof cc.Node);

                    if (node && !nodesUuid.includes(node.uuid)) {
                        nodesUuid.push(node.uuid);
                    }
                }
            },
            {
                dontSkipNull: false,
                ignoreSubPrefabHelper: true,
            },
        );

        return nodesUuid;
    }

    /**
     * 获取所有在场景树中的节点数据
     */
    getNodesInScene() {
        return this._map;
    }

    changeNodeUUID(oldUUID: string, newUUID: string) {
        if (oldUUID === newUUID) {
            return;
        }

        const node = this._map[oldUUID];
        if (!node) {
            return;
        }

        node._id = newUUID;

        this._map[newUUID] = node;
        delete this._map[oldUUID];
    }


    /**
    * 获取节点的父节点UUID
    */
    private _getParentUuid(uuid: string): string | undefined {
        for (const [parentUuid, children] of this._parentChildren.entries()) {
            if (children.has(uuid)) {
                return parentUuid;
            }
        }
    }

    /**
     * 清理父子关系
     */
    private _cleanupParentRelations(uuid: string) {
        // 从父节点中移除
        const parentUuid = this._getParentUuid(uuid);
        if (parentUuid) {
            this._parentChildren.get(parentUuid)?.delete(uuid);
            this._updateNameCount(parentUuid, this._map[uuid]?.name, null);
        }

        // 递归清理所有子节点
        const children = this._parentChildren.get(uuid);
        if (children) {
            for (const childUuid of children) {
                this.remove(childUuid);
            }
            this._parentChildren.delete(uuid);
        }

        // 清理名称计数
        this._nodeNames.delete(uuid);
    }

    /**
     * 更新名称计数
     */
    private _updateNameCount(parentUuid: string, oldName: string | null, newName: string | null) {
        if (!this._nodeNames.has(parentUuid)) {
            return;
        }

        const nameMap = this._nodeNames.get(parentUuid)!;

        // 减少旧名称的计数
        if (oldName && nameMap.has(oldName)) {
            const count = nameMap.get(oldName)!;
            if (count > 1) {
                nameMap.set(oldName, count - 1);
            } else {
                nameMap.delete(oldName);
            }
        }

        // 增加新名称的计数
        if (newName) {
            if (!nameMap.has(newName)) {
                nameMap.set(newName, 1);
            } else {
                nameMap.set(newName, nameMap.get(newName)! + 1);
            }
        }
    }


    /**
     * 清理名称中的非法字符
     */
    private _sanitizeName(name: string): string {
        // 移除或替换路径中的非法字符
        return name.replace(/[\/\\:\*\?"<>\|]/g, '_');
    }

    /**
     * 生成唯一路径
     */
    private _generateUniquePath(uuid: string, name: string, parentUuid?: string): string {
        const parentPath = parentUuid ? this._uuidToPath.get(parentUuid) || '' : '';

        // 清理名称中的非法路径字符
        const cleanName = this._sanitizeName(name);

        // 检查名称是否唯一，如果不唯一则添加自增后缀
        const finalName = this.ensureUniqueName(parentUuid || 'root', cleanName);
        const finalPath = parentPath ? `${parentPath}/${finalName}` : `/${finalName}`;

        return finalPath;
    }

    /**
     * 确保节点名称在父节点下唯一
     */
    ensureUniqueName(parentUuid: string, baseName: string): string {
        if (!this._nodeNames.has(parentUuid)) {
            this._nodeNames.set(parentUuid, new Map());
        }

        const nameMap = this._nodeNames.get(parentUuid)!;

        if (!nameMap.has(baseName)) {
            nameMap.set(baseName, 1);
            return baseName;
        }

        // 名称已存在，添加自增后缀
        let counter = nameMap.get(baseName)! + 1;
        let newName = `${baseName}_${counter}`;

        // 确保新名称也不存在
        while (nameMap.has(newName)) {
            counter++;
            newName = `${baseName}_${counter}`;
        }

        nameMap.set(baseName, counter);
        nameMap.set(newName, 1);

        return newName;
    }
}
