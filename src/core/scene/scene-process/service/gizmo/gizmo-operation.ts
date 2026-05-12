'use strict';

import { CCObject, Color, Layers, Node, Vec3, director } from 'cc';
import { OperationPriority } from '../operation/types';
import type { ISceneMouseEvent, ISceneKeyboardEvent } from '../operation/types';
import { GizmoMouseEvent } from './utils/defines';
import { getRaycastResults, raycast, RaycastResults } from './utils/engine-utils';
import { getRaycastResultNodes, getRegionNodes } from './utils/node-utils';
import { getSelectNode } from './utils/selection-utils';

function getService(): any {
    try {
        const { Service } = require('../core/decorator');
        return Service;
    } catch (e) {
        return null;
    }
}

function getServiceProp(name: string): any {
    try {
        return getService()?.[name];
    } catch (e) {
        return null;
    }
}

function getNodeByUuid(uuid: string): Node | null {
    const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
    return EditorExtends?.Node?.getNode?.(uuid) ?? null;
}

/**
 * 与编辑器 adjustY 一致：将浏览器 Y（从顶部向下）翻转为屏幕坐标 Y（从底部向上）
 */
function adjustY(y: number): number {
    const canvas = (cc as any).game?.canvas;
    const height = canvas ? canvas.height : 720;
    return height - y;
}

/**
 * Create a GizmoMouseEvent from an ISceneMouseEvent
 */
function createGizmoMouseEvent(type: string, event: ISceneMouseEvent): GizmoMouseEvent {
    const gme = new GizmoMouseEvent(type, true);
    gme.x = event.x;
    gme.y = adjustY(event.y);
    gme.clientX = event.clientX;
    gme.clientY = event.clientY;
    gme.deltaX = event.deltaX;
    gme.deltaY = event.deltaY;
    gme.wheelDeltaX = event.wheelDeltaX;
    gme.wheelDeltaY = event.wheelDeltaY;
    gme.ctrlKey = event.ctrlKey;
    gme.shiftKey = event.shiftKey;
    gme.altKey = event.altKey;
    gme.metaKey = event.metaKey;
    gme.leftButton = event.leftButton;
    gme.middleButton = event.middleButton;
    gme.rightButton = event.rightButton;
    gme.moveDeltaX = event.moveDeltaX;
    gme.moveDeltaY = -(event.moveDeltaY); // invert Y
    gme.button = event.button;
    gme.buttons = event.buttons;
    gme.movementX = event.movementX;
    gme.movementY = event.movementY;
    return gme;
}

class GizmoOperation {
    private _regionSelecting = false;
    private _gizmoMoved = false;
    private _hoverInNodeMap: Map<Node, boolean> = new Map();
    private _curMouseDownInfos: { node: Node; hitPoint: Vec3 }[] = [];
    private _gizmoMouseDownEvent: GizmoMouseEvent | null = null;
    private _noGizmoMouseDownEvent: GizmoMouseEvent | null = null;
    private _mouseDownRaycastGizmos: RaycastResults | null = null;
    private _anyKeyDown = false;

    /**
     * Raycast against gizmo nodes
     * 与编辑器一致：优先检测右上角 SceneGizmo，再检测 gizmo root
     */
    private raycastGizmos(x: number, y: number): RaycastResults {
        const gizmoSvc = getServiceProp('Gizmo');

        const sceneGizmoCamera = gizmoSvc?.sceneGizmoCamera?.camera;
        if (sceneGizmoCamera) {
            const results = raycast(
                director.getScene()?.renderScene,
                sceneGizmoCamera,
                Layers.Enum.SCENE_GIZMO,
                x, y,
            );
            if (results && results.length > 0) {
                return results;
            }
        }

        const gizmoRoot = gizmoSvc?.gizmoRootNode;
        if (!gizmoRoot) return new RaycastResults(null as any);

        return getRaycastResults(gizmoRoot, x, y, Infinity, Layers.Enum.IGNORE_RAYCAST);
    }

    private _emitEventToNode(node: Node, event: GizmoMouseEvent) {
        if (event.type) {
            node.emit(event.type, event);
            getServiceProp('Engine')?.repaintInEditMode?.();
        }
    }

    // --- Not-on-gizmo handlers ---

    private _onNotGizmoMouseDown(_event: GizmoMouseEvent) {
        // placeholder for region select start
    }

