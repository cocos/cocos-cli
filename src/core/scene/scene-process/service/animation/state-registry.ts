import {
    AnimationClip,
    AnimationState,
    Node,
} from 'cc';
import { ensureClipEvents } from './utils';

export class AnimationStateRegistry {
    private readonly _states = new Map<string, AnimationState>();

    constructor(
        private readonly _getRootNode: () => Node,
        private readonly _loadClip: (uuid: string) => Promise<AnimationClip>,
    ) {}

    get(uuid: string): AnimationState | undefined {
        return this._states.get(uuid);
    }

    async getOrCreate(uuid: string): Promise<AnimationState> {
        const existed = this._states.get(uuid);
        if (existed) {
            return existed;
        }

        return this.create(uuid, await this._loadClip(uuid));
    }

    create(uuid: string, clip: AnimationClip): AnimationState {
        ensureClipEvents(clip);
        const state = new AnimationState(clip);
        state.initialize(this._getRootNode());
        this._states.set(uuid, state);
        return state;
    }

    reset(uuid: string): void {
        const state = this._states.get(uuid);
        if (!state) {
            return;
        }
        destroyAnimationState(state);
        this._states.delete(uuid);
    }

    clear(): void {
        for (const state of this._states.values()) {
            destroyAnimationState(state);
        }
        this._states.clear();
    }
}

function destroyAnimationState(state: AnimationState): void {
    try {
        state.destroy();
    } catch (e) {
        console.warn('[Animation] destroy animation state failed:', e);
    }
}
