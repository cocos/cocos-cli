const { AnimationServicePlayback } = require('../scene-process/service/animation/service-playback');

describe('AnimationServicePlayback', () => {
    it('keeps the playback timer alive when the state is only transiently paused', () => {
        const state = {
            current: 0.5,
            duration: 1,
            isPaused: true,
            isPlaying: true,
            setTime: jest.fn(),
            sample: jest.fn(),
        };
        const playback = new AnimationServicePlayback({
            getCurrentState: () => state,
            getEditTime: () => 0.5,
            getPlayState: () => 'playing',
            setEditTime: jest.fn(),
            setPlayState: jest.fn(),
            enterAnimationMode: jest.fn(),
            exitAnimationMode: jest.fn(),
            repaintInEditMode: jest.fn(async () => undefined),
            broadcastTimeChanged: jest.fn(),
            broadcastStateChanged: jest.fn(async () => undefined),
        });
        const timer = setInterval(() => undefined, 1000);
        (playback as any)._playbackTimeBroadcastTimer = timer;

        (playback as any)._broadcastPlaybackTimeTick();

        expect((playback as any)._playbackTimeBroadcastTimer).toBe(timer);
        clearInterval(timer);
    });
});
