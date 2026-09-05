import type Grid from './grid';

/**
 * 刻度尺的屏幕映射，由相机实时状态构建（见 CameraController2D._rulerView），
 * 不依赖 Grid 的像素模型，保证刻度与渲染出的网格线/原点轴始终贴合。
 */
export interface IRulerView {
    /** 世界单位 → 屏幕像素（画布后备像素） */
    toX(value: number): number;
    toY(value: number): number;
    pxPerUnit: number;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

/**
 * 2D 场景刻度尺：横向（底部）+ 纵向（左侧），参考 Creator 场景 web ruler 移植。
 * 两个透明 canvas 由本类自建并 fixed 覆盖在宿主页上（Pink 内嵌宿主 / scene-editor.ejs
 * 等所有宿主通用，不依赖宿主页 DOM），仅绘制刻度文字。
 *
 * 刻度级别按「屏幕上 >= 50px 间隔」从 Grid 的 tick 序列里选取，缩放时自动换档；
 * 位置由相机实时状态换算，拖动/缩放后随 updateGrid 重绘。
 */
export class Ruler2D {
    private hCanvas: HTMLCanvasElement | null = null;
    private vCanvas: HTMLCanvasElement | null = null;
    private hCtx: CanvasRenderingContext2D | null = null;
    private vCtx: CanvasRenderingContext2D | null = null;
    private isShow = false;

    public init(): void {
        if (typeof document === 'undefined' || !document.body) {
            return;
        }
        this.hCanvas = this.ensureCanvas('scene-h-ruler', { left: '0', bottom: '0', width: '100%', height: '22px' });
        this.vCanvas = this.ensureCanvas('scene-v-ruler', { left: '0', top: '0', width: '35px', height: '100%' });
        this.hCtx = this.hCanvas ? this.hCanvas.getContext('2d') : null;
        this.vCtx = this.vCanvas ? this.vCanvas.getContext('2d') : null;
        this.resize();
    }

    /** 复用或创建透明刻度 canvas（fixed 覆盖、不拦截鼠标） */
    private ensureCanvas(id: string, css: Record<string, string>): HTMLCanvasElement | null {
        let el = document.getElementById(id) as HTMLCanvasElement | null;
        if (!el) {
            el = document.createElement('canvas');
            el.id = id;
            el.style.position = 'fixed';
            el.style.pointerEvents = 'none';
            el.style.zIndex = '6';
            for (const key of Object.keys(css)) {
                (el.style as unknown as Record<string, string>)[key] = css[key];
            }
            document.body.appendChild(el);
        }
        return el;
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
        const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
        if (this.hCanvas) {
            const rect = this.hCanvas.getBoundingClientRect();
            const cssW = rect.width > 0 ? rect.width : (typeof window !== 'undefined' ? window.innerWidth : 0);
            this.hCanvas.width = Math.max(1, Math.round(cssW * dpr));
            this.hCanvas.height = Math.max(1, Math.round(22 * dpr));
        }
        if (this.vCanvas) {
            const rect = this.vCanvas.getBoundingClientRect();
            const cssH = rect.height > 0 ? rect.height : (typeof window !== 'undefined' ? window.innerHeight : 0);
            this.vCanvas.width = Math.max(1, Math.round(35 * dpr));
            this.vCanvas.height = Math.max(1, Math.round(cssH * dpr));
        }
    }

    public updateTicks(grid: Grid, view: IRulerView): void {
        if (!this.hCtx || !this.vCtx || !this.hCanvas || !this.vCanvas) {
            return;
        }
        const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

        this.hCtx.clearRect(0, 0, this.hCanvas.width, this.hCanvas.height);
        this.vCtx.clearRect(0, 0, this.vCanvas.width, this.vCanvas.height);

        if (!this.isShow || !grid.hTicks || !grid.vTicks || !(view.pxPerUnit > 0)) {
            return;
        }

        const font = `${Math.round(11 * dpr)}px Arial`;
        const color = 'gray';
        // 刻度文字最小像素间隔，避免标签挤在一起（与 Creator 一致取 50，按 dpr 缩放）
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
