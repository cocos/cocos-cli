'use strict';

// A Node-owned DOM boundary for 3.8's HTML5 PAL. No GPU or browser navigation is
// emulated: this host is for data operations and the engine's EmptyDevice.
module.exports = function installHost() {
    const { byteResponseURL, createXMLHttpRequest } = require('./asset-transport.cjs');
    const { createCanvas, Canvas, Image: NativeImage, ImageData, Path2D, DOMMatrix } = require('@napi-rs/canvas');
    class Image extends NativeImage {
        set src(value) {
            if (typeof value === 'string' && /^https?:/.test(value)) {
                fetch(byteResponseURL(value)).then(response => { if (!response.ok) throw new Error('Image HTTP ' + response.status); return response.arrayBuffer(); })
                    .then(buffer => { super.src = Buffer.from(buffer); }).catch(error => this.onerror?.(error));
            } else { super.src = value; }
        }
        get src() { return super.src; }
    }
    class Element extends EventTarget {
        constructor(tag = 'div') {
            super();
            this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null;
            this.style = { getPropertyValue: () => '' }; this.attributes = new Map();
            this.clientWidth = 1280; this.clientHeight = 720; this.width = 1280; this.height = 720;
        }
        appendChild(child) { child.parentNode?.removeChild(child); this.children.push(child); child.parentNode = this; return child; }
        removeChild(child) { const index = this.children.indexOf(child); if (index >= 0) this.children.splice(index, 1); child.parentNode = null; return child; }
        setAttribute(key, value) { this.attributes.set(key, String(value)); if (key === 'id') this.id = String(value); }
        getAttribute(key) { return this.attributes.get(key) ?? null; }
        removeAttribute(key) { this.attributes.delete(key); }
        getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: this.clientWidth, height: this.clientHeight, right: this.clientWidth, bottom: this.clientHeight }; }
        get firstChild() { return this.children[0] ?? null; }
        get parentElement() { return this.parentNode; }
        get offsetWidth() { return this.clientWidth; }
        get offsetHeight() { return this.clientHeight; }
        focus() {} blur() {}
        contains(child) { return child === this || this.children.some(item => item.contains?.(child)); }
    }
    function canvas() {
        const result = createCanvas(1280, 720);
        const events = new EventTarget(); const context = result.getContext.bind(result);
        Object.assign(result, { tagName: 'CANVAS', style: {}, parentNode: null, clientWidth: 1280, clientHeight: 720,
            addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
            dispatchEvent: events.dispatchEvent.bind(events), getBoundingClientRect: Element.prototype.getBoundingClientRect,
            setAttribute: (key, value) => { result[key] = value; }, getAttribute: key => result[key] ?? null,
            getContext: type => type === '2d' ? context(type) : null,
            focus() {}, blur() {}, setPointerCapture() {}, releasePointerCapture() {} });
        return result;
    }
    const document = new Element('document');
    const html = document.documentElement = new Element('html');
    document.head = new Element('head'); document.body = new Element('body');
    html.appendChild(document.head); html.appendChild(document.body);
    document.hidden = false; document.visibilityState = 'visible'; document.readyState = 'complete';
    const gameDiv = new Element('div'); gameDiv.id = 'GameDiv';
    const container = new Element('div'); container.id = 'Cocos3dGameContainer';
    const gameCanvas = canvas(); gameCanvas.id = 'GameCanvas';
    document.body.appendChild(gameDiv); gameDiv.appendChild(container); container.appendChild(gameCanvas);
    const find = (node, id) => node.id === id ? node : node.children?.map(child => find(child, id)).find(Boolean);
    document.getElementById = id => find(html, id) ?? null;
    document.querySelector = selector => selector.startsWith('#') ? document.getElementById(selector.slice(1)) : null;
    document.querySelectorAll = selector => { const found = document.querySelector(selector); return found ? [found] : []; };
    document.createElement = tag => tag === 'canvas' ? canvas() : tag === 'img' ? new Image() : new Element(tag);
    document.createElementNS = (_namespace, tag) => document.createElement(tag);
    document.getElementsByTagName = tag => tag === 'head' ? [document.head] : tag === 'body' ? [document.body] : [];
    document.fonts = { add() {}, delete() {}, check: () => false, load: async () => [] };
    const events = new EventTarget();
    const enginePath = globalThis.nodeEnv?.enginePath;
    const previousEditor = globalThis.Editor;
    const previousRequest = previousEditor?.Message?.request;
    globalThis.Editor = { ...previousEditor, Message: { ...previousEditor?.Message, request(module, method, ...args) {
        if (module === 'engine' && method === 'query-engine-info') return Promise.resolve({
            typescript: { path: enginePath }, native: { path: require('node:path').join(enginePath, 'native') },
        });
        if (previousRequest) return previousRequest.call(previousEditor.Message, module, method, ...args);
        return Promise.reject(new Error('Unsupported Creator host request: ' + module + '.' + method));
    } } };
    globalThis.require = globalThis.nodeEnv?.require ?? require;
    const navigator = { userAgent: 'Mozilla/5.0 CocosCLI/3.8', appVersion: process.platform === 'win32' ? 'Win' : process.platform === 'darwin' ? 'Mac' : 'X11 Linux',
        platform: process.platform, language: 'en', languages: ['en'], maxTouchPoints: 0, onLine: true };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigator });
    Object.assign(globalThis, { window: globalThis, self: globalThis, document,
        DOMParser: require('xmldom').DOMParser,
        Image, ImageData, Path2D, DOMMatrix, HTMLElement: Element, HTMLCanvasElement: Canvas, HTMLImageElement: Image,
        HTMLVideoElement: class extends Element {}, HTMLAudioElement: class extends Element {}, Element,
        screen: { width: 1280, height: 720, availWidth: 1280, availHeight: 720, orientation: { type: 'landscape-primary', angle: 0 } },
        innerWidth: 1280, innerHeight: 720, outerWidth: 1280, outerHeight: 720, devicePixelRatio: 1,
        location: { href: 'file:///', protocol: 'file:' },
        XMLHttpRequest: globalThis.nodeEnv?.XMLHttpRequest && createXMLHttpRequest(globalThis.nodeEnv.XMLHttpRequest), localStorage: globalThis.nodeEnv?.localStorage,
        getComputedStyle: element => ({ ...element.style, getPropertyValue: () => '0' }),
        addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
        dispatchEvent: events.dispatchEvent.bind(events), matchMedia: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
        requestAnimationFrame: callback => setTimeout(() => callback(performance.now()), 16), cancelAnimationFrame: clearTimeout,
    });
    document.defaultView = globalThis;
    return { document, canvas: gameCanvas };
};

