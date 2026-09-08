import { Ruler2D, buildRulerView } from '../scene-process/service/camera/ruler-2d';

/**
 * 回归护栏（PR #914 review P1）：headless 场景进程提供 mock document，
 * 其 canvas 元素没有 getContext；Ruler2D 必须整体 no-op，
 * 不能让 CameraController2D.init / CameraService.onEditorOpened 抛异常。
 */
describe('Ruler2D headless safety', () => {
    afterEach(() => {
        delete (globalThis as any).document;
        delete (globalThis as any).window;
        delete (globalThis as any).cc;
    });

    it('no-ops when mock DOM elements lack getContext', () => {
        (globalThis as any).document = {
            body: { appendChild: jest.fn() },
            getElementById: () => null,
            createElement: () => ({ style: {} }),
        };

        const ruler = new Ruler2D();
        expect(() => ruler.init()).not.toThrow();
        expect(() => ruler.resize()).not.toThrow();
        expect(() => ruler.show(true)).not.toThrow();

        const grid: any = { hTicks: { ticks: [1, 10, 100] }, vTicks: { ticks: [1, 10, 100] } };
        const view: any = {
            toX: (v: number) => v * 2,
            toY: (v: number) => v * 2,
            pxPerUnit: 2,
            xMin: 0,
            xMax: 100,
            yMin: 0,
            yMax: 100,
        };
        expect(() => ruler.updateTicks(grid, view)).not.toThrow();
        expect(() => ruler.show(false)).not.toThrow();
    });

    it('no-ops without any document', () => {
        const ruler = new Ruler2D();
        expect(() => ruler.init()).not.toThrow();
        expect(() => ruler.resize()).not.toThrow();
    });

describe('buildRulerView viewport freshness (PR #914 round-2 P2)', () => {
    it('uses render-camera dimensions for the Y flip when controller size is stale', () => {
        const rc = {
            width: 1200,
            height: 1080,
            update: jest.fn(),
            worldToScreen: (out: any, p: any) => {
                out.x = 600 + p.x * 2;
                out.y = 540 + p.y * 2;
                return out;
            },
        };
        // 控制器缓存 size 仍是旧的 600x700（跨屏前 DPR2），渲染目标已变为 1200x1080
        const view = buildRulerView(rc as any, { width: 600, height: 700 }, { orthoHeight: 350, x: 0, y: 0 });
        expect(rc.update).toHaveBeenCalled();
        expect(view.pxPerUnit).toBe(2);
        expect(view.toX(0)).toBe(600);
        // Y 翻转必须用渲染高度 1080，而不是陈旧的 700
        expect(view.toY(0)).toBe(1080 - 540);
        expect(view.yMin).toBeCloseTo(-270);
        expect(view.yMax).toBeCloseTo(270);
        expect(view.xMin).toBeCloseTo(-300);
        expect(view.xMax).toBeCloseTo(300);
    });

    it('falls back to cached size and ortho when no render camera', () => {
        const view = buildRulerView(undefined, { width: 800, height: 600 }, { orthoHeight: 150, x: 100, y: 50 });
        // s = 600 / (2*150) = 2
        expect(view.pxPerUnit).toBe(2);
        expect(view.toX(100)).toBe(400);
        expect(view.toY(50)).toBe(100);
    });

    it('falls back to cached size when render camera lacks dimensions', () => {
        const rc = {
            width: 0,
            height: 0,
            worldToScreen: (out: any, p: any) => {
                out.x = 10 + p.x;
                out.y = 20 + p.y;
                return out;
            },
        };
        const view = buildRulerView(rc as any, { width: 640, height: 480 }, { orthoHeight: 240, x: 0, y: 0 });
        expect(view.toY(0)).toBe(480 - 20);
        expect(view.yMax).toBeCloseTo(460);
    });
});

describe('Ruler2D DPR backing', () => {
    it('uses engine canvas backing ratio as effective DPR when available', () => {
        (globalThis as any).window = { devicePixelRatio: 3, innerWidth: 600, innerHeight: 400, addEventListener: jest.fn() };
        const rect = { width: 600, height: 400 };
        const engineCanvas = { width: 1200, height: 800, getBoundingClientRect: () => rect };
        (globalThis as any).cc = { game: { canvas: engineCanvas } };

        const hEl: any = {
            style: {},
            getContext: () => ({ clearRect: jest.fn(), fillText: jest.fn() }),
            getBoundingClientRect: () => ({ width: 600, height: 22 }),
            width: 0,
            height: 0,
        };
        const vEl: any = {
            style: {},
            getContext: () => ({ clearRect: jest.fn(), fillText: jest.fn() }),
            getBoundingClientRect: () => ({ width: 35, height: 400 }),
            width: 0,
            height: 0,
        };
        const queue = [hEl, vEl];
        (globalThis as any).document = {
            body: { appendChild: jest.fn() },
            getElementById: () => null,
            createElement: () => queue.shift() || hEl,
        };

        const ruler = new Ruler2D();
        ruler.init();
        // 引擎 canvas 1200/600 = 2（封顶基准），横向后备应为 600*2 而非 600*3
        expect(hEl.width).toBe(1200);
        expect(hEl.height).toBe(44);
        expect(vEl.width).toBe(70);
        expect(vEl.height).toBe(800);
    });
});
});
