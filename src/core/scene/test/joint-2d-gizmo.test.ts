export {};

const mockRegisterGizmo = jest.fn();
const mockControllerInstances: any[] = [];
const mockLineControllerInstances: any[] = [];
const mockChangedNodes: any[] = [];
const mockControlBegins: Array<string | null> = [];
const mockControlUpdates: Array<string | null> = [];
const mockControlEnds: Array<string | null> = [];
const mockCommitChanges = jest.fn(async () => undefined);
const mockGizmoRoot = { name: 'gizmoRoot' };

jest.mock('cc', () => {
    class MockColor {
        static readonly BLUE = new MockColor(0, 0, 255, 255);
        static readonly YELLOW = new MockColor(255, 255, 0, 255);

        constructor(
            public r = 0,
            public g = 0,
            public b = 0,
            public a = 255,
        ) {}
    }

    class MockVec2 {
        constructor(public x = 0, public y = 0) {}
    }

    class MockVec3 {
        static readonly ZERO = new MockVec3();
        static readonly UNIT_Z = new MockVec3(0, 0, 1);

        constructor(public x = 0, public y = 0, public z = 0) {}

        set(value: { x: number; y: number; z?: number }): this;
        set(x: number, y: number, z?: number): this;
        set(valueOrX: number | { x: number; y: number; z?: number }, y?: number, z = 0): this {
            if (typeof valueOrX === 'number') {
                this.x = valueOrX;
                this.y = y ?? 0;
                this.z = z;
            } else {
                this.x = valueOrX.x;
                this.y = valueOrX.y;
                this.z = valueOrX.z ?? 0;
            }
            return this;
        }

        static transformMat4(out: MockVec3, value: MockVec3, matrix: MockMat4): MockVec3 {
            const x = value.x;
            const y = value.y;
            const z = value.z;
            out.x = x * matrix.scaleX + matrix.translateX;
            out.y = y * matrix.scaleY + matrix.translateY;
            out.z = z * matrix.scaleZ + matrix.translateZ;
            return out;
        }
    }

    class MockMat4 {
        translateX = 0;
        translateY = 0;
        translateZ = 0;
        scaleX = 1;
        scaleY = 1;
        scaleZ = 1;

        static invert(out: MockMat4, value: MockMat4): MockMat4 {
            const translateX = value.translateX;
            const translateY = value.translateY;
            const translateZ = value.translateZ;
            const scaleX = value.scaleX;
            const scaleY = value.scaleY;
            const scaleZ = value.scaleZ;
            out.scaleX = 1 / scaleX;
            out.scaleY = 1 / scaleY;
            out.scaleZ = 1 / scaleZ;
            out.translateX = -translateX / scaleX;
            out.translateY = -translateY / scaleY;
            out.translateZ = -translateZ / scaleZ;
            return out;
        }

        static equals(lhs: MockMat4, rhs: MockMat4): boolean {
            return lhs.translateX === rhs.translateX
                && lhs.translateY === rhs.translateY
                && lhs.translateZ === rhs.translateZ
                && lhs.scaleX === rhs.scaleX
                && lhs.scaleY === rhs.scaleY
                && lhs.scaleZ === rhs.scaleZ;
        }
    }

    class MockNode {}
    class MockComponent {
        node!: MockNode;
    }
    class MockJoint2D extends MockComponent {
        anchor = new MockVec2();
        connectedAnchor = new MockVec2();
        connectedBody: { node: MockNode } | null = null;
    }
    class MockDistanceJoint2D extends MockJoint2D {}
    class MockSpringJoint2D extends MockJoint2D {}
    class MockHingeJoint2D extends MockJoint2D {}
    class MockFixedJoint2D extends MockJoint2D {}
    class MockRelativeJoint2D extends MockJoint2D {}
    class MockSliderJoint2D extends MockJoint2D {}
    class MockWheelJoint2D extends MockJoint2D {}
    class MockMouseJoint2D extends MockJoint2D {}

    const classNames = new Map<unknown, string>([
        [MockDistanceJoint2D, 'cc.DistanceJoint2D'],
        [MockSpringJoint2D, 'cc.SpringJoint2D'],
        [MockHingeJoint2D, 'cc.HingeJoint2D'],
        [MockFixedJoint2D, 'cc.FixedJoint2D'],
        [MockRelativeJoint2D, 'cc.RelativeJoint2D'],
        [MockSliderJoint2D, 'cc.SliderJoint2D'],
        [MockWheelJoint2D, 'cc.WheelJoint2D'],
        [MockMouseJoint2D, 'cc.MouseJoint2D'],
    ]);

    return {
        Color: MockColor,
        Component: MockComponent,
        DistanceJoint2D: MockDistanceJoint2D,
        FixedJoint2D: MockFixedJoint2D,
        HingeJoint2D: MockHingeJoint2D,
        Joint2D: MockJoint2D,
        Mat4: MockMat4,
        MouseJoint2D: MockMouseJoint2D,
        Node: MockNode,
        RelativeJoint2D: MockRelativeJoint2D,
        SliderJoint2D: MockSliderJoint2D,
        SpringJoint2D: MockSpringJoint2D,
        Vec2: MockVec2,
        Vec3: MockVec3,
        WheelJoint2D: MockWheelJoint2D,
        js: {
            getClassName: jest.fn((ctor: unknown) => classNames.get(ctor) ?? ''),
        },
    };
});

