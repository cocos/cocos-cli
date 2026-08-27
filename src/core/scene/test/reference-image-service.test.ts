const request = jest.fn();
const broadcast = jest.fn();
const repaintInEditMode = jest.fn();
const camera = { is2D: true };
const gizmo = { is2D: true, backgroundNode: {} };
const editor = {
    getEditorSession: jest.fn(() => ({ uuid: 'scene-a', generation: 1 })),
    isCurrentEditorSession: jest.fn(() => true),
};

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
            Camera: camera,
            Engine: { repaintInEditMode },
            Editor: editor,
            Gizmo: gizmo,
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
        repaintInEditMode.mockReset();
        camera.is2D = true;
        gizmo.is2D = true;
        editor.getEditorSession.mockReturnValue({ uuid: 'scene-a', generation: 1 });
        editor.isCurrentEditorSession.mockReturnValue(true);
        authority = {
            instanceId: 'authority-a',
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
            if (changed) authority = {
                instanceId: authority.instanceId,
                revision: authority.revision + 1,
                config,
                changed: true,
            };
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
            authorityInstanceId: 'authority-a',
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

    it('keeps getState as an authority query without rehydrating runtime objects', async () => {
        Object.assign(service as any, { spriteFrame: null, loadedPath: null });
        authority = {
            ...authority,
            revision: 2,
            changed: true,
            config: {
                ...authority.config,
                images: authority.config.images.map((image: any) => ({ ...image, opacity: 50 })),
            },
        };
        const reconcileRuntime = jest.spyOn(service as any, 'reconcileRuntime');

        const state = await service.getState();

        expect(reconcileRuntime).not.toHaveBeenCalled();
        expect(request).toHaveBeenCalledWith('referenceImageStore', 'getSnapshot');
        expect(state.current.image?.opacity).toBe(50);
    });

    it('rehydrates runtime after a same-revision socket sync without writing authority', async () => {
        Object.assign(service as any, { spriteFrame: null, loadedPath: null, error: null });
        jest.spyOn(service as any, 'loadBoundImage').mockImplementation(async () => {
            Object.assign(service as any, {
                spriteFrame: { destroy: jest.fn() },
                loadedPath: 'C:\\design.png',
                error: null,
            });
        });

        await service.syncFromAuthority();

        expect((service as any).loadedPath).toBe('C:\\design.png');
        expect(broadcast).toHaveBeenCalledTimes(1);
        expect(request).not.toHaveBeenCalledWith('referenceImageStore', 'mutate', expect.anything());
    });

    it('rehydrates runtime when the current editor opens with an existing authority snapshot', async () => {
        const reinitialized = new ReferenceImageService();
        const loadBoundImage = jest.spyOn(reinitialized as any, 'loadBoundImage').mockResolvedValue(undefined);

        await reinitialized.init();

        expect(loadBoundImage).toHaveBeenCalledTimes(1);
        expect((reinitialized as any).currentSceneUuid).toBe('scene-a');
        expect(request).not.toHaveBeenCalledWith('referenceImageStore', 'mutate', expect.anything());
    });

    it('loads on cold editor open after Gizmo restores 2D before Camera is ready', async () => {
        camera.is2D = false;
        gizmo.is2D = true;
        const reinitialized = new ReferenceImageService();
        const frame = { destroy: jest.fn() };
        const readDataUrl = jest.spyOn(reinitialized as any, 'readDataUrl').mockResolvedValue('data:image/png;base64,valid');
        jest.spyOn(reinitialized as any, 'createSpriteFrame').mockResolvedValue(frame);
        const replaceSpriteFrame = jest.spyOn(reinitialized as any, 'replaceSpriteFrame').mockImplementation((_frame, path) => {
            Object.assign(reinitialized as any, { spriteFrame: frame, loadedPath: path });
        });
        jest.spyOn(reinitialized as any, 'applyCurrentParameters').mockImplementation(() => undefined);

        await reinitialized.init();

        expect(readDataUrl).toHaveBeenCalledWith('C:\\design.png');
        expect(replaceSpriteFrame).toHaveBeenCalledWith(frame, 'C:\\design.png');
        expect((reinitialized as any).loadedPath).toBe('C:\\design.png');
        expect((reinitialized as any).error).toBeNull();
    });

    it('reconciles runtime for both 3D and return-to-2D dimension lifecycle events', async () => {
        const loadBoundImage = jest.spyOn(service as any, 'loadBoundImage').mockResolvedValue(undefined);

        gizmo.is2D = false;
        await (service as any).handleDimensionChanged();
        expect(loadBoundImage).not.toHaveBeenCalled();
        gizmo.is2D = true;
        await (service as any).handleDimensionChanged();

        expect(loadBoundImage).toHaveBeenCalledTimes(1);
        expect(request).not.toHaveBeenCalledWith('referenceImageStore', 'mutate', expect.anything());
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

        await service.previewParameters({ interactionId: 5, patch: { opacity: 30 } });
        expect((service as any).previewPatch).toEqual({ opacity: 30 });
    });

    it('keeps the first host interaction valid and only invalidates an active ID', async () => {
        (service as any).invalidatePreview();
        expect((service as any).interactionWatermark).toBe(0);

        await service.previewParameters({ interactionId: 1, patch: { opacity: 40 } });
        expect((service as any).activeInteractionId).toBe(1);

        (service as any).invalidatePreview();
        expect((service as any).interactionWatermark).toBe(1);

        await service.previewParameters({ interactionId: 2, patch: { opacity: 30 } });
        expect((service as any).activeInteractionId).toBe(2);
        expect((service as any).previewPatch).toEqual({ opacity: 30 });
    });

    it('repaints once for each applied parameter preview', async () => {
        Object.assign(service as any, {
            imageNode: { setPosition: jest.fn(), setScale: jest.fn(), active: true },
            sprite: { color: { clone: () => ({ a: 255 }) } },
        });

        await service.previewParameters({ interactionId: 5, patch: { opacity: 40 } });

        expect(repaintInEditMode).toHaveBeenCalledTimes(1);
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
            instanceId: 'authority-a',
            revision: 2,
            changed: true,
            config: {
                desiredVisible: true,
                images: [{ path: 'C:\\new.png', x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 100 }],
                sceneBindings: { 'scene-a': 'C:\\new.png' },
            },
        };
        const older = { instanceId: 'authority-a', revision: 1, changed: true, config: (service as any).config };

        await (service as any).enqueueAuthoritySnapshot(newer, false);
        await (service as any).enqueueAuthoritySnapshot(older, false);

        expect((service as any).authorityRevision).toBe(2);
        expect((service as any).config.images).toEqual(newer.config.images);
    });

    it('applies a lower revision from a restarted main-process authority', async () => {
        const restarted = {
            instanceId: 'authority-b',
            revision: 0,
            changed: false,
            config: {
                desiredVisible: true,
                images: [{ path: 'C:\\recovered.png', x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 100 }],
                sceneBindings: { 'scene-a': 'C:\\recovered.png' },
            },
        };

        await (service as any).enqueueAuthoritySnapshot(restarted, false);

        expect((service as any).authorityInstanceId).toBe('authority-b');
        expect((service as any).authorityRevision).toBe(0);
        expect((service as any).config.images).toEqual(restarted.config.images);
    });

    it('clears only the current binding while preserving the image library and other scene bindings', async () => {
        (service as any).config.sceneBindings['scene-b'] = 'C:\\design.png';
        authority.config.sceneBindings['scene-b'] = 'C:\\design.png';
        (service as any).error = { stage: 'decode', message: 'Reference image decoding failed.' };
        const frame = (service as any).spriteFrame;

        const state = await service.clearBinding();

        expect(state.current).toEqual({ sceneUuid: 'scene-a', imagePath: null, image: null });
        expect(state.visibilityReason).toBe('unbound');
        expect(state.error).toBeNull();
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
