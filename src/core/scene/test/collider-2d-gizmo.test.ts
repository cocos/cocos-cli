export {};

const mockControlUpdates: (string | null)[] = [];
const mockControlEnds: (string | null)[] = [];
const mockChangedNodes: unknown[] = [];
const mockRegisterGizmo = jest.fn();
const mockOperation = { changePointer: jest.fn() };
const mockEngine = { repaintInEditMode: jest.fn() };

class MockVec2 {
    constructor(public x = 0, public y = 0) {}

    clone(): MockVec2 {
        return new MockVec2(this.x, this.y);
    }

    set(value: { x: number; y: number }): this;
    set(x: number, y: number): this;
    set(valueOrX: number | { x: number; y: number }, y?: number): this {
        if (typeof valueOrX === 'number') {
            this.x = valueOrX;
            this.y = y ?? 0;
        } else {
            this.x = valueOrX.x;
            this.y = valueOrX.y;
        }
        return this;
    }

    add2f(x: number, y: number): this {
        this.x += x;
        this.y += y;
        return this;
    }
}

class MockVec3 {
    static readonly ZERO = new MockVec3();

    x: number;
    y: number;
    z: number;

    constructor(x?: number | { x: number; y: number; z?: number }, y = 0, z = 0) {
        if (typeof x === 'object') {
            this.x = x.x;
            this.y = x.y;
            this.z = x.z ?? 0;
        } else {
            this.x = x ?? 0;
            this.y = y;
            this.z = z;
        }
    }

    clone(): MockVec3 {
        return new MockVec3(this.x, this.y, this.z);
    }

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

    subtract(value: { x: number; y: number; z: number }): this {
        this.x -= value.x;
        this.y -= value.y;
        this.z -= value.z;
        return this;
    }

    dot(value: { x: number; y: number; z: number }): number {
        return this.x * value.x + this.y * value.y + this.z * value.z;
    }

    static transformMat4(out: MockVec3, value: MockVec3, matrix: MockMat4): MockVec3 {
        const { x, y, z } = value;
        return out.set(
            matrix.m00 * x + matrix.m04 * y + matrix.m12,
            matrix.m01 * x + matrix.m05 * y + matrix.m13,
            matrix.m10 * z + matrix.m14,
        );
    }

    static transformQuat(out: MockVec3, value: MockVec3, rotation: MockQuat): MockVec3 {
        const { x, y, z } = value;
        const cos = rotation.w * rotation.w - rotation.z * rotation.z;
        const sin = 2 * rotation.z * rotation.w;
        return out.set(cos * x - sin * y, sin * x + cos * y, z);
    }

    static multiply(out: MockVec3, lhs: MockVec3, rhs: MockVec3): MockVec3 {
        return out.set(lhs.x * rhs.x, lhs.y * rhs.y, lhs.z * rhs.z);
    }
}

class MockSize {
    constructor(public width = 0, public height = 0) {}

    clone(): MockSize {
        return new MockSize(this.width, this.height);
    }

    set(value: { width: number; height: number }): this {
        this.width = value.width;
        this.height = value.height;
        return this;
    }
}

class MockMat4 {
    // Evaluate 2D affine transforms, including in-place inversion. Identity-only
    // mocks would hide errors involving parent rotation and non-uniform scale.
    m00 = 1;
    m01 = 0;
    m04 = 0;
    m05 = 1;
    m10 = 1;
    m12 = 0;
    m13 = 0;
    m14 = 0;

    static invert(out: MockMat4, matrix: MockMat4): MockMat4 {
        const { m00, m01, m04, m05, m10, m12, m13, m14 } = matrix;
        const det = m00 * m05 - m01 * m04;
        out.m00 = m05 / det;
        out.m01 = -m01 / det;
        out.m04 = -m04 / det;
        out.m05 = m00 / det;
        out.m10 = 1 / m10;
        out.m12 = (m04 * m13 - m05 * m12) / det;
        out.m13 = (m01 * m12 - m00 * m13) / det;
        out.m14 = -m14 / m10;
        return out;
    }
}

class MockQuat {
    z = 0;
    w = 1;