jest.mock('../scene-process/service/gizmo/gizmo-defines', () => ({
    registerGizmo: (...args: unknown[]) => mockRegisterGizmo(...args),
}));

jest.mock('../scene-process/service/gizmo/base/gizmo-base', () => ({
    __esModule: true,
    default: class MockGizmoBase {
        protected _isInitialized = false;
        protected _isControlBegin = false;
        protected _recorded = false;
        private _hidden = true;

        constructor(public target: unknown) {}

        protected getGizmoRoot(): unknown {
            return mockGizmoRoot;
        }

        public show(): void {
            if (!this._isInitialized) {
                (this as any).init?.();
                this._isInitialized = true;
            }
            if (this._hidden) {
                (this as any).onShow?.();
                this._hidden = false;
            }
        }

        public hide(): void {
            if (!this._hidden) {
                (this as any).onHide?.();
                this._hidden = true;
            }
        }

        public visible(): boolean {
            return !this._hidden;
        }

        public update(): void {
            (this as any).onUpdate?.();
        }

        public destroy(): void {
            this.hide();
            this.target = null;
        }

        public getCompPropPath(propName: string): string {
            return `_components.0.${propName}`;
        }

        public onControlUpdate(propPath: string | null): void {
            if (!this._isControlBegin) {
                mockControlBegins.push(propPath);
                this._isControlBegin = true;
            }
            this._recorded = true;
            mockControlUpdates.push(propPath);
        }

        public async onControlEnd(propPath: string | null): Promise<void> {
            this._isControlBegin = false;
            this._recorded = false;
            mockControlEnds.push(propPath);
        }

        public async commitChanges(): Promise<void> {
            this._recorded = false;
            await mockCommitChanges();
        }

        protected onComponentChanged(node: unknown): void {
            mockChangedNodes.push(node);
        }
    },
}));

jest.mock('../scene-process/service/gizmo/components/joint-2d/controller-joint-2d', () => ({
    __esModule: true,
    default: class MockJoint2DController {
        editable = false;
        edit = false;
        show = jest.fn();
        hide = jest.fn();
        setColor = jest.fn();
        updatePosition = jest.fn();
        destroy = jest.fn();
        cancelDrag = jest.fn();
        onControllerMouseDown?: () => void;
        onControllerMouseMove?: () => void;
        onControllerMouseUp?: () => void;
        private readonly dragWorldPosition = new (require('cc').Vec3)();

        constructor(public rootNode: unknown) {
            mockControllerInstances.push(this);
        }

        setDragWorldPosition(value: { x: number; y: number; z?: number }): void {
            this.dragWorldPosition.set(value);
        }

        getDragWorldPosition(out: any): any {
            return out.set(this.dragWorldPosition);
        }
    },
}));

