export const registerMap = {
    async registerVideoHandler() {
        return (await import('./assets/video-clip')).default;
    },
};
