let constructedState: any = null;

jest.mock('cc', () => ({
    AnimationClip: class AnimationClip {},
    Node: class Node {},
    AnimationState: class AnimationState {
        clip: unknown;
        initialize = jest.fn();
        destroy = jest.fn();

        constructor(clip: unknown) {
            this.clip = clip;
            constructedState = this;
            Object.defineProperty(this, '_curveLoaded', {
                set() {
                    throw new Error('private curve flag should not be written');
                },
            });
        }
    },
}));

const { AnimationStateRegistry } = require('../scene-process/service/animation/state-registry');

describe('AnimationStateRegistry', () => {
    beforeEach(() => {
        constructedState = null;
    });

    it('creates and initializes animation state without touching private curve flags', () => {
        const rootNode = {};
        const clip = {};
        const registry = new AnimationStateRegistry(() => rootNode, async () => clip);

        const state = registry.create('clip-uuid', clip);

        expect(state).toBe(constructedState);
        expect(state.initialize).toHaveBeenCalledWith(rootNode);
    });

    it('normalizes null clip events before initializing animation state', () => {
        const rootNode = {};
        const clip = { events: null };
        const registry = new AnimationStateRegistry(() => rootNode, async () => clip);

        registry.create('clip-uuid', clip);

        expect(clip.events).toEqual([]);
    });
});
