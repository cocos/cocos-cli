'use strict';

import { MeshRenderer, Node, Vec3, Color } from 'cc';

import ControllerShape from '../utils/controller-shape';
import ControllerUtils from '../utils/controller-utils';
import ControllerBase from './base';
import { getModel, setMeshColor, updatePositions } from '../utils/engine-utils';

class TriangleController extends ControllerBase {
    private _edgesNode!: Node;
    private _edgesMR: MeshRenderer | null = null;
    private _indices: number[] = [0, 1, 1, 2, 2, 0];

    constructor(rootNode: Node) {
        super(rootNode);
        this.initShape();
    }

    public setColor(color: Color) {
        this._color = color;
        setMeshColor(this._edgesNode, color);
    }

    initShape() {
        this.createShapeNode('TriangleController');
        this._edgesNode = ControllerUtils.lines([new Vec3(), new Vec3(), new Vec3()],
            this._indices, this._color, { unlit: true });
        this._edgesMR = getModel(this._edgesNode);
        this._edgesNode.parent = this.shape;
    }

    updateData(v0: Vec3, v1: Vec3, v2: Vec3) {
        const linesData = ControllerShape.calcLinesData([v0, v1, v2], this._indices);
        this._edgesMR && updatePositions(this._edgesMR, linesData.positions);
    }

    getDistScalar() {
        return 1;
    }
}

export default TriangleController;
