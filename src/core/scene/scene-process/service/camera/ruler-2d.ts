import type Grid from './grid';

/**
 * 刻度尺的屏幕映射，由相机实时状态构建（见 CameraController2D._rulerView），
 * 不依赖 Grid 的像素模型，保证刻度与渲染出的网格线/原点轴始终贴合。
 */
export interface IRulerView {
    /** 世界单位 → 屏幕像素（引擎渲染后备像素） */
    toX(value: number): number;
    toY(value: number): number;
    pxPerUnit: number;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

/** 渲染相机（renderer.scene.Camera）的最小结构类型，便于解耦与单测 */
export interface IRulerRenderCamera {
    width?: number;
    height?: number;
    worldToScreen?: (out: { x: number; y: number; z: number }, p: { x: number; y: number; z: number }) => { x: number; y: number; z: number };
    update?: (forceUpdate?: boolean) => void;
}

// buildRulerView 复用临时点，避免高频路径分配
const _bvO = { x: 0, y: 0, z: 0 };
const _bvA = { x: 0, y: 0, z: 0 };
const _bvB = { x: 0, y: 0, z: 0 };
const _bvP = { x: 0, y: 0, z: 0 };

/**
 * 构建刻度尺屏幕映射（纯函数，便于单测）。
 * 正交投影下映射是仿射的：投影世界点 (0,0)/(1,0)/(0,1) 拟合线性系数。
 *
 * 视口尺寸优先取渲染相机自身的 width/height（PR #914 第二轮 P2）：
 * 跨不同 DPR/分辨率屏幕时宿主直接更新 canvas 与渲染相机、不走 onResize，
 * 控制器缓存的 size 会陈旧；worldToScreen 的 y 位于渲染目标高度空间，
 * Y 翻转必须用同一高度，否则纵向刻度整体错位。
 */
export function buildRulerView(
    rc: IRulerRenderCamera | undefined,
    size: { width: number; height: number },
    ortho: { orthoHeight: number; x: number; y: number },
): IRulerView {
    const W = size.width;
    const H = size.height;
    let ox: number;
    let oy: number;
    let sx: number;
    let sy: number;
    let viewW = W;
    let viewH = H;
    if (rc && typeof rc.worldToScreen === 'function') {
        // 矩阵在渲染帧才重算，这里同步 flush，保证缩放当帧刻度即用新相机
        if (typeof rc.update === 'function') {
            rc.update();
        }
        if (rc.width && rc.width > 0) {
            viewW = rc.width;
        }
        if (rc.height && rc.height > 0) {
            viewH = rc.height;
        }
        rc.worldToScreen(_bvO, { x: 0, y: 0, z: 0 });
        rc.worldToScreen(_bvA, { x: 1, y: 0, z: 0 });
        rc.worldToScreen(_bvB, { x: 0, y: 1, z: 0 });
        ox = _bvO.x;
        oy = _bvO.y; // 引擎屏幕坐标 y 向上
        sx = (_bvA.x - ox) || 1;
        sy = (_bvB.y - oy) || 1;
    } else {
        const s = H / (2 * ortho.orthoHeight);
        ox = W / 2 - ortho.x * s;
        oy = H / 2 + ortho.y * s;
        sx = s;
        sy = s;
    }
    const x0 = (0 - ox) / sx;
    const x1 = (viewW - ox) / sx;
    const y0 = (0 - oy) / sy;
    const y1 = (viewH - oy) / sy;
    return {
        pxPerUnit: Math.abs(sx),
        xMin: Math.min(x0, x1),
        xMax: Math.max(x0, x1),
        yMin: Math.min(y0, y1),
        yMax: Math.max(y0, y1),
        toX: (v: number) => ox + v * sx,
        toY: (v: number) => viewH - (oy + v * sy),
    };
}

/**
 * 2D 场景刻度尺：横向（底部）+ 纵向（左侧），参考 Creator 场景 web ruler 移植。
 * 两个透明 canvas 由本类自建并 fixed 覆盖在宿主页上（Pink 内嵌宿主 / scene-editor.ejs
 * 等所有宿主通用，不依赖宿主页 DOM），仅绘制刻度文字。
 *
 * 环境边界（review P1）：headless 场景进程提供 mock document，其元素没有 getContext，
 * 本类在此整体 no-op，不影响场景服务启动与保存/关闭流程。
 *
 * 像素基准（review P2）：worldToScreen 坐标位于引擎渲染后备像素空间（引擎 DPR 封顶），
 * 故刻度后备/字号统一使用「有效渲染 DPR」（引擎 canvas 后备/CSS 比），与引擎同基准。
 *
 * 视口变化（review P2）：Pink 宿主摘除引擎 window-resize 自适应、面板 resize 不走
 * 引擎 canvas-resize 事件链，故本类自行观察 overlay 尺寸（ResizeObserver + window
 * resize，rAF 去抖），变化后重设后备并经 onNeedRedraw 回调控制器重画。
 */
export class Ruler2D {
    private hCanvas: HTMLCanvasElement | null = null;
    private vCanvas: HTMLCanvasElement | null = null;
    private hCtx: CanvasRenderingContext2D | null = null;
    private vCtx: CanvasRenderingContext2D | null = null;
    private isShow = false;
    private ro: ResizeObserver | null = null;
    private resizePending = false;