    private _onNotGizmoMouseUp(event: GizmoMouseEvent): boolean | void {
        const isViewMode = getServiceProp('Gizmo')?.transformToolData?.viewMode === 'view';
        const cameraCtrl = getServiceProp('Camera')?.controller;
        if (event.leftButton && !isViewMode && !cameraCtrl?.isMoving?.()) {
            if (this._regionSelecting) {
                this._regionSelecting = false;
                this._hideSelectionRegion();
            } else {
                this._selectNode(event);
            }
        }
    }

    private _onNotGizmoMouseMove(event: GizmoMouseEvent): boolean | undefined {
        if (this._anyKeyDown) return true;

        const downEvent = this._noGizmoMouseDownEvent;
        const isViewMode = getServiceProp('Gizmo')?.transformToolData?.viewMode === 'view';
        if (event.leftButton && downEvent && !isViewMode) {
            const dx = event.x - downEvent.x;
            const dy = event.y - downEvent.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 10) return false;
            this._regionSelecting = true;
            const revertX = downEvent.x > event.x;
            const revertY = downEvent.y < event.y;
            const left = revertX ? event.x : downEvent.x;
            const right = revertX ? downEvent.x : event.x;
            const bottom = revertY ? downEvent.y : event.y;
            const top = revertY ? event.y : downEvent.y;
            this._regionSelectNode(left, right, top, bottom, event.metaKey || event.ctrlKey);
            return false;
        }
        return undefined;
    }

    // --- Gizmo-hit handlers ---

    private _onGizmoMouseDown(event: GizmoMouseEvent, results: RaycastResults): boolean {
        // 与 cocos-editor 一致：相机移动中不处理 gizmo 交互
        const cameraCtrl = getServiceProp('Camera')?.controller;
        if (cameraCtrl?.isMoving?.()) return true;

        if (event.leftButton) {
            for (const info of results) {
                const backInfo = {
                    node: info.node,
                    hitPoint: info.hitPoint ? info.hitPoint.clone() : new Vec3(),
                };
                this._curMouseDownInfos.push(backInfo);
                event.hitPoint = backInfo.hitPoint;
                this._emitEventToNode(info.node, event);
                if (event.propagationStopped) break;
            }
            return false;
        }
        return true;
    }

    private _onGizmoMouseUp(event: GizmoMouseEvent): boolean {
        // 与 cocos-editor 一致：相机移动中不处理
        const cameraCtrl = getServiceProp('Camera')?.controller;
        if (cameraCtrl?.isMoving?.()) return true;

        if (this._curMouseDownInfos.length > 0) {
            for (const info of this._curMouseDownInfos) {
                event.hitPoint = info.hitPoint;
                this._emitEventToNode(info.node, event);
                if (event.propagationStopped) break;
            }
            this._curMouseDownInfos.length = 0;

            return false;
        }

        // 与 cocos-editor 一致：没有 mouseDown 记录时，对当前位置 raycast 并发送事件
        const { x, y } = event;
        const results = this.raycastGizmos(x, y);
        for (let i = 0; i < results.length; i++) {
            this._emitEventToNode(results[i].node, event);
            if (event.propagationStopped) break;
        }
        return true;
    }

    private _onGizmoMouseMove(event: GizmoMouseEvent, results: RaycastResults) {
        if (this._curMouseDownInfos.length > 0) {
            const map = new Map<Node, Vec3>();
            results.forEach((info: any) => map.set(info.node, info.hitPoint || new Vec3()));
            for (const info of this._curMouseDownInfos) {
                event.hitPoint = map.get(info.node) || new Vec3();
                this._emitEventToNode(info.node, event);
                if (event.propagationStopped) break;
            }
        }
    }

    // --- Main event handlers ---

    public onMouseDown(event: ISceneMouseEvent): boolean | void {
        this._gizmoMoved = false;
        this._anyKeyDown = event.altKey || event.ctrlKey || event.shiftKey || event.metaKey;

        const customEvent = createGizmoMouseEvent('mouseDown', event);

        // 与 cocos-editor 一致：不区分按键，始终做 raycast
        const results = this.raycastGizmos(customEvent.x, customEvent.y);
        this._mouseDownRaycastGizmos = results;

        if (results.length > 0) {
            this._gizmoMouseDownEvent = customEvent;
            return this._onGizmoMouseDown(customEvent, results);
        }

        this._noGizmoMouseDownEvent = customEvent;
        this._onNotGizmoMouseDown(customEvent);
    }

    public onMouseUp(event: ISceneMouseEvent): boolean | void {
        this._anyKeyDown = false;
        const customEvent = createGizmoMouseEvent('mouseUp', event);

        if (this._mouseDownRaycastGizmos && this._mouseDownRaycastGizmos.length > 0) {
            if (!this._gizmoMouseDownEvent) return true;
            this._gizmoMouseDownEvent = null;
            return this._onGizmoMouseUp(customEvent);
        } else {
            if (!this._noGizmoMouseDownEvent) return true;
            this._noGizmoMouseDownEvent = null;
            return this._onNotGizmoMouseUp(customEvent);
        }
    }

    public onMouseMove(event: ISceneMouseEvent): boolean | void {
        this._gizmoMoved = true;
        const customEvent = createGizmoMouseEvent('mouseMove', event);
        const results = this.raycastGizmos(customEvent.x, customEvent.y);

        if (this._mouseDownRaycastGizmos && this._mouseDownRaycastGizmos.length > 0) {
            if (!this._gizmoMouseDownEvent) {
                return this._changeMouseHover(customEvent, results);
            }
            return this._onGizmoMouseMove(customEvent, results);
        } else {
            if (!this._noGizmoMouseDownEvent) {
                return this._changeMouseHover(customEvent, results);
            }
            return this._onNotGizmoMouseMove(customEvent);
        }
    }

    public onMouseWheel() {}

    private _changeMouseHover(event: GizmoMouseEvent, results: RaycastResults): boolean {
        if (this._anyKeyDown) {
            return true;
        }

        // 与编辑器一致：vertexSnap 检查
        const selection = getServiceProp('Selection');
        const uuids: string[] = selection?.query?.() ?? [];
        if (uuids[0]) {
            const node = getNodeByUuid(uuids[0]);
            if (node) {
                const res = getServiceProp('Gizmo')?.callAllGizmoFuncOfNode?.(node, 'onVertexSnapMove', event);
                if (res === false) {
                    return false;
                }
            }
        }

        let hoverInNode: Node | null = null;
        const tempSet: Set<Node> = new Set();
        const hitPoint = new Vec3();

        if (results.length > 0) {
            const ray = results.ray;
            for (let i = 0; i < results.length; i++) {
                if (ray) {
                    Vec3.multiplyScalar(hitPoint, ray.d, results[i].distance);
                    Vec3.add(hitPoint, ray.o, hitPoint);
                    event.hitPoint = hitPoint;
                } else {
                    event.hitPoint = results[i].hitPoint;
                }
                results[i].node.emit(event.type, event);
            }

            for (const info of results) {
                tempSet.add(info.node);
                if (!this._hoverInNodeMap.has(info.node)) {
                    hoverInNode = info.node;
                    this._hoverInNodeMap.set(info.node, event.propagationStopped);
                }
                if (this._hoverInNodeMap.get(info.node)) break;
            }
        }

        // hoverOut
        this._hoverInNodeMap.forEach((_bool, node) => {
            if (!tempSet.has(node)) {
                event.type = 'hoverOut';
                event.customData = { hoverInNodeMap: this._hoverInNodeMap };
                this._emitEventToNode(node, event);
                this._hoverInNodeMap.delete(node);
            }
        });

        // hoverIn after hoverOut
        if (hoverInNode) {
            event.type = 'hoverIn';
            this._emitEventToNode(hoverInNode, event);
        }

        return true;
    }

    // --- Node selection ---

    private _selectNode(event: GizmoMouseEvent) {
        const camera = getServiceProp('Camera')?.getCamera?.()?.camera;
        if (!camera) return;

        const mask = Layers.makeMaskExclude([
            Layers.Enum.GIZMOS,
            Layers.Enum.SCENE_GIZMO,
            Layers.Enum.EDITOR,
            Layers.Enum.IGNORE_RAYCAST,
        ]);
        const nodes = getRaycastResultNodes(camera, event.x, event.y, mask);
        const selection = getServiceProp('Selection');

        if (nodes.length > 0) {
            let resultNode: Node | null = null;
            for (const checkNode of nodes) {
                if (checkNode._objFlags & CCObject.Flags.LockedInEditor) continue;
                resultNode = checkNode;
                break;
            }
            if (!resultNode) return;

            const curSelections = selection?.query?.() ?? [];

            if (!event.ctrlKey && !event.shiftKey) {
                selection?.clear?.();
            }

            if (event.ctrlKey) {
                if (curSelections.includes(resultNode.uuid)) {
                    selection?.unselect?.(resultNode.uuid);
                } else {
                    selection?.select?.(resultNode.uuid);
                }
            } else {
                resultNode = getSelectNode(nodes, curSelections[0]);
                selection?.select?.(resultNode.uuid);
            }
        } else {
            if (event.leftButton && !event.ctrlKey && !event.shiftKey) {
                selection?.clear?.();
            }
        }
    }

    private _regionSelectNode(
        left: number, right: number, top: number, bottom: number, _multiple: boolean,
    ) {
        this._showSelectionRegion(left, right, top, bottom);

        const camera = getServiceProp('Camera')?.getCamera?.()?.camera;
        if (!camera) return;

        const mask = Layers.makeMaskExclude([
            Layers.Enum.GIZMOS,
            Layers.Enum.SCENE_GIZMO,
            Layers.Enum.EDITOR,
        ]);
        const nodes = getRegionNodes(camera, left, right, top, bottom, mask);
        const selection = getServiceProp('Selection');

        const selectSet = new Set<string>(selection?.query?.() ?? []);
        nodes.forEach((node: Node) => {
            if (!selectSet.has(node.uuid)) {
                selection?.select?.(node.uuid);
            }
            selectSet.delete(node.uuid);
        });
        for (const uuid of selectSet.keys()) {
            selection?.unselect?.(uuid);
        }
    }

    private _showSelectionRegion(left: number, right: number, top: number, bottom: number) {
        const cameraComp = getServiceProp('Camera')?.getCamera?.();
        if (!cameraComp) return;

        const pos0 = new Vec3(left, bottom, 0.1);
        const pos1 = new Vec3(right, bottom, 0.1);
        const pos2 = new Vec3(right, top, 0.1);
        const pos3 = new Vec3(left, top, 0.1);
        const p0 = new Vec3();
        const p1 = new Vec3();
        const p2 = new Vec3();
        const p3 = new Vec3();
        cameraComp.screenToWorld(pos0, p0);
        cameraComp.screenToWorld(pos1, p1);
        cameraComp.screenToWorld(pos2, p2);
        cameraComp.screenToWorld(pos3, p3);

        const geometryRenderer = getServiceProp('Engine')?.getGeometryRenderer?.();
        if (geometryRenderer) {
            geometryRenderer.removeData('addQuad');
            geometryRenderer.addQuad(p0, p1, p2, p3, new Color(255, 255, 255, 120), false, false, true);
        }
        getServiceProp('Engine')?.repaintInEditMode?.();
    }

    private _hideSelectionRegion() {
        getServiceProp('Engine')?.getGeometryRenderer?.()?.removeData('addQuad');
        getServiceProp('Engine')?.repaintInEditMode?.();
    }

    // --- Keyboard ---

    public onKeyDown(event: ISceneKeyboardEvent): boolean | void {
        if (this._regionSelecting) return false;

        const selection = getServiceProp('Selection');
        const uuids: string[] = selection?.query?.() ?? [];
        if (uuids.length > 0) {
            const node = getNodeByUuid(uuids[0]);
            if (node) {
                const res = getServiceProp('Gizmo')?.callAllGizmoFuncOfNode?.(node, 'onKeyDown', event);
                return res;
            }
        }
        return true;
    }

    public onKeyUp(event: ISceneKeyboardEvent): boolean | void {
        const selection = getServiceProp('Selection');
        const uuids: string[] = selection?.query?.() ?? [];
        if (uuids.length > 0) {
            const node = getNodeByUuid(uuids[0]);
            if (node) {
                const res = getServiceProp('Gizmo')?.callAllGizmoFuncOfNode?.(node, 'onKeyUp', event);
                return res;
            }
        }
        return true;
    }

    // --- Lifecycle ---

    public init() {
        const operationMgr = getServiceProp('Operation');
        if (operationMgr) {
            operationMgr.addListener('mousedown', this.onMouseDown.bind(this), OperationPriority.Gizmo);
            operationMgr.addListener('mousemove', this.onMouseMove.bind(this), OperationPriority.Gizmo);
            operationMgr.addListener('mouseup', this.onMouseUp.bind(this), OperationPriority.Gizmo);
            operationMgr.addListener('mousewheel', this.onMouseWheel.bind(this), OperationPriority.Gizmo);
            operationMgr.addListener('keydown', this.onKeyDown.bind(this), OperationPriority.Gizmo);
            operationMgr.addListener('keyup', this.onKeyUp.bind(this), OperationPriority.Gizmo);
        }
    }

    public clear() {
        this._gizmoMouseDownEvent = null;
        this._noGizmoMouseDownEvent = null;
        this._hoverInNodeMap.clear();
        this._curMouseDownInfos.length = 0;
    }
}

export default GizmoOperation;
