const request = jest.fn();
const broadcast = jest.fn();

jest.mock('../scene-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request }) },
}));

jest.mock('../scene-process/service/core', () => {
    class BaseService<T> {
        broadcast = broadcast;
    }
    return {
        BaseService,
        register: () => (target: unknown) => target,
        Service: {
            Camera: { is2D: true },
            Engine: { repaintInEditMode: jest.fn() },
            Editor: { getEditorSession: () => ({ uuid: 'scene-a', generation: 1 }), isCurrentEditorSession: () => true },
            Gizmo: { backgroundNode: {} },
        },
        ServiceEvents: { on: jest.fn() },
    };
});

jest.mock('cc', () => ({
    Canvas: class {},
    CCObject: { Flags: { DontSave: 1, HideInHierarchy: 2 } },
    Color: class {},
    Layers: { Enum: { GIZMOS: 1, UI_2D: 2, IGNORE_RAYCAST: 4 } },
    Node: class {},
    Sprite: class {},
    SpriteFrame: class {},
    UITransform: class {},
}));

import { ReferenceImageService } from '../scene-process/service/reference-image';

describe('ReferenceImageService state and preview boundary', () => {
    let service: ReferenceImageService;

    beforeEach(() => {
        request.mockReset();
        broadcast.mockReset();
        request.mockResolvedValue(undefined);
        service = new ReferenceImageService();
        Object.assign(service as any, {
            config: {
                desiredVisible: true,
                images: [{ path: 'C:\\design.png', x: 2, y: 3, scaleX: 1, scaleY: 1, opacity: 75 }],
                sceneBindings: { 'scene-a': 'C:\\design.png' },
            },
            currentSceneUuid: 'scene-a',
            spriteFrame: {},
            loadedPath: 'C:\\design.png',
        });
    });

    it('derives current image from the library and scene binding', async () => {
        const state = await service.getState();

        expect(state.current).toEqual({
            sceneUuid: 'scene-a',
            imagePath: 'C:\\design.png',
            image: expect.objectContaining({ path: 'C:\\design.png', opacity: 75, missing: false }),
        });
        expect(state.visibilityReason).toBe('visible');
    });

    it('keeps preview ephemeral and rejects a late preview after commit', async () => {
        await service.previewParameters({ interactionId: 4, patch: { opacity: 40 } });

        expect((service as any).config.images[0].opacity).toBe(75);
        expect(request).not.toHaveBeenCalledWith('sceneConfigInstance', 'set', expect.anything());
        expect(broadcast).not.toHaveBeenCalled();

        await service.commitParameters({ interactionId: 4, patch: { opacity: 40 } });

        expect((service as any).config.images[0].opacity).toBe(40);
        expect(request).toHaveBeenCalledWith('sceneConfigInstance', 'set', ['referenceImage', expect.any(Object), 'local']);
        expect(broadcast).toHaveBeenCalledTimes(1);

        await service.previewParameters({ interactionId: 4, patch: { opacity: 10 } });
        expect((service as any).previewPatch).toBeNull();
        expect((service as any).config.images[0].opacity).toBe(40);
    });

    it('validates opacity as a percentage before changing runtime state', async () => {
        await expect(service.previewParameters({ interactionId: 1, patch: { opacity: 101 } }))
            .rejects.toThrow('opacity must be between 0 and 100');
        expect((service as any).previewPatch).toBeNull();
    });

    it('reports unreadable files as missing file errors', async () => {
        Object.assign(service as any, { spriteFrame: null, loadedPath: null });
        request.mockRejectedValueOnce(new Error('ENOENT: no such file'));

        await (service as any).loadBoundImage(true);

        const state = await service.getState();
        expect(state.current.image?.missing).toBe(true);
        expect(state.error).toEqual({ stage: 'file', message: 'ENOENT: no such file' });
        expect(state.visibilityReason).toBe('missing');
    });

    it('reports data URL decode failures without marking the file missing', async () => {
        Object.assign(service as any, { spriteFrame: null, loadedPath: null });
        request.mockResolvedValueOnce('data:image/png;base64,invalid');
        jest.spyOn(service as any, 'createSpriteFrame').mockRejectedValueOnce(new Error('Reference image decoding failed.'));

        await (service as any).loadBoundImage(true);

        const state = await service.getState();
        expect(state.current.image?.missing).toBe(false);
        expect(state.error).toEqual({ stage: 'decode', message: 'Reference image decoding failed.' });
        expect(state.visibilityReason).toBe('load-error');
    });
});
