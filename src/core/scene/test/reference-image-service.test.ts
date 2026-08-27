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
    let authority: any;

    beforeEach(() => {
        request.mockReset();
        broadcast.mockReset();
        authority = {
            revision: 1,
            changed: false,
            config: {
                desiredVisible: true,
                images: [{ path: 'C:\\design.png', x: 2, y: 3, scaleX: 1, scaleY: 1, opacity: 75 }],
                sceneBindings: { 'scene-a': 'C:\\design.png' },
            },
        };
        request.mockImplementation((module: string, method: string, args: any[] = []) => {
            if (module !== 'referenceImageStore') return Promise.resolve(undefined);
            if (method === 'getSnapshot') return Promise.resolve(authority);
            const mutation = args[0];
            const config = {
                desiredVisible: authority.config.desiredVisible,
                images: authority.config.images.map((image: any) => ({ ...image })),
                sceneBindings: { ...authority.config.sceneBindings },
            };
            let changed = false;
            if (mutation.type === 'clear-binding' && config.sceneBindings[mutation.sceneUuid]) {
                delete config.sceneBindings[mutation.sceneUuid];
                changed = true;
            } else if (mutation.type === 'commit-parameters') {
                const path = config.sceneBindings[mutation.sceneUuid];
                const image = config.images.find((candidate: any) => candidate.path === path);
                if (image && Object.keys(mutation.patch).some((key) => image[key] !== mutation.patch[key])) {
                    Object.assign(image, mutation.patch);
                    changed = true;
                }
            }
            if (changed) authority = { revision: authority.revision + 1, config, changed: true };
            return Promise.resolve({ ...authority, changed });
        });
        service = new ReferenceImageService();
        Object.assign(service as any, {
            config: {
                desiredVisible: true,
                images: [{ path: 'C:\\design.png', x: 2, y: 3, scaleX: 1, scaleY: 1, opacity: 75 }],
                sceneBindings: { 'scene-a': 'C:\\design.png' },
            },
            authorityRevision: 1,
            currentSceneUuid: 'scene-a',
            spriteFrame: { destroy: jest.fn() },
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
        expect(request).toHaveBeenCalledWith('referenceImageStore', 'mutate', [
            expect.objectContaining({ type: 'commit-parameters', sceneUuid: 'scene-a', patch: { opacity: 40 } }),
        ]);
        expect(broadcast).toHaveBeenCalledTimes(1);

        await service.previewParameters({ interactionId: 4, patch: { opacity: 10 } });
        expect((service as any).previewPatch).toBeNull();
        expect((service as any).config.images[0].opacity).toBe(40);
    });

    it('restores committed runtime parameters when a preview commit is a persistence no-op', async () => {
        (service as any).config.images[0].opacity = 40;
        authority.config.images[0].opacity = 40;
        const apply = jest.spyOn(service as any, 'applyCurrentParameters');

        await service.previewParameters({ interactionId: 8, patch: { opacity: 30 } });
        await service.commitParameters({ interactionId: 8, patch: { opacity: 40 } });

        expect((service as any).previewPatch).toBeNull();
        expect(apply).toHaveBeenLastCalledWith();
    });

    it('does not roll back after a newer socket snapshot arrives before an older RPC response', async () => {
        const newer = {
            revision: 2,
            changed: true,
            config: {
                desiredVisible: true,
                images: [{ path: 'C:\\new.png', x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 100 }],
                sceneBindings: { 'scene-a': 'C:\\new.png' },
            },
        };
        const older = { revision: 1, changed: true, config: (service as any).config };

        await (service as any).enqueueAuthoritySnapshot(newer, false);
        await (service as any).enqueueAuthoritySnapshot(older, false);

        expect((service as any).authorityRevision).toBe(2);
        expect((service as any).config.images).toEqual(newer.config.images);
    });

    it('clears only the current binding while preserving the image library and other scene bindings', async () => {
        (service as any).config.sceneBindings['scene-b'] = 'C:\\design.png';
        authority.config.sceneBindings['scene-b'] = 'C:\\design.png';
        const frame = (service as any).spriteFrame;

        const state = await service.clearBinding();

        expect(state.current).toEqual({ sceneUuid: 'scene-a', imagePath: null, image: null });
        expect(state.visibilityReason).toBe('unbound');
        expect(frame.destroy).toHaveBeenCalledTimes(1);
        expect((service as any).spriteFrame).toBeNull();
        expect((service as any).config.images).toEqual([
            { path: 'C:\\design.png', x: 2, y: 3, scaleX: 1, scaleY: 1, opacity: 75 },
        ]);
        expect((service as any).config.sceneBindings).toEqual({ 'scene-b': 'C:\\design.png' });
        expect(request).toHaveBeenCalledWith('referenceImageStore', 'mutate', [
            { type: 'clear-binding', sceneUuid: 'scene-a' },
        ]);
        expect(broadcast).toHaveBeenCalledTimes(1);
    });

    it('keeps a cleared binding unbound after reinitialization and ignores its late preview', async () => {
        await service.previewParameters({ interactionId: 7, patch: { opacity: 40 } });
        await service.clearBinding();
        await service.previewParameters({ interactionId: 7, patch: { opacity: 10 } });

        expect((await service.getState()).current.image).toBeNull();
        expect((service as any).previewPatch).toBeNull();

        const reinitialized = new ReferenceImageService();
        await reinitialized.init();
        expect((await reinitialized.getState()).current).toEqual({ sceneUuid: 'scene-a', imagePath: null, image: null });
    });

    it('does not persist or broadcast when the current scene is already unbound', async () => {
        await service.clearBinding();
        request.mockClear();
        broadcast.mockClear();

        const state = await service.clearBinding();

        expect(state.visibilityReason).toBe('unbound');
        expect(request).toHaveBeenCalledWith('referenceImageStore', 'mutate', [
            { type: 'clear-binding', sceneUuid: 'scene-a' },
        ]);
        expect(broadcast).not.toHaveBeenCalled();
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
