import { join } from 'path';
import { readFileSync, remove } from 'fs-extra';
import { globalSetup } from '../../test/global-setup';
import { TestGlobalEnv } from '../../../tests/global-env';
import { Engine } from '../../engine';
import { assetManager } from '..';
import { EngineLoader } from 'cc/loader.js';

describe('animation graph version-independent operations', () => {
    beforeAll(async () => { await globalSetup(); });
    afterAll(async () => { await assetManager.removeAsset(TestGlobalEnv.testRootUrl); await remove(TestGlobalEnv.testRoot); });
    async function createGraph(suffix: string) {
        const template = Engine.resolveAssetTemplate('db://internal/default_file_content/animation-graph/default.animgraph');
        return assetManager.createAsset({ target: join(TestGlobalEnv.testRoot, 'legacy-graph-' + suffix + '.animgraph'), content: readFileSync(join(TestGlobalEnv.engineRoot, 'editor/assets', template.slice('db://internal/'.length)), 'utf8'), overwrite: true });
    }
    it('edits classic variables and motion states, then saves and reloads the selected engine format', async () => {
        const asset = await createGraph('roundtrip');
        let state = await assetManager.queryAnimationGraph(asset.uuid);
        state = await assetManager.executeAnimationGraphCommand(asset.uuid, { command: { type: 'add-variable', name: 'speed', variableType: 0, initialValue: 1.5 }, expected: state });
        expect(state.graph.variables.find(v => v.name === 'speed')?.value.value).toBe(1.5);
        state = await assetManager.executeAnimationGraphCommand(asset.uuid, { command: { type: 'add-state', layerIndex: 0, stateMachinePath: [], stateType: 'motion', name: 'Idle' }, expected: state });
        const motion = state.graph.layers[0].stateMachine.states.find(v => v.name === 'Idle')!;
        expect(motion.type).toBe('motion');
        const target = { kind: 'state' as const, layerIndex: 0, stateMachinePath: [], stateIndex: motion.index };
        const inspector = await assetManager.queryAnimationGraphInspector(asset.uuid, target);
        await assetManager.setAnimationGraphInspectorProperty(asset.uuid, { target, path: 'speed', patch: 2, expected: inspector });
        state = await assetManager.queryAnimationGraph(asset.uuid);
        const saved = await assetManager.saveAnimationGraph(asset.uuid, state);
        const reloaded = await assetManager.reloadAnimationGraph(asset.uuid, { expected: saved });
        expect(reloaded.graph.variables.find(v => v.name === 'speed')?.value.value).toBe(1.5);
        expect(reloaded.graph.layers[0].stateMachine.states.find(v => v.name === 'Idle')?.speed).toBe(2);
    });
    it('only exposes layer properties implemented by the selected runtime', async () => {
        const asset = await createGraph('layer-properties');
        const api = EngineLoader.getEngineModuleById('cc/editor/new-gen-anim') as any;
        const graph = new api.AnimationGraph();
        const layer = graph.addLayer();
        const inspector = await assetManager.queryAnimationGraphInspector(asset.uuid, { kind: 'layer', layerIndex: 0 });
        expect(inspector.propertyCapabilities!.weight.set).toBe(true);
        expect('additive' in inspector.propertyCapabilities!).toBe('additive' in layer);
    });
    it('uses capability failure without changing the document when Pose Graphs are unavailable', async () => {
        const asset = await createGraph('capability');
        const before = await assetManager.queryAnimationGraph(asset.uuid);
        const api = EngineLoader.getEngineModuleById('cc/editor/new-gen-anim') as any;
        const request = assetManager.executeAnimationGraphCommand(asset.uuid, { command: { type: 'add-state', layerIndex: 0, stateMachinePath: [], stateType: 'procedural-pose', name: 'Pose' }, expected: before });
        if (api.poseGraphOp) {
            const next = await request;
            expect(next.graph.layers[0].stateMachine.states.find(v => v.name === 'Pose')?.type).toBe('procedural-pose');
            await assetManager.saveAnimationGraph(asset.uuid, next);
        } else {
            await expect(request).rejects.toMatchObject({ code: 'ENGINE_CAPABILITY_UNAVAILABLE' });
            const after = await assetManager.queryAnimationGraph(asset.uuid);
            expect(after.revision).toBe(before.revision);
            expect(after.graph).toEqual(before.graph);
            expect(after.dirty).toBe(before.dirty);
        }
    });
});
