import { Asset } from '@editor/asset-db';
// import { VideoClip, js } from 'cc';

import { getDependUUIDList } from '../utils';
import { AssetHandler } from '../../@types/protected';
import { serialize } from '../../../engine/editor-extends/utils/serialize';

export const VideoHandler: AssetHandler = {
    name: 'video-clip',
    extensions: ['.mp4'],
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
            // const element = document.createElement('video');

            // try {
            //     await loadVideo(asset, element);
            // } catch (error) {
            //     console.error(
            //         `Loading video ${asset.source} failed, the video you are using may be in a corrupted format or not supported by the current browser version of the editor, in the latter case you can ignore this error.`,
            //     );
            //     console.debug(error);
            // }

            // const video = createVideo(asset, element.duration);
            // TODO serialize 定义规范
            // const serializeJSON = serialize(video) as string;
            await asset.saveToLibrary('.json', JSON.stringify({
                test: 'video',
            }));

            // const depends = getDependUUIDList(serializeJSON);
            // asset.setData('depends', depends);
            return true;
        },
    },
};

export default VideoHandler;

function loadVideo(asset: Asset, element: HTMLVideoElement) {
    return new Promise<void>((resolve, reject) => {
        element.addEventListener('loadedmetadata', async () => {
            resolve();
        });
        element.addEventListener('error', (error) => {
            reject(error);
        });

        try {
            const str = asset.source
                .split(/\\|\//)
                .map((str) => encodeURIComponent(str))
                .join('/')
                .replace('%3A', ':');
            element.src = str;
        } catch (error) {
            reject(error);
        }
    });
}

// function createVideo(asset: Asset, duration?: number) {
//     const video = new VideoClip();
//     // @ts-ignore
//     duration && (video._duration = duration);

//     video.name = asset.basename;
//     video._setRawAsset(asset.extname);

//     return video;
// }
