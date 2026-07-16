const mockService = {
    Editor: {
        getCurrentEditorType: jest.fn(() => 'scene'),
        getRootNode: jest.fn(() => ({ name: 'SceneRoot' })),
    },
    Selection: {
        query: jest.fn(() => ['Canvas/Previous']),
        clear: jest.fn(),
        select: jest.fn(),
    },
    Engine: {
        repaintInEditMode: jest.fn(async () => undefined),
        enterAnimationMode: jest.fn(),
        exitAnimationMode: jest.fn(),
    },
    Node: {
        queryNodeTree: jest.fn(),
    },
    Undo: {
        createCheckpoint: jest.fn(() => ({ commandId: null, generation: 0 })),
        hasDifferenceOutsideScope: jest.fn(() => false),
        isDirty: jest.fn(() => false),
        markSaved: jest.fn(),
    },
};

jest.mock('cc', () => ({
    Animation: class Animation {},
    Asset: class Asset {},
    AnimationClip: class AnimationClip {
        static WrapMode: { Reverse: number } = { Reverse: 1 };
    },
    AnimationState: class AnimationState {
        clip: unknown;
        initialize = jest.fn();

        constructor(clip: unknown) {
            this.clip = clip;
        }
    },
    CCClass: { attr: jest.fn(), Attr: { PrimitiveType: class PrimitiveType {} } },
    Component: class Component {},
    Node: class Node {},
    RealCurve: class RealCurve {},
    Scene: class Scene {},
    SkeletalAnimation: class SkeletalAnimation {},
    animation: {},
    assetManager: { assets: { get: jest.fn() }, loadAny: jest.fn() },
    editorExtrasTag: Symbol.for('editorExtrasTag'),
    js: { getClassName: jest.fn(() => 'cc.Component') },
}));

jest.mock('cc/editor/embedded-player', () => ({
    EmbeddedAnimationClipPlayable: class EmbeddedAnimationClipPlayable {},
    EmbeddedParticleSystemPlayable: class EmbeddedParticleSystemPlayable {},
    EmbeddedPlayer: class EmbeddedPlayer {},
    addEmbeddedPlayerTag: Symbol.for('addEmbeddedPlayerTag'),
    clearEmbeddedPlayersTag: Symbol.for('clearEmbeddedPlayersTag'),
    getEmbeddedPlayersTag: Symbol.for('getEmbeddedPlayersTag'),
}));

jest.mock('../scene-process/service/core', () => ({
    BaseService: class BaseService {},
    register: () => (target: unknown) => target,
    Service: mockService,
}));

jest.mock('../scene-process/service/dump', () => ({
    __esModule: true,
    default: {
        dumpNode: jest.fn(() => ({ name: 'Root' })),
        restoreNode: jest.fn(),
    },
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: {
        getInstance: jest.fn(() => ({ request: jest.fn() })),
    },
}));

jest.mock('../scene-process/service/animation/service-save', () => ({
    saveAnimationServiceClip: jest.fn(),
}));

(globalThis as any).EditorExtends = {
    Node: {
        getNode: jest.fn(),
        getNodeByPath: jest.fn(),
        getNodePath: jest.fn(() => 'Canvas/AnimatedRoot'),
    },
    serialize: jest.fn(),
};

const { AnimationService } = require('../scene-process/service/animation');
const { isCurrentAnimationSessionClipQuery } = require('../scene-process/service/animation/service-target');
const { saveAnimationServiceClip: saveAnimationServiceClipMock } = require('../scene-process/service/animation/service-save');

