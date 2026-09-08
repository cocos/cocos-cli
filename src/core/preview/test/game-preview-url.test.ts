import { getExternalGamePreviewUrl } from '../game-preview-url';

describe('external game preview URL', () => {
    it('opts the CLI browser launch into the preview toolbar', () => {
        expect(getExternalGamePreviewUrl('http://localhost:9527')).toBe(
            'http://localhost:9527/?previewToolbar=1',
        );
    });

    it('preserves the selected scene alongside the toolbar flag', () => {
        expect(getExternalGamePreviewUrl('http://localhost:9527', 'db://assets/场景.scene')).toBe(
            'http://localhost:9527/?scene=db%3A%2F%2Fassets%2F%E5%9C%BA%E6%99%AF.scene&previewToolbar=1',
        );
    });
});
