import { join } from 'path';
import { existsSync } from 'fs';
import { readJSONSync, remove } from 'fs-extra';
import { globalSetup } from '../../test/global-setup';
import { TestGlobalEnv } from '../../../tests/global-env';

describe('Import Project', () => {
    beforeAll(async () => {
        await globalSetup();
    });
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
    console.log(`test assets in project ${TestGlobalEnv.projectRoot}, engine root ${TestGlobalEnv.engineRoot}`);
    testAssets.forEach((asset) => {
        const assetPath = join(TestGlobalEnv.projectRoot, asset.url);
        const metaPath = assetPath + '.meta';
        const meta = readJSONSync(metaPath);
        describe(asset.name + ' import', () => {
            it('meta exists', () => {
                expect(existsSync(metaPath)).toBeTruthy();
            });
            it('importer', () => {
                expect(meta.importer).toEqual(asset.importer);
            });
            asset.library.forEach((extension) => {
                it('library exists', () => {
                    const uuid = meta.uuid;
                    expect(existsSync(join(TestGlobalEnv.projectRoot, `library/${uuid.substring(0, 2)}/${uuid}${extension}`))).toBeTruthy();
                });
            });

            it('imported', () => {
                expect(meta.imported).toBeTruthy;
            });
        });
    });

});