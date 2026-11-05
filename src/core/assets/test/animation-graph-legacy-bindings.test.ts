import { join } from 'path';
import { readFileSync } from 'fs-extra';
import { globalSetup } from '../../test/global-setup';
import { TestGlobalEnv } from '../../../tests/global-env';
import { Engine } from '../../engine';
import { EngineLoader } from 'cc/loader.js';
import { assetManager } from '..';

describe('selected-engine animation transition bindings', () => {
    beforeAll(async () => { await globalSetup(); });
    afterAll(async () => { await assetManager.removeAsset(TestGlobalEnv.testRootUrl); });
    it('preserves native binary condition storage across edits, save and reload', async () => {
        const template = Engine.resolveAssetTemplate('db://internal/default_file_content/animation-graph/default.animgraph');
        const file = join(TestGlobalEnv.testRoot, 'legacy-transition-bindings.animgraph');
        const asset = await assetManager.createAsset({ target: file, content: readFileSync(join(TestGlobalEnv.engineRoot, 'editor/assets', template.slice('db://internal/'.length)), 'utf8'), overwrite: true });
        let state = await assetManager.queryAnimationGraph(asset.uuid);
        const execute = async (command: any) => { state = await assetManager.executeAnimationGraphCommand(asset.uuid, { command, expected: state }); };
        await execute({ type: 'add-variable', name: 'speed', variableType: 0, initialValue: 1.5 });
        const address = { layerIndex: 0, stateMachinePath: [] };
        await execute({ type: 'add-state', ...address, stateType: 'motion', name: 'From' });
        await execute({ type: 'add-state', ...address, stateType: 'motion', name: 'To' });
        const states = state.graph.layers[0].stateMachine.states;
        const from = states.find(item => item.name === 'From')!.index;
        const to = states.find(item => item.name === 'To')!.index;
        await execute({ type: 'add-transition', ...address, fromStateIndex: from, toStateIndex: to });
        const index = state.graph.layers[0].stateMachine.transitions.find(item => item.fromStateIndex === from && item.toStateIndex === to)!.index;
        const target = { kind: 'transition', ...address, transitionIndex: index };
        await execute({ type: 'add-transition-condition', target, conditionType: 'binary' });
        await execute({ type: 'set-transition-condition-property', target, conditionIndex: 0, path: 'rhs', value: 2.5 });
        await execute({ type: 'set-transition-condition-property', target, conditionIndex: 0, path: 'lhsBinding.variableName', value: 'speed' });
        const api = EngineLoader.getEngineModuleById('cc/editor/new-gen-anim') as any;
        if (!api.TCBindingValueType) {
            await expect(execute({ type: 'set-transition-condition-property', target, conditionIndex: 0, path: 'lhsBinding.type', value: 0 }))
                .rejects.toMatchObject({ code: 'ENGINE_CAPABILITY_UNAVAILABLE' });
            expect((await assetManager.queryAnimationGraph(asset.uuid)).revision).toBe(state.revision);
        }
        const saved = await assetManager.saveAnimationGraph(asset.uuid, state);
        const reloaded = await assetManager.reloadAnimationGraph(asset.uuid, { expected: saved });
        expect(reloaded.graph.layers[0].stateMachine.transitions[index].conditions[0]).toMatchObject({ rhs: 2.5, lhsBinding: { variableName: 'speed' } });
        const serialized = JSON.parse(readFileSync(file, 'utf8'));
        const binary = serialized.find((item: any) => item.__type__ === 'cc.animation.BinaryCondition');
        expect(typeof binary.rhs).toBe(typeof new api.BinaryCondition().rhs);
    });
});
