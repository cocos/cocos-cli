import LinearTicks from './linear-ticks';

function clamp(val: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, val));
}

function _uninterpolate(a: number, b: number) {
    b = (b -= a) || 1 / b;
    return function(x: number) {
        return (x - a) / b;
    };
}

function _interpolate(a: number, b: number) {
    return function(t: number) {
        return a * (1 - t) + b * t;
    };
}

class Grid {
    private _canvasWidth = 0;
    private _canvasHeight = 0;

    public hTicks: LinearTicks | null = null;
    public xAxisScale = 1.0;
    public xAxisOffset = 1.0;
    public xAnchor = 0.5;

    public vTicks: LinearTicks | null = null;
    public yAxisScale = 1.0;
    public yAxisOffset = 1.0;
    public yAnchor = 0.5;

    private _xAnchorOffset = 0;
    private _yAnchorOffset = 0;

    pixelToValueH: Function | null = null;
    valueToPixelH: Function | null = null;
    pixelToValueV: Function | null = null;
    valueToPixelV: Function | null = null;

    public xDirection = 0;
    public yDirection = 0;
    public xMinRange: number | null = null;
    public xMaxRange: number | null = null;
    public yMinRange: number | null = null;
    public yMaxRange: number | null = null;

    constructor(canvasWidth: number, canvasHeight: number) {
        this._canvasWidth = canvasWidth;
        this._canvasHeight = canvasHeight;
    }

    get canvasWidth() { return this._canvasWidth; }
    get canvasHeight() { return this._canvasHeight; }

    setAnchor(x: number, y: number) {
        this.xAnchor = clamp(x, -1, 1);
        this.yAnchor = clamp(y, -1, 1);
    }

    setScaleH(lods: number[], minScale: number, maxScale: number) {
        this.hTicks = new LinearTicks().initTicks(lods, minScale, maxScale).spacing(10, 200);
        this.xAxisScale = clamp(this.xAxisScale, this.hTicks.minValueScale, this.hTicks.maxValueScale);
        this.pixelToValueH = (x: number) => (x - this.xAxisOffset) / this.xAxisScale;
        this.valueToPixelH = (x: number) => x * this.xAxisScale + this.xAxisOffset;
    }

    setMappingH(minValue: number, maxValue: number, pixelRange: number) {
        this._xAnchorOffset = minValue / (maxValue - minValue);
        this.xDirection = maxValue - minValue > 0 ? 1 : -1;
        this.pixelToValueH = (x: number) => {
            const pixelOffset = this.xAxisOffset;
            const ratio = this._canvasWidth / pixelRange;
            const u = _uninterpolate(0.0, this._canvasWidth);
            const i = _interpolate(minValue * ratio, maxValue * ratio);
            return i(u(x - pixelOffset)) / this.xAxisScale;
        };
        this.valueToPixelH = (x: number) => {
            const pixelOffset = this.xAxisOffset;
            const ratio = this._canvasWidth / pixelRange;
            const u = _uninterpolate(minValue * ratio, maxValue * ratio);
            const i = _interpolate(0.0, this._canvasWidth);
            return i(u(x * this.xAxisScale)) + pixelOffset;
        };
    }

    setScaleV(lods: number[], minScale: number, maxScale: number) {
        this.vTicks = new LinearTicks().initTicks(lods, minScale, maxScale).spacing(10, 200);
        this.yAxisScale = clamp(this.yAxisScale, this.vTicks.minValueScale, this.vTicks.maxValueScale);
        this.pixelToValueV = (y: number) => (this._canvasHeight - y + this.yAxisOffset) / this.yAxisScale;
        this.valueToPixelV = (y: number) => -y * this.yAxisScale + this._canvasHeight + this.yAxisOffset;
    }

    setMappingV(minValue: number, maxValue: number, pixelRange: number) {
        this._yAnchorOffset = minValue / (maxValue - minValue);
        this.yDirection = maxValue - minValue > 0 ? 1 : -1;
        this.pixelToValueV = (y: number) => {
            const pixelOffset = this.yAxisOffset;
            const ratio = this._canvasHeight / pixelRange;
            const u = _uninterpolate(0.0, this._canvasHeight);
            const i = _interpolate(minValue * ratio, maxValue * ratio);
            return i(u(y - pixelOffset)) / this.yAxisScale;
        };
        this.valueToPixelV = (y: number) => {
            const pixelOffset = this.yAxisOffset;
            const ratio = this._canvasHeight / pixelRange;
            const u = _uninterpolate(minValue * ratio, maxValue * ratio);
            const i = _interpolate(0.0, this._canvasHeight);
            return i(u(y * this.yAxisScale)) + pixelOffset;
        };
    }

