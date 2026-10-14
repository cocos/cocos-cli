import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestGlobalEnv } from '../../../tests/global-env';

const engineModules = [
    'cc', 'cc/editor/populate-internal-constants', 'cc/editor/serialization',
    'cc/editor/new-gen-anim', 'cc/editor/embedded-player', 'cc/editor/reflection-probe',
    'cc/editor/lod-group-utils', 'cc/editor/material', 'cc/editor/2d-misc',
    'cc/editor/offline-mappings', 'cc/editor/custom-pipeline', 'cc/editor/animation-clip-migration',
    'cc/editor/exotic-animation', 'cc/editor/color-utils',
];

it('initializes a portrait project and realigns its Canvas after a resolution change', async () => {
    jest.resetModules();
    const { EngineLoader } = await import('cc/loader.js');
    engineModules.forEach(module => {
        jest.doMock(module, () => EngineLoader.getEngineModuleById(module), { virtual: true });
    });
    const project = await mkdtemp(join(tmpdir(), 'cocos-resolution-project-'));
    const configFile = join(project, 'settings', 'cocos.config.json');
    const source = JSON.stringify({ engine: { designResolution: { width: 393, height: 852 } } });
    try {
        await mkdir(join(project, 'settings'));
        await writeFile(configFile, source);
        const { initEngine } = await import('../index');
        await initEngine(TestGlobalEnv.engineRoot, project);
        const engine = await import('cc');
        const { applyEditorDesignResolution } = await import('../editor-design-resolution');
        const scene = new engine.Scene('HeadlessResolutionFixture');
        const canvasNode = new engine.Node('Canvas');
        scene.addChild(canvasNode);
        const transform = canvasNode.addComponent(engine.UITransform);
        const widget = canvasNode.addComponent(engine.Widget);
        widget.isAlignLeft = widget.isAlignRight = widget.isAlignTop = widget.isAlignBottom = true;
        const cameraNode = new engine.Node('Camera');
        canvasNode.addChild(cameraNode);
        const camera = cameraNode.addComponent(engine.Camera);
        const canvas = canvasNode.addComponent(engine.Canvas);
        canvas.cameraComponent = camera;
        engine.director.runSceneImmediate(scene);

        expect(engine.screen.windowSize).toMatchObject({ width: 393, height: 852 });
        expect(engine.view.getDesignResolutionSize()).toMatchObject({ width: 393, height: 852 });
        expect([transform.width, transform.height, camera.orthoHeight]).toEqual([393, 852, 426]);

        applyEditorDesignResolution(engine, { width: 800, height: 600 });
        expect(engine.screen.windowSize).toMatchObject({ width: 800, height: 600 });
        expect([transform.width, transform.height, camera.orthoHeight]).toEqual([800, 600, 300]);
        // Initializing the offline worker must not migrate or rewrite project settings.
        expect(await readFile(configFile, 'utf8')).toBe(source);
        scene.destroy();
        engine.CCObject._deferredDestroy();
    } finally {
        await rm(project, { recursive: true, force: true });
    }
}, 90000);
