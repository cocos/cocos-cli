import { join } from 'path';
import { existsSync } from 'fs';
import { readJSONSync, remove } from 'fs-extra';
import { globalSetup, testInfo } from './utils';

describe('Import Project', () => {
    beforeAll(async () => {
        await globalSetup();
        try {
            // clear cache
            await remove(join(testInfo.projectRoot, 'library'));
        } catch (error) {
        }
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
    testAssets.forEach((asset) => {
        const assetPath = join(testInfo.projectRoot, asset.url);
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
                expect(existsSync(join(testInfo.projectRoot, `library/${uuid.substring(0, 2)}/${uuid}${extension}`)));
            });
        });

        it('imported', () => {
            expect(meta.imported).toBeTruthy;
        });
    });

});