    pan(deltaPixelX: number, deltaPixelY: number) {
        this.panX(deltaPixelX);
        this.panY(deltaPixelY);
    }

    panX(deltaPixelX: number) {
        if (!this.valueToPixelH) return;
        const newOffset = this.xAxisOffset + deltaPixelX;
        this.xAxisOffset = 0.0;
        let min: number | undefined;
        let max: number | undefined;
        if (this.xMinRange !== undefined && this.xMinRange !== null) {
            min = this.valueToPixelH(this.xMinRange);
        }
        if (this.xMaxRange !== undefined && this.xMaxRange !== null) {
            max = this.valueToPixelH(this.xMaxRange) as number;
            max = Math.max(0, max - this._canvasWidth);
        }
        this.xAxisOffset = newOffset;
        if (min !== undefined && max !== undefined) {
            this.xAxisOffset = clamp(this.xAxisOffset, -max, -min);
            return;
        }
        if (min !== undefined) {
            this.xAxisOffset = Math.min(this.xAxisOffset, -min);
            return;
        }
        if (max !== undefined) {
            this.xAxisOffset = Math.max(this.xAxisOffset, -max);
        }
    }

    panY(deltaPixelY: number) {
        if (!this.valueToPixelV) return;
        const newOffset = this.yAxisOffset + deltaPixelY;
        this.yAxisOffset = 0.0;
        let min: number | undefined;
        let max: number | undefined;
        if (this.yMinRange !== undefined && this.yMinRange !== null) {
            min = this.valueToPixelV(this.yMinRange);
        }
        if (this.yMaxRange !== undefined && this.yMaxRange !== null) {
            max = this.valueToPixelV(this.yMaxRange) as number;
            max = Math.max(0, max - this._canvasHeight);
        }
        this.yAxisOffset = newOffset;
        if (min !== undefined && max !== undefined) {
            this.yAxisOffset = clamp(this.yAxisOffset, -max, -min);
            return;
        }
        if (min !== undefined) {
            this.yAxisOffset = Math.min(this.yAxisOffset, -min);
            return;
        }
        if (max !== undefined) {
            this.yAxisOffset = Math.max(this.yAxisOffset, -max);
        }
    }

    xAxisScaleAt(pixelX: number, scale: number) {
        const oldValueX = this.pixelToValueH!(pixelX);
        this.xAxisScale = clamp(scale, this.hTicks!.minValueScale, this.hTicks!.maxValueScale);
        const newScreenX = this.valueToPixelH!(oldValueX);
        this.pan(pixelX - newScreenX, 0);
    }

    yAxisScaleAt(pixelY: number, scale: number) {
        const oldValueY = this.pixelToValueV!(pixelY);
        this.yAxisScale = clamp(scale, this.vTicks!.minValueScale, this.vTicks!.maxValueScale);
        const newScreenY = this.valueToPixelV!(oldValueY);
        this.pan(0, pixelY - newScreenY);
    }

    xAxisSync(x: number, scaleX: number) {
        this.xAxisOffset = x;
        this.xAxisScale = scaleX;
    }

    yAxisSync(y: number, scaleY: number) {
        this.yAxisOffset = y;
        this.yAxisScale = scaleY;
    }

    resize(w: number, h: number) {
        if (!w || !h) return;
        if (this._canvasWidth !== 0) {
            this.panX((w - this._canvasWidth) * (this.xAnchor + this._xAnchorOffset));
        }
        if (this._canvasHeight !== 0) {
            this.panY((h - this._canvasHeight) * (this.yAnchor + this._yAnchorOffset));
        }
        this._canvasWidth = w;
        this._canvasHeight = h;
    }

    get left() { return this.pixelToValueH ? this.pixelToValueH(0) : 0; }
    get right() { return this.pixelToValueH ? this.pixelToValueH(this._canvasWidth) : 0; }
    get top() { return this.pixelToValueV ? this.pixelToValueV(0) : 0; }
    get bottom() { return this.pixelToValueV ? this.pixelToValueV(this._canvasHeight) : 0; }

    updateRange() {
        if (this.hTicks) this.hTicks.range(this.left, this.right, this._canvasWidth);
        if (this.vTicks) this.vTicks.range(this.top, this.bottom, this._canvasHeight);
    }
}

export default Grid;
