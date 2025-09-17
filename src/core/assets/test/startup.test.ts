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
        console.log('startupAssetDB success');
    }, 1000 * 60 * 50);

    const testAssets = [{
        name: 'video',
        url: 'assets/video.mp4',
        importer: 'video-clip',
        library: ['.json', '.mp4']
    }, {
        name: 'audio',
        url: 'assets/audio.mp3',
        importer: 'audio-clip',
        library: ['.json', '.mp3']
    }];
    testAssets.forEach((asset) => {
        const assetPath = join(projectRoot, asset.url);
        const metaPath = assetPath + '.meta';
        const meta = readJSONSync(metaPath);
        describe(asset.name + ' import', () => {
            it('meta exists', () => {
                expect(existsSync(metaPath));
            });
            it('importer', () => {
                expect(meta.importer).toEqual(asset.importer);
            });
        });

        asset.library.forEach((extension) => {
            it('library exists', () => {
                const uuid = meta.uuid;
                expect(existsSync(join(projectRoot, `library/${uuid.substring(0, 2)}/${uuid}${extension}`)));
            });
        });

        it('imported', () => {
            expect(meta.imported).toBeTruthy;
        });
    });

});