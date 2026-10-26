jest.mock('gl', () => () => ({
    constructor: class WebGLContext {},
    getExtension: () => ({ destroy() {} }),
}));

import { createCanvas } from '@napi-rs/canvas';
import { installOffscreenContext } from '../src/core/engine/offscreen-context';

it('decodes texture pixels before load and renders Canvas content for WebGL uploads', async () => {
    const scope = globalThis as any;
    const keys = ['HTMLCanvasElement', 'HTMLImageElement', 'document', 'WebGLRenderingContext'];
    const originals = keys.map(key => Object.getOwnPropertyDescriptor(scope, key));
    class Canvas {
        width = 2; height = 2; id = 'glcanvas';
        getContext(..._args: any[]): any { return null; }
    }
    const loaded = jest.fn();
    class ImageElement {
        src = ''; width = 2; height = 2; data?: Uint8ClampedArray;
        dispatchEvent(event: any): any { loaded(event.type, this.data); }
    }
    const canvas = new Canvas();
    try {
        scope.HTMLCanvasElement = Canvas;
        scope.HTMLImageElement = ImageElement;
        scope.document = { querySelector: () => canvas };
        expect(installOffscreenContext()).toBe(true);
        expect(canvas.id).toBe('GameCanvas');
        const source = createCanvas(2, 2);
        const sourceContext = source.getContext('2d');
        sourceContext.fillStyle = '#ff0000';
        sourceContext.fillRect(0, 0, 2, 2);
        const image = new ImageElement();
        image.src = source.toDataURL();
        await image.dispatchEvent({ type: 'load' });
        expect(loaded).toHaveBeenCalledWith('load', image.data);
        expect(ArrayBuffer.isView(image.data)).toBe(true);
        expect([...image.data!.slice(0, 4)]).toEqual([255, 0, 0, 255]);
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        expect([...context.getImageData(0, 0, 1, 1).data]).toEqual([255, 0, 0, 255]);
        context.font = '12px sans-serif';
        expect(context.measureText('CLI').width).toBeGreaterThan(0);
    } finally {
        keys.forEach((key, index) => {
            if (originals[index]) Object.defineProperty(scope, key, originals[index]!);
            else delete scope[key];
        });
    }
});
