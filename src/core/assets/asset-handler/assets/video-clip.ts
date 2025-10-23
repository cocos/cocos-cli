import { Asset } from '@cocos/asset-db';
import { AssetHandler } from '../../@types/protected';
import { VideoClip } from 'cc';
import { getMediaDuration } from '../utils';

export const VideoHandler: AssetHandler = {
    name: 'video-clip',
    // assetType: js.getClassName(VideoClip),
    assetType: 'cc.VideoClip',
    importer: {
        version: '1.0.0',
        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否导入成功的标记
         * 如果返回 false，则 imported 标记不会变成 true
         * 后续的一系列操作都不会执行
         * @param asset
         */
        async import(asset: Asset) {
            await asset.copyToLibrary(asset.extname, asset.source);
            let duration = 10;
            try {
                duration = await getMediaDuration(asset.source);
            } catch (error) {
                console.error(
                    `Loading video ${asset.source} failed, the video you are using may be in a corrupted format or not supported by the current browser version of the editor, in the latter case you can ignore this error.`,
                );
                console.debug(error);
            }
            const video = createVideo(asset, duration);
            const serializeJSON = EditorExtends.serialize(video) as string;
            await asset.saveToLibrary('.json', serializeJSON);
            return true;
        },
    },
};

export default VideoHandler;

function createVideo(asset: Asset, duration?: number) {

    const video = new VideoClip();
    // @ts-ignore
    duration && (video._duration = duration);

    video.name = asset.basename;
    video._setRawAsset(asset.extname);

    return video;
}