    setAngle(degrees: number): this {
        this.z = Math.sin(degrees * Math.PI / 360);
        this.w = Math.cos(degrees * Math.PI / 360);
        return this;
    }
}
class MockNode {}
class MockMeshRenderer {}
class MockComponent {
    node!: MockNode;
}
class MockBoxCollider2D extends MockComponent {}
class MockCircleCollider2D extends MockComponent {}
class MockPolygonCollider2D extends MockComponent {}
class MockColor {
    static readonly RED = new MockColor(255, 0, 0);
    static readonly YELLOW = new MockColor(255, 255, 0);

    constructor(public r = 0, public g = 0, public b = 0, public a = 255) {}
}

jest.mock('cc', () => ({
    BoxCollider2D: MockBoxCollider2D,
    CircleCollider2D: MockCircleCollider2D,
    Color: MockColor,
    Component: MockComponent,
    js: { getClassName: (ctor: { name: string }) => ctor.name },
    Layers: { Enum: { EDITOR: 1 } },
    Mat4: MockMat4,
    MeshRenderer: MockMeshRenderer,
    Node: MockNode,
    PolygonCollider2D: MockPolygonCollider2D,
    Quat: MockQuat,
    Size: MockSize,
    Vec2: MockVec2,
    Vec3: MockVec3,
}));

jest.mock('../scene-process/service/gizmo/base/gizmo-base', () => ({
    __esModule: true,
    default: class MockGizmoBase {
        protected _isInitialized = false;
        protected _isControlBegin = false;

        constructor(public target: any) {}

        protected getGizmoRoot(): object {
            return {};
        }

        public getCompPropPath(propName: string): string {
            return `_components.0.${propName}`;
        }

        public onControlUpdate(propPath: string | null): void {
            this._isControlBegin = true;
            mockControlUpdates.push(propPath);
        }

        public async onControlEnd(propPath: string | null): Promise<void> {
            this._isControlBegin = false;
            mockControlEnds.push(propPath);
        }

        protected onComponentChanged(node: unknown): void {
            mockChangedNodes.push(node);
        }
    },
}));

jest.mock('../scene-process/service/gizmo/gizmo-defines', () => ({
    registerGizmo: (...args: unknown[]) => mockRegisterGizmo(...args),
}));

jest.mock('../scene-process/service/gizmo/controller/disc', () => ({
    __esModule: true,
    default: class MockDiscController {
        static readonly DiscHandleType: Record<string, string> = {
            None: 'none',
            Left: 'neg_x',
            Right: 'x',
            Top: 'y',
            Bottom: 'neg_y',
            Area: 'area',
        };
    },
}));

jest.mock('../scene-process/service/gizmo/node/rectangle-controller', () => ({
    RectangleController: class MockRectangleController {
        static readonly RectHandleType: Record<string, string> = {
            None: 'none',
            TopLeft: 'tl',
            TopRight: 'tr',
            BottomLeft: 'bl',
            BottomRight: 'br',
            Left: 'neg_x',
            Right: 'x',
            Top: 'y',
            Bottom: 'neg_y',
            Area: 'area',
            Anchor: 'anchor',
        };
    },
}));

jest.mock('../scene-process/service/gizmo/controller/editable', () => ({
    __esModule: true,
    default: class MockEditableController {},
}));

jest.mock('../scene-process/service/gizmo/controller/line', () => ({
    __esModule: true,
    default: class MockLineController {},
}));

jest.mock('../scene-process/service/gizmo/utils/controller-utils', () => ({
    __esModule: true,
    default: {},
}));

jest.mock('../scene-process/service/gizmo/utils/controller-shape', () => ({
    __esModule: true,
    default: {},
}));

jest.mock('../scene-process/service/gizmo/utils/engine-utils', () => ({
    create3DNode: jest.fn(),
    getModel: jest.fn(),
    getNodeOpacity: jest.fn(() => 0),
    setMeshColor: jest.fn(),
    setNodeOpacity: jest.fn(),
    updateBoundingBox: jest.fn(),
    updateIB: jest.fn(),
    updatePositions: jest.fn(),
}));

