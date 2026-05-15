/**
 * Bridges browser DOM input events on a canvas to scene engine services.
 *
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas
 * @param {object} options.operation - { emitMouseEvent(type, evt, dpr), dispatch(type, evt) }
 * @param {object} [options.engine] - { repaintInEditMode() }
 * @param {(e: MouseEvent) => boolean} [options.shouldIgnore]
 * @returns {() => void} cleanup — removes all listeners
 */
function setupInputBridge(options) {
    var canvas = options.canvas;
    var operation = options.operation;
    var engine = options.engine;
    var shouldIgnore = options.shouldIgnore || function () { return false; };
    var lastX = 0, lastY = 0;
    var pointerLocked = false;

    function toMouseEvent(e, extra) {
        var rect = canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var dx = pointerLocked ? (e.movementX || 0) : (x - lastX);
        var dy = pointerLocked ? (e.movementY || 0) : (y - lastY);
        var evt = {
            x: x, y: y,
            clientX: e.clientX, clientY: e.clientY,
            deltaX: 0, deltaY: 0,
            wheelDeltaX: 0, wheelDeltaY: 0,
            moveDeltaX: dx, moveDeltaY: dy,
            movementX: e.movementX || 0, movementY: e.movementY || 0,
            leftButton: (e.buttons & 1) !== 0,
            middleButton: (e.buttons & 4) !== 0,
            rightButton: (e.buttons & 2) !== 0,
            button: e.button,
            buttons: e.buttons,
            ctrlKey: e.ctrlKey, shiftKey: e.shiftKey,
            altKey: e.altKey, metaKey: e.metaKey,
        };
        if (extra) Object.assign(evt, extra);
        lastX = x;
        lastY = y;
        return evt;
    }

    function toKeyEvent(e) {
        return {
            key: e.key, keyCode: e.keyCode, code: e.code,
            repeat: e.repeat,
            ctrlKey: e.ctrlKey, shiftKey: e.shiftKey,
            altKey: e.altKey, metaKey: e.metaKey,
        };
    }

    function dispatchMouse(type, evt) {
        try {
            var dpr = (typeof cc !== 'undefined' && cc.screen) ? cc.screen.devicePixelRatio : (window.devicePixelRatio || 1);
            operation.emitMouseEvent(type, evt, dpr);
            if (engine && engine.repaintInEditMode) engine.repaintInEditMode();
        } catch (ex) { /* ignore */ }
    }

    function dispatchKey(type, evt) {
        try {
            operation.dispatch(type, evt);
        } catch (ex) { /* ignore */ }
    }

    function onMouseDown(e) {
        if (shouldIgnore(e)) return;
        canvas.focus();
        var rect = canvas.getBoundingClientRect();
        lastX = e.clientX - rect.left;
        lastY = e.clientY - rect.top;
        dispatchMouse('mousedown', toMouseEvent(e));
    }

    function onMouseMove(e) {
        if (shouldIgnore(e)) return;
        dispatchMouse('mousemove', toMouseEvent(e));
    }

    function onMouseUp(e) {
        var evt = toMouseEvent(e);
        evt.leftButton = e.button === 0;
        evt.middleButton = e.button === 1;
        evt.rightButton = e.button === 2;
        dispatchMouse('mouseup', evt);
    }

    function onDblClick(e) {
        if (shouldIgnore(e)) return;
        dispatchMouse('dblclick', toMouseEvent(e));
    }

    function onWheel(e) {
        if (shouldIgnore(e)) return;
        e.preventDefault();
        dispatchMouse('mousewheel', toMouseEvent(e, {
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            wheelDeltaX: -(e.deltaX),
            wheelDeltaY: -(e.deltaY),
        }));
    }

    function onContextMenu(e) {
        e.preventDefault();
    }

    function onKeyDown(e) {
        dispatchKey('keydown', toKeyEvent(e));
    }

    function onKeyUp(e) {
        dispatchKey('keyup', toKeyEvent(e));
    }

    function onPointerLockChange() {
        pointerLocked = document.pointerLockElement === canvas;
    }

    // DPR change monitoring — matches editor's bindEvent behavior
    if (typeof window.matchMedia === 'function') {
        var updateDPRChangeListener = function () {
            var dpr = window.devicePixelRatio;
            window.matchMedia('(resolution: ' + dpr + 'dppx)').addEventListener('change', function () {
                window.dispatchEvent(new Event('resize'));
                updateDPRChangeListener();
            }, { once: true });
        };
        updateDPRChangeListener();
    }

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    return function cleanup() {
        canvas.removeEventListener('mousedown', onMouseDown);
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mouseup', onMouseUp);
        canvas.removeEventListener('dblclick', onDblClick);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('contextmenu', onContextMenu);
        canvas.removeEventListener('keydown', onKeyDown);
        canvas.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('pointerlockchange', onPointerLockChange);
        if (pointerLocked) {
            document.exitPointerLock();
        }
    };
}
