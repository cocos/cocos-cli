import type { IDesignResolution } from './@types/config';

export type DesignResolution = Pick<IDesignResolution, 'width' | 'height'>;
type ResolutionLoader = () => Promise<DesignResolution>;

// This module is shared with the browser scene editor; keep Node dependencies out.
interface ResolutionEngine {
    Size: new (width: number, height: number) => DesignResolution;
    screen: { windowSize: DesignResolution; resolution: DesignResolution };
    view: {
        getDesignResolutionSize(): DesignResolution;
        getResolutionPolicy(): unknown;
        setDesignResolutionSize(width: number, height: number, policy: any): void;
    };
    director?: { getScene(): any };
}

interface HeadlessScreenState {
    resolution: DesignResolution;
    load?: ResolutionLoader;
}
const headlessScreens = new WeakMap<object, HeadlessScreenState>();

export function validateDesignResolution(value: unknown): DesignResolution {
    const size = value as DesignResolution | undefined;
    if (!size || typeof size.width !== 'number' || !Number.isFinite(size.width) || size.width <= 0
        || typeof size.height !== 'number' || !Number.isFinite(size.height) || size.height <= 0) {
        throw new Error('Invalid project design resolution: width and height must be positive finite numbers');
    }
    return { width: size.width, height: size.height };
}

/** The Node screen adapter ignores its setter and otherwise always reports 960x640. */
export function installHeadlessScreen(engine: ResolutionEngine, value: unknown) {
    const resolution = validateDesignResolution(value);
    const existing = headlessScreens.get(engine.screen);
    if (existing) {
        existing.resolution = resolution;
        return;
    }
    const state: HeadlessScreenState = { resolution };
    headlessScreens.set(engine.screen, state);
    const size = () => new engine.Size(state.resolution.width, state.resolution.height);
    Object.defineProperties(engine.screen, {
        windowSize: { configurable: true, get: size },
        resolution: { configurable: true, get: size },
    });
}

export function setHeadlessResolutionLoader(engine: ResolutionEngine, load: ResolutionLoader) {
    const state = headlessScreens.get(engine.screen);
    if (!state) {
        throw new Error('Headless screen must be installed before its resolution loader');
    }
    state.load = load;
}

export async function fetchDesignResolution(serverURL: string): Promise<DesignResolution> {
    const response = await fetch(`${serverURL}/scripting/engine/design-resolution`);
    if (!response.ok) {
        throw new Error(`Cannot read project design resolution (HTTP ${response.status})`);
    }
    return validateDesignResolution(await response.json());
}

export function loadEditorDesignResolution(engine: ResolutionEngine, serverURL: string): Promise<DesignResolution> {
    const load = headlessScreens.get(engine.screen)?.load;
    return load ? load() : fetchDesignResolution(serverURL);
}

/** Must run before scene activation, and again when project settings change. */
export function applyEditorDesignResolution(engine: ResolutionEngine, value: unknown, force = false): boolean {
    const resolution = validateDesignResolution(value);
    const state = headlessScreens.get(engine.screen);
    const screenChanged = !!state && (state.resolution.width !== resolution.width || state.resolution.height !== resolution.height);
    if (state) {
        state.resolution = resolution;
    }
    const current = engine.view.getDesignResolutionSize();
    if (!force && !screenChanged && current.width === resolution.width && current.height === resolution.height) {
        return false;
    }
    if (state) {
        // Keep the Node DOM/canvas shim coherent too; browsers never enter this branch.
        (globalThis as any).window?.resize?.(resolution.width, resolution.height);
    }
    engine.view.setDesignResolutionSize(resolution.width, resolution.height, engine.view.getResolutionPolicy());
    // EDITOR does not subscribe Canvas to design-resolution-changed.
    for (const canvas of engine.director?.getScene()?.getComponentsInChildren('cc.Canvas') ?? []) {
        if (!canvas?.node?.activeInHierarchy || !canvas.enabled) {
            continue;
        }
        const widget = canvas.node.getComponent('cc.Widget');
        if (widget) {
            if (!state) {
                continue;
            }
            widget.updateAlignment();
        } else {
            canvas.fitDesignResolution_EDITOR?.();
        }
        if (state) {
            canvas._onResizeCamera?.();
        }
    }
    return true;
}
