import { redactInlineImageData } from '../src/mcp/image-result';

describe('MCP inline image result', () => {
    it('keeps base64 only in the original image payload', () => {
        const result = {
            code: 200,
            data: {
                image: {
                    base64: 'large-image-payload',
                    mimeType: 'image/jpeg',
                    attached: true,
                },
                meta: { width: 1280, height: 720 },
            },
        };

        const redacted = redactInlineImageData(result);

        expect(redacted).toEqual({
            code: 200,
            data: {
                image: { mimeType: 'image/jpeg', attached: true },
                meta: { width: 1280, height: 720 },
            },
        });
        expect(result.data.image.base64).toBe('large-image-payload');
        expect(JSON.stringify(redacted)).not.toContain('large-image-payload');
    });

    it('does not clone ordinary tool results', () => {
        const result = { code: 200, data: { value: 1 } };
        expect(redactInlineImageData(result)).toBe(result);
    });
});