jest.mock('../scene-process/service/gizmo/controller/line', () => ({
    __esModule: true,
    default: class MockLineController {
        shape = { destroy: jest.fn() };
        show = jest.fn();
        hide = jest.fn();
        setColor = jest.fn();
        setOpacity = jest.fn();
        updateData = jest.fn();

        constructor(public rootNode: unknown) {
            mockLineControllerInstances.push(this);
        }
    },
}));

const {
    DistanceJoint2D,
    FixedJoint2D,
    HingeJoint2D,
    RelativeJoint2D,
    SliderJoint2D,
    SpringJoint2D,
    Vec2,
    Vec3,
    WheelJoint2D,
} = require('cc');

const distanceModule = require('../scene-process/service/gizmo/components/distance-joint-2d');
const springModule = require('../scene-process/service/gizmo/components/spring-joint-2d');
const hingeModule = require('../scene-process/service/gizmo/components/hinge-joint-2d');
const fixedModule = require('../scene-process/service/gizmo/components/fixed-joint-2d');
const relativeModule = require('../scene-process/service/gizmo/components/relative-joint-2d');
const sliderModule = require('../scene-process/service/gizmo/components/slider-joint-2d');
const wheelModule = require('../scene-process/service/gizmo/components/wheel-joint-2d');

function createNode(
    translateX: number,
    translateY: number,
    scaleX = 1,
    scaleY = 1,
) {
    const transform = {
        translateX,
        translateY,
        scaleX,
        scaleY,
    };
    return {
        isValid: true,
        getWorldMatrix: jest.fn((out: any) => {
            out.translateX = transform.translateX;
            out.translateY = transform.translateY;
            out.translateZ = 0;
            out.scaleX = transform.scaleX;
            out.scaleY = transform.scaleY;
            out.scaleZ = 1;
            return out;
        }),
        getWorldPosition: jest.fn(() => new Vec3(transform.translateX, transform.translateY, 0)),
        setWorldTransform(
            nextTranslateX: number,
            nextTranslateY: number,
            nextScaleX = transform.scaleX,
            nextScaleY = transform.scaleY,
        ) {
            transform.translateX = nextTranslateX;
            transform.translateY = nextTranslateY;
            transform.scaleX = nextScaleX;
            transform.scaleY = nextScaleY;
        },
    };
}

