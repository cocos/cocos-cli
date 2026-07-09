class FakeAnimationClip {
    constructor(
        public _uuid: string,
        public name: string,
        public _tracks: unknown,
        public _events: unknown = [],
        public _embeddedPlayers: unknown = [],
        public _auxiliaryCurveEntries: unknown = [],
    ) {}
}

class FakeAnimation {
    private _clips: FakeAnimationClip[] = [];
    defaultClip: FakeAnimationClip | null = null;

    get clips() {
        return this._clips;
    }

    set clips(value: FakeAnimationClip[]) {
        for (const clip of value) {
            if (clip && !Array.isArray(clip._tracks)) {
                throw new TypeError('invalid clip tracks');
            }
            if (clip && !Array.isArray(clip._events)) {
                throw new TypeError('invalid clip events');
            }
            if (clip && !Array.isArray(clip._embeddedPlayers)) {
                throw new TypeError('invalid clip embedded players');
            }
            if (clip && !Array.isArray(clip._auxiliaryCurveEntries)) {
                throw new TypeError('invalid clip auxiliary curves');
            }
        }
        this._clips = value;
    }

    setRawClips(value: FakeAnimationClip[]) {
        this._clips = value;
    }
}

jest.mock('cc', () => ({
    Animation: FakeAnimation,
    AnimationClip: FakeAnimationClip,
    Node: class Node {},
    Scene: class Scene {},
    SkeletalAnimation: class SkeletalAnimation extends FakeAnimation {},
    animation: {
        AnimationController: class AnimationController {},
    },
    assetManager: {
        assets: {
            get: jest.fn(),
        },
        loadAny: jest.fn(),
    },
    js: {
        getClassName: jest.fn(),
    },
}));

(globalThis as any).EditorExtends = {
    Node: {
        getNode: jest.fn(),
        getNodeByPath: jest.fn(),
        getNodePath: jest.fn(),
    },
};

const { rebindAnimationComponentClip } = require('../scene-process/service/animation/clip-library');

describe('animation clip library', () => {
    it('rebindAnimationComponentClip drops stale unnamed clips before assigning Animation.clips', () => {
        const anim = new FakeAnimation();
        const stale = new FakeAnimationClip('stale-clip', '', null, null);
        const current = new FakeAnimationClip('current-clip', 'CurrentClip', []);
        anim.setRawClips([stale]);
        anim.defaultClip = current;

        expect(() => rebindAnimationComponentClip(anim as any, current as any)).not.toThrow();
        expect(anim.clips).toEqual([current]);
        expect(anim.defaultClip).toBe(current);
    });

    it('rebindAnimationComponentClip normalizes null runtime arrays on the bound clip', () => {
        const anim = new FakeAnimation();
        const current = new FakeAnimationClip('current-clip', 'CurrentClip', null, null, null, null);
        anim.defaultClip = current;

        expect(() => rebindAnimationComponentClip(anim as any, current as any)).not.toThrow();
        expect(current._tracks).toEqual([]);
        expect(current._events).toEqual([]);
        expect(current._embeddedPlayers).toEqual([]);
        expect(current._auxiliaryCurveEntries).toEqual([]);
        expect(anim.clips).toEqual([current]);
    });

    it('rebindAnimationComponentClip normalizes retained named clips before assigning Animation.clips', () => {
        const anim = new FakeAnimation();
        const retained = new FakeAnimationClip('retained-clip', 'RetainedClip', null, null, null, null);
        const current = new FakeAnimationClip('current-clip', 'CurrentClip', [], []);
        anim.setRawClips([retained]);
        anim.defaultClip = current;

        expect(() => rebindAnimationComponentClip(anim as any, current as any)).not.toThrow();
        expect(retained._tracks).toEqual([]);
        expect(retained._events).toEqual([]);
        expect(retained._embeddedPlayers).toEqual([]);
        expect(retained._auxiliaryCurveEntries).toEqual([]);
        expect(anim.clips).toEqual([retained, current]);
    });
});
