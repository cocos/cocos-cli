'use strict';

jest.mock('gl', () => {
    const noop = () => undefined;
    return () => ({
        VERTEX_SHADER: 35633,
        FRAGMENT_SHADER: 35632,
        COMPILE_STATUS: 35713,
        LINK_STATUS: 35714,
        getSupportedExtensions: () => [],
        getExtension: noop,
        createShader: (type: number) => ({ type }),
        shaderSource: noop,
        compileShader: noop,
        getShaderParameter: () => true,
        getShaderInfoLog: () => '',
        deleteShader: noop,
        createProgram: () => ({}),
        attachShader: noop,
        linkProgram: noop,
        getProgramParameter: () => true,
        getProgramInfoLog: () => '',
        deleteProgram: noop,
    });
});

import { join } from 'path';
import { readFileSync, remove } from 'fs-extra';
import { globalSetup } from '../../test/global-setup';
import { TestGlobalEnv } from '../../../tests/global-env';
import { assetManager } from '..';
import animationGraph from '../animation-graph-service';
import type { IProperty } from '../../scene/@types/public';

describe('animation graph asset service', () => {
    const name = `animation-graph-service-${Date.now()}`;

    function getDefaultGraphContent(): string {
        return readFileSync(join(
            TestGlobalEnv.engineRoot,
            'editor/assets/default_file_content/animation-graph/default.animgraph',
        ), 'utf8');
    }

    beforeAll(async () => {
        await globalSetup();
    });

    afterAll(async () => {
        try {
            await assetManager.removeAsset(TestGlobalEnv.testRootUrl);
        } catch {
            // A failed test may already have removed the shared fixture directory.
        }
        await remove(TestGlobalEnv.testRoot);
        await remove(TestGlobalEnv.testRoot + '.meta');
    });

    it('queries, edits, mutates, saves and reloads one authoritative graph document', async () => {
        const content = getDefaultGraphContent();
        const asset = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}.animgraph`),
            content,
            overwrite: true,
        });

        const initial = await assetManager.queryAnimationGraph(asset.uuid);
        expect(initial).toMatchObject({
            uuid: asset.uuid,
            revision: 0,
            persistedRevision: 0,
            dirty: false,
            externallyModified: false,
        });
        expect(initial.graph.layers).toHaveLength(1);
        expect(initial.graph.layers[0].stateMachine.states.map((state) => state.type)).toEqual([
            'entry',
            'exit',
            'any',
        ]);

        const layerTarget = { kind: 'layer' as const, layerIndex: 0 };
        const layerInspector = await assetManager.queryAnimationGraphInspector(asset.uuid, layerTarget);
        const layerDump = layerInspector.dump.value as Record<string, IProperty>;
        expect(layerDump.weight).toMatchObject({ path: 'weight', value: 1, type: 'Number' });

        const firstEdit = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
            target: layerTarget,
            path: 'weight',
            patch: { value: 0.5 },
            expected: layerInspector,
            sourceId: 'inspector',
        });
        expect(firstEdit).toMatchObject({ revision: 1, persistedRevision: 0, dirty: true });
        expect((firstEdit.dump.value as Record<string, IProperty>).weight.value).toBe(0.5);

        await expect(assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
            target: layerTarget,
            path: 'weight',
            patch: { value: 0.75 },
            expected: layerInspector,
        })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

        const withVariable = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-variable', name: 'speed', variableType: 0, initialValue: 1.5 },
            expected: firstEdit,
        });
        expect(withVariable.graph.variables).toContainEqual(expect.objectContaining({
            name: 'speed',
            type: 0,
            value: expect.objectContaining({ type: 'Number', value: 1.5, path: 'value' }),
        }));
        const withVariableValue = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'set-variable-value', name: 'speed', patch: 2.25 },
            expected: withVariable,
        });
        expect(withVariableValue.graph.variables.find((variable) => variable.name === 'speed')?.value.value).toBe(2.25);

        const withMotionState = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'motion',
                name: 'Idle',
                editorData: { centerX: 24, centerY: 48 },
            },
            expected: withVariableValue,
            sourceId: 'canvas',
        });
        const motionState = withMotionState.graph.layers[0].stateMachine.states.find((state) => state.name === 'Idle');
        expect(motionState).toMatchObject({
            type: 'motion',
            speed: 1,
            speedMultiplier: '',
            speedMultiplierEnabled: false,
            editorData: { centerX: 24, centerY: 48 },
        });

        const stateTarget = {
            kind: 'state' as const,
            layerIndex: 0,
            stateMachinePath: [],
            stateIndex: motionState!.index,
        };
        const stateInspector = await assetManager.queryAnimationGraphInspector(asset.uuid, stateTarget);
        expect((stateInspector.dump.value as Record<string, IProperty>).speed.value).toBe(1);

        const withComponent = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state-component',
                layerIndex: 0,
                stateMachinePath: [],
                stateIndex: motionState!.index,
                componentType: 'cc.animation.StateMachineComponent',
            },
            expected: stateInspector,
        });
        expect(withComponent.graph.layers[0].stateMachine.states[motionState!.index].components).toHaveLength(1);
        const componentInspector = await assetManager.queryAnimationGraphInspector(asset.uuid, {
            kind: 'state-component',
            layerIndex: 0,
            stateMachinePath: [],
            stateIndex: motionState!.index,
            componentIndex: 0,
        });
        expect(componentInspector.dump).toMatchObject({ path: '', visible: true, readonly: false });

        const withMotion = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'set-motion',
                layerIndex: 0,
                stateMachinePath: [],
                stateIndex: motionState!.index,
                motionType: 'blend-1d',
            },
            expected: componentInspector,
        });
        expect(withMotion.graph.layers[0].stateMachine.states[motionState!.index].motion).toMatchObject({
            type: 'blend-1d',
            level: [0],
            variable: '',
            value: 0,
        });
        const blendTarget = withMotion.graph.layers[0].stateMachine.states[motionState!.index].motion!.target;
        let blendInspector = await assetManager.queryAnimationGraphInspector(asset.uuid, blendTarget);
        blendInspector = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
            target: blendTarget,
            path: 'variable',
            patch: 'speed',
            expected: blendInspector,
        });
        blendInspector = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
            target: blendTarget,
            path: 'value',
            patch: 0.4,
            expected: blendInspector,
        });
        const withBlendParameters = await assetManager.queryAnimationGraph(asset.uuid);
        expect(withBlendParameters.graph.layers[0].stateMachine.states[motionState!.index].motion).toMatchObject({
            variable: 'speed',
            value: 0.4,
        });

        const withChild = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-motion-child',
                target: {
                    kind: 'motion',
                    layerIndex: 0,
                    stateMachinePath: [],
                    stateIndex: motionState!.index,
                    level: [0],
                },
                motionType: 'clip',
            },
            expected: withBlendParameters,
        });
        expect(withChild.graph.layers[0].stateMachine.states[motionState!.index].motion?.children).toHaveLength(1);

        const withEmptyState = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'empty',
                name: 'Done',
            },
            expected: withChild,
        });
        const emptyState = withEmptyState.graph.layers[0].stateMachine.states.find((state) => state.name === 'Done');
        const withTransition = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-transition',
                layerIndex: 0,
                stateMachinePath: [],
                fromStateIndex: motionState!.index,
                toStateIndex: emptyState!.index,
            },
            expected: withEmptyState,
        });
        const transition = withTransition.graph.layers[0].stateMachine.transitions.find((item) => (
            item.fromStateIndex === motionState!.index && item.toStateIndex === emptyState!.index
        ));
        expect(transition?.conditions).toEqual([]);

        const transitionTarget = {
            kind: 'transition' as const,
            layerIndex: 0,
            stateMachinePath: [],
            transitionIndex: transition!.index,
        };
        const withCondition = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-transition-condition',
                target: transitionTarget,
                conditionType: 'binary',
            },
            expected: withTransition,
        });
        expect(withCondition.graph.layers[0].stateMachine.transitions[transition!.index].conditions[0]).toMatchObject({
            type: 'BinaryCondition',
            operator: 0,
            rhs: 0,
        });

        const withEditedCondition = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'set-transition-condition-property',
                target: transitionTarget,
                conditionIndex: 0,
                path: 'lhsBinding.variableName',
                value: 'speed',
            },
            expected: withCondition,
        });
        expect(withEditedCondition.graph.layers[0].stateMachine.transitions[transition!.index].conditions[0]).toMatchObject({
            type: 'BinaryCondition',
            lhsBinding: { variableName: 'speed' },
        });

        const withRenamedVariable = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'rename-variable', name: 'speed', newName: 'velocity' },
            expected: withEditedCondition,
        });
        expect(withRenamedVariable.graph.variables.some((variable) => variable.name === 'velocity')).toBe(true);
        expect(withRenamedVariable.graph.layers[0].stateMachine.transitions[transition!.index].conditions[0]).toMatchObject({
            type: 'BinaryCondition',
            lhsBinding: { variableName: 'velocity' },
        });
        expect(withRenamedVariable.graph.layers[0].stateMachine.states[motionState!.index].motion).toMatchObject({
            variable: 'velocity',
            value: 0.4,
        });

        const withBindingSwitch = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'set-transition-condition-binding-class',
                target: transitionTarget,
                conditionIndex: 0,
                bindingClass: 'cc.animation.TCAuxiliaryCurveBinding',
            },
            expected: withRenamedVariable,
        });
        expect(withBindingSwitch.graph.layers[0].stateMachine.transitions[transition!.index].conditions[0]).toMatchObject({
            type: 'BinaryCondition',
            bindingClass: 'cc.animation.TCAuxiliaryCurveBinding',
        });
        const withCurveName = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'set-transition-condition-property',
                target: transitionTarget,
                conditionIndex: 0,
                path: 'lhsBinding.curveName',
                value: 'LeftFoot',
            },
            expected: withBindingSwitch,
        });
        expect(withCurveName.graph.layers[0].stateMachine.transitions[transition!.index].conditions[0]).toMatchObject({
            bindingClass: 'cc.animation.TCAuxiliaryCurveBinding',
            lhsBinding: { curveName: 'LeftFoot' },
        });

        const withVariableBinding = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'set-transition-condition-binding-class',
                target: transitionTarget,
                conditionIndex: 0,
                bindingClass: 'TCVariableBinding',
            },
            expected: withCurveName,
        });
        expect(withVariableBinding.graph.layers[0].stateMachine.transitions[transition!.index].conditions[0]).toMatchObject({
            bindingClass: 'cc.animation.TCVariableBinding',
        });

        const withEventBinding = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'set-transition-event-binding',
                layerIndex: 0,
                stateMachinePath: [],
                transitionIndex: transition!.index,
                which: 'start',
                methodName: 'onTransitionStart',
            },
            expected: withVariableBinding,
        });
        expect(withEventBinding.graph.layers[0].stateMachine.transitions[transition!.index].startEvent).toBe('onTransitionStart');
        expect(withEventBinding.graph.layers[0].stateMachine.transitions[transition!.index].endEvent).toBe('');

        const withPoseState = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'procedural-pose',
                name: 'Pose',
            },
            expected: withEventBinding,
        });
        const poseState = withPoseState.graph.layers[0].stateMachine.states.find((state) => state.name === 'Pose');
        expect(poseState?.poseGraph?.nodes.length).toBeGreaterThan(0);
        const outputNodeId = poseState!.poseGraph!.rootOutputNodeId;
        const poseInspector = await assetManager.queryAnimationGraphInspector(asset.uuid, {
            kind: 'pose-node',
            layerIndex: 0,
            stateMachinePath: [],
            stateIndex: poseState!.index,
            nodeId: outputNodeId,
        });
        expect(poseInspector.dump).toMatchObject({ path: '', visible: true });

        const withPoseNode = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-pose-node',
                layerIndex: 0,
                stateMachinePath: [],
                stateIndex: poseState!.index,
                nodeType: 'cc.animation.PoseNodeBlendTwoPose',
            },
            expected: poseInspector,
        });
        const blendNode = withPoseNode.graph.layers[0].stateMachine.states[poseState!.index].poseGraph!.nodes.find((node) => (
            node.id !== outputNodeId && node.type.includes('PoseNodeBlendTwoPose')
        ));
        const ratioInput = blendNode!.inputs.find((input) => input.id.includes('ratio'));
        expect(ratioInput?.value).toMatchObject({ path: 'value', type: 'Number', value: 1 });
        const inputTarget = {
            kind: 'pose-input' as const,
            layerIndex: 0,
            stateMachinePath: [],
            stateIndex: poseState!.index,
            nodeId: blendNode!.id,
            inputId: ratioInput!.id,
        };
        const inputInspector = await assetManager.queryAnimationGraphInspector(asset.uuid, inputTarget);
        expect(inputInspector.dump).toMatchObject({ path: 'value', type: 'Number', value: 1 });
        const withEditedInput = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
            target: inputTarget,
            path: 'value',
            patch: 0.25,
            expected: inputInspector,
        });
        expect(withEditedInput.dump.value).toBe(0.25);
        const withResetInput = await assetManager.resetAnimationGraphInspectorProperty(asset.uuid, {
            target: inputTarget,
            path: 'value',
            expected: withEditedInput,
        });
        expect(withResetInput.dump.value).toBe(1);

        const concurrentResults = await Promise.allSettled([
            assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
                target: layerTarget,
                path: 'weight',
                patch: 0.6,
                expected: withResetInput,
            }),
            assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
                target: layerTarget,
                path: 'additive',
                patch: true,
                expected: withResetInput,
            }),
        ]);
        expect(concurrentResults.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
        const afterConcurrentEdit = await assetManager.queryAnimationGraph(asset.uuid);
        expect(afterConcurrentEdit.revision).toBe(withResetInput.revision + 1);

        await expect(assetManager.saveAsset(asset.uuid, content)).rejects.toMatchObject({ code: 'DIRTY_DOCUMENT' });

        const saved = await assetManager.saveAnimationGraph(asset.uuid, afterConcurrentEdit);
        expect(saved).toMatchObject({ dirty: false, persistedRevision: saved.revision });

        const savedSource = readFileSync(asset.file, 'utf8');
        const genericWriteRace = await Promise.allSettled([
            assetManager.saveAsset(asset.uuid, `${savedSource}\n`),
            assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
                target: layerTarget,
                path: 'weight',
                patch: 0.7,
                expected: saved,
            }),
        ]);
        expect(genericWriteRace[0].status).toBe('fulfilled');
        expect(genericWriteRace[1]).toMatchObject({
            status: 'rejected',
            reason: expect.objectContaining({ code: 'SOURCE_CHANGED' }),
        });
        const externallyChanged = await assetManager.queryAnimationGraph(asset.uuid);
        expect(externallyChanged.externallyModified).toBe(true);
        await expect(assetManager.saveAnimationGraph(asset.uuid, externallyChanged)).rejects.toMatchObject({
            code: 'SOURCE_CHANGED',
        });

        const reloaded = await assetManager.reloadAnimationGraph(asset.uuid, { expected: externallyChanged });
        expect(reloaded.documentId).not.toBe(saved.documentId);
        expect(reloaded.revision).toBe(0);
        expect(reloaded.graph.layers[0].weight).toBe(0.6);
        expect(reloaded.graph.layers[0].stateMachine.states.some((state) => state.name === 'Idle')).toBe(true);

        // A direct Graph delete is coordinated by the same document queue. This also
        // guards against re-entering the queue through the delete operation's refresh.
        await expect(assetManager.removeAsset(asset.uuid, { useTrash: false })).resolves.toMatchObject({
            uuid: asset.uuid,
        });
    });

    it('keeps no-op and failed mutations transactional and rejects duplicate names', async () => {
        const asset = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-transaction.animgraph`),
            content: getDefaultGraphContent(),
            overwrite: true,
        });
        const initial = await assetManager.queryAnimationGraph(asset.uuid);

        const noOp = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
            target: { kind: 'layer', layerIndex: 0 },
            path: 'weight',
            patch: 1,
            expected: initial,
        });
        expect(noOp).toMatchObject({ revision: initial.revision, dirty: false });

        const withVariable = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-variable', name: 'speed', variableType: 0, initialValue: 1 },
            expected: noOp,
        });
        await expect(assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-variable', name: 'speed', variableType: 0, initialValue: 2 },
            expected: withVariable,
        })).rejects.toMatchObject({ code: 'NAME_CONFLICT' });
        expect((await assetManager.queryAnimationGraph(asset.uuid)).revision).toBe(withVariable.revision);

        const withSecondVariable = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-variable', name: 'direction', variableType: 0, initialValue: 0 },
            expected: withVariable,
        });
        const sameName = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'rename-variable', name: 'speed', newName: 'speed' },
            expected: withSecondVariable,
        });
        expect(sameName.revision).toBe(withSecondVariable.revision);
        await expect(assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'rename-variable', name: 'speed', newName: 'direction' },
            expected: sameName,
        })).rejects.toMatchObject({ code: 'NAME_CONFLICT' });
        const afterVariableConflict = await assetManager.queryAnimationGraph(asset.uuid);
        expect(afterVariableConflict.revision).toBe(withSecondVariable.revision);
        expect(afterVariableConflict.graph.variables.map((variable) => variable.name)).toEqual(['speed', 'direction']);

        const withStash = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-stash', layerIndex: 0, name: 'Locomotion' },
            expected: afterVariableConflict,
        });
        await expect(assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-stash', layerIndex: 0, name: 'Locomotion' },
            expected: withStash,
        })).rejects.toMatchObject({ code: 'NAME_CONFLICT' });
        expect((await assetManager.queryAnimationGraph(asset.uuid)).revision).toBe(withStash.revision);

        const withSecondStash = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-stash', layerIndex: 0, name: 'Secondary' },
            expected: withStash,
        });
        await expect(assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'rename-stash', layerIndex: 0, name: 'Secondary', newName: 'Locomotion' },
            expected: withSecondStash,
        })).rejects.toMatchObject({ code: 'NAME_CONFLICT' });
        const afterStashConflict = await assetManager.queryAnimationGraph(asset.uuid);
        expect(afterStashConflict.revision).toBe(withSecondStash.revision);
        expect(afterStashConflict.graph.layers[0].stashes).toEqual(['Locomotion', 'Secondary']);

        const withDirectState = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'motion',
                name: 'Direct',
            },
            expected: afterStashConflict,
        });
        const stateIndex = withDirectState.graph.layers[0].stateMachine.states.find((state) => state.name === 'Direct')!.index;
        const withDirectMotion = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'set-motion',
                layerIndex: 0,
                stateMachinePath: [],
                stateIndex,
                motionType: 'blend-direct',
            },
            expected: withDirectState,
        });
        const directTarget = withDirectMotion.graph.layers[0].stateMachine.states[stateIndex].motion!.target;
        const withDirectChild = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-motion-child', target: directTarget, motionType: 'clip' },
            expected: withDirectMotion,
        });
        expect(withDirectChild.graph.layers[0].stateMachine.states[stateIndex].motion!.children![0].weight).toEqual({
            value: 0,
            variable: '',
        });

        await expect(assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'set-direct-blend-weight',
                target: directTarget,
                childIndex: 0,
                value: 0.75,
                variable: 1 as unknown as string,
            },
            expected: withDirectChild,
        })).rejects.toMatchObject({ code: 'INVALID_PROPERTY_PATCH' });
        const afterRollback = await assetManager.queryAnimationGraph(asset.uuid);
        expect(afterRollback.revision).toBe(withDirectChild.revision);
        expect(afterRollback.graph.layers[0].stateMachine.states[stateIndex].motion!.children![0].weight).toEqual({
            value: 0,
            variable: '',
        });

        const withWeight = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'set-direct-blend-weight',
                target: directTarget,
                childIndex: 0,
                value: 0.75,
                variable: 'speed',
            },
            expected: afterRollback,
        });
        expect(withWeight.graph.layers[0].stateMachine.states[stateIndex].motion!.children![0].weight).toEqual({
            value: 0.75,
            variable: 'speed',
        });

        await assetManager.saveAnimationGraph(asset.uuid, withWeight);
    });

    it('resets and creates Inspector properties through the authoritative Graph document', async () => {
        const asset = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-property-operations.animgraph`),
            content: getDefaultGraphContent(),
            overwrite: true,
        });
        const target = { kind: 'layer' as const, layerIndex: 0 };
        const initial = await assetManager.queryAnimationGraphInspector(asset.uuid, target);
        expect(initial.propertyCapabilities).toMatchObject({
            weight: { set: true, reset: true, create: true },
            additive: { set: true, reset: true, create: true },
            mask: { set: true, reset: true, create: true },
        });

        const unchangedWeight = await assetManager.resetAnimationGraphInspectorProperty(asset.uuid, {
            target,
            path: 'weight',
            expected: initial,
        });
        expect(unchangedWeight.revision).toBe(initial.revision);

        const editedWeight = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
            target,
            path: 'weight',
            patch: 0.25,
            expected: unchangedWeight,
        });
        const resetWeight = await assetManager.resetAnimationGraphInspectorProperty(asset.uuid, {
            target,
            path: 'weight',
            expected: editedWeight,
            sourceId: 'inspector-reset',
        });
        expect(resetWeight).toMatchObject({ revision: editedWeight.revision + 1, dirty: true });
        expect((resetWeight.dump.value as Record<string, IProperty>).weight.value).toBe(1);

        const editedAdditive = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
            target,
            path: 'additive',
            patch: true,
            expected: resetWeight,
        });
        const createdAdditive = await assetManager.createAnimationGraphInspectorProperty(asset.uuid, {
            target,
            path: 'additive',
            expected: editedAdditive,
            sourceId: 'inspector-create',
        });
        expect(createdAdditive.revision).toBe(editedAdditive.revision + 1);
        expect((createdAdditive.dump.value as Record<string, IProperty>).additive.value).toBe(false);

        await expect(assetManager.resetAnimationGraphInspectorProperty(asset.uuid, {
            target,
            path: 'weight',
            expected: initial,
        })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

        await assetManager.saveAnimationGraph(asset.uuid, createdAdditive);
    });

    it('supports value types, integer transition bindings and nested Creator graph contexts', async () => {
        const asset = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-contexts.animgraph`),
            content: getDefaultGraphContent(),
            overwrite: true,
        });
        let snapshot = await assetManager.queryAnimationGraph(asset.uuid);

        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-variable', name: 'position', variableType: 4 },
            expected: snapshot,
        });
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'set-variable-value', name: 'position', patch: { x: 1, y: 0, z: -2 } },
            expected: snapshot,
        });
        expect(snapshot.graph.variables.find((variable) => variable.name === 'position')?.value.value).toEqual({ x: 1, y: 0, z: -2 });

        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-variable', name: 'rotation', variableType: 5 },
            expected: snapshot,
        });
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'set-variable-value', name: 'rotation', patch: { x: 0, y: 0.5, z: 0, w: 0.5 } },
            expected: snapshot,
        });
        expect(snapshot.graph.variables.find((variable) => variable.name === 'rotation')?.value.value).toEqual({ x: 0, y: 0.5, z: 0, w: 0.5 });

        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-stash', layerIndex: 0, name: 'Nested' },
            expected: snapshot,
        });
        const stashPoseGraph = snapshot.graph.layers[0].stashPoseGraphs.find((stash) => stash.name === 'Nested')!.poseGraph;
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-pose-node',
                poseGraph: stashPoseGraph.context,
                nodeType: 'cc.animation.PoseNodeStateMachine',
            },
            expected: snapshot,
        });
        const updatedStash = snapshot.graph.layers[0].stashPoseGraphs.find((stash) => stash.name === 'Nested')!.poseGraph;
        const stateMachineNode = updatedStash.nodes.find((node) => node.type.includes('PoseNodeStateMachine'))!;
        expect(stateMachineNode.stateMachine?.states.map((state) => state.type)).toEqual(['entry', 'exit', 'any']);
        expect(stateMachineNode.enterInfo).toEqual({ type: 'state-machine' });

        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                stateMachine: stateMachineNode.stateMachine!.context,
                stateType: 'procedural-pose',
                name: 'Nested Pose',
            },
            expected: snapshot,
        });
        const nestedStash = snapshot.graph.layers[0].stashPoseGraphs.find((stash) => stash.name === 'Nested')!.poseGraph;
        const nestedStateMachine = nestedStash.nodes.find((node) => node.id === stateMachineNode.id)!.stateMachine!;
        expect(nestedStateMachine.states.some((state) => state.name === 'Nested Pose' && !!state.poseGraph)).toBe(true);
        const nestedPoseState = nestedStateMachine.states.find((state) => state.name === 'Nested Pose')!;
        const nestedStateInspector = await assetManager.queryAnimationGraphInspector(asset.uuid, {
            kind: 'state',
            stateMachine: nestedStateMachine.context,
            stateIndex: nestedPoseState.index,
        });
        expect((nestedStateInspector.dump.value as Record<string, IProperty>).name.value).toBe('Nested Pose');

        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-pose-node',
                poseGraph: updatedStash.context,
                nodeType: 'cc.animation.PoseNodePlayMotion',
                createArg: { type: 'animation-blend-1d' },
            },
            expected: snapshot,
        });
        const motionNode = snapshot.graph.layers[0].stashPoseGraphs.find((stash) => stash.name === 'Nested')!
            .poseGraph.nodes.find((node) => node.type.includes('PoseNodePlayMotion'))!;
        expect(motionNode.motion?.type).toBe('blend-1d');
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-motion-child', target: motionNode.motion!.target, motionType: 'clip' },
            expected: snapshot,
        });
        const motionAfterChild = snapshot.graph.layers[0].stashPoseGraphs.find((stash) => stash.name === 'Nested')!
            .poseGraph.nodes.find((node) => node.id === motionNode.id)!.motion;
        expect(motionAfterChild?.children).toHaveLength(1);

        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'motion',
                name: 'From',
            },
            expected: snapshot,
        });
        const fromIndex = snapshot.graph.layers[0].stateMachine.states.find((state) => state.name === 'From')!.index;
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'empty',
                name: 'To',
            },
            expected: snapshot,
        });
        const toIndex = snapshot.graph.layers[0].stateMachine.states.find((state) => state.name === 'To')!.index;
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-transition', layerIndex: 0, stateMachinePath: [], fromStateIndex: fromIndex, toStateIndex: toIndex },
            expected: snapshot,
        });
        const transitionIndex = snapshot.graph.layers[0].stateMachine.transitions.find((transition) => (
            transition.fromStateIndex === fromIndex && transition.toStateIndex === toIndex
        ))!.index;
        const transitionTarget = { kind: 'transition' as const, layerIndex: 0, stateMachinePath: [], transitionIndex };
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-transition-condition', target: transitionTarget, conditionType: 'binary' },
            expected: snapshot,
        });
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'set-transition-condition-property',
                target: transitionTarget,
                conditionIndex: 0,
                path: 'lhsBinding.type',
                value: 3,
            },
            expected: snapshot,
        });
        expect(snapshot.graph.layers[0].stateMachine.transitions[transitionIndex].conditions[0]).toMatchObject({ isRhsInteger: true });

        const poseStateIndex = nestedPoseState.index;
        const nestedPoseGraph = snapshot.graph.layers[0].stashPoseGraphs.find((stash) => stash.name === 'Nested')!
            .poseGraph.nodes.find((node) => node.id === stateMachineNode.id)!.stateMachine!.states[poseStateIndex].poseGraph!;
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-pose-node',
                poseGraph: nestedPoseGraph.context,
                nodeType: 'cc.animation.PoseNodeApplyTransform',
            },
            expected: snapshot,
        });
        const applyTransformNode = snapshot.graph.layers[0].stashPoseGraphs.find((stash) => stash.name === 'Nested')!
            .poseGraph.nodes.find((node) => node.id === stateMachineNode.id)!.stateMachine!.states[poseStateIndex].poseGraph!
            .nodes.find((node) => node.type.includes('PoseNodeApplyTransform'))!;
        const poseNodeTarget = { kind: 'pose-node' as const, poseGraph: nestedPoseGraph.context, nodeId: applyTransformNode.id };
        let inspector = await assetManager.queryAnimationGraphInspector(asset.uuid, poseNodeTarget);
        inspector = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
            target: poseNodeTarget,
            path: 'positionOperation',
            patch: 1,
            expected: inspector,
        });
        const positionInput = applyTransformNode.inputs.find((input) => input.id.includes('position'))!;
        const positionTarget = { ...poseNodeTarget, kind: 'pose-input' as const, inputId: positionInput.id };
        const positionInspector = await assetManager.queryAnimationGraphInspector(asset.uuid, positionTarget);
        const updatedPosition = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
            target: positionTarget,
            path: 'value',
            patch: { x: 3, y: 0, z: -4 },
            expected: positionInspector,
        });
        expect(updatedPosition.dump.value).toEqual({ x: 3, y: 0, z: -4 });

        let rotationNodeInspector = await assetManager.queryAnimationGraphInspector(asset.uuid, poseNodeTarget);
        rotationNodeInspector = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
            target: poseNodeTarget,
            path: 'rotationOperation',
            patch: 1,
            expected: rotationNodeInspector,
        });
        const rotationInput = applyTransformNode.inputs.find((input) => input.id.includes('rotation'))!;
        const rotationTarget = { ...poseNodeTarget, kind: 'pose-input' as const, inputId: rotationInput.id };
        const rotationInspector = await assetManager.queryAnimationGraphInspector(asset.uuid, rotationTarget);
        const updatedRotation = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
            target: rotationTarget,
            path: 'value',
            patch: { x: 0, y: 0.25, z: 0, w: 0.75 },
            expected: rotationInspector,
        });
        expect(updatedRotation.dump.value).toEqual({ x: 0, y: 0.25, z: 0, w: 0.75 });

        await assetManager.saveAnimationGraph(asset.uuid, updatedRotation);
    });

    it('returns Creator state, blend and transition values and persists editor extras', async () => {
        const asset = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-creator-values.animgraph`),
            content: getDefaultGraphContent(),
            overwrite: true,
        });
        let snapshot = await assetManager.queryAnimationGraph(asset.uuid);
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-variable', name: 'speed', variableType: 0, initialValue: 1 },
            expected: snapshot,
        });
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'add-variable', name: 'direction', variableType: 0, initialValue: 0 },
            expected: snapshot,
        });
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'motion',
                name: 'Blend',
                editorData: { centerX: 120, centerY: 48, collapsed: true },
            },
            expected: snapshot,
        });
        const stateIndex = snapshot.graph.layers[0].stateMachine.states.find((state) => state.name === 'Blend')!.index;
        const stateTarget = { kind: 'state' as const, layerIndex: 0, stateMachinePath: [], stateIndex };
        let inspector = await assetManager.queryAnimationGraphInspector(asset.uuid, stateTarget);
        for (const [path, patch] of [
            ['speed', 1.75],
            ['speedMultiplier', 'speed'],
            ['speedMultiplierEnabled', true],
        ] as const) {
            inspector = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
                target: stateTarget,
                path,
                patch,
                expected: inspector,
            });
        }
        snapshot = await assetManager.queryAnimationGraph(asset.uuid);
        expect(snapshot.graph.layers[0].stateMachine.states[stateIndex]).toMatchObject({
            speed: 1.75,
            speedMultiplier: 'speed',
            speedMultiplierEnabled: true,
            editorData: { centerX: 120, centerY: 48, collapsed: true },
        });

        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'set-motion',
                layerIndex: 0,
                stateMachinePath: [],
                stateIndex,
                motionType: 'blend-2d',
            },
            expected: snapshot,
        });
        const motionTarget = snapshot.graph.layers[0].stateMachine.states[stateIndex].motion!.target;
        inspector = await assetManager.queryAnimationGraphInspector(asset.uuid, motionTarget);
        for (const [path, patch] of [
            ['variableX', 'speed'],
            ['valueX', 0.25],
            ['variableY', 'direction'],
            ['valueY', -0.5],
        ] as const) {
            inspector = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
                target: motionTarget,
                path,
                patch,
                expected: inspector,
            });
        }
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'set-motion-editor-data',
                target: motionTarget,
                editorData: { centerX: 16, centerY: 32, autoThreshold: false },
            },
            expected: inspector,
        });
        expect(snapshot.graph.layers[0].stateMachine.states[stateIndex].motion).toMatchObject({
            type: 'blend-2d',
            variableX: 'speed',
            valueX: 0.25,
            variableY: 'direction',
            valueY: -0.5,
            editorData: { centerX: 16, centerY: 32, autoThreshold: false },
        });

        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'empty',
                name: 'Destination',
            },
            expected: snapshot,
        });
        const destinationIndex = snapshot.graph.layers[0].stateMachine.states.find((state) => state.name === 'Destination')!.index;
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-transition',
                layerIndex: 0,
                stateMachinePath: [],
                fromStateIndex: stateIndex,
                toStateIndex: destinationIndex,
            },
            expected: snapshot,
        });
        const transitionIndex = snapshot.graph.layers[0].stateMachine.transitions.find((transition) => (
            transition.fromStateIndex === stateIndex && transition.toStateIndex === destinationIndex
        ))!.index;
        const transitionTarget = {
            kind: 'transition' as const,
            layerIndex: 0,
            stateMachinePath: [],
            transitionIndex,
        };
        inspector = await assetManager.queryAnimationGraphInspector(asset.uuid, transitionTarget);
        for (const [path, patch] of [
            ['duration', 0.45],
            ['relativeDuration', true],
            ['exitConditionEnabled', false],
            ['exitCondition', 0.8],
            ['destinationStart', 0.2],
            ['relativeDestinationStart', true],
        ] as const) {
            inspector = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
                target: transitionTarget,
                path,
                patch,
                expected: inspector,
            });
        }
        snapshot = await assetManager.queryAnimationGraph(asset.uuid);
        expect(snapshot.graph.layers[0].stateMachine.transitions[transitionIndex]).toMatchObject({
            duration: 0.45,
            relativeDuration: true,
            exitConditionEnabled: false,
            exitCondition: 0.8,
            destinationStart: 0.2,
            relativeDestinationStart: true,
        });
        expect(snapshot.graph.layers[0].stateMachine.transitions[transitionIndex]).not.toHaveProperty('interruptible');

        const saved = await assetManager.saveAnimationGraph(asset.uuid, snapshot);
        const reloaded = await assetManager.reloadAnimationGraph(asset.uuid, { expected: saved });
        expect(reloaded.graph.layers[0].stateMachine.states[stateIndex]).toMatchObject({
            speed: 1.75,
            speedMultiplier: 'speed',
            speedMultiplierEnabled: true,
            editorData: { centerX: 120, centerY: 48, collapsed: true },
            motion: expect.objectContaining({
                variableX: 'speed',
                valueX: 0.25,
                variableY: 'direction',
                valueY: -0.5,
                editorData: { centerX: 16, centerY: 32, autoThreshold: false },
            }),
        });
        expect(reloaded.graph.layers[0].stateMachine.transitions[transitionIndex]).toMatchObject({
            duration: 0.45,
            exitCondition: 0.8,
            destinationStart: 0.2,
        });
    });

    it('keeps serialized Creator editor extras through load, mutation, save and reload', async () => {
        const content = JSON.parse(getDefaultGraphContent());
        content[2].__editorExtras__ = { centerX: 8, centerY: 12, name: 'Root Machine' };
        content[3].__editorExtras__ = { centerX: -40, centerY: 0, name: 'Entry' };
        const stateConstructor = require('cc').js.getClassByName('cc.animation.State');
        const stateValues = stateConstructor.__values__;
        const stateProps = stateConstructor.__props__;
        const stateDeserializer = Object.getOwnPropertyDescriptor(stateConstructor, '__deserialize__');
        const asset = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-editor-extras.animgraph`),
            content: JSON.stringify(content, null, 2),
            overwrite: true,
        });

        let snapshot = await assetManager.queryAnimationGraph(asset.uuid);
        expect(snapshot.graph.layers[0].stateMachine.editorData).toEqual({ centerX: 8, centerY: 12, name: 'Root Machine' });
        expect(snapshot.graph.layers[0].stateMachine.states[0].editorData).toEqual({ centerX: -40, centerY: 0, name: 'Entry' });
        expect(stateConstructor.__values__).toBe(stateValues);
        expect(stateConstructor.__props__).toBe(stateProps);
        expect(Object.getOwnPropertyDescriptor(stateConstructor, '__deserialize__')).toEqual(stateDeserializer);

        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'set-state-editor-data',
                layerIndex: 0,
                stateMachinePath: [],
                stateIndex: 0,
                editorData: { centerX: -24 },
            },
            expected: snapshot,
        });
        expect(snapshot.graph.layers[0].stateMachine.states[0].editorData).toEqual({
            centerX: -24,
            centerY: 0,
            name: 'Entry',
        });
        const saved = await assetManager.saveAnimationGraph(asset.uuid, snapshot);
        const reloaded = await assetManager.reloadAnimationGraph(asset.uuid, { expected: saved });
        expect(reloaded.graph.layers[0].stateMachine.editorData).toEqual({ centerX: 8, centerY: 12, name: 'Root Machine' });
        expect(reloaded.graph.layers[0].stateMachine.states[0].editorData).toEqual({
            centerX: -24,
            centerY: 0,
            name: 'Entry',
        });
        expect(stateConstructor.__values__).toBe(stateValues);
        expect(stateConstructor.__props__).toBe(stateProps);
        expect(Object.getOwnPropertyDescriptor(stateConstructor, '__deserialize__')).toEqual(stateDeserializer);
    });

    it('stashes a Pose Graph with links, editor data, conflicts and Creator auto naming', async () => {
        const asset = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-stash-pose-graph.animgraph`),
            content: getDefaultGraphContent(),
            overwrite: true,
        });
        let snapshot = await assetManager.queryAnimationGraph(asset.uuid);
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'procedural-pose',
                name: 'Procedural',
            },
            expected: snapshot,
        });
        const stateIndex = snapshot.graph.layers[0].stateMachine.states.find((state) => state.name === 'Procedural')!.index;
        let poseGraph = snapshot.graph.layers[0].stateMachine.states[stateIndex].poseGraph!;
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-pose-node',
                poseGraph: poseGraph.context,
                nodeType: 'cc.animation.PoseNodeBlendTwoPose',
                editorData: { centerX: -80, centerY: 24 },
            },
            expected: snapshot,
        });
        poseGraph = snapshot.graph.layers[0].stateMachine.states[stateIndex].poseGraph!;
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-pose-node',
                poseGraph: poseGraph.context,
                nodeType: 'cc.animation.PoseNodeApplyTransform',
                editorData: { centerX: 40, centerY: 24 },
            },
            expected: snapshot,
        });
        poseGraph = snapshot.graph.layers[0].stateMachine.states[stateIndex].poseGraph!;
        const blendNode = poseGraph.nodes.find((node) => node.type.includes('PoseNodeBlendTwoPose'))!;
        const transformNode = poseGraph.nodes.find((node) => node.type.includes('PoseNodeApplyTransform'))!;
        const transformPoseInput = transformNode.inputs.find((input) => input.type === blendNode.outputTypes[0])!;
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'connect-pose-nodes',
                poseGraph: poseGraph.context,
                producerNodeId: blendNode.id,
                producerOutputId: 0,
                consumerNodeId: transformNode.id,
                consumerInputId: transformPoseInput.id,
            },
            expected: snapshot,
        });
        poseGraph = snapshot.graph.layers[0].stateMachine.states[stateIndex].poseGraph!;
        const connectedInput = poseGraph.nodes.find((node) => node.id === transformNode.id)!.inputs.find((input) => input.id === transformPoseInput.id)!;
        expect(connectedInput.connected).toBe(true);
        expect(connectedInput).not.toHaveProperty('value');

        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'stash-pose-graph',
                poseGraph: poseGraph.context,
                layerIndex: 0,
                stashName: 'Locomotion',
                editorData: { centerX: 160, centerY: 24 },
            },
            expected: snapshot,
        });
        const stashed = snapshot.graph.layers[0].stashPoseGraphs.find((stash) => stash.name === 'Locomotion')!.poseGraph;
        expect(snapshot.graph.layers[0].stashPoseGraphs.find((stash) => stash.name === 'Locomotion')!.referenceCount).toBe(1);
        expect(stashed.nodes.find((node) => node.type.includes('PoseNodeBlendTwoPose'))?.editorData).toEqual({ centerX: -80, centerY: 24 });
        expect(stashed.nodes.find((node) => node.type.includes('PoseNodeApplyTransform'))?.editorData).toEqual({ centerX: 40, centerY: 24 });
        expect(stashed.nodes.some((node) => node.inputs.some((input) => input.connected))).toBe(true);
        const original = snapshot.graph.layers[0].stateMachine.states[stateIndex].poseGraph!;
        const useStashNode = original.nodes.find((node) => node.type.includes('PoseNodeUseStashedPose'))!;
        expect(useStashNode.editorData).toEqual({ centerX: 160, centerY: 24 });
        expect(useStashNode.enterInfo).toEqual({ type: 'stash', stashName: 'Locomotion' });
        expect(original.nodes).toHaveLength(2);
        const document = (animationGraph as unknown as {
            _documents: Map<string, { nodesById: Map<number, object> }>;
        })._documents.get(asset.uuid)!;
        expect(document.nodesById.has(blendNode.id)).toBe(false);
        expect(document.nodesById.has(transformNode.id)).toBe(false);

        await expect(assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'stash-pose-graph',
                poseGraph: original.context,
                layerIndex: 0,
                stashName: 'Locomotion',
            },
            expected: snapshot,
        })).rejects.toMatchObject({ code: 'NAME_CONFLICT' });
        expect((await assetManager.queryAnimationGraph(asset.uuid)).revision).toBe(snapshot.revision);

        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: { type: 'stash-pose-graph', poseGraph: original.context, layerIndex: 0 },
            expected: snapshot,
        });
        expect(snapshot.graph.layers[0].stashes).toEqual(expect.arrayContaining(['Locomotion', 'Stash1']));
        const saved = await assetManager.saveAnimationGraph(asset.uuid, snapshot);
        const reloaded = await assetManager.reloadAnimationGraph(asset.uuid, { expected: saved });
        expect(reloaded.graph.layers[0].stashes).toEqual(expect.arrayContaining(['Locomotion', 'Stash1']));
        expect(reloaded.graph.layers[0].stashPoseGraphs.find((stash) => stash.name === 'Locomotion')!.poseGraph.nodes)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ editorData: { centerX: -80, centerY: 24 } }),
                expect.objectContaining({ editorData: { centerX: 40, centerY: 24 } }),
            ]));
    });

    it('restores temporary editor extras class state when registration fails', async () => {
        const asset = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-editor-extras-registration-error.animgraph`),
            content: getDefaultGraphContent(),
            overwrite: true,
        });
        let snapshot = await assetManager.queryAnimationGraph(asset.uuid);
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'procedural-pose',
                name: 'Registration Error',
            },
            expected: snapshot,
        });
        const poseGraph = snapshot.graph.layers[0].stateMachine.states
            .find((state) => state.name === 'Registration Error')!.poseGraph!;
        const outputConstructor = require('cc').js.getClassByName('cc.animation.PoseGraphOutputNode');
        const propsDescriptor = Object.getOwnPropertyDescriptor(outputConstructor, '__props__');
        const valuesDescriptor = Object.getOwnPropertyDescriptor(outputConstructor, '__values__')!;
        const deserializeDescriptor = Object.getOwnPropertyDescriptor(outputConstructor, '__deserialize__');
        expect(valuesDescriptor.value).not.toContain('__editorExtras__');
        const readonlyValuesDescriptor = { ...valuesDescriptor, writable: false };
        Object.defineProperty(outputConstructor, '__values__', readonlyValuesDescriptor);
        try {
            await expect(assetManager.executeAnimationGraphCommand(asset.uuid, {
                command: {
                    type: 'stash-pose-graph',
                    poseGraph: poseGraph.context,
                    layerIndex: 0,
                    stashName: 'Should Fail',
                },
                expected: snapshot,
            })).rejects.toThrow();
            expect(Object.getOwnPropertyDescriptor(outputConstructor, '__props__')).toEqual(propsDescriptor);
            expect(Object.getOwnPropertyDescriptor(outputConstructor, '__values__')).toEqual(readonlyValuesDescriptor);
            expect(Object.getOwnPropertyDescriptor(outputConstructor, '__deserialize__')).toEqual(deserializeDescriptor);
            expect((await assetManager.queryAnimationGraph(asset.uuid)).revision).toBe(snapshot.revision);
        } finally {
            if (deserializeDescriptor) {
                Object.defineProperty(outputConstructor, '__deserialize__', deserializeDescriptor);
            } else {
                delete outputConstructor.__deserialize__;
            }
            Object.defineProperty(outputConstructor, '__values__', valuesDescriptor);
            if (propsDescriptor) {
                Object.defineProperty(outputConstructor, '__props__', propsDescriptor);
            } else {
                delete outputConstructor.__props__;
            }
        }
    });

    it('sets and clears Animation Graph asset references through inspector dumps', async () => {
        const asset = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-references.animgraph`),
            content: getDefaultGraphContent(),
            overwrite: true,
        });
        const mask = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}.animask`),
            content: readFileSync(join(
                TestGlobalEnv.engineRoot,
                'editor/assets/default_file_content/animation-mask/default.animask',
            ), 'utf8'),
            overwrite: true,
        });
        const clip = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}.anim`),
            content: readFileSync(join(
                TestGlobalEnv.engineRoot,
                'editor/assets/default_file_content/animation-clip/default.anim',
            ), 'utf8'),
            overwrite: true,
        });

        let inspector = await assetManager.queryAnimationGraphInspector(asset.uuid, { kind: 'layer', layerIndex: 0 });
        inspector = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
            target: { kind: 'layer', layerIndex: 0 },
            path: 'mask',
            patch: { uuid: mask.uuid },
            expected: inspector,
        });
        expect((inspector.dump.value as Record<string, IProperty>).mask.value).toEqual({ uuid: mask.uuid });
        inspector = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
            target: { kind: 'layer', layerIndex: 0 },
            path: 'mask',
            patch: { uuid: '' },
            expected: inspector,
        });
        expect((inspector.dump.value as Record<string, IProperty>).mask.value).toEqual({ uuid: '' });

        let snapshot = await assetManager.queryAnimationGraph(asset.uuid);
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'motion',
                name: 'Clip',
            },
            expected: snapshot,
        });
        const stateIndex = snapshot.graph.layers[0].stateMachine.states.find((state) => state.name === 'Clip')!.index;
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'set-motion',
                layerIndex: 0,
                stateMachinePath: [],
                stateIndex,
                motionType: 'clip',
                clipUuid: clip.uuid,
            },
            expected: snapshot,
        });
        const motionTarget = snapshot.graph.layers[0].stateMachine.states[stateIndex].motion!.target;
        let motionInspector = await assetManager.queryAnimationGraphInspector(asset.uuid, motionTarget);
        expect((motionInspector.dump.value as Record<string, IProperty>).clip.value).toEqual({ uuid: clip.uuid });
        motionInspector = await assetManager.setAnimationGraphInspectorProperty(asset.uuid, {
            target: motionTarget,
            path: 'clip',
            patch: { uuid: '' },
            expected: motionInspector,
        });
        expect((motionInspector.dump.value as Record<string, IProperty>).clip.value).toEqual({ uuid: '' });

        await assetManager.saveAnimationGraph(asset.uuid, motionInspector);
    });

    it('queries pose graph asset drag handlers and creates pose nodes from dragged assets', async () => {
        const handlers = await assetManager.queryAnimationGraphPoseGraphAssetDragHandlers();
        const clipEntry = handlers.find((entry) => entry.assetType === 'cc.AnimationClip');
        expect(clipEntry).toBeDefined();
        expect(clipEntry!.handlers.length).toBeGreaterThan(0);
        for (const handler of clipEntry!.handlers) {
            expect(handler.id).toBeTruthy();
            expect(typeof handler.displayName).toBe('string');
        }
        const handlerId = clipEntry!.handlers[0].id;

        const asset = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-asset-drag.animgraph`),
            content: getDefaultGraphContent(),
            overwrite: true,
        });
        const clip = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-asset-drag.anim`),
            content: readFileSync(join(
                TestGlobalEnv.engineRoot,
                'editor/assets/default_file_content/animation-clip/default.anim',
            ), 'utf8'),
            overwrite: true,
        });
        const mask = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-asset-drag.animask`),
            content: readFileSync(join(
                TestGlobalEnv.engineRoot,
                'editor/assets/default_file_content/animation-mask/default.animask',
            ), 'utf8'),
            overwrite: true,
        });

        let snapshot = await assetManager.queryAnimationGraph(asset.uuid);
        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'procedural-pose',
                name: 'Pose',
            },
            expected: snapshot,
        });
        const stateIndex = snapshot.graph.layers[0].stateMachine.states.find((state) => state.name === 'Pose')!.index;
        const nodeCount = snapshot.graph.layers[0].stateMachine.states[stateIndex].poseGraph!.nodes.length;

        snapshot = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'create-pose-node-on-asset-drag',
                layerIndex: 0,
                stateMachinePath: [],
                stateIndex,
                assetUuid: clip.uuid,
                handlerId,
                editorData: { centerX: 200, centerY: 40 },
            },
            expected: snapshot,
        });
        const poseGraph = snapshot.graph.layers[0].stateMachine.states[stateIndex].poseGraph!;
        expect(poseGraph.nodes).toHaveLength(nodeCount + 1);
        const createdNode = poseGraph.nodes.find((node) => node.motion?.clipUuid === clip.uuid);
        expect(createdNode).toBeDefined();
        expect(createdNode!.editorData).toEqual({ centerX: 200, centerY: 40 });

        await expect(assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'create-pose-node-on-asset-drag',
                layerIndex: 0,
                stateMachinePath: [],
                stateIndex,
                assetUuid: clip.uuid,
                handlerId: 'not-a-handler',
            },
            expected: snapshot,
        })).rejects.toMatchObject({ code: 'TARGET_NOT_FOUND', message: expect.stringContaining('not-a-handler') });

        await expect(assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'create-pose-node-on-asset-drag',
                layerIndex: 0,
                stateMachinePath: [],
                stateIndex,
                assetUuid: mask.uuid,
                handlerId,
            },
            expected: snapshot,
        })).rejects.toMatchObject({ code: 'TARGET_NOT_FOUND', message: expect.stringContaining('cc.AnimationMask') });

        await expect(assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'create-pose-node-on-asset-drag',
                layerIndex: 0,
                stateMachinePath: [],
                stateIndex,
                assetUuid: 'missing-asset-uuid',
                handlerId,
            },
            expected: snapshot,
        })).rejects.toMatchObject({ code: 'TARGET_NOT_FOUND', message: expect.stringContaining('missing-asset-uuid') });
    });

    it('queries registered state machine component types', async () => {
        const cc = require('cc');
        const initial = await assetManager.queryAnimationGraphStateMachineComponentTypes();
        expect(initial).not.toContain('cc.animation.StateMachineComponent');

        const base = cc.js.getClassByName('cc.animation.StateMachineComponent');
        expect(base).toBeTruthy();
        const className = 'cc.animation.TestAgentStateMachineComponent';
        class TestAgentStateMachineComponent extends base {}
        cc.js.setClassName(className, TestAgentStateMachineComponent);
        try {
            const types = await assetManager.queryAnimationGraphStateMachineComponentTypes();
            expect(types).toContain(className);
            expect(types).not.toContain('cc.animation.StateMachineComponent');
        } finally {
            cc.js.unregisterClass(TestAgentStateMachineComponent);
        }
        const restored = await assetManager.queryAnimationGraphStateMachineComponentTypes();
        expect(restored).not.toContain(className);
    });

    it('blocks generic overwrite and directory mutations while a graph document is dirty', async () => {
        const directoryName = `${name}-dirty-directory`;
        const directoryPath = join(TestGlobalEnv.testRoot, directoryName);
        const targetPath = join(directoryPath, 'target.animgraph');
        const sourcePath = join(TestGlobalEnv.testRoot, `${name}-source.animgraph`);
        const renameSourcePath = join(directoryPath, 'rename-source.animgraph');
        const source = await assetManager.createAsset({ target: sourcePath, content: getDefaultGraphContent(), overwrite: true });
        const renameSource = await assetManager.createAsset({ target: renameSourcePath, content: getDefaultGraphContent(), overwrite: true });
        const target = await assetManager.createAsset({ target: targetPath, content: getDefaultGraphContent(), overwrite: true });
        const initial = await assetManager.queryAnimationGraph(target.uuid);
        const dirty = await assetManager.setAnimationGraphInspectorProperty(target.uuid, {
            target: { kind: 'layer', layerIndex: 0 },
            path: 'weight',
            patch: 0.25,
            expected: initial,
        });

        await expect(assetManager.createAsset({ target: targetPath, content: getDefaultGraphContent(), overwrite: true }))
            .rejects.toMatchObject({ code: 'DIRTY_DOCUMENT' });
        await expect(assetManager.importAsset(sourcePath, targetPath, { overwrite: true }))
            .rejects.toMatchObject({ code: 'DIRTY_DOCUMENT' });
        await expect(assetManager.copyAsset(source.uuid, targetPath, { overwrite: true }))
            .rejects.toMatchObject({ code: 'DIRTY_DOCUMENT' });
        await expect(assetManager.moveAsset(sourcePath, targetPath, { overwrite: true }))
            .rejects.toMatchObject({ code: 'DIRTY_DOCUMENT' });
        await expect(assetManager.renameAsset(renameSource.uuid, 'target.animgraph', { overwrite: true }))
            .rejects.toMatchObject({ code: 'DIRTY_DOCUMENT' });
        await expect(assetManager.refreshAsset(directoryPath)).rejects.toMatchObject({ code: 'DIRTY_DOCUMENT' });
        await expect(assetManager.moveAsset(directoryPath, join(TestGlobalEnv.testRoot, `${directoryName}-moved`), { overwrite: true }))
            .rejects.toMatchObject({ code: 'DIRTY_DOCUMENT' });
        await expect(assetManager.removeAsset(directoryPath, { useTrash: false })).rejects.toMatchObject({ code: 'DIRTY_DOCUMENT' });

        await assetManager.saveAnimationGraph(target.uuid, dirty);
    });

    it('creates a motion state with an attached clip in one command and rejects clip-on-empty', async () => {
        const asset = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-add-state-clip.animgraph`),
            content: getDefaultGraphContent(),
            overwrite: true,
        });
        const clip = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-add-state-clip.anim`),
            content: readFileSync(join(
                TestGlobalEnv.engineRoot,
                'editor/assets/default_file_content/animation-clip/default.anim',
            ), 'utf8'),
            overwrite: true,
        });
        const initial = await assetManager.queryAnimationGraph(asset.uuid);

        const withClipState = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'motion',
                name: 'Run',
                clipUuid: clip.uuid,
                editorData: { centerX: 30, centerY: 60 },
            },
            expected: initial,
        });
        const clipState = withClipState.graph.layers[0].stateMachine.states.find((state) => state.name === 'Run');
        expect(clipState).toBeDefined();
        expect(clipState!.motion).toMatchObject({ type: 'clip' });
        expect(clipState!.motion?.clipUuid).toBe(clip.uuid);
        expect(clipState!.editorData).toEqual({ centerX: 30, centerY: 60 });

        const withBlend1DState = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'motion',
                name: 'Blend 1D',
                motionType: 'blend-1d',
            },
            expected: withClipState,
        });
        expect(withBlend1DState.graph.layers[0].stateMachine.states.find((state) => state.name === 'Blend 1D')!.motion).toMatchObject({ type: 'blend-1d' });

        const withBlend2DState = await assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'motion',
                name: 'Blend 2D',
                motionType: 'blend-2d',
            },
            expected: withBlend1DState,
        });
        expect(withBlend2DState.graph.layers[0].stateMachine.states.find((state) => state.name === 'Blend 2D')!.motion).toMatchObject({ type: 'blend-2d' });

        await expect(assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'empty',
                clipUuid: clip.uuid,
            },
            expected: withBlend2DState,
        })).rejects.toMatchObject({ code: 'INVALID_PROPERTY_PATCH' });

        await expect(assetManager.executeAnimationGraphCommand(asset.uuid, {
            command: {
                type: 'add-state',
                layerIndex: 0,
                stateMachinePath: [],
                stateType: 'motion',
                clipUuid: 'missing-asset-uuid',
            },
            expected: withBlend2DState,
        })).rejects.toMatchObject({ message: expect.stringContaining('missing-asset-uuid') });
    });
});
