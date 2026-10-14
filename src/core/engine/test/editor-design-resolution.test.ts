import {
    applyEditorDesignResolution,
    installHeadlessScreen,
    loadEditorDesignResolution,
    setHeadlessResolutionLoader,
} from '../editor-design-resolution';

function createEngine() {
    let designSize = { width: 960, height: 640 };
    const canvases: any[] = [];
    const engine = {
        Size: class { constructor(public width: number, public height: number) {} },
        screen: {
            get windowSize() { return { width: 960, height: 640 }; },
            get resolution() { return { width: 960, height: 640 }; },
        },
        view: {
            getDesignResolutionSize: () => designSize,
            getResolutionPolicy: () => 'SHOW_ALL',
            setDesignResolutionSize: jest.fn((width: number, height: number, _policy: any) => { designSize = { width, height }; }),
        },
        director: { getScene: () => ({ getComponentsInChildren: () => canvases }) },
    };
    return { engine, canvases };
}

describe('editor design resolution', () => {
    const oldWindow = (globalThis as any).window;
    afterEach(() => { (globalThis as any).window = oldWindow; });

    it.each([{ width: 393, height: 852 }, { width: 1280, height: 720 }])(
        'sets the headless screen before View.init and applies its first policy for $width x $height', (resolution) => {
            const { engine } = createEngine();
            const resize = jest.fn();
            (globalThis as any).window = { resize };
            installHeadlessScreen(engine, resolution);
            // View.init reads screen.windowSize before any Canvas __preload runs.
            expect(engine.screen.windowSize).toEqual(resolution);
            expect(engine.screen.resolution).toEqual(resolution);
            engine.screen.windowSize.width = 1;
            expect(engine.screen.windowSize.width).toBe(resolution.width);
            applyEditorDesignResolution(engine, resolution, true);
            expect(engine.view.getDesignResolutionSize()).toEqual(resolution);
            expect(engine.view.setDesignResolutionSize).toHaveBeenCalledWith(resolution.width, resolution.height, 'SHOW_ALL');
            expect(resize).toHaveBeenCalledWith(resolution.width, resolution.height);
            expect(applyEditorDesignResolution(engine, resolution)).toBe(false);
            expect(engine.view.setDesignResolutionSize).toHaveBeenCalledTimes(1);
            expect(resize).toHaveBeenCalledTimes(1);
        },
    );

    it('keeps screen, view, active Canvas and camera coherent after a project setting change', () => {
        const { engine, canvases } = createEngine();
        installHeadlessScreen(engine, { width: 393, height: 852 });
        applyEditorDesignResolution(engine, { width: 393, height: 852 });
        let cameraHeight = 0;
        const fit = jest.fn();
        const widget = { updateAlignment: jest.fn() };
        const camera = jest.fn(() => { cameraHeight = engine.screen.windowSize.height / 2; });
        canvases.push(
            { node: { activeInHierarchy: true, getComponent: () => null }, enabled: true, fitDesignResolution_EDITOR: fit, _onResizeCamera: camera },
            { node: { activeInHierarchy: true, getComponent: () => widget }, enabled: true, _onResizeCamera: camera },
            { node: { activeInHierarchy: false }, enabled: true, fitDesignResolution_EDITOR: fit, _onResizeCamera: camera },
            { node: { activeInHierarchy: true }, enabled: false, fitDesignResolution_EDITOR: fit, _onResizeCamera: camera },
        );
        applyEditorDesignResolution(engine, { width: 800, height: 600 });
        expect(engine.screen.windowSize).toEqual({ width: 800, height: 600 });
        expect(engine.screen.resolution).toEqual(engine.view.getDesignResolutionSize());
        expect(fit).toHaveBeenCalledTimes(1);
        expect(widget.updateAlignment).toHaveBeenCalledTimes(1);
        expect(camera).toHaveBeenCalledTimes(2);
        expect(cameraHeight).toBe(300);
    });

    it('leaves browser window dimensions and Widget-owned Canvas alone', () => {
        const { engine, canvases } = createEngine();
        const resize = jest.fn();
        (globalThis as any).window = { resize };
        const widget = { updateAlignment: jest.fn() };
        canvases.push({ node: { activeInHierarchy: true, getComponent: () => widget }, enabled: true });
        applyEditorDesignResolution(engine, { width: 393, height: 852 });
        expect(engine.screen.windowSize).toEqual({ width: 960, height: 640 });
        expect(engine.screen.resolution).toEqual({ width: 960, height: 640 });
        expect(resize).not.toHaveBeenCalled();
        expect(widget.updateAlignment).not.toHaveBeenCalled();
    });

    it.each([null, {}, { width: 0, height: 1 }, { width: Infinity, height: 852 }, { width: 393, height: -1 }, { width: '393', height: 852 }])(
        'rejects invalid dimensions without touching current screen or view: %p', (invalid) => {
            const { engine } = createEngine();
            installHeadlessScreen(engine, { width: 393, height: 852 });
            applyEditorDesignResolution(engine, { width: 393, height: 852 });
            expect(() => applyEditorDesignResolution(engine, invalid)).toThrow('Invalid project design resolution');
            expect(engine.screen.windowSize).toEqual({ width: 393, height: 852 });
            expect(engine.view.getDesignResolutionSize()).toEqual({ width: 393, height: 852 });
        },
    );

    it('reuses the headless configuration source when resyncing an offline worker', async () => {
        const { engine } = createEngine();
        installHeadlessScreen(engine, { width: 393, height: 852 });
        const load = jest.fn(async () => ({ width: 800, height: 600 }));
        setHeadlessResolutionLoader(engine, load);
        expect(await loadEditorDesignResolution(engine, '')).toEqual({ width: 800, height: 600 });
        expect(load).toHaveBeenCalledTimes(1);
    });
});
