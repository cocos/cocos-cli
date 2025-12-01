'use strict';

import type { Node } from 'cc';
import { EventEmitter } from 'events';

import * as ObjectWalker from '../missing-reporter/object-walker';
import utils from '../../../base/utils';
import pathManager from './node-path-manager';

const lodash = require('lodash');

export default class NodeManager extends EventEmitter {
    // 当前在场景树中的节点集合,包括在层级管理器中隐藏的
    allow = false;

    _map: { [index: string]: any } = {};

    private _parentChildren: Map<string, Set<string>> = new Map(); // 父节点UUID -> 子节点UUID集合

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
        pathManager.generateUniquePath(uuid, node.name, parentUuid);

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

        pathManager.remove(uuid);

        // 清理父子关系
        this._cleanupParentRelations(uuid);

        // this._recycle[uuid] = this._map[uuid];
        delete this._map[uuid];
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
        pathManager.clear();
        this._parentChildren.clear();
        // this._recycle = {};
    }


    /**
     * 更新节点名称和路径
     */
    updateNodeName(uuid: string, newName: string) {
        if (!this._map[uuid]) {
            return;
        }

        const node = this._map[uuid];

        // 获取父节点UUID
        const parentUuid = this._getParentUuid(uuid);
        pathManager.updateUuid(uuid, newName, parentUuid);
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
        const uuid = pathManager.getNodeUuid(path);
        if (uuid) {
            return this.getNode(uuid);
        }
        return null;
    }

    getNodePath(node: Node): string {
        return pathManager.getNodePath(node.uuid);
    }

    getNodeUuidByPath(path: string): string | null {
        const uuid = pathManager.getNodeUuid(path);
        const node = uuid && this.getNode(uuid);
        return node ? node.uuid : null;
    }

    getNodeByPathOrThrow(path: string): Node {
        const node = this.getNodeByPath(path);
        if (!node) {
            throw new Error(`找不到路径为 '${path}' 的节点`);
        }
        return node;
    }

    getNodeUuidByPathOrThrow(nodePath: string): string {
        const nodeUuid = this.getNodeUuidByPath(nodePath);
        if (!nodeUuid) {
            throw new Error(`找不到路径为 "${nodePath}" 的节点`);
        }
        return nodeUuid;
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

        // 更新节点路径
        pathManager.changeUuid(oldUUID, newUUID);

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
    }

    /**
     * 更新名称计数
     */
    private _updateNameCount(parentUuid: string, oldName: string | null, newName: string | null) {
        const nameMap = pathManager.getNameMap(parentUuid);
        if (!nameMap) {
            return;
        }

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
}