jest.mock('../scene-process/service/core/decorator', () => ({
    queryRegisteredService: (name: string) => {
        if (name === 'Operation') return mockOperation;
        if (name === 'Engine') return mockEngine;
        return null;
    },
}));

const boxModule = require('../scene-process/service/gizmo/components/box-collider-2d');
const circleModule = require('../scene-process/service/gizmo/components/circle-collider-2d');
const polygonModule = require('../scene-process/service/gizmo/components/polygon-collider-2d');

function createNode(
    scale = new MockVec3(1, 1, 1),
    parentRotationZ = 0,
    localRotationZ = 0,
    worldPosition = new MockVec3(),
) {
    const angle = (parentRotationZ + localRotationZ) * Math.PI / 180;
    const worldMatrix = Object.assign(new MockMat4(), {
        m00: Math.cos(angle) * scale.x,
        m01: Math.sin(angle) * scale.x,
        m04: -Math.sin(angle) * scale.y,
        m05: Math.cos(angle) * scale.y,
        m10: scale.z,
        m12: worldPosition.x,
        m13: worldPosition.y,
        m14: worldPosition.z,
    });
    return {
        getWorldMatrix: jest.fn((out: MockMat4) => Object.assign(out, worldMatrix)),
        getWorldScale: jest.fn((out?: MockVec3) => out ? out.set(scale) : scale),
        getWorldRotation: jest.fn((out: MockQuat) => out.setAngle(parentRotationZ + localRotationZ)),
        getRotation: jest.fn((out: MockQuat) => out.setAngle(localRotationZ)),
    };
}

function createLineController() {
    return {
        hide: jest.fn(),
        show: jest.fn(),
        updateData: jest.fn(),
    };
}

