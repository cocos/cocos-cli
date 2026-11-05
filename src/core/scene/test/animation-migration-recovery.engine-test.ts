/*---------------------------------------------------------------------------------------------
 * Copyright (c) SUD. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AnimationClip, Component, Material, MeshRenderer, Node } from 'cc';
import type { IAnimationOperation } from '../common';
import { TestGlobalEnv } from '../../../tests/global-env';

const mockService = {
    Engine: { repaintInEditMode: jest.fn(async () => undefined) },
    Undo: { push: jest.fn() },
};

jest.mock('../scene-process/service/core', () => ({
    BaseService: class BaseService {},
    register: () => (target: unknown) => target,
    Service: mockService,
}));

const engineModules = [
    'cc', 'cc/editor/populate-internal-constants', 'cc/editor/serialization',
    'cc/editor/new-gen-anim', 'cc/editor/embedded-player', 'cc/editor/reflection-probe',
    'cc/editor/lod-group-utils', 'cc/editor/material', 'cc/editor/2d-misc',
    'cc/editor/offline-mappings', 'cc/editor/custom-pipeline', 'cc/editor/animation-clip-migration',
    'cc/editor/exotic-animation', 'cc/editor/color-utils',
];

interface RecoveryComponent extends Component {
    material: Material | null;
    failOnNine: boolean;
    failure: number;
}

describe('Migration recovery through AnimationService with the real engine', () => {
    let cc: typeof import('cc');
    let AnimationService: typeof import('../scene-process/service/animation').AnimationService;
    let snapshots: typeof import('../scene-process/service/animation/clip-snapshot');
    let targets: typeof import('../scene-process/service/animation/service-target');
    let RecoveryComponent: new () => RecoveryComponent;
    let writablePath: string;
    let root: Node;
    let clip: AnimationClip;
    let service: any;

    beforeAll(async () => {
        jest.resetModules();
        const { EngineLoader } = await import('cc/loader.js');
        engineModules.forEach(id => {
            jest.doMock(id, () => EngineLoader.getEngineModuleById(id), { virtual: true });
        });
        writablePath = await mkdtemp(join(tmpdir(), 'animation-migration-recovery-'));
        const { Engine } = await import('../../engine');
        await Engine.importEditorExtensions();
        const { default: preload } = await import('cc/preload');
        await preload({
            engineRoot: TestGlobalEnv.engineRoot,
            engineDev: join(TestGlobalEnv.engineRoot, 'bin/.cache/dev-cli'),
            writablePath,
            requiredModules: engineModules,
        });
        await Engine.initEditorExtensions();
        cc = await import('cc');
        ({ AnimationService } = await import('../scene-process/service/animation'));
        snapshots = await import('../scene-process/service/animation/clip-snapshot');
        targets = await import('../scene-process/service/animation/service-target');

        @cc._decorator.ccclass('MigrationRecoveryComponent')
        class TestComponent extends cc.Component {
            @cc._decorator.property(cc.Material)
            material: Material | null = null;

            failOnNine = false;
            private _failure = 3;

            @cc._decorator.property(cc.CCFloat)
            get failure() { return this._failure; }
            set failure(value: number) {
                if (this.failOnNine && value === 9) {
                    throw new Error('migration sampling failed');
                }
                this._failure = value;
            }
        }
        RecoveryComponent = TestComponent;
    });

    beforeEach(() => {
        mockService.Undo.push.mockClear();
        root = new cc.Node('Root');
        for (const name of ['A', 'B', 'C']) {
            root.addChild(new cc.Node(name));
        }
        clip = new cc.AnimationClip();
        Object.assign(clip, { _uuid: 'migration-recovery-clip' });
        clip.duration = 1;
        service = new AnimationService();
        service._session = { rootUuid: root.uuid, rootPath: 'Root', clipUuid: clip.uuid };
        service._getSessionRootNode = () => root;
        service._broadcastTimeChanged = jest.fn();
        service._broadcastClipChanged = jest.fn();
        jest.spyOn(EditorExtends.Node, 'getNode').mockImplementation(uuid => {
            return [root, ...root.children].find(node => node.uuid === uuid) ?? null;
        });
    });

    afterEach(() => {
        service?._animationStates.clear();
        root?.destroy();
        clip?.destroy();
        cc?.CCObject._deferredDestroy();
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        cc?.js.unregisterClass(RecoveryComponent);
        if (writablePath) {
            await rm(writablePath, { recursive: true, force: true });
        }
    });

    function addActiveTrack(nodePath: string) {
        const track = new cc.animation.ObjectTrack();
        track.path = new cc.animation.TrackPath();
        if (nodePath) {
            track.path.toHierarchy(nodePath);
        }
        track.path.toProperty('active');
        track.channel.curve.assignSorted([0], [false]);
        clip.addTrack(track);
    }

    function addFailureTrack(nodePath: string, target: Node) {
        root.getChildByName(nodePath)!.addComponent(RecoveryComponent);
        const component = target.getComponent(RecoveryComponent)
            ?? target.addComponent(RecoveryComponent);
        component.failOnNine = true;
        const track = new cc.animation.RealTrack();
        track.path = new cc.animation.TrackPath().toHierarchy(nodePath)
            .toComponent(RecoveryComponent).toProperty('failure');
        track.channel.curve.assignSorted([0], [{ value: 9 }]);
        clip.addTrack(track);
    }

    function migrate(srcPath: string, dstPath: string): IAnimationOperation {
        return { type: 'changeNodeDataPath', clipUuid: clip.uuid, srcPath, dstPath };
    }

    async function checkRecovery(options: {
        operations: IAnimationOperation[];
        read: () => unknown;
        before: unknown;
        after: unknown;
        rollback: boolean;
    }) {
        const context = targets.createAnimationPropertyCurveMetadataContext(root);
        const captureClip = () => snapshots.captureAnimationClipSnapshot(clip, context);
        const beforeClip = captureClip();
        service._animationStates.create(clip.uuid, clip);
        const result = await service.applyOperations({ operations: options.operations });
        if (options.rollback) {
            expect(result).toMatchObject({ state: 'failure', result: false });
            expect(result.reason).toContain('migration sampling failed');
            expect(options.read()).toEqual(options.before);
            expect(captureClip()).toEqual(beforeClip);
            expect(mockService.Undo.push).not.toHaveBeenCalled();
            return;
        }
        expect(result).toMatchObject({ state: 'success', undoRecorded: true });
        expect(options.read()).toEqual(options.after);
        const afterClip = captureClip();
        const command = mockService.Undo.push.mock.calls[0][0];
        for (let iteration = 0; iteration < 2; iteration++) {
            expect(await command.undo()).toMatchObject({ success: true });
            expect(options.read()).toEqual(options.before);
            expect(captureClip()).toEqual(beforeClip);
            expect(await command.redo()).toMatchObject({ success: true });
            expect(options.read()).toEqual(options.after);
            expect(captureClip()).toEqual(afterClip);
        }
    }

    function addMorphRenderer(node: Node): MeshRenderer {
        const mesh = new cc.Mesh();
        // 保留真实 mesh setter 和权重 API，仅省去 GPU 资源初始化
        Object.assign(mesh, {
            _struct: {
                vertexBundles: [], primitives: [{}, {}],
                morph: {
                    subMeshMorphs: [
                        { targets: [{}, {}], weights: [1, 2] },
                        { targets: [{}, {}], weights: [1, 2] },
                    ],
                },
            },
        });
        jest.spyOn(mesh, 'initialize').mockImplementation(() => undefined);
        const renderer = node.addComponent(cc.MeshRenderer);
        // onRestore 的皮肤渲染更新依赖 GPU pipeline，权重恢复仍走真实实现
        jest.spyOn(renderer as any, '_updateStandardSkin').mockImplementation(() => undefined);
        renderer.mesh = mesh;
        renderer.setWeights([3, 4], 0);
        renderer.setWeights([5, 6], 1);
        return renderer;
    }

    it.each(
        (['single', 'submesh', 'all', 'untracked'] as const).flatMap(kind =>
            [false, true].map(rollback => ({ kind, rollback }))),
    )(
        'restores $kind morph weights, rollback=$rollback', async ({ kind, rollback }) => {
            const source = root.getChildByName('A')!;
            const target = root.getChildByName('C')!;
            addMorphRenderer(source);
            const renderer = addMorphRenderer(target);
            if (kind === 'untracked') {
                addActiveTrack('A');
            } else {
                const track = kind === 'single'
                    ? new cc.animation.RealTrack()
                    : new cc.animation.ObjectTrack();
                track.path = new cc.animation.TrackPath().toHierarchy('A')
                    .toComponent(cc.MeshRenderer);
                if (track instanceof cc.animation.RealTrack) {
                    const proxy = new cc.animation.MorphWeightValueProxy();
                    proxy.subMeshIndex = 1;
                    proxy.shapeIndex = 0;
                    track.proxy = proxy;
                    track.channel.curve.assignSorted([0], [{ value: 9 }]);
                } else {
                    track.proxy = kind === 'submesh'
                        ? new cc.animation.MorphWeightsValueProxy()
                        : new cc.animation.MorphWeightsAllValueProxy();
                    track.channel.curve.assignSorted([0], [[9, 10]]);
                }
                clip.addTrack(track);
            }
            if (rollback) {
                addFailureTrack('A', target);
            }
            const after = {
                single: [[3, 4], [9, 6]], submesh: [[9, 10], [5, 6]],
                all: [[9, 10], [9, 10]], untracked: [[3, 4], [5, 6]],
            }[kind];
            await checkRecovery({
                operations: [migrate('A', 'C')], rollback,
                read: () => [0, 1].map(subMesh =>
                    [0, 1].map(shape => renderer.getWeight(subMesh, shape))),
                before: [[3, 4], [5, 6]], after,
            });
        },
    );

    function addUniform(node: Node) {
        const component = node.addComponent(RecoveryComponent);
        // 使用真实 Pass 的读写方法，通过内存 UBO 观察 uniform
        const pass = Object.assign(Object.create(cc.renderer.Pass.prototype), {
            _propertyHandleMap: { amount: (cc.gfx.Type.FLOAT << 26) | (1 << 12) },
            _blocks: [new Float32Array([3])],
            _blocksInt: [new Int32Array([3])],
            _properties: { amount: { type: cc.gfx.Type.FLOAT } },
            _shaderInfo: { blocks: [{ members: [{ name: 'amount', count: 1 }] }] },
        });
        component.material = new cc.Material();
        Object.assign(component.material, { _passes: [pass] });
        return () => pass.getUniform(pass.getHandle('amount'), 0);
    }

    it.each([
        { address: 'relative', rollback: false }, { address: 'relative', rollback: true },
        { address: 'absolute', rollback: false }, { address: 'uuid', rollback: false },
        { address: 'missing', rollback: false }, { address: 'duplicate', rollback: false },
        { address: 'root', rollback: false }, { address: 'created', rollback: false },
    ])('projects removals with $address targets, rollback=$rollback', async ({ address, rollback }) => {
        const sourcePath = address === 'root' ? '' : 'A';
        const source = address === 'root' ? root : root.getChildByName('A')!;
        const middle = root.getChildByName('B')!;
        const target = root.getChildByName('C')!;
        if (address !== 'created') {
            addActiveTrack(sourcePath);
        }
        if (address === 'duplicate') {
            addActiveTrack('A');
        }
        addUniform(middle);
        const read = addUniform(target);
        const uniform = new cc.animation.RealTrack();
        uniform.path = new cc.animation.TrackPath().toHierarchy('B')
            .toComponent(RecoveryComponent).toProperty('material');
        uniform.proxy = new cc.animation.UniformProxyFactory('amount', 0);
        uniform.channel.curve.assignSorted([0], [{ value: 9 }]);
        clip.addTrack(uniform);
        if (rollback) {
            addFailureTrack('B', target);
        }
        if (address === 'missing') {
            source.removeFromParent();
            source.destroy();
        }
        const operations: IAnimationOperation[] = [];
        if (address === 'created') {
            operations.push({
                type: 'createPropertyKey', clipUuid: clip.uuid, nodePath: sourcePath,
                propKey: 'active', frame: 0, value: false,
            });
        }
        operations.push({
            type: 'removePropertyCurve', clipUuid: clip.uuid, propKey: 'active',
            ...(address === 'uuid' ? { nodeUuid: source.uuid } : {
                nodePath: address === 'absolute' ? 'Root/A' : sourcePath,
            }),
        }, migrate(sourcePath, 'B'), migrate('B', 'C'));
        await checkRecovery({
            operations,
            rollback, read, before: 3, after: address === 'duplicate' ? 3 : 9,
        });
    });
});
