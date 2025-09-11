import { Asset } from '@editor/asset-db';
import { AssetHandler } from '../../@types/private';

const AudioHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'audio-clip',

    // 引擎内对应的类型
    assetType: 'cc.AudioClip',

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
            // 如果当前资源没有导入，则开始导入当前资源
            // 0 - WEBAUDIO, 1 - DOM
            asset.userData.downloadMode = 0;
            await asset.copyToLibrary(asset.extname, asset.source);
            let duration = 0;
            // 如果当前资源没有生成 audio，则开始生成 audio
            try {
                duration = await getAudioDurationInSeconds(asset.source);
            } catch (error) {
                console.error(error);
                console.error(
                    `Loading audio ${asset.source} failed, the audio you are using may be in a corrupted format or not supported by the current browser version of the editor, in the latter case you can ignore this error.`,
                );
            }
            // const audio = createAudio(asset, duration);
            // await asset.saveToLibrary('.json', EditorExtends.serialize(audio));
            await asset.saveToLibrary('.json', JSON.stringify({
                duration,
                name: asset._name,
            }));
            return true;
        },
    },
};

export default AudioHandler;

function getAudioDurationInSeconds(path: string) {
    return new Promise<number>((resolve, reject) => {
        const { getAudioDurationInSeconds } = require('get-audio-duration')
        getAudioDurationInSeconds(path).then((duration: number) => {
            resolve(duration);
        })
    });
}

function createAudio(asset: Asset, duration: number) {
    const audio = new cc.AudioClip();
    audio._loadMode = asset.userData.downloadMode;
    audio._duration = duration;

    audio.name = asset.basename;
    audio._setRawAsset(asset.extname);

    return audio;
}
