import { AssetHandler } from "../@types/protected";

export interface AssetHandlerInfo {
    name: string;
    extensions: string[];
    handle: () => AssetHandler | Promise<AssetHandler>;
}

export const assetHandlerInfos: AssetHandlerInfo[] = [{
    name: 'video-clip',
    extensions: ['.mp4'],
    handle: async () => {
        return (await import('./assets/video-clip')).default;
    }
}];