    /** 控制器注入的重画入口；视口变化重设后备后触发 */
    public onNeedRedraw: (() => void) | null = null;

    public init(): void {
        if (typeof document === 'undefined' || !document.body) {
            return;
        }
        this.hCanvas = this.ensureCanvas('scene-h-ruler', { left: '0', bottom: '0', width: '100%', height: '22px' });
        this.vCanvas = this.ensureCanvas('scene-v-ruler', { left: '0', top: '0', width: '35px', height: '100%' });
        this.hCtx = this.hCanvas ? this.hCanvas.getContext('2d') : null;
        this.vCtx = this.vCanvas ? this.vCanvas.getContext('2d') : null;
        this.observeHost();
        this.resize();
    }

    /** 复用或创建透明刻度 canvas；headless mock 元素无 getContext 时返回 null（整体 no-op） */
    private ensureCanvas(id: string, css: Record<string, string>): HTMLCanvasElement | null {
        let el = document.getElementById(id) as HTMLCanvasElement | null;
        let created = false;
        if (!el) {
            created = true;
            el = document.createElement('canvas') as HTMLCanvasElement;
            el.id = id;
            const st = (el as unknown as { style?: Record<string, string> }).style;
            if (st) {
                st.position = 'fixed';
                st.pointerEvents = 'none';
                st.zIndex = '6';
                for (const key of Object.keys(css)) {
                    st[key] = css[key];
                }
            }
        }
        if (typeof (el as unknown as { getContext?: unknown }).getContext !== 'function') {
            return null;
        }
        if (created) {
            document.body.appendChild(el);
        }
        return el;
    }

    /** 独立观察宿主视口：overlay 尺寸或 window 变化时重设后备并重画 */
    private observeHost(): void {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
            return;
        }
        window.addEventListener('resize', this.onHostResize);
        if (typeof ResizeObserver === 'function') {
            this.ro = new ResizeObserver(this.onHostResize);
            if (this.hCanvas) {
                this.ro.observe(this.hCanvas);
            }
            if (this.vCanvas) {
                this.ro.observe(this.vCanvas);
            }
        }
    }

    private readonly onHostResize = (): void => {
        if (this.resizePending) {
            return;
        }
        this.resizePending = true;
        const raf = (globalThis as unknown as { requestAnimationFrame?: (cb: () => void) => void }).requestAnimationFrame;
        const run = (): void => {
            this.resizePending = false;
            this.resize();
            if (this.onNeedRedraw) {
                this.onNeedRedraw();
            }
        };
        if (typeof raf === 'function') {
            raf(run);
        } else {
            run();
        }
    };

    /** 有效渲染 DPR：引擎 canvas 后备/CSS 比（与引擎同封顶），回退 window.devicePixelRatio */
    private renderDpr(): number {
        let dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
        const engineCanvas = (globalThis as unknown as { cc?: { game?: { canvas?: HTMLCanvasElement } } }).cc?.game?.canvas;
        if (engineCanvas && typeof engineCanvas.getBoundingClientRect === 'function') {
            const rect = engineCanvas.getBoundingClientRect();
            if (rect.width > 0 && engineCanvas.width > 0) {
                dpr = engineCanvas.width / rect.width;
            }
        }
        return dpr > 0 ? dpr : 1;
    }

