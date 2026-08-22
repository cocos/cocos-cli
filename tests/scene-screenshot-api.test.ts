const mockCapture = jest.fn();
const mockReadFile = jest.fn();
const mockUnlink = jest.fn();
const mockResize = jest.fn();
const mockPng = jest.fn();
const mockJpeg = jest.fn();
const mockToBuffer = jest.fn();

const mockPipeline = {
    resize: mockResize,
    png: mockPng,
    jpeg: mockJpeg,
    toBuffer: mockToBuffer,
};

mockResize.mockReturnValue(mockPipeline);
mockPng.mockReturnValue(mockPipeline);
mockJpeg.mockReturnValue(mockPipeline);

jest.mock('../src/api/decorator/decorator.js', () => ({
    description: () => jest.fn(),
    param: () => jest.fn(),
    result: () => jest.fn(),
    title: () => jest.fn(),
    tool: () => jest.fn(),
}), { virtual: true });

jest.mock('../src/core/scene', () => ({
    Scene: {
        Screenshot: {
            capture: (...args: unknown[]) => mockCapture(...args),
        },
    },
}));

jest.mock('fs/promises', () => ({
    readFile: (...args: unknown[]) => mockReadFile(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
}));

jest.mock('sharp', () => ({
    __esModule: true,
    default: jest.fn(() => mockPipeline),
}));

import { SceneScreenshotApi } from '../src/api/scene/screenshot';
import { SchemaScreenshotResult } from '../src/api/scene/screenshot-schema';

const shot = {
    filePath: 'C:\\Temp\\cocos-cli-screenshot-test.png',
    width: 1200,
    height: 600,
    sceneUrl: 'db://assets/main.scene',
    sceneName: 'main.scene',
    actualCamera: {
        source: 'scene' as const,
        projection: 'perspective' as const,
        position: { x: 0, y: 0, z: 10 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        fov: 45,
        priority: 0,
        clearFlags: 1,
        visibility: 0xffffffff,
        viewport: { x: 0, y: 0, width: 1, height: 1 },
    },
    actualCameras: [{
        source: 'scene' as const,
        projection: 'perspective' as const,
        position: { x: 0, y: 0, z: 10 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        fov: 45,
        priority: 0,
        clearFlags: 1,
        visibility: 0xffffffff,
        viewport: { x: 0, y: 0, width: 1, height: 1 },
    }],
};

describe('SceneScreenshotApi image transport', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockResize.mockReturnValue(mockPipeline);
        mockPng.mockReturnValue(mockPipeline);
        mockJpeg.mockReturnValue(mockPipeline);
        mockCapture.mockResolvedValue(shot);
        mockReadFile.mockResolvedValue(Buffer.from('raw-png'));
        mockUnlink.mockResolvedValue(undefined);
        mockToBuffer.mockResolvedValue({
            data: Buffer.from('encoded-image'),
            info: { width: 400, height: 200 },
        });
    });

    it('returns output dimensions and removes the temporary PNG', async () => {
        const result = await new SceneScreenshotApi().getSceneScreenshot({
            format: 'jpeg',
            quality: 80,
            maxSize: 400,
        });

        expect(result.code).toBe(200);
        expect(result.data?.meta).toMatchObject({
            width: 400,
            height: 200,
            renderWidth: 1200,
            renderHeight: 600,
        });
        expect(result.data?.image).toMatchObject({
            base64: Buffer.from('encoded-image').toString('base64'),
            mimeType: 'image/jpeg',
            attached: true,
        });
        expect(mockUnlink).toHaveBeenCalledWith(shot.filePath);

        const structured = SchemaScreenshotResult.parse(result.data);
        expect(structured.image).toEqual({ mimeType: 'image/jpeg', attached: true });
        expect(structured).not.toHaveProperty('meta.filePath');
    });

    it('removes the temporary PNG when image processing fails', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        mockToBuffer.mockRejectedValue(new Error('encode failed'));

        try {
            const result = await new SceneScreenshotApi().getSceneScreenshot({ format: 'jpeg', quality: 80 });
            expect(result.code).toBeGreaterThanOrEqual(500);
            expect(mockUnlink).toHaveBeenCalledWith(shot.filePath);
        } finally {
            consoleError.mockRestore();
        }
    });
});
