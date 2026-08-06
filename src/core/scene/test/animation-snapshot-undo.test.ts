const mockReplacePropertyCurves = jest.fn((clip: any, curves: any[]) => {
    clip.__curves = JSON.parse(JSON.stringify(curves));
    return true;
});

const mockReplaceAuxiliaryCurves = jest.fn((clip: any, curves: Record<string, unknown>) => {
    clip.__auxiliaryCurves = JSON.parse(JSON.stringify(curves));
    return true;
});

const mockLoadAny = jest.fn();

jest.mock('cc', () => {
    class Asset {
        _uuid = '';
        isDefault = false;

        initDefault(uuid?: string) {
            this._uuid = uuid || this._uuid;
            this.isDefault = true;
        }
    }

    class SpriteFrame extends Asset {
        texture: unknown = null;
    }

    return {
        AnimationClip: class AnimationClip {},
        Asset,
        SpriteFrame,
        assetManager: {
            loadAny: mockLoadAny,
        },
        js: {
            getClassByName(name: string) {
                return name === 'cc.SpriteFrame' ? SpriteFrame : null;
            },
        },
        editorExtrasTag: Symbol.for('editorExtrasTag'),
    };
});

jest.mock('cc/editor/embedded-player', () => ({
    EmbeddedAnimationClipPlayable: class EmbeddedAnimationClipPlayable {},
    EmbeddedParticleSystemPlayable: class EmbeddedParticleSystemPlayable {},
    EmbeddedPlayer: class EmbeddedPlayer {},
    addEmbeddedPlayerTag: Symbol.for('addEmbeddedPlayerTag'),
    clearEmbeddedPlayersTag: Symbol.for('clearEmbeddedPlayersTag'),
    getEmbeddedPlayersTag: Symbol.for('getEmbeddedPlayersTag'),
}));

jest.mock('../scene-process/service/animation/property-curve', () => ({
    dumpPropertyCurves: jest.fn((clip: any) => JSON.parse(JSON.stringify(clip.__curves || []))),
    replacePropertyCurves: (clip: any, curves: any[]) => mockReplacePropertyCurves(clip, curves),
}));

jest.mock('../scene-process/service/animation/auxiliary-curve', () => ({
    dumpAuxiliaryCurves: jest.fn((clip: any) => JSON.parse(JSON.stringify(clip.__auxiliaryCurves || {}))),
    replaceAuxiliaryCurves: (clip: any, curves: Record<string, unknown>) => mockReplaceAuxiliaryCurves(clip, curves),
}));

import { editorExtrasTag } from 'cc';
import { SceneUndoManager } from '../scene-process/service/undo/scene-undo-manager';
import { restoreAnimationClipSnapshot, type IAnimationClipSnapshot } from '../scene-process/service/animation/clip-snapshot';
import { AnimationClipSnapshotCommand } from '../scene-process/service/animation/undo';

function createSnapshot(partial: Partial<IAnimationClipSnapshot> = {}): IAnimationClipSnapshot {
    return {
        duration: 0,
        sample: 60,
        speed: 1,
        wrapMode: 1,
        curves: [],
        events: [],
        embeddedPlayers: [],
        embeddedPlayerGroups: [],
        auxiliaryCurves: {},
        ...partial,
    };
}

function createClip(snapshot: IAnimationClipSnapshot): any {
    return {
        duration: snapshot.duration,
        sample: snapshot.sample,
        speed: snapshot.speed,
        wrapMode: snapshot.wrapMode,
        events: [],
        __curves: JSON.parse(JSON.stringify(snapshot.curves)),
        __auxiliaryCurves: JSON.parse(JSON.stringify(snapshot.auxiliaryCurves)),
        [editorExtrasTag]: {
            embeddedPlayerGroups: JSON.parse(JSON.stringify(snapshot.embeddedPlayerGroups)),
        },
    };
}

