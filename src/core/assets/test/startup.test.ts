import { join } from 'path';
import { existsSync } from 'fs';
import { startupAssetDB } from '../../assets';


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

    it('video meta exist', async () => {
        const videoAsset = join(projectRoot, 'assets/cocosvideo.mp4');
        expect(existsSync(videoAsset + '.meta'));
    });
});