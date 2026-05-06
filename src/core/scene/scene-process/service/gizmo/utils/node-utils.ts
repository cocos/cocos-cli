'use strict';

import { CCObject, geometry, Layers, Mat4, Node, Rect, UITransform, Vec2, Vec3, director } from 'cc';
import { ray } from './engine-utils';
import raycastUtil from './raycast';

function getEditorCamera(): any {
    try {
        const { Service } = require('../../core/decorator');
        return Service.Camera?.getCamera?.();
    } catch (e) {
        return null;
    }
}

/**
 * 判断是否编辑器节点
 */
export function isEditorNode(node: Node): boolean {
    if (node.layer & Layers.Enum.GIZMOS) return true;
    if (node.layer & Layers.Enum.SCENE_GIZMO) return true;
    if (node.layer & Layers.Enum.EDITOR) return true;
    return false;
}

/**
 * 对场景节点做射线检测，排除编辑器层和锁定节点
 * 与编辑器一致：使用 raycastAll 合并 3D 模型和 2D Canvas 的检测结果
 * Returns array of nodes sorted by distance
 */
export function getRaycastResultNodes(
    camera: any,
    x: number,
    y: number,
    mask: number = ~Layers.Enum.SCENE_GIZMO,
): Node[] {
    if (!camera) return [];

    camera.screenPointToRay(ray, x, y);
    const scene = director.getScene()?.renderScene;
    if (!scene) return [];

    const resultNodes: Node[] = [];

    if (raycastUtil.raycastAll(scene, ray, mask, Infinity, false, undefined, new Vec2(x, y))) {
        const allResults = raycastUtil.rayResultAll;
        for (const result of allResults) {
            const node = result.node;
            if (isEditorNode(node)) continue;
            if (node._objFlags & CCObject.Flags.LockedInEditor) continue;
            if (node._objFlags & CCObject.Flags.HideInHierarchy) continue;
            resultNodes.push(node);
        }
    }

    return resultNodes;
}

const regionTargetClassName: string[] = [
    'cc.UITransform',
    'cc.SpriteRenderer',
    'cc.Camera',
    'cc.DirectionalLight',
    'cc.Terrain',
    'cc.SphereLight',
    'cc.ParticleSystem',
    'cc.SpotLight',
];

function hasComponent(node: Node, classNames: string[]): boolean {
    for (const name of classNames) {
        if (node.getComponent(name)) return true;
    }
    return false;
}

function inRegion(x: number, y: number, left: number, right: number, top: number, bottom: number): boolean {
    return x >= left && x <= right && y <= top && y >= bottom;
}

interface RegionCollectMap {
    prefabs: { prefab: Node; models: any[]; nodes: Node[] }[];
    models: any[];
    nodes: Node[];
}

function collectNodesForRegion(shouldFilterForeground = true): RegionCollectMap {
    const collectMap: RegionCollectMap = {
        prefabs: [],
        models: [],
        nodes: [],
    };

    const collectPrefab = (prefabRoot: Node, collects: RegionCollectMap) => {
        const target = {
            prefab: prefabRoot,
            models: [] as any[],
            nodes: [] as Node[],
        };
        prefabRoot.walk((child: Node) => {
            collectNodeAndModel(child, target);
        });
        collects.prefabs.push(target);
    };

    const collectNodeAndModel = (node: Node, collects: any) => {
        if (hasComponent(node, regionTargetClassName)) {
            collects.nodes.push(node);
        } else if (hasComponent(node, ['cc.MeshRenderer', 'cc.SkinnedMeshRenderer'])) {
            const com = (node.getComponent('cc.MeshRenderer') || node.getComponent('cc.SkinnedMeshRenderer')) as any;
            if (com?.model) {
                const editorCam = getEditorCamera()?.camera;
                if (!director.getScene()?.renderScene?.isCulledByLod?.(editorCam, com.model)) {
                    collects.models.push(com.model);
                }
            }
        }
    };

    const collect = (child: Node, ignoreForPrefabMode = false) => {
        // @ts-ignore
        if (child['_prefab']) {
            // @ts-ignore
            if (!(ignoreForPrefabMode && !child?.['_prefab'].instance)) {
                collectPrefab(child, collectMap);
                return;
            }
        }
        collectNodeAndModel(child, collectMap);
        child.children.forEach((c: Node) => {
            collect(c);
        });
    };

    director.getScene()?.children.forEach((child: Node) => {
        if (child.name === 'Editor Scene Foreground' && shouldFilterForeground) {
            return;
        }
        if (child.name === 'Editor Scene Background') {
            return;
        }
        collect(child, true);
    });

    return collectMap;
}

