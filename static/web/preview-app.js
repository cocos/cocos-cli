/* global window, document, cc */

// Scene services, provided by boot() via initPreviewApp(ctx). Replaces the
// former window.cli.Scene global.
let services = null;

function log(msg, level) {
    if (level === 'err') console.error('[Preview]', msg);
    else if (level === 'warn') console.warn('[Preview]', msg);
    else console.log('[Preview]', msg);
}

function repaint() {
    try { services && services.Engine && services.Engine.repaintInEditMode(); } catch (e) { /* ignore */ }
}

function getPreviewService() {
    return services && services.Preview;
}

function getActive() {
    var preview = getPreviewService();
    return preview && preview.activePreview;
}

// ── Preview execution ──

async function doPreview() {
    var preview = getPreviewService();
    if (!preview) {
        log('Preview service not ready', 'err');
        return null;
    }

    var uuid = document.getElementById('pvUuid').value.trim();
    var status = document.getElementById('pvStatus');

    if (!uuid) {
        log('UUID is required', 'warn');
        return null;
    }

    status.textContent = 'Loading...';
    log('Preview: uuid=' + uuid);

    try {
        var instance = await preview.open(uuid);
        if (!instance) {
            status.textContent = 'unsupported type';
            return null;
        }
        status.textContent = 'ok';
        return instance;
    } catch (e) {
        log('Preview error: ' + e.message, 'err');
        status.textContent = 'error';
        console.error('Preview error:', e);
        return null;
    }
}

function switchPrimitive(type) {
    var active = getActive();
    if (active && active.switchPrimitive) {
        active.switchPrimitive(type);
        repaint();
        log('Switched primitive: ' + type);
    }
}

function toggleLight() {
    var active = getActive();
    if (!active || !active.setLightEnable) return;
    var light = active.lightComp;
    var on = light ? !light.enabled : true;
    active.setLightEnable(on);
    repaint();
    log('Light: ' + (on ? 'ON' : 'OFF'));
}

function toggle2D3D() {
    var active = getActive();
    if (active && active.viewToggle) {
        active.viewToggle();
        repaint();
        log('Toggled 2D/3D view');
    }
}

// ── Mouse event forwarding to InteractivePreview ──

function bindPreviewMouseEvents(canvas) {
    canvas.addEventListener('mousedown', function(e) {
        var active = getActive();
        if (active) active.onMouseDown(e);
    });

    canvas.addEventListener('mousemove', function(e) {
        var active = getActive();
        if (!active) return;
        active.onMouseMove(e);
        if (active._isMouseDown) {
            repaint();
        }
    });

    canvas.addEventListener('mouseup', function(e) {
        var active = getActive();
        if (active) active.onMouseUp(e);
    });

    canvas.addEventListener('wheel', function(e) {
        var active = getActive();
        if (!active) return;
        e.preventDefault();
        active.onMouseWheel({
            wheelDeltaY: -e.deltaY,
        });
        repaint();
    }, { passive: false });

    canvas.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });
}

// ── Initialization ──

export default function initPreviewApp(ctx) {
    services = ctx && ctx.services;
    var status = document.getElementById('pvStatus');

    var preview = getPreviewService();
    if (!preview) {
        status.textContent = 'Service unavailable';
        log('Preview service not found after boot', 'err');
        return;
    }

    try {
        services && services.Engine && services.Engine.resume();
    } catch (e) {
        log('Engine resume failed: ' + e.message, 'warn');
    }

    var canvas = document.getElementById('GameCanvas');
    if (canvas) {
        bindPreviewMouseEvents(canvas);
        log('Bound preview mouse events to canvas');
    }

    status.textContent = 'Ready';
    log('Preview service ready');

    // Parse URL params for auto-preview
    var params = new URLSearchParams(window.location.search);
    var uuid = params.get('uuid');

    if (uuid) {
        document.getElementById('pvUuid').value = uuid;
        log('Auto-preview from URL params: uuid=' + uuid);
        setTimeout(function() { doPreview(); }, 100);
    }

    // Expose API for external automation
    window.previewAPI = {
        doPreview: doPreview,
        open: function(uuid) {
            document.getElementById('pvUuid').value = uuid || '';
            return doPreview();
        },
        switchPrimitive: switchPrimitive,
        toggleLight: toggleLight,
        toggle2D3D: toggle2D3D,
    };
}
