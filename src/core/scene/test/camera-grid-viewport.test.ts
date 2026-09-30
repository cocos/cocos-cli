import { Camera, Color, Vec3 } from 'cc';
import { CameraController2D } from '../scene-process/service/camera/camera-controller-2d';
import { Ruler2D } from '../scene-process/service/camera/ruler-2d';

jest.mock('cc', () => {
    class MockVec3 {
        constructor(public x = 0, public y = 0, public z = 0) {}
        clone() { return new MockVec3(this.x, this.y, this.z); }
    }

    class MockColor {
        static RED = new MockColor();
        static GREEN = new MockColor();
        static BLUE = new MockColor();
        constructor(public r = 85, public g = 85, public b = 85, public a = 255) {}
        clone() { return new MockColor(this.r, this.g, this.b, this.a); }
        fromHEX() { return this; }
    }

    return {
        Camera: { ProjectionType: { ORTHO: 0 } },
        Color: MockColor,
        Vec3: MockVec3,
        Quat: class {},
        Rect: class {
            constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
        },
        gfx: { AttributeName: { ATTR_POSITION: 'a_position', ATTR_COLOR: 'a_color' } },
    };
});

interface GridMesh {
    node: { active: boolean };
    positions: number[];
}

const mockMeshes: GridMesh[] = [];
jest.mock('../scene-process/service/camera/utils', () => ({
    CameraMoveMode: { IDLE: 0, PAN: 2 },
    CameraUtils: {
        createGrid: () => {
            const mesh = { node: { active: false }, positions: [] };
            mockMeshes.push(mesh);
            return mesh;
        },
        updateVBAttr: (mesh: GridMesh, attr: string, data: number[]) => {
            if (attr === 'a_position') {
                mesh.positions = data;
            }
        },
        updateIB: jest.fn(),
    },
}));

const mockRepaint = jest.fn();
jest.mock('../scene-process/service/core/decorator', () => ({
    Service: {
        Engine: { repaintInEditMode: () => mockRepaint() },
        Gizmo: { transformToolData: {} },
    },
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request: async () => undefined }) },
}));

