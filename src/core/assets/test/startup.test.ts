import { join } from 'path';
import { existsSync } from 'fs';
import { startupAssetDB } from '../../assets';
import { readJSONSync } from 'fs-extra';


describe('Import Project', () => {
    const projectRoot = join(__dirname, '../../../../test-project');
    beforeAll(async () => {
        await startupAssetDB({
            root: projectRoot,
            assetDBList: [{
                name: 'assets',
                target: join(projectRoot, 'assets'),
                readonly: false,
                visible: true,
            }],
        });
    });

    describe('video import', async () => {
        const videoAsset = join(projectRoot, 'assets/video.mp4');
        const videoMetaPath = videoAsset + '.meta';
        it('video meta exists', () => {
            expect(existsSync(videoAsset + '.meta'));
        });

        const data = readJSONSync(videoMetaPath);
        it('audio importer', () => {
            expect(data.importer).toEqual('video-clip');
            expect(data.imported).toBeTruthy;
        });
    });
    describe('audio import', async () => {
        const audioAsset = join(projectRoot, 'assets/audio.mp4');
        const audioMetaPath = audioAsset + '.meta';
        it('audio meta exists', () => {
            expect(existsSync(audioMetaPath));
        });

        const data = readJSONSync(audioMetaPath);
        it('audio importer', () => {
            expect(data.importer).toEqual('audio-clip');
            expect(data.imported).toBeTruthy;
        });
    });
});