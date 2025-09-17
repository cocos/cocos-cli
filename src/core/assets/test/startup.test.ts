import { join } from 'path';
import { existsSync } from 'fs';
import { readJSONSync } from 'fs-extra';
import { EngineLoader } from 'cc/loader.js';
import Engine, { IEngine } from '../../engine';
import { engine as EnginPath } from '../../../../.user.json';

// [
//     'cc',
//     'cc/editor/populate-internal-constants',
//     'cc/editor/serialization',
//     'cc/editor/animation-clip-migration',
//     'cc/editor/exotic-animation',
//     'cc/editor/new-gen-anim',
//     'cc/editor/offline-mappings',
//     'cc/editor/embedded-player',
//     'cc/editor/color-utils',
//     'cc/editor/custom-pipeline',
// ].forEach((module) => {
//     jest.mock(module, () => {
//         return EngineLoader.getEngineModuleById(module);
//     }, { virtual: true });
// });

describe('Import Project', () => {
    const projectRoot = join(__dirname, '../../../../test-project');
    beforeAll(async () => {
        // const engine = await Engine.init(EnginPath);
        // await engine.initEngine({
        //     importBase: join(projectRoot, 'library'),
        //     nativeBase: join(projectRoot, 'library'),
        // });

        const { startupAssetDB } = await import('../index');
        await startupAssetDB({
            root: projectRoot,
            assetDBList: [{
                name: 'assets',
                target: join(projectRoot, 'assets'),
                readonly: false,
                visible: true,
                library: join(projectRoot, 'library'),
            }],
        });
    });

    describe('video import', () => {
        const videoAsset = join(projectRoot, 'assets/video.mp4');
        const videoMetaPath = videoAsset + '.meta';
        it('video meta exists', () => {
            expect(existsSync(videoAsset + '.meta'));
        });

        const data = readJSONSync(videoMetaPath);
        it('video importer', () => {
            expect(data.importer).toEqual('video-clip');
            expect(data.imported).toBeTruthy;
        });
    });
    describe('audio import', () => {
        const audioAsset = join(projectRoot, 'assets/audio.mp3');
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