    public show(isShow: boolean): void {
        this.isShow = isShow;
        if (!isShow) {
            // 切 3D 等场景下立即清屏，避免残留刻度
            if (this.hCanvas && this.hCtx) {
                this.hCtx.clearRect(0, 0, this.hCanvas.width, this.hCanvas.height);
            }
            if (this.vCanvas && this.vCtx) {
                this.vCtx.clearRect(0, 0, this.vCanvas.width, this.vCanvas.height);
            }
        }
    }

    public resize(): void {
        const dpr = this.renderDpr();
        if (this.hCanvas) {
            const cssW = this.cssWidthOf(this.hCanvas);
            this.hCanvas.width = Math.max(1, Math.round(cssW * dpr));
            this.hCanvas.height = Math.max(1, Math.round(22 * dpr));
        }
        if (this.vCanvas) {
            const cssH = this.cssHeightOf(this.vCanvas);
            this.vCanvas.width = Math.max(1, Math.round(35 * dpr));
            this.vCanvas.height = Math.max(1, Math.round(cssH * dpr));
        }
    }

    private cssWidthOf(el: HTMLCanvasElement): number {
        if (typeof el.getBoundingClientRect === 'function') {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0) {
                return rect.width;
            }
        }
        return typeof window !== 'undefined' ? window.innerWidth : 0;
    }

    private cssHeightOf(el: HTMLCanvasElement): number {
        if (typeof el.getBoundingClientRect === 'function') {
            const rect = el.getBoundingClientRect();
            if (rect.height > 0) {
                return rect.height;
            }
        }
        return typeof window !== 'undefined' ? window.innerHeight : 0;
    }

    public updateTicks(grid: Grid, view: IRulerView): void {
        if (!this.hCtx || !this.vCtx || !this.hCanvas || !this.vCanvas) {
            return;
        }
        const dpr = this.renderDpr();

        this.hCtx.clearRect(0, 0, this.hCanvas.width, this.hCanvas.height);
        this.vCtx.clearRect(0, 0, this.vCanvas.width, this.vCanvas.height);

        if (!this.isShow || !grid.hTicks || !grid.vTicks || !(view.pxPerUnit > 0)) {
            return;
        }

        const font = `${Math.round(11 * dpr)}px Arial`;
        const color = 'gray';
        // 刻度文字最小像素间隔，避免标签挤在一起（与 Creator 一致取 50，按有效 DPR 缩放）
        const minStep = 50 * dpr;

        // 横向刻度
        const hStep = pickTickStep(grid.hTicks.ticks, view.pxPerUnit, minStep);
        if (hStep > 0) {
            this.hCtx.font = font;
            this.hCtx.fillStyle = color;
            this.hCtx.textBaseline = 'bottom';
            const first = Math.ceil(view.xMin / hStep);
            const last = Math.floor(view.xMax / hStep);
            for (let i = first; i <= last; i++) {
                const value = i * hStep;
                const x = Math.floor(view.toX(value)) + Math.round(4 * dpr);
                this.hCtx.fillText(formatLabel(value), x, this.hCanvas.height - Math.round(3 * dpr));
            }
        }

        // 纵向刻度
        const vStep = pickTickStep(grid.vTicks.ticks, view.pxPerUnit, minStep);
        if (vStep > 0) {
            this.vCtx.font = font;
            this.vCtx.fillStyle = color;
            this.vCtx.textBaseline = 'middle';
            const first = Math.ceil(view.yMin / vStep);
            const last = Math.floor(view.yMax / vStep);
            for (let i = first; i <= last; i++) {
                const value = i * vStep;
                const y = Math.floor(view.toY(value));
                this.vCtx.fillText(formatLabel(value), Math.round(4 * dpr), y - Math.round(8 * dpr));
            }
        }
    }
}

/** 从 tick 序列（升序）中选第一个屏幕间距 >= minStep 的级别；都不够则用最大级 */
function pickTickStep(ticks: number[], pxPerUnit: number, minStep: number): number {
    if (!ticks.length) {
        return 0;
    }
    let step = ticks[ticks.length - 1];
    for (const t of ticks) {
        if (t * pxPerUnit >= minStep) {
            step = t;
            break;
        }
    }
    return step;
}

function formatLabel(value: number): string {
    const rounded = Math.round(value * 100) / 100;
    return rounded.toString();
}

export default Ruler2D;
