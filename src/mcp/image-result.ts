/**
 * Remove binary image data from JSON/text channels after the full tool result
 * has passed schema validation. The original result remains untouched so its
 * base64 payload can still be emitted as an MCP image content block.
 */
export function redactInlineImageData(result: any): any {
    const image = result?.data?.image;
    if (!image || typeof image.base64 !== 'string') {
        return result;
    }
    const { base64: _base64, ...imageMetadata } = image;
    return {
        ...result,
        data: {
            ...result.data,
            image: imageMetadata,
        },
    };
}
