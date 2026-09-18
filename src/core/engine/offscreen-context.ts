/** Install a Node-owned WebGL canvas without an IDE or browser preview process. */
export function installOffscreenContext(): boolean {
    const scope = globalThis as any;
    const Canvas = scope.HTMLCanvasElement ?? scope.ccwindow?.HTMLCanvasElement;
    if (!Canvas?.prototype?.getContext) {
        console.warn('[Scene] Offscreen rendering unavailable: the engine canvas adapter is missing.');
        return false;
    }
    if (Canvas.prototype.__cliOffscreenContext) return true;
    try {
        const createContext = require('gl');
        const { createCanvas, loadImage } = require('@napi-rs/canvas');
        const probe = createContext(16, 16, { preserveDrawingBuffer: true, stencil: true });
        if (!probe) throw new Error('The graphics driver did not create an offscreen WebGL context.');
        scope.WebGLRenderingContext = probe.constructor;
        probe.getExtension('STACKGL_destroy_context')?.destroy();
        const original = Canvas.prototype.getContext;
        const contexts = new WeakMap<object, any>();
        const canvases = new WeakMap<object, any>();
        const getCanvas = (element: any) => {
            let canvas = canvases.get(element);
            if (!canvas) {
                canvas = createCanvas(Math.max(1, element.width), Math.max(1, element.height));
                canvases.set(element, canvas);
            }
            if (canvas.width !== Math.max(1, element.width)) canvas.width = Math.max(1, element.width);
            if (canvas.height !== Math.max(1, element.height)) canvas.height = Math.max(1, element.height);
            return canvas;
        };
        // Decode pixels before the engine receives its load event. The stock adapter only
        // reads metadata, which is sufficient for imports but not for texture uploads.
        const ImageElement = scope.HTMLImageElement ?? scope.ccwindow?.HTMLImageElement;
        if (!ImageElement?.prototype) throw new Error('The engine image adapter is missing.');
        const dispatch = ImageElement.prototype.dispatchEvent;
        ImageElement.prototype.dispatchEvent = function (event: any) {
            if (event.type !== 'load') return dispatch.call(this, event);
            const source = this.src;
            return loadImage(source instanceof Uint8Array ? Buffer.from(source) : source).then((image: any) => {
                if (this.src !== source) return;
                const canvas = createCanvas(image.width, image.height);
                const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0);
                this._nativeImage = image;
                this.data = context.getImageData(0, 0, image.width, image.height).data;
                this._data = this.data;
                this.complete = true;
                return dispatch.call(this, event);
            }).catch((error: Error) => {
                console.warn('[Scene] Failed to decode texture:', error.message);
                return dispatch.call(this, { type: 'error', target: this });
            });
        };
        Canvas.prototype.getContext = function (name: string, options: any) {
            if (name === '2d') {
                const context = getCanvas(this).getContext('2d', options);
                return new Proxy(context, {
                    get(target, key) {
                        if (key === 'drawImage') return (source: any, ...args: any[]) =>
                            target.drawImage(source._nativeImage ?? canvases.get(source) ?? source, ...args);
                        const value = Reflect.get(target, key, target);
                        return typeof value === 'function' ? value.bind(target) : value;
                    },
                    set(target, key, value) { return Reflect.set(target, key, value, target); },
                });
            }
            if (name !== 'webgl' && name !== 'experimental-webgl') return original.call(this, name, options);
            let context = contexts.get(this);
            if (!context) {
                context = createContext(Math.max(1, this.width || 1280), Math.max(1, this.height || 720), {
                    ...options, preserveDrawingBuffer: true, stencil: true,
                });
                if (!context) throw new Error('Failed to create the CLI offscreen WebGL canvas.');
                contexts.set(this, context);
            }
            const width = Math.max(1, this.width || 1280), height = Math.max(1, this.height || 720);
            if (context.drawingBufferWidth !== width || context.drawingBufferHeight !== height) {
                context.getExtension('STACKGL_resize_drawingbuffer')?.resize(width, height);
            }
            return context;
        };
        Canvas.prototype.__cliOffscreenContext = true;
        // The Node adapter calls its canvas "glcanvas", while pal/env looks up #GameCanvas.
        const canvas = scope.document?.querySelector('canvas');
        if (canvas) {
            canvas.id = 'GameCanvas';
            if (!canvas.width) canvas.width = 1280;
            if (!canvas.height) canvas.height = 720;
        }
        return true;
    } catch (error) {
        // Data-only scene operations remain available on machines without graphics support.
        console.warn('[Scene] Offscreen rendering unavailable; scene data operations remain enabled:', error instanceof Error ? error.message : error);
        return false;
    }
}
