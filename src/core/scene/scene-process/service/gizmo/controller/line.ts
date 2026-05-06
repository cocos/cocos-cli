'use strict';

import { Color, MeshRenderer, Node, Vec3 } from 'cc';

import ControllerBase from './base';
import ControllerUtils from '../utils/controller-utils';
import ControllerShape from '../utils/controller-shape';
import {
    getModel,
    updatePositions,
    setMeshColor,
    setNodeOpacity,
    updateBoundingBox,
} from '../utils/engine-utils';

class LineController extends ControllerBase {
    private _lineNode: Node | null = null;
    private _lineMR: MeshRenderer | null = null;

    constructor(rootNode: Node) {
        super(rootNode);
        this.initShape();
    }

    initShape() {
        this.createShapeNode('LineController');
        this._lineNode = this.createLineNode(new Vec3(), new Vec3(), 'LineNode', this._color);
        this._lineMR = getModel(this._lineNode);
    }

    setColor(color: Color) {
        this._color = color;
        setMeshColor(this._lineNode!, color);
    }

    setOpacity(opacity: number) {
        setNodeOpacity(this._lineNode!, opacity);
    }

    createLineNode(startPos: Vec3, endPos: Vec3, name: string, color: Color) {
        const lineData = ControllerShape.calcLineData(startPos, endPos);
        const lineNode = ControllerUtils.createShapeByData(lineData, color, { unlit: true });
        lineNode.name = name;
        lineNode.parent = this.shape;
        return lineNode;
    }

    updateData(startPos: Vec3, endPos: Vec3) {
        const lineData = ControllerShape.calcLineData(startPos, endPos);
        updatePositions(this._lineMR!, lineData.positions);
        updateBoundingBox(this._lineMR!, lineData.minPos, lineData.maxPos);
    }
}

export default LineController;
