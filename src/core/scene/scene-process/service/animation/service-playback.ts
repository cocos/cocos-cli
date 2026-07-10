import type { AnimationState } from 'cc';
import type { AnimationEventReason, AnimationPlayState } from '../../../common';

const PLAYBACK_TIME_BROADCAST_INTERVAL_MS = 1000 / 60;
const PLAYBACK_TIME_BROADCAST_EPSILON = 0.001;

export interface IAnimationServicePlaybackContext {
    getCurrentState(): AnimationState | undefined;
    getEditTime(): number;
    getPlayState(): AnimationPlayState;
    setEditTime(time: number): void;
    setPlayState(playState: AnimationPlayState): void;
    enterAnimationMode(): void;
    exitAnimationMode(): void;
    repaintInEditMode(): Promise<void>;
    broadcastTimeChanged(reason: AnimationEventReason): void;
    broadcastStateChanged(reason: AnimationEventReason): Promise<void>;
}

export class AnimationServicePlayback {
    private _playbackTimeBroadcastTimer: ReturnType<typeof setInterval> | null = null;
    private _lastPlaybackBroadcastTime = Number.NaN;

    constructor(private readonly _context: IAnimationServicePlaybackContext) {}

    play(state: AnimationState): void {
        state.weight = 1;
        if (state.isPlaying && state.isPaused) {
            state.resume();
        } else {
            state.play();
        }
        this._context.setPlayState('playing');
        this._context.enterAnimationMode();
        this._startPlaybackTimeBroadcast();
    }

    pause(state: AnimationState): void {
        this._stopPlaybackTimeBroadcast();
        state.pause();
        this._context.setEditTime(state.current);
        this._context.setPlayState('pause');
        this._context.exitAnimationMode();
    }

    resume(state: AnimationState): void {
        if (!state.isPlaying) {
            state.weight = 1;
            state.play();
        }
        state.resume();
        this._context.setPlayState('playing');
        this._context.enterAnimationMode();
        this._startPlaybackTimeBroadcast();
    }

    async stopCurrent(): Promise<void> {
        this._stopPlaybackTimeBroadcast();
        const state = this._context.getCurrentState();
        if (state) {
            state.setTime(0);
            if (!state.isPaused) {
                state.pause();
            }
            state.sample();
            state.stop();
        }
        this._context.setEditTime(0);
        this._context.setPlayState('stop');
        this._context.exitAnimationMode();
    }

    dispose(): void {
        this._stopPlaybackTimeBroadcast();
        this._context.exitAnimationMode();
        this._context.setPlayState('stop');
    }

    private _startPlaybackTimeBroadcast(): void {
        this._stopPlaybackTimeBroadcast();
        this._lastPlaybackBroadcastTime = Number.NaN;
        this._playbackTimeBroadcastTimer = setInterval(() => {
            this._broadcastPlaybackTimeTick();
        }, PLAYBACK_TIME_BROADCAST_INTERVAL_MS);
        this._broadcastPlaybackTimeTick();
    }

    private _stopPlaybackTimeBroadcast(): void {
        if (this._playbackTimeBroadcastTimer) {
            clearInterval(this._playbackTimeBroadcastTimer);
            this._playbackTimeBroadcastTimer = null;
        }
    }

    private _broadcastPlaybackTimeTick(): void {
        if (this._context.getPlayState() !== 'playing') {
            this._stopPlaybackTimeBroadcast();
            return;
        }
        const state = this._context.getCurrentState();
        const time = state?.current;
        if (!state) {
            this._stopPlaybackTimeBroadcast();
            return;
        }
        if (state.isPaused) {
            return;
        }
        if (!state.isPlaying) {
            this._stopPlaybackTimeBroadcast();
            const duration = Number.isFinite(state.duration) ? state.duration : this._context.getEditTime();
            this._context.setEditTime(Math.max(0, duration));
            state.weight = 1;
            state.setTime(this._context.getEditTime());
            state.sample();
            this._context.setPlayState('stop');
            this._context.exitAnimationMode();
            void this._context.repaintInEditMode();
            this._context.broadcastTimeChanged('play-state');
            void this._context.broadcastStateChanged('play-state')
                .catch((error) => console.error('[Animation] broadcast playback stop state failed:', error));
            return;
        }
        if (typeof time !== 'number' || !Number.isFinite(time)) {
            return;
        }
        if (Number.isNaN(this._lastPlaybackBroadcastTime) && time <= PLAYBACK_TIME_BROADCAST_EPSILON) {
            this._lastPlaybackBroadcastTime = time;
            return;
        }
        if (Math.abs(time - this._lastPlaybackBroadcastTime) < PLAYBACK_TIME_BROADCAST_EPSILON) {
            return;
        }
        this._context.setEditTime(time);
        this._lastPlaybackBroadcastTime = time;
        this._context.broadcastTimeChanged('play-state');
    }
}
