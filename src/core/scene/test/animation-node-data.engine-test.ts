/*---------------------------------------------------------------------------------------------
 * Copyright (c) SUD. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Module from 'node:module';
import type { animation, AnimationClip, Node } from 'cc';
import { TestGlobalEnv } from '../../../tests/global-env';

const modules = [
    'cc', 'cc/editor/populate-internal-constants', 'cc/editor/serialization',
    'cc/editor/new-gen-anim', 'cc/editor/embedded-player', 'cc/editor/reflection-probe',
    'cc/editor/lod-group-utils', 'cc/editor/material', 'cc/editor/2d-misc',
    'cc/editor/offline-mappings', 'cc/editor/custom-pipeline', 'cc/editor/animation-clip-migration',
    'cc/editor/exotic-animation', 'cc/editor/color-utils',
];

describe('Animation node data migration with the real engine', () => {
    let cc: typeof import('cc');
    let migration: typeof import('../scene-process/service/animation/node-data');
    let snapshots: typeof import('../scene-process/service/animation/clip-snapshot');
    let paths: typeof import('../scene-process/service/animation/property-curve-track');
    let propertyCurves: typeof import('../scene-process/service/animation/property-curve');
    let temporaryDirectory: string;
    let restoreModuleHooks: (() => void) | undefined;
    let root: Node;

    beforeAll(async () => {
        jest.resetModules();
        const moduleHooks = Module as typeof Module & { _load: unknown; _resolveFilename: unknown };
        const { _load, _resolveFilename } = moduleHooks;
        restoreModuleHooks = () => {
            moduleHooks._load = _load;
            moduleHooks._resolveFilename = _resolveFilename;
        };
        const { EngineLoader } = await import('cc/loader.js');
        modules.forEach(id => jest.doMock(id, () => EngineLoader.getEngineModuleById(id), { virtual: true }));
        temporaryDirectory = await mkdtemp(join(tmpdir(), 'animation-node-data-'));
        const { Engine } = await import('../../engine');
        await Engine.importEditorExtensions();
        const { default: preload } = await import('cc/preload');
        await preload({
            engineRoot: TestGlobalEnv.engineRoot,
            engineDev: join(TestGlobalEnv.engineRoot, 'bin/.cache/dev-cli'),
            writablePath: temporaryDirectory,
            requiredModules: modules,
        });
        await Engine.initEditorExtensions();
        cc = await import('cc');
        migration = await import('../scene-process/service/animation/node-data');
        snapshots = await import('../scene-process/service/animation/clip-snapshot');
        paths = await import('../scene-process/service/animation/property-curve-track');
        propertyCurves = await import('../scene-process/service/animation/property-curve');
    });

    beforeEach(() => {
        root = new cc.Node('Root');
        root.addChild(new cc.Node('Target'));
    });

    afterEach(() => {
        root?.destroy();
        cc?.CCObject._deferredDestroy();
    });

    afterAll(async () => {
        // 测试结束后恢复引擎加载器改动的全局模块钩子
        restoreModuleHooks?.();
        if (temporaryDirectory) {
            await rm(temporaryDirectory, { recursive: true, force: true });
        }
    });

    function addTrack(clip: AnimationClip, nodePath: string, empty = false) {
        const track = new cc.animation.RealTrack();
        track.path = new cc.animation.TrackPath().toHierarchy(nodePath).toProperty('value');
        if (!empty) {
            track.channel.curve.addKeyFrame(0.25, { value: 7, leftTangent: 2, rightTangent: 3 });
        }
        clip.addTrack(track);
        return track;
    }

    function move(clip: AnimationClip, srcPath = 'Missing', dstPath = 'Target') {
        return migration.changeNodeDataPath(clip, root, {
            type: 'changeNodeDataPath', clipUuid: 'clip', srcPath, dstPath,
        });
    }

    it('moves missing source tracks, replaces the whole target and preserves children and events', async () => {
        const clip = new cc.AnimationClip();
        const source = addTrack(clip, 'Missing');
        const empty = addTrack(clip, 'Missing', true);
        addTrack(clip, 'Target');
        const child = addTrack(clip, 'Missing/Child');
        const targetChild = addTrack(clip, 'Target/Child');
        clip.events = [{ frame: 1, func: 'unchanged', params: [] }];
        const before = snapshots.captureAnimationClipSnapshot(clip);

        expect(move(clip)).toBe(true);
        expect(Array.from(clip.tracks)).toEqual([source, empty, child, targetChild]);
        expect(paths.queryAnimationNodePaths(clip)).toEqual(['Target', 'Missing/Child', 'Target/Child']);
        expect(source.channel.curve.getKeyframeValue(0).value).toBe(7);
        expect(empty.channel.curve.keyFramesCount).toBe(0);
        expect(clip.events).toEqual([{ frame: 1, func: 'unchanged', params: [] }]);
        const after = snapshots.captureAnimationClipSnapshot(clip);

        await snapshots.restoreAnimationClipSnapshot(clip, before);
        expect(snapshots.captureAnimationClipSnapshot(clip)).toEqual(before);
        await snapshots.restoreAnimationClipSnapshot(clip, after);
        expect(snapshots.captureAnimationClipSnapshot(clip)).toEqual(after);
    });

    it('preserves complex paths and proxies through migration, serialization and restoration', async () => {
        const clip = new cc.AnimationClip();
        const track = addTrack(clip, 'Missing');
        track.path = new cc.animation.TrackPath().toHierarchy('Missing')
            .toComponent('MissingComponent').toProperty('items').toElement(2).toProperty('amount');
        track.proxy = new cc.animation.UniformProxyFactory('albedo', 0);
        const before = snapshots.captureAnimationClipSnapshot(clip);
        move(clip);
        expect(track.path.parseHierarchyAt(0)).toBe('Target');
        expect(track.path.parseComponentAt(1)).toBe('MissingComponent');
        expect(track.path.parseElementAt(3)).toBe(2);
        await snapshots.restoreAnimationClipSnapshot(clip, before);
        expect(snapshots.captureAnimationClipSnapshot(clip)).toEqual(before);
    });

    it.each(['VectorTrack', 'QuatTrack', 'ColorTrack', 'SizeTrack', 'ObjectTrack'] as const)(
        'preserves an empty %s and its binding in raw snapshots', async kind => {
            const clip = new cc.AnimationClip();
            const track: animation.Track = new cc.animation[kind]();
            track.path = new cc.animation.TrackPath().toHierarchy('Missing').toProperty('value');
            clip.addTrack(track);
            const before = snapshots.captureAnimationClipSnapshot(clip);
            move(clip);
            await snapshots.restoreAnimationClipSnapshot(clip, before);
            expect(snapshots.captureAnimationClipSnapshot(clip)).toEqual(before);
            expect(clip.getTrack(0)).toBeInstanceOf(cc.animation[kind]);
        },
    );

    it('supports moving to and from the root empty path', () => {
        const clip = new cc.AnimationClip();
        const source = addTrack(clip, 'Missing');
        addTrack(clip, '');
        move(clip, 'Missing', '');
        expect(source.path.isHierarchyAt(0)).toBe(false);
        expect(paths.queryAnimationNodePaths(clip)).toEqual(['']);
        move(clip, '', 'Target');
        expect(paths.queryAnimationNodePaths(clip)).toEqual(['Target']);
    });

    it('preserves untyped tracks without requiring a live source component', async () => {
        const Constructor = cc.js.getClassByName('cc.animation.UntypedTrack');
        expect(Constructor).toBeDefined();
        const track = new Constructor();
        if (!(track instanceof cc.animation.Track)) {
            throw new Error('Untyped track constructor was not registered.');
        }
        track.path = new cc.animation.TrackPath().toHierarchy('Missing')
            .toComponent('MissingComponent').toProperty('color');
        const clip = new cc.AnimationClip();
        clip.addTrack(track);
        const before = snapshots.captureAnimationClipSnapshot(clip);
        expect(paths.queryAnimationNodePaths(clip)).toEqual(['Missing']);
        move(clip);
        await snapshots.restoreAnimationClipSnapshot(clip, before);
        expect(snapshots.captureAnimationClipSnapshot(clip)).toEqual(before);
        expect(clip.getTrack(0)).toBeInstanceOf(Constructor);
    });

    it('preserves resource references through migration, undo and a saved clip round trip', async () => {
        const asset = new cc.SpriteFrame();
        Object.assign(asset, { _uuid: '9624e676-6114-4ef0-babd-f9a45f381c16' });
        cc.assetManager.assets.add(asset.uuid, asset);
        try {
            const clip = new cc.AnimationClip();
            const track = new cc.animation.ObjectTrack();
            track.path = new cc.animation.TrackPath().toHierarchy('Missing')
                .toComponent('cc.Sprite').toProperty('spriteFrame');
            track.channel.curve.assignSorted([0], [asset]);
            clip.addTrack(track);
            const before = snapshots.captureAnimationClipSnapshot(clip);
            move(clip);
            const saved = EditorExtends.serialize(clip);
            const { deserializeFull } = await import('../../engine/editor-extends/utils/deserialize');
            const reopened: unknown = await deserializeFull(saved);
            if (!(reopened instanceof cc.AnimationClip)) {
                throw new Error('The saved animation clip did not deserialize.');
            }
            expect(paths.queryAnimationNodePaths(reopened)).toEqual(['Target']);
            await snapshots.restoreAnimationClipSnapshot(clip, before);
            const restored = clip.getTrack(0);
            if (!(restored instanceof cc.animation.ObjectTrack)) {
                throw new Error('Object track was lost.');
            }
            expect(restored.channel.curve.getKeyframeValue(0)).toBe(asset);
        } finally {
            cc.assetManager.assets.remove(asset.uuid);
            asset.destroy();
        }
    });

    it.each([
        { nullKey: false, cached: false },
        { nullKey: true, cached: false },
        { nullKey: false, cached: true },
        { nullKey: true, cached: true },
    ])('restores missing resource track metadata: nullKey=$nullKey, cached=$cached', async ({ nullKey, cached }) => {
        const clip = new cc.AnimationClip();
        const track = new cc.animation.ObjectTrack();
        track.path = new cc.animation.TrackPath().toHierarchy('Missing')
            .toComponent('cc.Sprite').toProperty('spriteFrame');
        if (nullKey) {
            track.channel.curve.assignSorted([0], [null]);
        }
        clip.addTrack(track);
        const context = {
            queryPropertyMetadata: () => ({
                type: { value: 'cc.SpriteFrame' },
                valueCtor: cc.SpriteFrame,
            }),
        };
        if (cached) {
            // 模拟节点删除前已经读取过类型，后续快照不再依赖真实节点
            propertyCurves.dumpPropertyCurves(clip, context);
        }
        const before = snapshots.captureAnimationClipSnapshot(clip, cached ? {} : context);
        expect(before.curves[0]?.type?.value).toBe('cc.SpriteFrame');

        move(clip);
        const after = snapshots.captureAnimationClipSnapshot(clip);
        await snapshots.restoreAnimationClipSnapshot(clip, before);
        const restored = clip.getTrack(0);
        expect(restored).not.toBe(track);
        expect(paths.parsePropertyTrack(restored)?.descriptor).toMatchObject({
            type: { value: 'cc.SpriteFrame' },
            valueCtor: cc.SpriteFrame,
        });
        expect(snapshots.captureAnimationClipSnapshot(clip)).toEqual(before);

        await snapshots.restoreAnimationClipSnapshot(clip, after);
        expect(snapshots.captureAnimationClipSnapshot(clip)).toEqual(after);
        clip.destroy();
    });

    it('preserves separate metadata for tracks with the same binding', async () => {
        const clip = new cc.AnimationClip();
        for (const assetCtor of [cc.SpriteFrame, cc.Texture2D]) {
            const descriptor = paths.createPropertyDescriptor(
                'ResourceComponent.resource', undefined, 'object', undefined,
                { value: cc.js.getClassName(assetCtor) }, assetCtor,
            );
            if (!descriptor) {
                throw new Error('Resource track descriptor was not created.');
            }
            paths.createPropertyTrack(clip, 'Missing', descriptor);
        }
        const before = snapshots.captureAnimationClipSnapshot(clip);
        await snapshots.restoreAnimationClipSnapshot(clip, before);
        expect(propertyCurves.dumpPropertyCurves(clip).map(curve => curve.type?.value))
            .toEqual(['cc.SpriteFrame', 'cc.Texture2D']);
        expect(snapshots.captureAnimationClipSnapshot(clip)).toEqual(before);
        clip.destroy();
    });

    it('accepts raw snapshots created before track metadata was recorded', async () => {
        const clip = new cc.AnimationClip();
        addTrack(clip, 'Missing');
        const before = snapshots.captureAnimationClipSnapshot(clip);
        const legacy = EditorExtends.serialize({ tracks: Array.from(clip.tracks) });
        await snapshots.restoreAnimationClipSnapshot(clip, {
            ...before,
            serializedTracks: typeof legacy === 'string' ? legacy : JSON.stringify(legacy),
        });
        expect(snapshots.captureAnimationClipSnapshot(clip)).toEqual(before);
        clip.destroy();
    });

    it('rolls back an invalid raw snapshot without leaving a partially restored clip', async () => {
        const clip = new cc.AnimationClip();
        addTrack(clip, 'Missing');
        move(clip);
        const before = snapshots.captureAnimationClipSnapshot(clip);
        await expect(snapshots.restoreAnimationClipSnapshot(clip, {
            ...before, duration: 99, serializedTracks: JSON.stringify({ invalid: true }),
        })).rejects.toThrow('Invalid animation track snapshot');
        expect(snapshots.captureAnimationClipSnapshot(clip)).toEqual(before);
    });

    it('does not remove target data for empty sources, identical paths or invalid targets', () => {
        const clip = new cc.AnimationClip();
        addTrack(clip, 'Target');
        const before = snapshots.captureAnimationClipSnapshot(clip);
        move(clip);
        move(clip, 'Target', 'Target');
        expect(() => move(clip, 'Target', 'Absent')).toThrow('does not exist');
        root.addChild(new cc.Node('Target'));
        expect(() => move(clip, '', 'Target')).toThrow('ambiguous');
        expect(() => move(clip, '../Target', '')).toThrow('relative');
        expect(snapshots.captureAnimationClipSnapshot(clip)).toEqual(before);
    });
});
