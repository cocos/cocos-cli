import { assetManager, Color, Node, Vec2, Vec3 } from 'cc';

import ControllerBase from './base';
import ControllerUtils from '../utils/controller-utils';
import ControllerShape from '../utils/controller-shape';
import type { GizmoMouseEvent } from '../utils/defines';
import { setMaterialProperty, updatePositions, getModel } from '../utils/engine-utils';

function repaintEngine(): void {
    try {
        const { Service } = require('../../core/decorator');
        Service.Engine?.repaintInEditMode?.();
    } catch (e) {
        // not ready
    }
}

class ImageController extends ControllerBase {
    private _center: Vec3 = new Vec3();
    private _size: Vec2 = new Vec2(100, 100);
    private _imageNode: Node | null = null;

    constructor(rootNode: Node, opts?: any) {
        super(rootNode);
        this.initShape(opts);
    }

    initShape(opts?: any) {
        this.createShapeNode('ImageController');
        this._imageNode = ControllerUtils.quad(this._center, this._size.x, this._size.y, Vec3.UNIT_Z, Color.WHITE, opts);
        this._imageNode!.parent = this.shape;
        this._imageNode!.position = new Vec3(0, 0, -0.01);
        this.registerMouseEvents(this._imageNode!, 'image');
    }

    setTexture(texture: any) {
        setMaterialProperty(this._imageNode!, 'mainTexture', texture);
    }

    setTextureByUUID(uuid: string) {
        assetManager.loadAny(uuid, (err: any, img: any) => {
            if (img) {
                this.setTexture(img);
                repaintEngine();
            }
        });
    }

    updateSize(center: Vec3, size: Vec2) {
        this._center = center;
        this._size = size;

        const quadData = ControllerShape.calcQuadData(this._center, this._size.x, this._size.y, Vec3.UNIT_Z);
        if (!this._imageNode) return;
        const mr = getModel(this._imageNode);
        if (mr && mr.model) {
            mr.model.createBoundingShape(quadData.minPos, quadData.maxPos);
            mr.model.updateWorldBound();
            updatePositions(mr, quadData.positions);
        }
    }

    protected onMouseDown(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (this.onControllerMouseDown) {
            this.onControllerMouseDown(event);
        }
    }

    protected onMouseMove(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (this.onControllerMouseMove) {
            this.onControllerMouseMove(event);
        }
    }

    protected onMouseUp(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (this.onControllerMouseUp) {
            this.onControllerMouseUp(event);
        }
    }
}

export default ImageController;
