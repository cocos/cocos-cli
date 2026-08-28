import { Canvas, Color, Label, Node, Size, UITransform, Vec2, Vec3 } from 'cc';

import { RectangleController } from '../../node/rectangle-controller';
import { create3DNode } from '../../utils/engine-utils';
import type { IRectangleControllerOption } from '../../utils/defines';

const tempVec3 = new Vec3();

export default class LODController extends RectangleController {
    static readonly LABEL_CONTENT_SIZE = new Size(180, 40);
    static readonly FONT_COLOR = new Color(204, 204, 204, 255);
    static readonly OUTLINE_COLOR = new Color(5, 5, 5, 220);
    static readonly FONT_SIZE = 32;

    private readonly _canvasNode: Node;
    private readonly _label: Label;
    private readonly _labelTransform: UITransform;

    constructor(rootNode: Node, options: IRectangleControllerOption = {}) {
        super(rootNode, options);

        this._canvasNode = create3DNode('LOD Gizmo Canvas');
        const canvas = this._canvasNode.addComponent(Canvas);
        (canvas as Canvas & { fitDesignResolution_EDITOR?: () => void }).fitDesignResolution_EDITOR = () => {};
        this._canvasNode.setParent(rootNode);
        this.shape.setParent(this._canvasNode);
        this.shape.name = 'LOD Gizmo Controller';

        const labelNode = new Node('LOD Level');
        this._label = labelNode.addComponent(Label);
        this._labelTransform = this._label.getComponent(UITransform)!;
        this._labelTransform.setContentSize(LODController.LABEL_CONTENT_SIZE);
        this._labelTransform.anchorPoint.set(0.5, 1);
        this._label.color = LODController.FONT_COLOR;
        this._label.fontSize = LODController.FONT_SIZE;
        this._label.lineHeight = LODController.FONT_SIZE;
        this._label.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._label.verticalAlign = Label.VerticalAlign.CENTER;
        this._label.enableOutline = true;
        this._label.outlineColor = LODController.OUTLINE_COLOR;
        this._label.outlineWidth = 2;
        labelNode.setParent(this.shape);
    }

    destroy(): void {
        this.unregisterCameraMoveEvent();
        if (this._canvasNode.isValid) {
            this._canvasNode.destroy();
        }
    }

    setString(value: string): void {
        this._label.string = value;
    }

    updateSize(center: Readonly<Vec3>, size: Vec2): void {
        super.updateSize(center, size);
        tempVec3.set(0, -size.y / 2, 0);
        this._label.node.setPosition(tempVec3);
    }

    adjustControllerSize(): void {
        super.adjustControllerSize();
        const scale = this.getDistScalar() / 4;
        tempVec3.set(scale, scale, scale);
        this._label.node.setScale(tempVec3);
    }
}
