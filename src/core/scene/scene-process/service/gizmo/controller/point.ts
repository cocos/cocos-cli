'use strict';

import { Color, Node, Vec3 } from 'cc';

import ControllerUtils from '../utils/controller-utils';
import ControllerBase from './base';
import { setMeshColor } from '../utils/engine-utils';

class PointController extends ControllerBase {
    private _pointNode: Node | null = null;
    constructor(rootNode: Node) {
        super(rootNode);
        this._color = Color.GREEN;
        this.initShape();
    }

    setColor(color: Color) {
        this._color = color;
        setMeshColor(this._pointNode!, color);
    }

    initShape() {
        this.createShapeNode('PointController');
        this._pointNode = ControllerUtils.sphere(new Vec3(), 0.05, this._color, { unlit: true });
        this._pointNode.parent = this.shape;
    }

    updateData(pos: Vec3) {
        this._pointNode?.setPosition(pos);
    }
}

export default PointController;
