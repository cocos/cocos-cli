export {};

jest.mock('sharp', () => ({
    __esModule: true,
    default: jest.fn(),
}));

const mockSharp = require('sharp').default as jest.Mock;
const imageProcessingModule = () => require('../image-processing') as typeof import('../image-processing');

describe('asset image processing', () => {
    beforeEach(() => {
        mockSharp.mockReset();
    });

    it('extracts RGBA pixels in Node and returns JSON-safe Base64 data', async () => {
        const data = Buffer.from([
            255, 0, 0, 255,
            0, 255, 0, 128,
        ]);
        const pipeline = {
            extract: jest.fn().mockReturnThis(),
            rotate: jest.fn().mockReturnThis(),
            ensureAlpha: jest.fn().mockReturnThis(),
            raw: jest.fn().mockReturnThis(),
            toBuffer: jest.fn().mockResolvedValue({
                data,
                info: { width: 1, height: 2, channels: 4 },
            }),
        };
        mockSharp.mockReturnValue(pipeline);

        const result = await imageProcessingModule().extractImagePixelsFromFile(
            'D:/project/assets/atlas.png',
            {
                rect: { left: 3, top: 4, width: 2, height: 1 },
                rotation: 90,
            },
        );

        expect(mockSharp).toHaveBeenCalledWith('D:/project/assets/atlas.png');
        expect(pipeline.extract).toHaveBeenCalledWith({ left: 3, top: 4, width: 2, height: 1 });
        expect(pipeline.rotate).toHaveBeenCalledWith(90);
        expect(pipeline.ensureAlpha).toHaveBeenCalledTimes(1);
        expect(pipeline.raw).toHaveBeenCalledTimes(1);
        expect(result).toEqual({
            dataBase64: data.toString('base64'),
            width: 1,
            height: 2,
            channels: 4,
        });
    });

    it('rejects invalid extraction rectangles before invoking Sharp', async () => {
        await expect(imageProcessingModule().extractImagePixelsFromFile(
            'D:/project/assets/atlas.png',
            {
                rect: { left: 0, top: 0, width: 0, height: 1 },
                rotation: 0,
            },
        )).rejects.toThrow('rect.width must be an integer greater than or equal to 1');

        expect(mockSharp).not.toHaveBeenCalled();
    });
});