describe('Joint2D Gizmo', () => {
    beforeEach(() => {
        mockControllerInstances.length = 0;
        mockLineControllerInstances.length = 0;
        mockChangedNodes.length = 0;
        mockControlBegins.length = 0;
        mockControlUpdates.length = 0;
        mockControlEnds.length = 0;
        mockCommitChanges.mockClear();
    });

    it('registers the seven Creator-supported Joint2D component gizmos', () => {
        const modules = [
            ['cc.DistanceJoint2D', distanceModule],
            ['cc.SpringJoint2D', springModule],
            ['cc.HingeJoint2D', hingeModule],
            ['cc.FixedJoint2D', fixedModule],
            ['cc.RelativeJoint2D', relativeModule],
            ['cc.SliderJoint2D', sliderModule],
            ['cc.WheelJoint2D', wheelModule],
        ];

        for (const [name, module] of modules) {
            expect(module.name).toBe(name);
            expect(mockRegisterGizmo).toHaveBeenCalledWith(name, {
                SelectGizmo: module.SelectGizmo,
            });
        }
        expect(mockRegisterGizmo).not.toHaveBeenCalledWith(
            'cc.MouseJoint2D',
            expect.anything(),
        );
    });

    it('ignores target updates before the Joint controllers are initialized', () => {
        const target = Object.assign(new SpringJoint2D(), {
            node: createNode(1, 2),
            anchor: new Vec2(3, 4),
            connectedAnchor: new Vec2(5, 6),
            connectedBody: null,
        });
        const gizmo = new springModule.SelectGizmo(target);

        expect(() => (gizmo as any).onTargetUpdate()).not.toThrow();
        expect(mockControllerInstances).toHaveLength(0);

        gizmo.show();
        expect(mockControllerInstances).toHaveLength(2);
        expect(mockControllerInstances[0].updatePosition).toHaveBeenCalled();
        expect(mockControllerInstances[1].updatePosition).toHaveBeenCalled();
    });

    it('adds an anchor-to-anchor line only for DistanceJoint2D', () => {
        const ownerNode = createNode(10, 20, 2, 3);
        const connectedNode = createNode(-5, 7, 4, 2);
        const target = Object.assign(new DistanceJoint2D(), {
            node: ownerNode,
            anchor: new Vec2(1, 2),
            connectedAnchor: new Vec2(3, 4),
            connectedBody: { node: connectedNode },
        });
        const gizmo = new distanceModule.SelectGizmo(target);

        gizmo.show();

        expect(mockLineControllerInstances).toHaveLength(1);
        const lineController = mockLineControllerInstances[0];
        expect(lineController.rootNode).toBe(mockGizmoRoot);
        expect(lineController.setColor).toHaveBeenCalledWith(
            mockControllerInstances[0].setColor.mock.calls[0][0],
        );
        expect(lineController.setOpacity).toHaveBeenCalledWith(128);
        expect(lineController.updateData).toHaveBeenLastCalledWith(
            new Vec3(12, 26, 0),
            new Vec3(7, 15, 0),
        );
        expect(lineController.show).toHaveBeenCalledTimes(1);

        connectedNode.setWorldTransform(0, 0, 1, 1);
        gizmo.update();
        expect(lineController.updateData).toHaveBeenLastCalledWith(
            new Vec3(12, 26, 0),
            new Vec3(3, 4, 0),
        );

        target.anchor = new Vec2(2, 3);
        gizmo.onNodeChanged();
        expect(lineController.updateData).toHaveBeenLastCalledWith(
            new Vec3(14, 29, 0),
            new Vec3(3, 4, 0),
        );

        target.connectedBody = null;
        target.connectedAnchor = new Vec2(30, 40);
        gizmo.onNodeChanged();
        expect(lineController.updateData).toHaveBeenLastCalledWith(
            new Vec3(14, 29, 0),
            new Vec3(30, 40, 0),
        );

        const springTarget = Object.assign(new SpringJoint2D(), {
            node: createNode(0, 0),
            anchor: new Vec2(),
            connectedAnchor: new Vec2(),
            connectedBody: null,
        });
        new springModule.SelectGizmo(springTarget).show();
        expect(mockLineControllerInstances).toHaveLength(1);

        gizmo.hide();
        expect(lineController.hide).toHaveBeenCalledTimes(1);
        gizmo.destroy();
        expect(lineController.shape.destroy).toHaveBeenCalledTimes(1);
    });

    it('shows anchor and connectedAnchor in their owning body world spaces', () => {
        const ownerNode = createNode(10, 20, 2, 3);
        const connectedNode = createNode(-5, 7, 4, 2);
        const target = Object.assign(new SpringJoint2D(), {
            node: ownerNode,
            anchor: new Vec2(1, 2),
            connectedAnchor: new Vec2(3, 4),
            connectedBody: { node: connectedNode },
        });

        const gizmo = new springModule.SelectGizmo(target);
        gizmo.show();

        expect(mockControllerInstances).toHaveLength(2);
        expect(mockControllerInstances[0].rootNode).toBe(mockGizmoRoot);
        expect(mockControllerInstances[0].updatePosition).toHaveBeenLastCalledWith(
            new Vec3(10, 20, 0),
            new Vec3(12, 26, 0),
        );
        expect(mockControllerInstances[1].updatePosition).toHaveBeenLastCalledWith(
            new Vec3(-5, 7, 0),
            new Vec3(7, 15, 0),
        );
    });

    it('treats connectedAnchor as a world position when connectedBody is empty', () => {
        const target = Object.assign(new HingeJoint2D(), {
            node: createNode(10, 20, 2, 3),
            anchor: new Vec2(1, 2),
            connectedAnchor: new Vec2(30, 40),
            connectedBody: null,
        });

        const gizmo = new hingeModule.SelectGizmo(target);
        gizmo.show();

        expect(mockControllerInstances[1].updatePosition).toHaveBeenLastCalledWith(
            Vec3.ZERO,
            new Vec3(30, 40, 0),
        );
    });

    it('refreshes both controllers when the selected Joint node changes', () => {
        const target = Object.assign(new FixedJoint2D(), {
            node: createNode(1, 2),
            anchor: new Vec2(3, 4),
            connectedAnchor: new Vec2(5, 6),
            connectedBody: null,
        });

        const gizmo = new fixedModule.SelectGizmo(target);
        gizmo.show();
        target.anchor = new Vec2(7, 8);
        gizmo.onNodeChanged();

        expect(mockControllerInstances[0].updatePosition).toHaveBeenLastCalledWith(
            new Vec3(1, 2, 0),
            new Vec3(8, 10, 0),
        );
    });

    it('refreshes only when the connected body identity or world transform changes independently', () => {
        const ownerNode = createNode(1, 2);
        const connectedNode = createNode(10, 20, 2, 3);
        const target = Object.assign(new SpringJoint2D(), {
            node: ownerNode,
            anchor: new Vec2(3, 4),
            connectedAnchor: new Vec2(5, 6),
            connectedBody: { node: connectedNode },
        });
        const gizmo = new springModule.SelectGizmo(target);
        gizmo.show();
        const anchorController = mockControllerInstances[0];
        const connectedController = mockControllerInstances[1];
        anchorController.updatePosition.mockClear();
        connectedController.updatePosition.mockClear();

        gizmo.update();
        expect(anchorController.updatePosition).not.toHaveBeenCalled();
        expect(connectedController.updatePosition).not.toHaveBeenCalled();

        connectedNode.setWorldTransform(30, 40, 4, 5);
        gizmo.update();
        expect(connectedController.updatePosition).toHaveBeenLastCalledWith(
            new Vec3(30, 40, 0),
            new Vec3(50, 70, 0),
        );

        anchorController.updatePosition.mockClear();
        connectedController.updatePosition.mockClear();
        gizmo.update();
        expect(anchorController.updatePosition).not.toHaveBeenCalled();
        expect(connectedController.updatePosition).not.toHaveBeenCalled();

        const replacementNode = createNode(-10, -20, 2, 2);
        target.connectedBody = { node: replacementNode };
        gizmo.update();
        expect(connectedController.updatePosition).toHaveBeenLastCalledWith(
            new Vec3(-10, -20, 0),
            new Vec3(0, -8, 0),
        );

        replacementNode.isValid = false;
        gizmo.update();
        expect(connectedController.updatePosition).toHaveBeenLastCalledWith(
            Vec3.ZERO,
            new Vec3(5, 6, 0),
        );

        anchorController.updatePosition.mockClear();
        connectedController.updatePosition.mockClear();
        gizmo.update();
        expect(anchorController.updatePosition).not.toHaveBeenCalled();
        expect(connectedController.updatePosition).not.toHaveBeenCalled();
    });

    it('writes anchor drag positions back through the owner node inverse world matrix', () => {
        const ownerNode = createNode(10, 20, 2, 3);
        const target = Object.assign(new HingeJoint2D(), {
            node: ownerNode,
            anchor: new Vec2(1, 2),
            connectedAnchor: new Vec2(),
            connectedBody: null,
        });
        const gizmo = new hingeModule.SelectGizmo(target);
        gizmo.show();
        const anchorController = mockControllerInstances[0];

        anchorController.onControllerMouseDown();
        anchorController.setDragWorldPosition(new Vec3(14.26, 29.86, 0));
        anchorController.onControllerMouseMove();
        anchorController.setDragWorldPosition(new Vec3(16.24, 32.12, 0));
        anchorController.onControllerMouseMove();
        anchorController.onControllerMouseUp();

        expect(target.anchor).toEqual(new Vec2(3.1, 4));
        expect(mockChangedNodes).toEqual([ownerNode, ownerNode]);
        expect(mockControlUpdates).toEqual([
            '_components.0.anchor',
            '_components.0.anchor',
        ]);
        expect(mockControlBegins).toEqual(['_components.0.anchor']);
        expect(mockControlEnds).toEqual(['_components.0.anchor']);
        expect(anchorController.updatePosition).toHaveBeenLastCalledWith(
            new Vec3(10, 20, 0),
            new Vec3(16.2, 32, 0),
        );
    });

    it('quantizes positive and negative anchor coordinates symmetrically', () => {
        const ownerNode = createNode(0, 0);
        const target = Object.assign(new HingeJoint2D(), {
            node: ownerNode,
            anchor: new Vec2(),
            connectedAnchor: new Vec2(),
            connectedBody: null,
        });
        const gizmo = new hingeModule.SelectGizmo(target);
        gizmo.show();
        const anchorController = mockControllerInstances[0];

        anchorController.onControllerMouseDown();
        anchorController.setDragWorldPosition(new Vec3(-0.05, 0.05, 0));
        anchorController.onControllerMouseMove();
        anchorController.onControllerMouseUp();

        expect(target.anchor).toEqual(new Vec2(-0.1, 0.1));
    });

    it('writes connectedAnchor in connected-body local space, or world space without a body', () => {
        const ownerNode = createNode(10, 20);
        const connectedNode = createNode(-5, 7, 4, 2);
        const target = Object.assign(new SliderJoint2D(), {
            node: ownerNode,
            anchor: new Vec2(),
            connectedAnchor: new Vec2(3, 4),
            connectedBody: { node: connectedNode },
        });
        const gizmo = new sliderModule.SelectGizmo(target);
        gizmo.show();
        const connectedController = mockControllerInstances[1];

        connectedController.onControllerMouseDown();
        connectedController.setDragWorldPosition(new Vec3(7.44, 15.72, 0));
        connectedController.onControllerMouseMove();
        expect(target.connectedAnchor).toEqual(new Vec2(3.1, 4.4));

        connectedController.onControllerMouseUp();
        expect(mockControlEnds).toEqual(['_components.0.connectedAnchor']);
        target.connectedBody = null;
        connectedController.onControllerMouseDown();
        connectedController.setDragWorldPosition(new Vec3(30.04, 40.06, 0));
        connectedController.onControllerMouseMove();
        expect(target.connectedAnchor).toEqual(new Vec2(30, 40.1));
        expect(mockChangedNodes).toEqual([ownerNode, ownerNode]);
        connectedController.onControllerMouseUp();
        expect(mockControlEnds).toEqual([
            '_components.0.connectedAnchor',
            '_components.0.connectedAnchor',
        ]);
    });

    it('cancels connectedAnchor writeback if connectedBody changes during the drag', () => {
        const ownerNode = createNode(0, 0);
        const connectedNode = createNode(5, 6);
        const target = Object.assign(new WheelJoint2D(), {
            node: ownerNode,
            anchor: new Vec2(),
            connectedAnchor: new Vec2(1, 2),
            connectedBody: { node: connectedNode },
        });
        const gizmo = new wheelModule.SelectGizmo(target);
        gizmo.show();
        const connectedController = mockControllerInstances[1];

        connectedController.onControllerMouseDown();
        target.connectedBody = { node: createNode(50, 60) };
        connectedController.setDragWorldPosition(new Vec3(100, 200, 0));
        connectedController.onControllerMouseMove();

        expect(target.connectedAnchor).toEqual(new Vec2(1, 2));
        expect(mockChangedNodes).toHaveLength(0);
    });

    it('does not emit node:change when a quantized drag leaves the property unchanged', () => {
        const target = Object.assign(new FixedJoint2D(), {
            node: createNode(10, 20, 2, 3),
            anchor: new Vec2(1, 2),
            connectedAnchor: new Vec2(),
            connectedBody: null,
        });
        const gizmo = new fixedModule.SelectGizmo(target);
        gizmo.show();
        const anchorController = mockControllerInstances[0];

        anchorController.onControllerMouseDown();
        anchorController.setDragWorldPosition(new Vec3(12.01, 26.01, 0));
        anchorController.onControllerMouseMove();
        anchorController.onControllerMouseUp();

        expect(target.anchor).toEqual(new Vec2(1, 2));
        expect(mockChangedNodes).toHaveLength(0);
        expect(mockControlUpdates).toHaveLength(0);
        expect(mockControlEnds).toHaveLength(0);
    });

    it('ends the existing connectedAnchor transaction without redirecting after connectedBody changes', () => {
        const ownerNode = createNode(0, 0);
        const target = Object.assign(new SpringJoint2D(), {
            node: ownerNode,
            anchor: new Vec2(),
            connectedAnchor: new Vec2(1, 2),
            connectedBody: { node: createNode(5, 6) },
        });
        const gizmo = new springModule.SelectGizmo(target);
        gizmo.show();
        const connectedController = mockControllerInstances[1];

        connectedController.onControllerMouseDown();
        connectedController.setDragWorldPosition(new Vec3(8, 10, 0));
        connectedController.onControllerMouseMove();
        target.connectedBody = { node: createNode(50, 60) };
        gizmo.onNodeChanged();

        expect(target.connectedAnchor).toEqual(new Vec2(3, 4));
        expect(mockControlUpdates).toEqual(['_components.0.connectedAnchor']);
        expect(mockControlEnds).toEqual(['_components.0.connectedAnchor']);
        expect(connectedController.cancelDrag).toHaveBeenCalledTimes(1);
    });

    it('finishes an active anchor transaction before hide or destroy', () => {
        const target = Object.assign(new FixedJoint2D(), {
            node: createNode(0, 0),
            anchor: new Vec2(),
            connectedAnchor: new Vec2(),
            connectedBody: null,
        });
        const gizmo = new fixedModule.SelectGizmo(target);
        gizmo.show();
        const anchorController = mockControllerInstances[0];

        anchorController.onControllerMouseDown();
        anchorController.setDragWorldPosition(new Vec3(1, 2, 0));
        anchorController.onControllerMouseMove();
        gizmo.hide();
        expect(mockControlEnds).toEqual(['_components.0.anchor']);

        gizmo.show();
        anchorController.onControllerMouseDown();
        anchorController.setDragWorldPosition(new Vec3(3, 4, 0));
        anchorController.onControllerMouseMove();
        gizmo.destroy();
        expect(mockControlEnds).toEqual([
            '_components.0.anchor',
            '_components.0.anchor',
        ]);
        expect(anchorController.destroy).toHaveBeenCalledTimes(1);
        expect(mockControllerInstances[1].destroy).toHaveBeenCalledTimes(1);
    });

    it('closes an interrupted recording without committing the old property on a replacement target', () => {
        const target = Object.assign(new HingeJoint2D(), {
            node: createNode(0, 0),
            anchor: new Vec2(),
            connectedAnchor: new Vec2(),
            connectedBody: null,
        });
        const gizmo = new hingeModule.SelectGizmo(target);
        gizmo.show();
        const anchorController = mockControllerInstances[0];

        anchorController.onControllerMouseDown();
        anchorController.setDragWorldPosition(new Vec3(1, 2, 0));
        anchorController.onControllerMouseMove();
        (gizmo as any).onTargetUpdate();

        expect(mockCommitChanges).toHaveBeenCalledTimes(1);
        expect(mockControlEnds).toHaveLength(0);

        anchorController.onControllerMouseDown();
        anchorController.setDragWorldPosition(new Vec3(3, 4, 0));
        anchorController.onControllerMouseMove();
        anchorController.onControllerMouseUp();
        expect(mockControlBegins).toEqual([
            '_components.0.anchor',
            '_components.0.anchor',
        ]);
        expect(mockControlEnds).toEqual(['_components.0.anchor']);
    });

    it('uses the shared base gizmo for all non-distance Joint2D types', () => {
        const cases = [
            [SpringJoint2D, springModule],
            [HingeJoint2D, hingeModule],
            [FixedJoint2D, fixedModule],
            [RelativeJoint2D, relativeModule],
            [SliderJoint2D, sliderModule],
            [WheelJoint2D, wheelModule],
        ];

        for (const [JointCtor, module] of cases) {
            mockControllerInstances.length = 0;
            const target = Object.assign(new JointCtor(), {
                node: createNode(0, 0),
                anchor: new Vec2(),
                connectedAnchor: new Vec2(),
                connectedBody: null,
            });
            new module.SelectGizmo(target).show();
            expect(mockControllerInstances).toHaveLength(2);
        }
    });
});