describe('Animation clip snapshot undo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLoadAny.mockReset();
    });

    it('loads SpriteFrame snapshot UUIDs as real assets instead of restoring initDefault placeholders', async () => {
        const { SpriteFrame } = require('cc');
        const spriteFrameA = new SpriteFrame();
        spriteFrameA._uuid = 'sprite-frame-a';
        spriteFrameA.texture = { id: 'texture-a', isValid: true };
        const spriteFrameB = new SpriteFrame();
        spriteFrameB._uuid = 'sprite-frame-b';
        spriteFrameB.texture = { id: 'texture-b', isValid: true };
        const loadedAssets = new Map([
            [spriteFrameA._uuid, spriteFrameA],
            [spriteFrameB._uuid, spriteFrameB],
        ]);
        mockLoadAny.mockImplementation((uuid: string, callback: (error: Error | null, asset?: unknown) => void) => {
            callback(null, loadedAssets.get(uuid));
        });

        const clip = createClip(createSnapshot());
        mockReplacePropertyCurves.mockImplementationOnce((targetClip: any, curves: any[]) => {
            targetClip.__restoredSpriteFrames = curves[0].keyframes.map((keyframe: any) => {
                const value = keyframe.dump.value;
                if (value instanceof SpriteFrame) {
                    return value;
                }
                const placeholder = new SpriteFrame();
                placeholder.initDefault(value?.uuid);
                return placeholder;
            });
            targetClip.__curves = curves;
            return true;
        });

        await restoreAnimationClipSnapshot(clip, createSnapshot({
            curves: [{
                nodePath: '',
                key: 'cc.Sprite.spriteFrame',
                type: { value: 'cc.SpriteFrame' },
                keyframes: [
                    { frame: 0, dump: { value: { uuid: spriteFrameA._uuid }, type: 'cc.SpriteFrame' } },
                    { frame: 10, dump: { value: { uuid: spriteFrameB._uuid }, type: 'cc.SpriteFrame' } },
                ],
            } as any],
        }));

        expect({
            restored: clip.__restoredSpriteFrames.map((value: any) => ({
                uuid: value._uuid,
                isDefault: value.isDefault,
                texture: value.texture,
                isLoadedInstance: value === loadedAssets.get(value._uuid),
            })),
            requestedUuids: mockLoadAny.mock.calls.map(([uuid]) => uuid),
        }).toEqual({
            restored: [
                {
                    uuid: spriteFrameA._uuid,
                    isDefault: false,
                    texture: spriteFrameA.texture,
                    isLoadedInstance: true,
                },
                {
                    uuid: spriteFrameB._uuid,
                    isDefault: false,
                    texture: spriteFrameB.texture,
                    isLoadedInstance: true,
                },
            ],
            requestedUuids: [spriteFrameA._uuid, spriteFrameB._uuid],
        });
    });

    it('treats empty embedded players as a restorable state for zero-duration child addPropertyCurve undo/redo', async () => {
        const before = createSnapshot();
        const after = createSnapshot({
            curves: [{
                nodePath: 'AnimationServiceChildSamplingChild',
                key: 'position',
                keyframes: [],
            } as any],
        });
        const clip = createClip(after);
        const manager = new SceneUndoManager();

        manager.push(new AnimationClipSnapshotCommand({
            clipUuid: 'child-clip-uuid',
            before,
            after,
            applySnapshot: (snapshot) => restoreAnimationClipSnapshot(clip, snapshot),
        }));

        await expect(manager.undo()).resolves.toMatchObject({
            success: true,
            label: 'Animation Operation',
        });
        expect(clip.__curves).toEqual(before.curves);
        expect(manager.canRedo()).toBe(true);

        await expect(manager.redo()).resolves.toMatchObject({
            success: true,
            label: 'Animation Operation',
        });
        expect(clip.__curves).toEqual(after.curves);
        expect(manager.canRedo()).toBe(false);
    });

    it('still fails loudly when restoring non-empty embedded players without host APIs', async () => {
        const clip = createClip(createSnapshot());

        await expect(restoreAnimationClipSnapshot(clip, createSnapshot({
            embeddedPlayers: [{
                begin: 0,
                end: 0,
                reconciledSpeed: false,
                group: 'particle-track',
            }],
        }))).rejects.toThrow('Failed to restore animation embedded players.');
    });

    it('restores the original clip data when snapshot restore fails partway', async () => {
        const original = createSnapshot({
            duration: 1,
            sample: 30,
            speed: 1,
            wrapMode: 1,
            curves: [{
                nodePath: '',
                key: 'position',
                keyframes: [{ frame: 0, dump: { value: { x: 1, y: 2, z: 3 }, type: 'cc.Vec3' } }],
            } as any],
            embeddedPlayerGroups: [{ key: 'old-group', name: 'Old Group', type: 'particle-system' }],
            auxiliaryCurves: {
                OldWeight: { keyframes: [{ frame: 0, value: 0.25 }] } as any,
            },
        });
        const clip = createClip(original);

        await expect(restoreAnimationClipSnapshot(clip, createSnapshot({
            duration: 2,
            sample: 60,
            speed: 2,
            wrapMode: 2,
            curves: [{
                nodePath: '',
                key: 'scale',
                keyframes: [{ frame: 0, dump: { value: { x: 4, y: 5, z: 6 }, type: 'cc.Vec3' } }],
            } as any],
            embeddedPlayerGroups: [{ key: 'new-group', name: 'New Group', type: 'particle-system' }],
            embeddedPlayers: [{
                begin: 0,
                end: 30,
                reconciledSpeed: false,
                group: 'new-group',
            }],
            auxiliaryCurves: {
                NewWeight: { keyframes: [{ frame: 0, value: 1 }] } as any,
            },
        }))).rejects.toThrow('Failed to restore animation embedded players.');

        expect(clip.duration).toBe(original.duration);
        expect(clip.sample).toBe(original.sample);
        expect(clip.speed).toBe(original.speed);
        expect(clip.wrapMode).toBe(original.wrapMode);
        expect(clip.__curves).toEqual(original.curves);
        expect(clip[editorExtrasTag].embeddedPlayerGroups).toEqual(original.embeddedPlayerGroups);
        expect(clip.__auxiliaryCurves).toEqual(original.auxiliaryCurves);
    });
});
