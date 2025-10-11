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
    // 被删除节点集合,为了undo，编辑器不会把Node删除
    // _recycle: { [index: string]: any } = {};

    /**
     * 新增一个节点，当引擎将一个节点添加到场景树中，同时会遍历子节点，递归的调用这个方法。
     * @param uuid
     * @param node
     */
    add(uuid: string, node: any) {
        if (!this.allow) {
            return;
        }
        this._map[uuid] = node;

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
        // this._recycle = {};
    }

    /**
     * 获取一个节点数据，查的范围包括被删除的节点
     * @param uuid
     */
    getNode(uuid: string): Node | null {
        return this._map[uuid] ?? null;
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
}
