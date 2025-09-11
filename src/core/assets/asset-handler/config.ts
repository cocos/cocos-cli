import { AssetHandler } from '../@types/protected';

export interface AssetHandlerInfo {
    name: string;
    extensions: string[];
    load: () => AssetHandler | Promise<AssetHandler>;
}

export const assetHandlerInfos: AssetHandlerInfo[] = [{
    name: 'video-clip',
    extensions: ['.mp4'],
    load: async () => {
        return (await import('./assets/video-clip')).default;
    }
}, {
    name: 'audio-clip',
    extensions: [
        '.mp3',
        '.wav',
        '.ogg',
        '.aac',
        '.pcm',
        '.m4a'
    ],
    load: async () => {
        return (await import('./assets/audio-clip')).default;
    }
}];