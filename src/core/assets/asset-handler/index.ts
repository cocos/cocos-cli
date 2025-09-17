export const registerMap = {
    async registerVideoHandler() {
        return (await import('./assets/video-clip')).default;
    },
    async registerAudioHandler() {
        return (await import('./assets/audio-clip')).default;
    },
};
