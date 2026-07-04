const mockReplacePropertyCurves = jest.fn((clip: any, curves: any[]) => {
    clip.__curves = JSON.parse(JSON.stringify(curves));
    return true;
});

const mockReplaceAuxiliaryCurves = jest.fn((clip: any, curves: Record<string, unknown>) => {
    clip.__auxiliaryCurves = JSON.parse(JSON.stringify(curves));
    return true;
});

jest.mock('cc', () => ({
    AnimationClip: class AnimationClip {},
    assetManager: {
        loadAny: jest.fn(),
    },
    editorExtrasTag: Symbol.for('editorExtrasTag'),
}));

jest.mock('cc/editor/embedded-player', () => ({
    EmbeddedAnimationClipPlayable: class EmbeddedAnimationClipPlayable {},
    EmbeddedParticleSystemPlayable: class EmbeddedParticleSystemPlayable {},
    EmbeddedPlayer: class EmbeddedPlayer {},
    addEmbeddedPlayerTag: Symbol.for('addEmbeddedPlayerTag'),
    clearEmbeddedPlayersTag: Symbol.for('clearEmbeddedPlayersTag'),
    getEmbeddedPlayersTag: Symbol.for('getEmbeddedPlayersTag'),
}));

jest.mock('../scene-process/service/animation/property-curve', () => ({
    dumpPropertyCurves: jest.fn(() => []),
    replacePropertyCurves: (clip: any, curves: any[]) => mockReplacePropertyCurves(clip, curves),
}));

jest.mock('../scene-process/service/animation/auxiliary-curve', () => ({
    dumpAuxiliaryCurves: jest.fn(() => ({})),
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
});