function isNodeInRegion(node: Node, camera: any, left: number, right: number, top: number, bottom: number): boolean {
    const scenePos = new Vec3();
    camera.worldToScreen(scenePos, node.worldPosition);
    return inRegion(scenePos.x, scenePos.y, left, right, top, bottom);
}

function isModelInRegion(m: any, camera: any, left: number, right: number, top: number, bottom: number): boolean {
    if (!m.worldBounds) return false;
    const keys = ['x', 'y', 'z'];
    const operations = [1, -1];
    const center = m.worldBounds.center;
    const point = new Vec3();
    camera.worldToScreen(point, center);
    if (inRegion(point.x, point.y, left, right, top, bottom)) {
        const half = m.worldBounds.halfExtents;
        for (const key of keys) {
            for (const v of operations) {
                const target = new Vec3(center);
                // @ts-ignore
                target[key] = target[key] + v * half[key];
                camera.worldToScreen(point, target);
                if (!inRegion(point.x, point.y, left, right, top, bottom)) {
                    return false;
                }
            }
        }
        return true;
    }
    return false;
}

/**
 * 框选场景节点算法
 */
export function getRegionNodes(
    camera: any,
    left: number,
    right: number,
    top: number,
    bottom: number,
    mask: number = ~Layers.Enum.SCENE_GIZMO,
): Node[] {
    if (!camera) return [];

    const resultNodes: Node[] = [];
    const collectMap = collectNodesForRegion();

    // 遍历prefab,子节点被选中就选中整个prefab
    collectMap.prefabs.forEach(prefab => {
        for (const node of prefab.nodes) {
            if (isNodeInRegion(node, camera, left, right, top, bottom)) {
                resultNodes.push(prefab.prefab);
                return;
            }
        }
        for (const m of prefab.models) {
            const transform = m.transform;
            if (!transform || !m.enabled || !(m.node.layer & mask) || !m.worldBounds) {
                return;
            }
            if (isModelInRegion(m, camera, left, right, top, bottom)) {
                resultNodes.push(prefab.prefab);
                return;
            }
        }
    });

    collectMap.nodes.forEach(node => {
        if (isNodeInRegion(node, camera, left, right, top, bottom)) {
            resultNodes.push(node);
        }
    });

    // 遍历所有的model
    collectMap.models.forEach(m => {
        const transform = m.transform;
        if (!transform || !m.enabled || !(m.node.layer & mask) || !m.worldBounds) {
            return;
        }
        if (isModelInRegion(m, camera, left, right, top, bottom)) {
            resultNodes.push(m.node);
        }
    });

    return resultNodes;
}

export function getNodeWorldBounds(node: Node): Rect {
    let width = 0, height = 0;
    const rect = new Rect(0, 0, 0, 0);

    const uiComp = node.getComponent(UITransform);
    if (uiComp) {
        width = uiComp.contentSize.width;
        height = uiComp.contentSize.height;
        const anchor = uiComp.anchorPoint;
        rect.x = -anchor.x * width;
        rect.y = -anchor.y * height;
        rect.width = width;
        rect.height = height;
    }

    const mat = new Mat4();
    node.getWorldMatrix(mat);
    rect.transformMat4(mat);
    return rect;
}

export function getNodeWorldOrientedBounds(node: Node): Vec3[] {
    const mat = new Mat4();
    node.getWorldMatrix(mat);

    let width = 0, height = 0;
    const rect = new Rect(0, 0, 0, 0);

    const uiComp = node.getComponent(UITransform);
    if (uiComp) {
        width = uiComp.contentSize.width;
        height = uiComp.contentSize.height;
        const anchor = uiComp.anchorPoint;
        rect.x = -anchor.x * width;
        rect.y = -anchor.y * height;
        rect.width = width;
        rect.height = height;
    }

    const bl = new Vec3(rect.x, rect.y, 0);
    const tl = new Vec3(rect.x, rect.y + rect.height, 0);
    const tr = new Vec3(rect.x + rect.width, rect.y + rect.height, 0);
    const br = new Vec3(rect.x + rect.width, rect.y, 0);
    Vec3.transformMat4(bl, bl, mat);
    Vec3.transformMat4(tl, tl, mat);
    Vec3.transformMat4(tr, tr, mat);
    Vec3.transformMat4(br, br, mat);

    const worldPos = node.getWorldPosition();
    bl.z = tl.z = tr.z = br.z = worldPos.z;

    return [bl, tl, tr, br];
}
