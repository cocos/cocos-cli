import fs from 'fs';
import path from 'path';
import vm from 'vm';

type Listener = (event: any) => void;

function createEventTarget() {
    const listeners = new Map<string, Listener>();
    return {
        addEventListener(type: string, listener: Listener) {
            listeners.set(type, listener);
        },
        removeEventListener(type: string) {
            listeners.delete(type);
        },
        emit(type: string, event: any) {
            listeners.get(type)?.(event);
        },
    };
}

describe('input bridge', () => {
    it('maps DOM coordinates and deltas to the canvas render-buffer scale', () => {
        const canvasTarget = createEventTarget();
        const documentTarget = createEventTarget();
        const emitted: Array<{ type: string; event: any; scale: number | undefined }> = [];
        const canvas = {
            ...canvasTarget,
            width: 2400,
            height: 1200,
            focus: jest.fn(),
            getBoundingClientRect: () => ({ left: 10, top: 20, width: 1200, height: 600 }),
        };
        const context: any = {
            cc: { screen: { devicePixelRatio: 1.25 } },
            window: { devicePixelRatio: 1.25 },
            document: {
                ...documentTarget,
                pointerLockElement: null,
                exitPointerLock: jest.fn(),
            },
        };

        const source = fs.readFileSync(path.join(process.cwd(), 'static/web/input-bridge.js'), 'utf8');
        vm.runInNewContext(source, context);
        context.setupInputBridge({
            canvas,
            operation: {
                emitMouseEvent(type: string, event: any, scale?: number) {
                    emitted.push({ type, event, scale });
                },
            },
        });

        const mouse = (clientX: number, clientY: number, extra: Record<string, unknown> = {}) => ({
            clientX,
            clientY,
            buttons: 1,
            button: 0,
            movementX: 0,
            movementY: 0,
            ...extra,
        });
        canvas.emit('mousedown', mouse(110, 50));
        canvas.emit('mousemove', mouse(130, 70));
        canvas.emit('wheel', {
            ...mouse(130, 70),
            deltaX: 3,
            deltaY: 4,
            preventDefault: jest.fn(),
        });

        expect(emitted).toHaveLength(3);
        expect(emitted[0]).toMatchObject({
            type: 'mousedown',
            scale: undefined,
            event: { x: 200, y: 60, clientX: 200, clientY: 60, moveDeltaX: 0, moveDeltaY: 0 },
        });
        expect(emitted[1]).toMatchObject({
            type: 'mousemove',
            event: { x: 240, y: 100, moveDeltaX: 40, moveDeltaY: 40 },
        });
        expect(emitted[2]).toMatchObject({
            type: 'mousewheel',
            event: { deltaX: 6, deltaY: 8, wheelDeltaX: -6, wheelDeltaY: -8 },
        });
    });
});
