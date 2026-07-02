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
};

jest.mock('cc', () => ({
    Animation: class Animation {},
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
    assetManager: { loadAny: jest.fn() },
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

(globalThis as any).EditorExtends = {
    Node: {
        getNode: jest.fn(),
        getNodeByPath: jest.fn(),
        getNodePath: jest.fn(() => 'Canvas/AnimatedRoot'),
    },
    serialize: jest.fn(),
};

const { AnimationService } = require('../scene-process/service/animation');

describe('AnimationService enter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
});
