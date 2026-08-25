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
    NodeType: { EMPTY: 'Empty' },
    SCENE_TEMPLATE_TYPE: ['empty'],
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

jest.mock('../src/api/scene/component', () => ({ ComponentApi: jest.fn() }));
jest.mock('../src/api/scene/node', () => ({ NodeApi: jest.fn() }));
jest.mock('../src/api/scene/prefab', () => ({ PrefabApi: jest.fn() }));

import { SceneApi } from '../src/api/scene/scene';
import { SchemaScreenshotResult } from '../src/api/scene/screenshot-schema';

const shot = {
    filePath: 'C:\\Temp\\cocos-cli-screenshot-test.png',
    sceneUrl: 'db://assets/main.scene',
    sceneName: 'main.scene',
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

describe('SceneApi screenshot image transport', () => {
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
        const result = await new SceneApi().getSceneScreenshot({
            format: 'jpeg',
            quality: 80,
            maxSize: 400,
        });

        expect(result.code).toBe(200);
        expect(result.data?.meta).toMatchObject({
            width: 400,
            height: 200,
        });
        expect(result.data?.image).toMatchObject({
            base64: Buffer.from('encoded-image').toString('base64'),
            mimeType: 'image/jpeg',
        });
        expect(mockUnlink).toHaveBeenCalledWith(shot.filePath);
        expect(mockCapture).toHaveBeenCalledWith(expect.objectContaining({
            includeGizmos: undefined,
        }));

        const structured = SchemaScreenshotResult.parse(result.data);
        expect(structured.image).toEqual({ mimeType: 'image/jpeg' });
        expect(structured).not.toHaveProperty('meta.filePath');
    });

    it('removes the temporary PNG when image processing fails', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        mockToBuffer.mockRejectedValue(new Error('encode failed'));

        try {
            const result = await new SceneApi().getSceneScreenshot({ format: 'jpeg', quality: 80 });
            expect(result.code).toBeGreaterThanOrEqual(500);
            expect(mockUnlink).toHaveBeenCalledWith(shot.filePath);
        } finally {
            consoleError.mockRestore();
        }
    });

    it('passes the editor-gizmo option to the scene process', async () => {
        await new SceneApi().getSceneScreenshot({
            format: 'png',
            quality: 80,
            includeGizmos: true,
        });

        expect(mockCapture).toHaveBeenCalledWith(expect.objectContaining({
            includeGizmos: true,
        }));
    });
});