describe('CameraController2D grid viewport coverage', () => {
    beforeEach(() => {
        mockMeshes.length = 0;
        mockRepaint.mockClear();
        Object.defineProperty(globalThis, 'cc', {
            configurable: true,
            value: {
                color: () => new Color(),
                game: { canvas: { width: 1280, height: 720 } },
            },
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        Reflect.deleteProperty(globalThis, 'cc');
    });

    /** 创建带正交投影的相机，复现宿主独立修改 viewport 的行为 */
    function createController(active = true) {
        const viewport = { width: 1280, height: 720 };
        const node = {
            parent: {},
            worldPosition: new Vec3(),
            setWorldPosition(position: Vec3) { this.worldPosition = position; },
            setWorldRotation: jest.fn(),
            getWorldPosition() { return this.worldPosition; },
        };
        const camera = {
            node,
            orthoHeight: 360,
            camera: {
                width: 2560,
                height: 1440,
                update: jest.fn(),
                worldToScreen(out: Vec3, point: Vec3) {
                    const scale = viewport.height / (2 * camera.orthoHeight);
                    out.x = viewport.width / 2 + (point.x - node.worldPosition.x) * scale;
                    out.y = this.height - viewport.height / 2
                        + (point.y - node.worldPosition.y) * scale;
                    out.z = 0;
                    return out;
                },
            },
        };
        const controller = new CameraController2D();
        const rulers: Ruler2D[] = [];
        jest.spyOn(Ruler2D.prototype, 'init').mockImplementation(function (this: Ruler2D) {
            rulers.push(this);
        });
        controller.init(camera as unknown as Camera);
        if (active) {
            controller.active = true;
            controller.zoomTo(0.02);
        }
        const ruler = rulers[0];
        if (!ruler) {
            throw new Error('Camera controller did not initialize its ruler');
        }

        return { controller, camera, viewport, ruler };
    }

    /** 模拟真实引擎在 3D 正交侧视下接近零的水平投影比例 */
    function useSideView(fixture: ReturnType<typeof createController>) {
        fixture.camera.node.setWorldPosition(new Vec3(20, 0, 0));
        fixture.camera.orthoHeight = 1;
        return jest.spyOn(fixture.camera.camera, 'worldToScreen').mockImplementation((out, point) => {
            out.x = 640 + point.x * 2 ** -43;
            out.y = 360 + point.y * 360;
            out.z = 0;
            return out;
        });
    }

    /** 检查每条可见网格线都延伸到视口边缘，并覆盖两个方向的刻度 */
    function expectCoverage(fixture: ReturnType<typeof createController>) {
        const { camera, viewport } = fixture;
        const { x, y } = camera.node.worldPosition;
        const halfWidth = camera.orthoHeight * viewport.width / viewport.height;
        const left = x - halfWidth;
        const right = x + halfWidth;
        const bottom = y - camera.orthoHeight;
        const top = y + camera.orthoHeight;
        const horizontal: number[] = [];
        const vertical: number[] = [];
        const positions = mockMeshes[0].positions;

        for (let i = 0; i < positions.length; i += 4) {
            const [x1, y1, x2, y2] = positions.slice(i, i + 4);
            if (x1 === x2 && y1 !== y2 && x1 >= left && x1 <= right) {
                expect(Math.min(y1, y2)).toBeLessThanOrEqual(bottom + 0.001);
                expect(Math.max(y1, y2)).toBeGreaterThanOrEqual(top - 0.001);
                vertical.push(x1);
            }
            if (y1 === y2 && x1 !== x2 && y1 >= bottom && y1 <= top) {
                expect(Math.min(x1, x2)).toBeLessThanOrEqual(left + 0.001);
                expect(Math.max(x1, x2)).toBeGreaterThanOrEqual(right - 0.001);
                horizontal.push(y1);
            }
        }

        // 允许边缘到最近刻度有一个细网格间距，不能出现成片空白
        const maxGap = 10 * (2 * camera.orthoHeight) / viewport.height;
        expect(Math.min(...vertical) - left).toBeLessThanOrEqual(maxGap);
        expect(right - Math.max(...vertical)).toBeLessThanOrEqual(maxGap);
        expect(Math.min(...horizontal) - bottom).toBeLessThanOrEqual(maxGap);
        expect(top - Math.max(...horizontal)).toBeLessThanOrEqual(maxGap);
    }

    it.each([
        { width: 1940, height: 684 },
        { width: 600, height: 1200 },
    ])('covers a resized $width x $height viewport without canvas-resize', (size) => {
        const fixture = createController();
        Object.assign(fixture.viewport, size);
        fixture.controller.refresh();
        expectCoverage(fixture);
    });

    it('covers the new camera position immediately after panning and zooming', () => {
        const fixture = createController();
        fixture.viewport.width = 1940;
        fixture.viewport.height = 684;
        fixture.controller.grid.pan(1500, -900);
        fixture.controller.updateGrid();
        fixture.controller.adjustCamera();
        expectCoverage(fixture);

        fixture.controller.scale(20, 200, 150);
        expectCoverage(fixture);
    });

    it('rebuilds and repaints on host resize even when origin axes are hidden', () => {
        const fixture = createController();
        fixture.controller.updateOriginAxisByConfig({ x: false, y: false });
        fixture.viewport.width = 1940;
        fixture.viewport.height = 684;
        mockRepaint.mockClear();

        fixture.ruler.onNeedRedraw!();

        expectCoverage(fixture);
        expect(mockRepaint).toHaveBeenCalled();
    });

    it('extends both origin axes across the resized viewport', () => {
        const fixture = createController();
        fixture.controller.showGrid(true);
        fixture.viewport.width = 1940;
        fixture.viewport.height = 684;
        fixture.ruler.onNeedRedraw!();

        const positions = mockMeshes[1].positions;
        const start = new Vec3();
        const end = new Vec3();
        const renderCamera = fixture.camera.camera;
        renderCamera.worldToScreen(start, new Vec3(positions[0], positions[1]));
        renderCamera.worldToScreen(end, new Vec3(positions[2], positions[3]));
        expect(start.x).toBeLessThanOrEqual(0);
        expect(end.x).toBeGreaterThanOrEqual(fixture.viewport.width);

        renderCamera.worldToScreen(start, new Vec3(positions[4], positions[5]));
        renderCamera.worldToScreen(end, new Vec3(positions[6], positions[7]));
        expect(start.y).toBeLessThanOrEqual(renderCamera.height - fixture.viewport.height);
        expect(end.y).toBeGreaterThanOrEqual(renderCamera.height);
    });

    describe.each([false, true])('inactive 2D controller (previously active: %s)', (wasActive) => {
        it.each(['host resize', 'grid color', 'grid visibility', 'origin axes'])(
            'does not sample the 3D projection on %s', (trigger) => {
                const fixture = createController(wasActive);
                fixture.controller.active = false;
                const project = useSideView(fixture);

                // 一旦回归也只记录调用，避免测试进程实际枚举数万亿个刻度
                jest.spyOn(fixture.controller.grid.hTicks!, 'ticksAtLevel').mockReturnValue([]);
                jest.spyOn(fixture.controller.grid.vTicks!, 'ticksAtLevel').mockReturnValue([]);

                if (trigger === 'host resize') {
                    fixture.ruler.onNeedRedraw!();
                } else if (trigger === 'grid color') {
                    fixture.controller.lineColor = new Color(100, 100, 100);
                    fixture.controller.updateGrid();
                } else if (trigger === 'grid visibility') {
                    fixture.controller.isGridVisible = true;
                } else {
                    fixture.controller.updateOriginAxisByConfig({ x: true, y: true });
                }

                expect(project).not.toHaveBeenCalled();
            },
        );
    });

    it('rebuilds full coverage when the 2D controller is reactivated', () => {
        const fixture = createController();
        fixture.controller.active = false;
        const project = useSideView(fixture);
        fixture.viewport.width = 1940;
        fixture.viewport.height = 684;

        project.mockRestore();
        fixture.controller.active = true;

        expectCoverage(fixture);
        expect(mockMeshes.map(mesh => mesh.node.active)).toEqual([true, true]);
    });
});
