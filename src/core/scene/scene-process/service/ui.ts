'use strict';

import { Mat4, Node, Rect, UITransform, Vec3 } from 'cc';
import { BaseService, register, Service } from './core';
import type { IUIService, IUIEvents, UIAlignType } from '../../common';

const v3_a = new Vec3();
const tempMatrix = new Mat4();

interface Item {
    node: Node;
    bounds: Rect;
}

function getNodeByPath(path: string): Node | null {
    const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
    return EditorExtends?.Node?.getNodeByPath?.(path) ?? null;
}

function getWorldBounds(node: Node): Rect {
    let width = 0;
    let height = 0;
    const rect = new Rect(0, 0, width, height);

    const uiTransComp: UITransform | null = node.getComponent(UITransform);
    if (uiTransComp) {
        const size = uiTransComp.contentSize;
        width = size.width;
        height = size.height;
        const anchor = uiTransComp.anchorPoint;

        rect.x = -anchor.x * width;
        rect.y = -anchor.y * height;
        rect.width = width;
        rect.height = height;
    }

    node.getWorldMatrix(tempMatrix);
    rect.transformMat4(tempMatrix);

    return rect;
}

function filterTopLevelNodes(nodes: Node[]): Node[] {
    return nodes.filter((node) => {
        let parent = node.parent;
        while (parent) {
            if (nodes.indexOf(parent) !== -1) {
                return false;
            }
            parent = parent.parent;
        }
        return true;
    });
}

@register('UI')
export class UIService extends BaseService<IUIEvents> implements IUIService {
    public alignSelection(type: UIAlignType) {
        const selectPaths = Service.Selection.query();

        if (selectPaths.length <= 1) {
            return;
        }

        let selectedNodes: Node[] = selectPaths.map((path: string) => {
            return getNodeByPath(path);
        }).filter(Boolean) as Node[];

        selectedNodes = filterTopLevelNodes(selectedNodes);

        let minX = 1e10;
        let minY = 1e10;
        let maxX = -1e10;
        let maxY = -1e10;

        const items: Item[] = selectedNodes.map((node) => {
            const bounds = getWorldBounds(node);

            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.xMax);
            maxY = Math.max(maxY, bounds.yMax);

            return {
                node: node,
                bounds: bounds,
            };
        });

        const aabb = new Rect(minX, minY, maxX - minX, maxY - minY);

        const uuids = selectedNodes.map((node) => node.uuid);
        const undoID = Service.Undo.beginRecording(uuids);

        items.forEach((item) => {
            const node = item.node;

            let dif;
            switch (type) {
                case 'top':
                    dif = new Vec3(0, aabb.yMax - item.bounds.yMax, 0);
                    break;
                case 'v-center':
                    dif = new Vec3(0, aabb.center.y - item.bounds.center.y, 0);
                    break;
                case 'bottom':
                    dif = new Vec3(0, aabb.y - item.bounds.y, 0);
                    break;
                case 'left':
                    dif = new Vec3(aabb.x - item.bounds.x, 0, 0);
                    break;
                case 'h-center':
                    dif = new Vec3(aabb.center.x - item.bounds.center.x, 0, 0);
                    break;
                case 'right':
                    dif = new Vec3(aabb.xMax - item.bounds.xMax, 0, 0);
                    break;
            }

            const worldPos = node.getWorldPosition();
            node.setWorldPosition(Vec3.add(v3_a, worldPos, dif));
        });

        Service.Undo.endRecording(undoID);
        this.emit('ui:align-selection', type);
    }

    public distributeSelection(type: UIAlignType) {
        const selectPaths = Service.Selection.query();

        if (selectPaths.length <= 1) {
            return;
        }

        let selectedNodes = selectPaths.map((path: string) => {
            return getNodeByPath(path);
        }).filter(Boolean) as Node[];

        selectedNodes = filterTopLevelNodes(selectedNodes);

        const items: Item[] = selectedNodes.map((node) => {
            const bounds = getWorldBounds(node);

            return {
                node: node,
                bounds: bounds,
            };
        });

        items.sort((a, b) => {
            let result = 1;
            switch (type) {
                case 'top':
                    result = a.bounds.yMax - b.bounds.yMax;
                    break;
                case 'v-center':
                    result = a.bounds.center.y - b.bounds.center.y;
                    break;
                case 'bottom':
                    result = a.bounds.y - b.bounds.y;
                    break;
                case 'left':
                    result = a.bounds.x - b.bounds.x;
                    break;
                case 'h-center':
                    result = a.bounds.center.x - b.bounds.center.x;
                    break;
                case 'right':
                    result = a.bounds.xMax - b.bounds.xMax;
                    break;
            }

            return result;
        });

        const length = items.length - 1;
        const first = items[0].bounds;
        const last = items[length].bounds;

        const uuids = selectedNodes.map((node) => node.uuid);
        const undoID = Service.Undo.beginRecording(uuids);

        items.forEach((item, i) => {
            const node = item.node;
            const bounds = item.bounds;
            let dif;

            switch (type) {
                case 'top':
                    dif = new Vec3(0, first.yMax + ((last.yMax - first.yMax) * i) / length - bounds.yMax, 0);
                    break;
                case 'v-center':
                    dif = new Vec3(0, first.center.y + ((last.center.y - first.center.y) * i) / length - bounds.center.y, 0);
                    break;
                case 'bottom':
                    dif = new Vec3(0, first.y + ((last.y - first.y) * i) / length - bounds.y, 0);
                    break;
                case 'left':
                    dif = new Vec3(first.x + ((last.x - first.x) * i) / length - bounds.x, 0, 0);
                    break;
                case 'h-center':
                    dif = new Vec3(first.center.x + ((last.center.x - first.center.x) * i) / length - bounds.center.x, 0, 0);
                    break;
                case 'right':
                    dif = new Vec3(first.xMax + ((last.xMax - first.xMax) * i) / length - bounds.xMax, 0, 0);
                    break;
            }

            const worldPos = node.getWorldPosition();
            node.setWorldPosition(Vec3.add(v3_a, worldPos, dif));
        });

        Service.Undo.endRecording(undoID);
        this.emit('ui:distribute-selection', type);
    }
}