describe('Collider2D Gizmo correctness', () => {
    beforeEach(() => {
        mockControlUpdates.length = 0;
        mockControlEnds.length = 0;
        mockChangedNodes.length = 0;
        mockOperation.changePointer.mockClear();
        mockEngine.repaintInEditMode.mockClear();
    });

    it('uses offset scope for Circle area moves and radius scope for radius moves', () => {
        const areaTarget = {
            node: createNode(),
            offset: new MockVec2(1, 2),
            radius: 10,
        };
        const areaController = {
            updated: true,
            getCurHandleType: () => 'area',
            getDeltaPos: () => new MockVec3(2, 3),
        };
        const areaGizmo = new circleModule.SelectGizmo(areaTarget);
        (areaGizmo as any)._controller = areaController;

        areaGizmo.onControllerMouseDown();
        areaGizmo.onControllerMouseMove();
        areaGizmo.onControllerMouseUp();

        expect(mockControlUpdates).toEqual(['_components.0.offset']);
        expect(mockControlEnds).toEqual(['_components.0.offset']);
        expect(areaTarget.offset).toMatchObject({ x: 3, y: 5 });

        mockControlUpdates.length = 0;
        mockControlEnds.length = 0;
        const radiusTarget = {
            node: createNode(new MockVec3(1, 8, 12)),
            offset: new MockVec2(),
            radius: 10,
        };
        const radiusController = {
            updated: true,
            getCurHandleType: () => 'x',
            getDeltaRadius: () => 2,
        };
        const radiusGizmo = new circleModule.SelectGizmo(radiusTarget);
        (radiusGizmo as any)._controller = radiusController;

        radiusGizmo.onControllerMouseDown();
        radiusGizmo.onControllerMouseMove();
        radiusGizmo.onControllerMouseUp();

        expect(mockControlUpdates).toEqual(['_components.0.radius']);
        expect(mockControlEnds).toEqual(['_components.0.radius']);
        expect(radiusTarget.radius).toBe(12);
    });

    it('uses abs(scaleX) for Circle display and drag while guarding zero scale', () => {
        const target = {
            node: createNode(new MockVec3(-2, 9, 12)),
            offset: new MockVec2(),
            radius: 10,
            editing: true,
        };
        const updateSize = jest.fn();
        const controller = {
            updated: true,
            edit: false,
            getCurHandleType: () => 'x',
            getDeltaRadius: () => 4,
            setPosition: jest.fn(),
            setRotation: jest.fn(),
            updateSize,
        };
        const gizmo = new circleModule.SelectGizmo(target);
        (gizmo as any)._controller = controller;
        (gizmo as any)._isInitialized = true;

        gizmo.updateControllerData();
        gizmo.onControllerMouseDown();
        gizmo.onControllerMouseMove();

        expect(updateSize).toHaveBeenCalledWith(MockVec3.ZERO, 20);
        expect(target.radius).toBe(12);

        mockControlUpdates.length = 0;
        const zeroScaleTarget = {
            node: createNode(new MockVec3(0, 9, 12)),
            offset: new MockVec2(),
            radius: 10,
        };
        const zeroScaleGizmo = new circleModule.SelectGizmo(zeroScaleTarget);
        (zeroScaleGizmo as any)._controller = controller;

        zeroScaleGizmo.onControllerMouseDown();
        zeroScaleGizmo.onControllerMouseMove();
        zeroScaleGizmo.onControllerMouseUp();

        expect(zeroScaleTarget.radius).toBe(10);
        expect(Number.isFinite(zeroScaleTarget.radius)).toBe(true);
        expect(mockControlUpdates).toEqual([]);
    });

    it('uses the Box gesture primary property for area, centered resize and normal resize', () => {
        const run = (handleType: string, altKey: boolean) => {
            const target = {
                node: createNode(),
                offset: new MockVec2(),
                size: new MockSize(10, 20),
            };
            const controller = {
                updated: true,
                getCurHandleType: () => handleType,
                getDeltaSize: () => new MockVec3(2, 0),
            };
            const gizmo = new boxModule.SelectGizmo(target);
            (gizmo as any)._controller = controller;
            gizmo.onKeyDown({ altKey });
            gizmo.onControllerMouseDown();
            gizmo.onControllerMouseMove();
            gizmo.onControllerMouseUp();
            return target;
        };

        const areaTarget = run('area', false);
        expect(mockControlUpdates.pop()).toBe('_components.0.offset');
        expect(mockControlEnds.pop()).toBe('_components.0.offset');
        expect(areaTarget.offset).toMatchObject({ x: 2, y: 0 });

        const centeredTarget = run('x', true);
        expect(mockControlUpdates.pop()).toBe('_components.0.size');
        expect(mockControlEnds.pop()).toBe('_components.0.size');
        expect(centeredTarget.offset).toMatchObject({ x: 0, y: 0 });
        expect(centeredTarget.size).toMatchObject({ width: 14, height: 20 });

        const normalTarget = run('x', false);
        expect(mockControlUpdates.pop()).toBe('_components.0.size');
        expect(mockControlEnds.pop()).toBe('_components.0.size');
        expect(normalTarget.offset).toMatchObject({ x: 1, y: 0 });
        expect(normalTarget.size).toMatchObject({ width: 12, height: 20 });
    });

    it('starts Polygon point recording with the points path before changing data', () => {
        const target = {
            node: createNode(),
            offset: new MockVec2(),
            points: [new MockVec2(0, 0), new MockVec2(10, 0), new MockVec2(0, 10)],
        };
        const controller = {
            updated: true,
            points: [new MockVec3(0, 0), new MockVec3(10, 0), new MockVec3(0, 10)],
            getHandleData: () => ({ type: 'point', index: 1, deltaPos: new MockVec3(2, 3) }),
        };
        const gizmo = new polygonModule.SelectGizmo(target);
        (gizmo as any)._controller = controller;
        (gizmo as any)._leftDeleteLine = createLineController();
        (gizmo as any)._rightDeleteLine = createLineController();

        gizmo.onControllerMouseDown();
        expect(mockControlUpdates).toEqual([]);
        gizmo.onControllerMouseMove({ ctrlKey: false, metaKey: false });
        gizmo.onControllerMouseUp();

        expect(mockControlUpdates).toEqual(['_components.0.points']);
        expect(mockControlEnds).toEqual(['_components.0.points']);
        expect(target.points[1]).toMatchObject({ x: 12, y: 3 });
    });

    describe.each([
        [30, 0, 1, 1],
        [90, 0, 1, 1],
        [30, 45, 2, 3],
    ])('Box transform: parent Z=%i, local Z=%i, scale=(%i,%i)', (parentZ, localZ, scaleX, scaleY) => {
        const handles: Array<[string, number, number]> = [
            ['x', 1, 0], ['neg_x', -1, 0], ['y', 0, 1], ['neg_y', 0, -1],
            ['tr', 1, 1], ['tl', -1, 1], ['br', 1, -1], ['bl', -1, -1],
        ];

        function createBox(handle: string, delta: MockVec3) {
            const node = createNode(new MockVec3(scaleX, scaleY, 1), parentZ, localZ, new MockVec3(73, -41, 9));
            const target = { node, offset: new MockVec2(3, -7), size: new MockSize(100, 80) };
            const gizmo = new boxModule.SelectGizmo(target);
            (gizmo as any)._controller = {
                updated: true,
                getCurHandleType: () => handle,
                getDeltaSize: () => delta,
            };
            return { target, gizmo };
        }

        it.each(handles)('keeps the opposite side fixed when resizing %s', (handle, signX, signY) => {
            const delta = new MockVec3(signX ? 24 : 0, signY ? 18 : 0);
            const { target, gizmo } = createBox(handle, delta);
            const worldMatrix = target.node.getWorldMatrix(new MockMat4());
            const oppositeWorldPosition = () => MockVec3.transformMat4(new MockVec3(), new MockVec3(
                target.offset.x - signX * target.size.width / 2,
                target.offset.y - signY * target.size.height / 2,
            ), worldMatrix);
            const before = oppositeWorldPosition();

            gizmo.onControllerMouseDown();
            gizmo.onControllerMouseMove();
            gizmo.onControllerMouseUp();

            expect(target.size.width).toBe(100 + delta.x / scaleX);
            expect(target.size.height).toBe(80 + delta.y / scaleY);
            expect(target.offset.x).toBe(3 + signX * delta.x / (2 * scaleX));
            expect(target.offset.y).toBe(-7 + signY * delta.y / (2 * scaleY));
            const after = oppositeWorldPosition();
            expect(after.x).toBeCloseTo(before.x, 6);
            expect(after.y).toBeCloseTo(before.y, 6);
            expect(mockControlEnds).toEqual(['_components.0.size']);
        });

        it('keeps the center fixed during Alt resize', () => {
            const { target, gizmo } = createBox('tr', new MockVec3(24, 18));
            gizmo.onKeyDown({ altKey: true });
            gizmo.onControllerMouseDown();
            gizmo.onControllerMouseMove();
            gizmo.onControllerMouseUp();
            expect(target.offset).toEqual(new MockVec2(3, -7));
            expect(target.size).toEqual(new MockSize(100 + 48 / scaleX, 80 + 36 / scaleY));
            expect(mockControlEnds).toEqual(['_components.0.size']);
        });

        it('converts Area world movement without applying rotation twice', () => {
            const rotation = new MockQuat().setAngle(parentZ + localZ);
            const delta = MockVec3.transformQuat(new MockVec3(), new MockVec3(4 * scaleX, 6 * scaleY), rotation);
            const { target, gizmo } = createBox('area', delta);
            gizmo.onControllerMouseDown();
            gizmo.onControllerMouseMove();
            gizmo.onControllerMouseUp();
            expect(target.offset).toEqual(new MockVec2(7, -1));
            expect(target.size).toEqual(new MockSize(100, 80));
            expect(mockControlEnds).toEqual(['_components.0.offset']);
        });
    });

    it.each([false, true])('switches Box Alt mode during one drag (starts with Alt=%s)', (startsWithAlt) => {
        const target = { node: createNode(), offset: new MockVec2(), size: new MockSize(10, 20) };
        let delta = 2;
        const gizmo = new boxModule.SelectGizmo(target);
        (gizmo as any)._controller = {
            updated: true,
            getCurHandleType: () => 'x',
            getDeltaSize: () => new MockVec3(delta, 0),
        };
        gizmo.onKeyDown({ altKey: startsWithAlt });
        gizmo.onControllerMouseDown();
        gizmo.onControllerMouseMove();
        expect(target.size.width).toBe(startsWithAlt ? 14 : 12);
        expect(target.offset.x).toBe(startsWithAlt ? 0 : 1);

        gizmo.onKeyDown({ altKey: !startsWithAlt });
        delta = 4;
        gizmo.onControllerMouseMove();
        expect(target.size.width).toBe(startsWithAlt ? 14 : 18);
        expect(target.offset.x).toBe(startsWithAlt ? 2 : 1);

        gizmo.onKeyUp({ altKey: startsWithAlt });
        delta = 6;
        gizmo.onControllerMouseMove();
        expect(target.size.width).toBe(startsWithAlt ? 22 : 16);
        expect(target.offset.x).toBe(startsWithAlt ? 2 : 3);
        gizmo.onControllerMouseUp();
        expect(mockControlUpdates).toEqual(Array(3).fill('_components.0.size'));
        expect(mockControlEnds).toEqual(['_components.0.size']);
    });

    it('refreshes Polygon preview while the delete modifier stays pressed and geometry changes', () => {
        const target = {
            node: createNode(), editing: true, offset: new MockVec2(),
            points: [new MockVec2(), new MockVec2(10, 0), new MockVec2(0, 10)],
        };
        const gizmo = new polygonModule.SelectGizmo(target);
        let delta = new MockVec3();
        const controller = {
            updated: true, edit: true, points: [] as MockVec3[],
            updateData(points: MockVec3[]) { this.points = points; },
            getHandleData: () => ({ type: 'point', index: 1, deltaPos: delta }),
        };
        const left = createLineController();
        const right = createLineController();
        // Copy endpoints, as the real renderer stores vertex data rather than Vec3 references.
        left.updateData.mockImplementation((a: MockVec3, b: MockVec3) => [a.clone(), b.clone()]);
        right.updateData.mockImplementation((a: MockVec3, b: MockVec3) => [a.clone(), b.clone()]);
        Object.assign(gizmo, { _controller: controller, _leftDeleteLine: left, _rightDeleteLine: right, _isInitialized: true });
        gizmo.updateControllerData();
        gizmo.onControllerHoverIn({ handleName: 'p1', customData: { index: 1 } });
        gizmo.onControllerMouseDown();
        gizmo.onKeyDown({ ctrlKey: true, metaKey: false });
        left.updateData.mockClear();
        gizmo.onKeyDown({ ctrlKey: true, metaKey: false });
        expect(left.updateData).toHaveBeenCalled();
        for (const x of [2, 4, 6]) {
            delta = new MockVec3(x, 1);
            gizmo.onControllerMouseMove({ ctrlKey: true, metaKey: false });
            gizmo.onNodeChanged();
            expect(left.updateData.mock.results.at(-1)?.value[1]).toEqual(new MockVec3(10 + x, 1));
            expect(right.updateData.mock.results.at(-1)?.value[0]).toEqual(new MockVec3(10 + x, 1));
        }
        gizmo.onKeyUp({ ctrlKey: false, metaKey: false });
        expect(left.hide).toHaveBeenCalled();
        expect(right.hide).toHaveBeenCalled();
        expect(mockOperation.changePointer).toHaveBeenLastCalledWith('default');
    });

    it('clears Polygon preview and its active transaction when editing is disabled', () => {
        const target = {
            node: createNode(), editing: true, offset: new MockVec2(),
            points: [new MockVec2(), new MockVec2(10, 0), new MockVec2(0, 10)],
        };
        const gizmo = new polygonModule.SelectGizmo(target);
        const controller = {
            updated: true, edit: true, points: [] as MockVec3[],
            updateData(points: MockVec3[]) { this.points = points; },
            getHandleData: () => ({ type: 'point', index: 1, deltaPos: new MockVec3(2, 0) }),
        };
        const left = createLineController();
        const right = createLineController();
        Object.assign(gizmo, { _controller: controller, _leftDeleteLine: left, _rightDeleteLine: right, _isInitialized: true });
        gizmo.updateControllerData();
        gizmo.onControllerHoverIn({ handleName: 'p1', customData: { index: 1 } });
        gizmo.onControllerMouseDown();
        gizmo.onControllerMouseMove({ ctrlKey: true, metaKey: false });
        left.hide.mockClear();
        right.hide.mockClear();

        target.editing = false;
        gizmo.onNodeChanged();
        expect(mockControlEnds).toEqual(['_components.0.points']);
        gizmo.onControllerMouseUp();
        expect(controller.edit).toBe(false);
        expect(left.hide).toHaveBeenCalled();
        expect(right.hide).toHaveBeenCalled();
        expect(mockOperation.changePointer).toHaveBeenLastCalledWith('default');
        expect(mockControlEnds).toEqual(['_components.0.points']);
        target.editing = true;
        left.show.mockClear();
        right.show.mockClear();
        gizmo.onNodeChanged();
        expect(left.show).not.toHaveBeenCalled();
        expect(right.show).not.toHaveBeenCalled();
    });

    it('uses points scope for Polygon edge insertion and point deletion', () => {
        const createPolygonGizmo = (handleData: object) => {
            const target = {
                node: createNode(),
                offset: new MockVec2(),
                points: [new MockVec2(0, 0), new MockVec2(10, 0), new MockVec2(0, 10)],
            };
            const controller = {
                points: [new MockVec3(0, 0), new MockVec3(10, 0), new MockVec3(0, 10)],
                getHandleData: () => handleData,
            };
            const gizmo = new polygonModule.SelectGizmo(target);
            (gizmo as any)._controller = controller;
            (gizmo as any)._leftDeleteLine = createLineController();
            (gizmo as any)._rightDeleteLine = createLineController();
            return { gizmo, target };
        };

        const insertion = createPolygonGizmo({
            type: 'line',
            index: 0,
            hitPos: new MockVec3(5, 0),
        });
        insertion.gizmo.onControllerMouseDown();
        insertion.gizmo.onControllerMouseUp();
        expect(mockControlUpdates.pop()).toBe('_components.0.points');
        expect(mockControlEnds.pop()).toBe('_components.0.points');
        expect(insertion.target.points).toHaveLength(4);
        expect(insertion.target.points[1]).toMatchObject({ x: 5, y: 0 });

        const deletion = createPolygonGizmo({
            type: 'point',
            index: 1,
            deltaPos: new MockVec3(),
        });
        deletion.gizmo.onKeyDown({ ctrlKey: true, metaKey: false });
        deletion.gizmo.onControllerMouseDown();
        deletion.gizmo.onControllerMouseUp();
        expect(mockControlUpdates.pop()).toBe('_components.0.points');
        expect(mockControlEnds.pop()).toBe('_components.0.points');
        expect(deletion.target.points).toEqual([
            expect.objectContaining({ x: 0, y: 0 }),
            expect.objectContaining({ x: 0, y: 10 }),
        ]);
    });

    it('does not finish a Collider2D transaction when no drag change began', () => {
        const circleTarget = {
            node: createNode(),
            offset: new MockVec2(),
            radius: 10,
        };
        const circleGizmo = new circleModule.SelectGizmo(circleTarget);
        (circleGizmo as any)._controller = { getCurHandleType: () => 'x' };
        circleGizmo.onControllerMouseDown();
        circleGizmo.onControllerMouseUp();

        const boxTarget = {
            node: createNode(),
            offset: new MockVec2(),
            size: new MockSize(10, 20),
        };
        const boxGizmo = new boxModule.SelectGizmo(boxTarget);
        (boxGizmo as any)._controller = { getCurHandleType: () => 'x' };
        boxGizmo.onControllerMouseDown();
        boxGizmo.onControllerMouseUp();

        expect(mockControlUpdates).toEqual([]);
        expect(mockControlEnds).toEqual([]);
    });

    it('finishes each active Collider2D transaction once when selection hides the gizmo', () => {
        const circleTarget = {
            node: createNode(),
            offset: new MockVec2(),
            radius: 10,
        };
        const circleController = {
            updated: true,
            getCurHandleType: () => 'x',
            getDeltaRadius: () => 1,
            hide: jest.fn(),
        };
        const circleGizmo = new circleModule.SelectGizmo(circleTarget);
        (circleGizmo as any)._controller = circleController;
        circleGizmo.onControllerMouseDown();
        circleGizmo.onControllerMouseMove();
        circleGizmo.onHide();
        circleGizmo.onControllerMouseUp();
        expect(mockControlEnds).toEqual(['_components.0.radius']);

        mockControlEnds.length = 0;
        const boxTarget = {
            node: createNode(),
            offset: new MockVec2(),
            size: new MockSize(10, 20),
        };
        const boxController = {
            updated: true,
            getCurHandleType: () => 'x',
            getDeltaSize: () => new MockVec3(1, 0),
            hide: jest.fn(),
        };
        const boxGizmo = new boxModule.SelectGizmo(boxTarget);
        (boxGizmo as any)._controller = boxController;
        boxGizmo.onControllerMouseDown();
        boxGizmo.onControllerMouseMove();
        boxGizmo.onHide();
        boxGizmo.onControllerMouseUp();
        expect(mockControlEnds).toEqual(['_components.0.size']);

        mockControlEnds.length = 0;
        const polygonTarget = {
            node: createNode(),
            offset: new MockVec2(),
            points: [new MockVec2(0, 0), new MockVec2(10, 0), new MockVec2(0, 10)],
        };
        const polygonController = {
            updated: true,
            points: [new MockVec3(0, 0), new MockVec3(10, 0), new MockVec3(0, 10)],
            getHandleData: () => ({ type: 'point', index: 1, deltaPos: new MockVec3(1, 0) }),
            hide: jest.fn(),
        };
        const polygonGizmo = new polygonModule.SelectGizmo(polygonTarget);
        (polygonGizmo as any)._controller = polygonController;
        (polygonGizmo as any)._leftDeleteLine = createLineController();
        (polygonGizmo as any)._rightDeleteLine = createLineController();
        polygonGizmo.onControllerMouseDown();
        polygonGizmo.onControllerMouseMove({ ctrlKey: false, metaKey: false });
        polygonGizmo.onHide();
        polygonGizmo.onControllerMouseUp();
        expect(mockControlEnds).toEqual(['_components.0.points']);
    });

    it('restores Polygon copy/alias pointers and adjacent-edge delete preview', () => {
        const points = [new MockVec2(0, 0), new MockVec2(10, 0), new MockVec2(0, 10)];
        const worldPoints = [new MockVec3(1, 2), new MockVec3(11, 2), new MockVec3(1, 12)];
        const target = { node: createNode(), offset: new MockVec2(), points };
        const controller = { points: worldPoints };
        const leftLine = createLineController();
        const rightLine = createLineController();
        const gizmo = new polygonModule.SelectGizmo(target);
        (gizmo as any)._controller = controller;
        (gizmo as any)._leftDeleteLine = leftLine;
        (gizmo as any)._rightDeleteLine = rightLine;

        gizmo.onControllerHoverIn({ handleName: 'l0', customData: { index: 0 } });
        expect(mockOperation.changePointer).toHaveBeenLastCalledWith('copy');

        gizmo.onControllerHoverIn({ handleName: 'p1', customData: { index: 1 } });
        expect(mockOperation.changePointer).toHaveBeenLastCalledWith('default');
        gizmo.onKeyDown({ ctrlKey: true, metaKey: false });

        expect(mockOperation.changePointer).toHaveBeenLastCalledWith('alias');
        expect(leftLine.updateData).toHaveBeenLastCalledWith(worldPoints[0], worldPoints[1]);
        expect(rightLine.updateData).toHaveBeenLastCalledWith(worldPoints[1], worldPoints[2]);
        expect(leftLine.show).toHaveBeenCalled();
        expect(rightLine.show).toHaveBeenCalled();

        gizmo.onKeyUp({ ctrlKey: false, metaKey: false });
        expect(mockOperation.changePointer).toHaveBeenLastCalledWith('default');
        expect(leftLine.hide).toHaveBeenCalled();
        expect(rightLine.hide).toHaveBeenCalled();
        expect(mockEngine.repaintInEditMode).toHaveBeenCalled();
    });
});