describe('AnimationService enter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const { assetManager } = require('cc');
        assetManager.assets.get.mockReset();
        assetManager.loadAny.mockReset();
        saveAnimationServiceClipMock.mockResolvedValue(true);
    });

    it('matches current clip queries with normalized root paths', () => {
        const session = {
            rootUuid: 'root-uuid',
            rootPath: 'Canvas/AnimatedRoot',
            clipUuid: 'clip-uuid',
        };

        expect(isCurrentAnimationSessionClipQuery(session, {
            rootPath: '/Canvas/AnimatedRoot/',
            clipUuid: 'clip-uuid',
        }, 'clip-uuid', true)).toBe(true);
    });

    it('waits for animation state initialization before sampling time zero', async () => {
        const { Animation } = require('cc');
        const service = new AnimationService() as any;
        const clip = { _uuid: 'clip-uuid', name: 'Idle' };
        const animComp = new Animation();
        animComp.clips = [clip];
        animComp.defaultClip = clip;
        const rootNode = {
            uuid: 'root-uuid',
            name: 'AnimatedRoot',
            components: [animComp],
            children: [],
            getComponent: jest.fn((ctor) => ctor === Animation ? animComp : null),
        };
        let resolveState!: () => void;

        (globalThis as any).EditorExtends.Node.getNodeByPath.mockReturnValueOnce(rootNode);
        service._getAnimationState = jest.fn(() => new Promise<void>((resolve) => {
            resolveState = resolve;
        }));
        service.broadcast = jest.fn();
        service.setTime = jest.fn(async () => true);
        service.queryState = jest.fn(async () => ({
            active: true,
            editorType: 'scene',
            mode: 'animation',
            rootUuid: rootNode.uuid,
            rootPath: 'Canvas/AnimatedRoot',
            clipUuid: clip._uuid,
            time: 0,
            playState: 'stop',
            selection: [],
            restoreSelectionOnExit: true,
        }));

        const enterPromise = service.enter({ rootPath: 'Canvas/AnimatedRoot' });
        await Promise.resolve();
        await Promise.resolve();

        expect(service.setTime).not.toHaveBeenCalled();

        resolveState();
        await enterPromise;

        expect(service.setTime).toHaveBeenCalledWith({ time: 0 });
    });

    it('does not resolve or rebind non-current clips from play controls', async () => {
        const service = new AnimationService() as any;
        service._session = { clipUuid: 'current-clip' };
        service._getAnimationState = jest.fn();

        await expect(service.changePlayState({ operate: 'play', clipUuid: 'other-clip' })).rejects.toThrow(
            "current edit clip: 'current-clip' but you want to operate: 'other-clip'",
        );
        expect(service._getAnimationState).not.toHaveBeenCalled();
    });

    it('does not recover clip bindings while resolving animation state', async () => {
        const { Animation, assetManager } = require('cc');
        const service = new AnimationService() as any;
        const animComp = new Animation();
        animComp.clips = [];
        animComp.defaultClip = null;
        const rootNode = {
            uuid: 'root-uuid',
            getComponent: jest.fn((ctor) => ctor === Animation ? animComp : null),
        };

        service._session = { clipUuid: 'clip-uuid', rootUuid: 'root-uuid', rootPath: 'Canvas/AnimatedRoot' };
        service._getSessionRootNode = jest.fn(() => rootNode);

        await expect(service._getAnimationState('clip-uuid')).rejects.toThrow('Animation clips not found');

        expect(assetManager.loadAny).not.toHaveBeenCalled();
    });

    it('keeps the active animation state authoritative during current clip asset refresh', async () => {
        const { Animation, AnimationClip, assetManager } = require('cc');
        const service = new AnimationService() as any;
        const currentClip = new AnimationClip();
        currentClip._uuid = 'clip-uuid';
        currentClip.name = 'Current';
        const reloadedClip = new AnimationClip();
        reloadedClip._uuid = 'clip-uuid';
        reloadedClip.name = 'Reloaded';
        const animComp = new Animation();
        animComp.clips = [reloadedClip];
        animComp.defaultClip = reloadedClip;
        const rootNode = {
            uuid: 'root-uuid',
            getComponent: jest.fn((ctor) => ctor === Animation ? animComp : null),
        };

        assetManager.assets.get.mockReturnValue(reloadedClip);
        service._session = {
            clipUuid: 'clip-uuid',
            rootUuid: rootNode.uuid,
            rootPath: 'Canvas/AnimatedRoot',
            undoBaseline: { commandId: null, generation: 0 },
            globalDirtyAtEnter: false,
        };
        service._getSessionRootNode = jest.fn(() => rootNode);
        service._animationStates.get = jest.fn(() => ({ clip: currentClip }));
        service._animationStates.reset = jest.fn();
        service._animationStates.create = jest.fn();
        service._getAnimationState = jest.fn(async () => ({ clip: currentClip }));
        service.setTime = jest.fn(async () => true);
        service._broadcastClipChanged = jest.fn();

        await service._refreshCurrentClipAsset('clip-uuid');

        expect(assetManager.assets.get).not.toHaveBeenCalled();
        expect(service._animationStates.reset).not.toHaveBeenCalled();
        expect(service._animationStates.create).not.toHaveBeenCalled();
        expect(service.setTime).not.toHaveBeenCalled();
        expect(service._broadcastClipChanged).not.toHaveBeenCalledWith('asset-refresh');
        expect(animComp.clips).toEqual([currentClip]);
        expect(animComp.defaultClip).toBe(currentClip);
    });

    it('ignores the asset refresh triggered by saving the current clip', async () => {
        const { Animation, AnimationClip, assetManager } = require('cc');
        const service = new AnimationService() as any;
        const currentClip = new AnimationClip();
        currentClip._uuid = 'clip-uuid';
        currentClip.name = 'Current';
        const reloadedClip = new AnimationClip();
        reloadedClip._uuid = 'clip-uuid';
        reloadedClip.name = 'Reloaded';
        const animComp = new Animation();
        animComp.clips = [currentClip];
        animComp.defaultClip = currentClip;
        const rootNode = {
            uuid: 'root-uuid',
            getComponent: jest.fn((ctor) => ctor === Animation ? animComp : null),
        };

        assetManager.assets.get.mockReturnValue(reloadedClip);
        service._session = {
            clipUuid: 'clip-uuid',
            rootUuid: rootNode.uuid,
            rootPath: 'Canvas/AnimatedRoot',
            undoBaseline: { commandId: null, generation: 0 },
            globalDirtyAtEnter: false,
        };
        service._getSessionRootNode = jest.fn(() => rootNode);
        service._animationStates.get = jest.fn(() => ({ clip: currentClip }));
        service._animationStates.reset = jest.fn();
        service._animationStates.create = jest.fn();
        service._getAnimationState = jest.fn(async () => ({ clip: currentClip }));
        service.setTime = jest.fn(async () => true);
        service._broadcastClipChanged = jest.fn();

        await expect(service.save()).resolves.toBe(true);
        await service._refreshCurrentClipAsset('clip-uuid');
        await service._refreshCurrentClipAsset('clip-uuid');

        expect(service._animationStates.reset).not.toHaveBeenCalled();
        expect(service._animationStates.create).not.toHaveBeenCalled();
        expect(service._broadcastClipChanged).not.toHaveBeenCalledWith('asset-refresh');
    });

    it('keeps self-save asset refresh suppression after re-entering the same clip', async () => {
        const { Animation, AnimationClip, assetManager } = require('cc');
        const service = new AnimationService() as any;
        const currentClip = new AnimationClip();
        currentClip._uuid = 'clip-uuid';
        currentClip.name = 'Current';
        const reloadedClip = new AnimationClip();
        reloadedClip._uuid = 'clip-uuid';
        reloadedClip.name = 'Reloaded';
        const animComp = new Animation();
        animComp.clips = [currentClip];
        animComp.defaultClip = currentClip;
        const rootNode = {
            uuid: 'root-uuid',
            getComponent: jest.fn((ctor) => ctor === Animation ? animComp : null),
        };
        const createSession = () => ({
            clipUuid: 'clip-uuid',
            rootUuid: rootNode.uuid,
            rootPath: 'Canvas/AnimatedRoot',
            undoBaseline: { commandId: null, generation: 0 },
            globalDirtyAtEnter: false,
        });

        assetManager.assets.get.mockReturnValue(reloadedClip);
        service._session = createSession();
        service._getSessionRootNode = jest.fn(() => rootNode);
        service._animationStates.get = jest.fn(() => ({ clip: currentClip }));
        service._animationStates.reset = jest.fn();
        service._animationStates.create = jest.fn();
        service._animationStates.clear = jest.fn();
        service._getAnimationState = jest.fn(async () => ({ clip: currentClip }));
        service.setTime = jest.fn(async () => true);
        service._broadcastClipChanged = jest.fn();

        await expect(service.save()).resolves.toBe(true);
        service._disposeSession();
        service._session = createSession();
        service._animationStates.reset.mockClear();
        service._animationStates.create.mockClear();
        service.setTime.mockClear();
        service._broadcastClipChanged.mockClear();
        assetManager.assets.get.mockClear();

        await service._refreshCurrentClipAsset('clip-uuid');

        expect(assetManager.assets.get).not.toHaveBeenCalled();
        expect(service._animationStates.reset).not.toHaveBeenCalled();
        expect(service._animationStates.create).not.toHaveBeenCalled();
        expect(service.setTime).not.toHaveBeenCalled();
        expect(service._broadcastClipChanged).not.toHaveBeenCalledWith('asset-refresh');
        expect(animComp.clips).toEqual([currentClip]);
        expect(animComp.defaultClip).toBe(currentClip);
    });

    it('rebinds the current clip after save when asset refresh replaced the component binding', async () => {
        const { Animation, AnimationClip } = require('cc');
        const service = new AnimationService() as any;
        const currentClip = new AnimationClip();
        currentClip._uuid = 'clip-uuid';
        currentClip.name = 'Current';
        currentClip.events = null;
        const staleClip = new AnimationClip();
        staleClip._uuid = 'clip-uuid';
        staleClip.name = 'Stale';
        const animComp = new Animation();
        animComp.clips = [currentClip];
        animComp.defaultClip = currentClip;
        const rootNode = {
            uuid: 'root-uuid',
            getComponent: jest.fn((ctor) => ctor === Animation ? animComp : null),
        };

        service._session = {
            clipUuid: 'clip-uuid',
            rootUuid: rootNode.uuid,
            rootPath: 'Canvas/AnimatedRoot',
            undoBaseline: { commandId: null, generation: 0 },
            globalDirtyAtEnter: false,
        };
        service._getSessionRootNode = jest.fn(() => rootNode);
        service._getAnimationState = jest.fn(async () => ({ clip: currentClip }));
        saveAnimationServiceClipMock.mockImplementationOnce(async () => {
            animComp.clips = [staleClip];
            animComp.defaultClip = staleClip;
            return true;
        });

        await expect(service.save()).resolves.toBe(true);

        expect(animComp.clips).toEqual([currentClip]);
        expect(animComp.defaultClip).toBe(currentClip);
        expect(currentClip.events).toEqual([]);
    });

    it('restores the current clip snapshot when self save mutates the editing clip', async () => {
        const { Animation, AnimationClip } = require('cc');
        const service = new AnimationService() as any;
        const currentClip = new AnimationClip();
        currentClip._uuid = 'clip-uuid';
        currentClip.name = 'Current';
        currentClip.events = [{ frame: 0, func: 'before-save', params: ['ok'] }];
        const animComp = new Animation();
        animComp.clips = [currentClip];
        animComp.defaultClip = currentClip;
        const rootNode = {
            uuid: 'root-uuid',
            getComponent: jest.fn((ctor) => ctor === Animation ? animComp : null),
        };

        service._session = {
            clipUuid: 'clip-uuid',
            rootUuid: rootNode.uuid,
            rootPath: 'Canvas/AnimatedRoot',
            undoBaseline: { commandId: null, generation: 0 },
            globalDirtyAtEnter: false,
        };
        service._getSessionRootNode = jest.fn(() => rootNode);
        service._getAnimationState = jest.fn(async () => ({ clip: currentClip }));
        service._animationStates.get = jest.fn(() => ({ clip: currentClip }));
        service._animationStates.reset = jest.fn();
        service._animationStates.create = jest.fn();
        service._restoreClipSnapshotWithStateRecreation = jest.fn(async (uuid: string, clip: any, snapshot: any) => {
            service._animationStates.reset(uuid);
            const restoredEvents = snapshot.events.map((event: any) => ({
                frame: event.frame,
                func: event.func,
                params: event.params,
            }));
            clip.events = restoredEvents;
            clip._events = restoredEvents;
            service._animationStates.create(uuid, clip);
        });
        service.setTime = jest.fn(async () => true);
        saveAnimationServiceClipMock.mockImplementationOnce(async () => {
            currentClip.events = [];
            return true;
        });

        await expect(service.save()).resolves.toBe(true);

        expect(service._restoreClipSnapshotWithStateRecreation).toHaveBeenCalledWith('clip-uuid', currentClip, expect.objectContaining({
            events: [{ frame: 0, func: 'before-save', params: ['ok'] }],
        }), true);
        expect(service._animationStates.reset).toHaveBeenCalledWith('clip-uuid');
        expect(service._animationStates.create).toHaveBeenCalledWith('clip-uuid', currentClip);
        expect(service.setTime).toHaveBeenCalledWith({ time: 0 });
        expect(animComp.clips).toEqual([currentClip]);
        expect(animComp.defaultClip).toBe(currentClip);
        expect(currentClip.events).toEqual([{ frame: 0, func: 'before-save', params: ['ok'] }]);
    });

    it('ignores a current clip refresh that started before saving the current clip', async () => {
        const { Animation, AnimationClip, assetManager } = require('cc');
        const service = new AnimationService() as any;
        const currentClip = new AnimationClip();
        currentClip._uuid = 'clip-uuid';
        currentClip.name = 'Current';
        const reloadedClip = new AnimationClip();
        reloadedClip._uuid = 'clip-uuid';
        reloadedClip.name = 'Reloaded';
        const animComp = new Animation();
        animComp.clips = [currentClip];
        animComp.defaultClip = currentClip;
        const rootNode = {
            uuid: 'root-uuid',
            getComponent: jest.fn((ctor) => ctor === Animation ? animComp : null),
        };
        assetManager.assets.get.mockReturnValue(undefined);
        service._session = {
            clipUuid: 'clip-uuid',
            rootUuid: rootNode.uuid,
            rootPath: 'Canvas/AnimatedRoot',
            undoBaseline: { commandId: null, generation: 0 },
            globalDirtyAtEnter: false,
        };
        service._getSessionRootNode = jest.fn(() => rootNode);
        service._animationStates.get = jest.fn(() => ({ clip: currentClip }));
        service._animationStates.reset = jest.fn();
        service._animationStates.create = jest.fn();
        service._getAnimationState = jest.fn(async () => ({ clip: currentClip }));
        service.setTime = jest.fn(async () => true);
        service._broadcastClipChanged = jest.fn();

        await service._refreshCurrentClipAsset('clip-uuid');
        await expect(service.save()).resolves.toBe(true);

        expect(assetManager.loadAny).not.toHaveBeenCalled();
        expect(service._animationStates.reset).not.toHaveBeenCalled();
        expect(service._animationStates.create).not.toHaveBeenCalled();
        expect(service._broadcastClipChanged).not.toHaveBeenCalledWith('asset-refresh');
        expect(animComp.clips).toEqual([currentClip]);
        expect(animComp.defaultClip).toBe(currentClip);
    });

    it('keeps a running animation state playing after frame value query', async () => {
        const service = new AnimationService() as any;
        const rootNode = {
            uuid: 'root-uuid',
            position: { x: 4, y: 5, z: 6 },
            components: [],
        };
        let current = 0.4;
        let isPaused = false;
        const state = {
            clip: { sample: 30 },
            weight: 0,
            get current() {
                return current;
            },
            get isPlaying() {
                return true;
            },
            get isPaused() {
                return isPaused;
            },
            setTime: jest.fn((time: number) => {
                current = time;
            }),
            pause: jest.fn(() => {
                isPaused = true;
            }),
            resume: jest.fn(() => {
                isPaused = false;
            }),
            sample: jest.fn(() => {
                rootNode.position = current === 0.5 ? { x: 10, y: 11, z: 12 } : { x: 4, y: 5, z: 6 };
            }),
        };
        (globalThis as any).EditorExtends.Node.getNodeByPath.mockReturnValue(rootNode);
        service._session = {
            clipUuid: 'clip-uuid',
            rootUuid: rootNode.uuid,
            rootPath: 'Canvas/AnimatedRoot',
        };
        service._curEditTime = 0.4;
        service._getAnimationState = jest.fn(async () => state);

        const value = await service.queryPropertyValueAtFrame({
            clipUuid: 'clip-uuid',
            nodePath: 'Canvas/AnimatedRoot',
            propKey: 'position',
            frame: 15,
        });

        expect(value).toEqual({ x: 10, y: 11, z: 12 });
        expect(state.pause).toHaveBeenCalled();
        expect(state.resume).toHaveBeenCalled();
        expect(state.current).toBe(0.4);
        expect(state.isPaused).toBe(false);
        expect(service._curEditTime).toBe(0.4);
    });

    it('keeps edit time unchanged when sampling reverse clips', async () => {
        const service = new AnimationService() as any;
        const state = {
            clip: { wrapMode: 1 },
            duration: 1,
            weight: 0,
            isPaused: false,
            setTime: jest.fn(),
            pause: jest.fn(function (this: { isPaused: boolean }) {
                this.isPaused = true;
            }),
            sample: jest.fn(),
        };
        service._session = { clipUuid: 'clip-uuid' };
        service._getAnimationState = jest.fn(async () => state);
        service._broadcastTimeChanged = jest.fn();

        await service.setTime({ time: 0.25 });

        expect(state.setTime).toHaveBeenCalledWith(0.75);
        expect(service._curEditTime).toBe(0.25);
    });

    it('uses the active session clip for root info on the current animation root', async () => {
        const { Animation } = require('cc');
        const service = new AnimationService() as any;
        const defaultClip = { _uuid: 'default-clip', name: 'Default' };
        const currentClip = { _uuid: 'current-clip', name: 'Current' };
        const animComp = new Animation();
        animComp.clips = [defaultClip, currentClip];
        animComp.defaultClip = defaultClip;
        const rootNode = {
            uuid: 'root-uuid',
            getComponent: jest.fn((ctor) => ctor === Animation ? animComp : null),
        };
        service._session = {
            clipUuid: 'current-clip',
            rootUuid: rootNode.uuid,
            rootPath: 'Canvas/AnimatedRoot',
        };
        service._resolveRootNode = jest.fn(() => rootNode);
        service.queryClip = jest.fn(async (options: { clipUuid: string }) => ({ uuid: options.clipUuid }));
        service.queryTime = jest.fn(async (options: { clipUuid: string }) => options.clipUuid === 'current-clip' ? 0.5 : 0.25);
        mockService.Node.queryNodeTree.mockResolvedValue({ name: 'AnimatedRoot' });

        const info = await service.queryRootInfo({ rootPath: 'Canvas/AnimatedRoot' });

        expect(info.defaultClip).toBe('default-clip');
        expect(info.clipDump).toEqual({ uuid: 'current-clip' });
        expect(info.time).toBe(0.5);
        expect(service.queryClip).toHaveBeenCalledWith({ rootUuid: rootNode.uuid, clipUuid: 'current-clip' });
        expect(service.queryTime).toHaveBeenCalledWith({ clipUuid: 'current-clip' });
    });

    it('reports stop play state for root info outside the active animation session', async () => {
        const { Animation } = require('cc');
        const service = new AnimationService() as any;
        const defaultClip = { _uuid: 'default-clip', name: 'Default' };
        const animComp = new Animation();
        animComp.clips = [defaultClip];
        animComp.defaultClip = defaultClip;
        const rootNode = {
            uuid: 'other-root-uuid',
            getComponent: jest.fn((ctor) => ctor === Animation ? animComp : null),
        };
        service._session = {
            clipUuid: 'current-clip',
            rootUuid: 'active-root-uuid',
            rootPath: 'Canvas/ActiveRoot',
        };
        service._playState = 'playing';
        service._resolveRootNode = jest.fn(() => rootNode);
        service.queryClip = jest.fn(async () => ({ uuid: 'default-clip' }));
        mockService.Node.queryNodeTree.mockResolvedValue({ name: 'OtherRoot' });

        const info = await service.queryRootInfo({ rootPath: 'Canvas/OtherRoot' });

        expect(info.state).toBe('stop');
    });

    it('does not report the current edit time for uncached non-current clips', async () => {
        const service = new AnimationService() as any;
        service._session = { clipUuid: 'current-clip' };
        service._curEditTime = 0.75;
        service._animationStates.get = jest.fn(() => undefined);

        await expect(service.queryTime({ clipUuid: 'other-clip' })).resolves.toBe(0);
    });

    it('recreates animation state after failed-operation snapshot restore without touching private curve flags', async () => {
        const service = new AnimationService() as any;
        const clip = {
            _uuid: 'clip-uuid',
            duration: 1,
            sample: 30,
            speed: 1,
            wrapMode: 1,
            events: [],
        };
        const snapshot = {
            duration: 1,
            sample: 30,
            speed: 1,
            wrapMode: 1,
            curves: [],
            events: [],
            embeddedPlayers: [],
            embeddedPlayerGroups: [],
            auxiliaryCurves: {},
        };
        const state = {};
        Object.defineProperty(state, '_curveLoaded', {
            set() {
                throw new Error('private curve flag should not be written');
            },
        });
        service._animationStates.get = jest.fn(() => state);
        service._animationStates.reset = jest.fn();
        service._animationStates.create = jest.fn();
        service._curEditTime = 0.5;
        service.setTime = jest.fn(async () => true);

        await expect(service._restoreFailedOperationSnapshot(clip, snapshot, {})).resolves.toBeUndefined();

        expect(service._animationStates.reset).toHaveBeenCalledWith('clip-uuid');
        expect(service._animationStates.create).toHaveBeenCalledWith('clip-uuid', clip);
        expect(service.setTime).toHaveBeenCalledWith({ time: 0.5 });
    });

    it('destroys the current state before restoring a failed-operation snapshot', async () => {
        const service = new AnimationService() as any;
        const clip = {
            _uuid: 'clip-uuid',
            duration: 1,
            sample: 30,
            speed: 1,
            wrapMode: 1,
            events: [{ frame: 0.25, func: 'stale', params: [] }],
        };
        const snapshot = {
            duration: 1,
            sample: 30,
            speed: 1,
            wrapMode: 1,
            curves: [],
            events: [{ frame: 15, func: 'restored', params: ['ok'] }],
            embeddedPlayers: [],
            embeddedPlayerGroups: [],
            auxiliaryCurves: {},
        };
        const state = {};
        const order: string[] = [];
        service._animationStates.get = jest.fn(() => state);
        service._animationStates.reset = jest.fn(() => {
            order.push(`reset:${clip.events[0]?.func || 'none'}`);
            clip.events = [{ frame: 99, func: 'destroyed', params: [] }];
        });
        service._animationStates.create = jest.fn(() => {
            order.push(`create:${clip.events[0]?.func || 'none'}`);
        });
        service._curEditTime = 0.5;
        service.setTime = jest.fn(async () => true);

        await expect(service._restoreFailedOperationSnapshot(clip, snapshot, {})).resolves.toBeUndefined();

        expect(order).toEqual(['reset:stale', 'create:restored']);
        expect(clip.events).toEqual([{ frame: 0.5, func: 'restored', params: ['ok'] }]);
        expect(service.setTime).toHaveBeenCalledWith({ time: 0.5 });
    });

    it('destroys the current state before restoring an undo snapshot', async () => {
        const service = new AnimationService() as any;
        const clip = {
            _uuid: 'clip-uuid',
            duration: 1,
            sample: 30,
            speed: 1,
            wrapMode: 1,
            events: [{ frame: 0.25, func: 'stale', params: [] }],
        };
        const snapshot = {
            duration: 1,
            sample: 30,
            speed: 1,
            wrapMode: 1,
            curves: [],
            events: [{ frame: 15, func: 'restored', params: ['ok'] }],
            embeddedPlayers: [],
            embeddedPlayerGroups: [],
            auxiliaryCurves: {},
        };
        const order: string[] = [];
        service._session = { clipUuid: 'clip-uuid' };
        service._getAnimationState = jest.fn(async () => ({ clip }));
        service._animationStates.reset = jest.fn(() => {
            order.push(`reset:${clip.events[0]?.func || 'none'}`);
            clip.events = [{ frame: 99, func: 'destroyed', params: [] }];
        });
        service._animationStates.create = jest.fn(() => {
            order.push(`create:${clip.events[0]?.func || 'none'}`);
        });
        service._curEditTime = 0.5;
        service.setTime = jest.fn(async () => true);
        service._broadcastClipChanged = jest.fn();

        await expect(service._restoreCurrentClipSnapshot('clip-uuid', snapshot)).resolves.toBeUndefined();

        expect(order).toEqual(['reset:stale', 'create:restored']);
        expect(clip.events).toEqual([{ frame: 0.5, func: 'restored', params: ['ok'] }]);
        expect(service.setTime).toHaveBeenCalledWith({ time: 0.5 });
        expect(service._broadcastClipChanged).toHaveBeenCalledWith('undo-redo');
    });

    it('recreates the current state when undo snapshot restore fails', async () => {
        const service = new AnimationService() as any;
        const clip = {
            _uuid: 'clip-uuid',
            duration: 1,
            sample: 30,
            speed: 1,
            wrapMode: 1,
            events: [],
        };
        service._session = { clipUuid: 'clip-uuid' };
        service._getAnimationState = jest.fn(async () => ({ clip }));
        service._animationStates.reset = jest.fn();
        service._animationStates.create = jest.fn();

        await expect(service._restoreCurrentClipSnapshot('clip-uuid', {
            duration: 1,
            sample: 30,
            speed: 1,
            wrapMode: 1,
            curves: [],
            events: [],
            embeddedPlayers: [{
                begin: 0,
                end: 30,
                reconciledSpeed: false,
                group: 'particle-track',
            }],
            embeddedPlayerGroups: [],
            auxiliaryCurves: {},
        })).rejects.toThrow('Failed to restore animation embedded players.');

        expect(service._animationStates.reset).toHaveBeenCalledWith('clip-uuid');
        expect(service._animationStates.create).toHaveBeenCalledWith('clip-uuid', clip);
    });

    it('returns empty clip info for animation roots without clips', async () => {
        const { Animation } = require('cc');
        const service = new AnimationService() as any;
        const animComp = new Animation();
        animComp.clips = [];
        animComp.defaultClip = null;
        const rootNode = {
            uuid: 'root-uuid',
            getComponent: jest.fn((ctor) => ctor === Animation ? animComp : null),
        };

        service._resolveRootNode = jest.fn(() => rootNode);
        service._getNodePath = jest.fn(() => 'Canvas/AnimatedRoot');
        mockService.Node.queryNodeTree.mockResolvedValue({ name: 'AnimatedRoot' });

        await expect(service.queryClips({ rootPath: 'Canvas/AnimatedRoot' })).resolves.toEqual({
            rootUuid: 'root-uuid',
            rootPath: 'Canvas/AnimatedRoot',
            clipsMenu: [],
            defaultClip: '',
        });
        await expect(service.queryRootInfo({ rootPath: 'Canvas/AnimatedRoot' })).resolves.toMatchObject({
            rootUuid: 'root-uuid',
            rootPath: 'Canvas/AnimatedRoot',
            clipsMenu: [],
            defaultClip: '',
            clipDump: null,
            time: 0,
        });
    });

    it('returns root tree info for nodes without animation components', async () => {
        const { Animation } = require('cc');
        const service = new AnimationService() as any;
        const rootNode = {
            uuid: 'root-uuid',
            getComponent: jest.fn((ctor) => ctor === Animation ? null : null),
        };

        service._resolveRootNode = jest.fn(() => rootNode);
        mockService.Node.queryNodeTree.mockResolvedValue({ name: 'AnimatedRoot' });

        await expect(service.queryRootInfo({ rootPath: 'Canvas/AnimatedRoot' })).resolves.toEqual({
            rootUuid: 'root-uuid',
            rootPath: 'Canvas/AnimatedRoot',
            clipsMenu: [],
            defaultClip: '',
            nodeTreeDump: { name: 'AnimatedRoot' },
            clipDump: null,
            time: 0,
            state: 'stop',
            useBakedAnimation: false,
        });
        expect(mockService.Node.queryNodeTree).toHaveBeenCalledWith({ path: 'Canvas/AnimatedRoot' });
    });
});
