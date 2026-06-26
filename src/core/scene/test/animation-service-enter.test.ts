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
    AnimationState: class AnimationState {},
    CCClass: { attr: jest.fn(), Attr: { PrimitiveType: class PrimitiveType {} } },
    Component: class Component {},
    Node: class Node {},
    Scene: class Scene {},
    SkeletalAnimation: class SkeletalAnimation {},
    animation: {},
    js: { getClassName: jest.fn(() => 'cc.Component') },
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
        const service = new AnimationService() as any;
        const rootNode = { uuid: 'root-uuid', name: 'AnimatedRoot' };
        const clip = { _uuid: 'clip-uuid', name: 'Idle' };
        let resolveState!: () => void;

        service._assertEditorOpened = jest.fn();
        service._resolveNode = jest.fn(() => rootNode);
        service._queryAnimationRootNode = jest.fn(() => rootNode);
        service._queryNodeAnimationData = jest.fn(async () => ({ clips: [clip], defaultClip: clip, node: rootNode, animComp: {} }));
        service._resolveClip = jest.fn(() => clip);
        service._getNodePath = jest.fn(() => 'Canvas/AnimatedRoot');
        service._getAnimationState = jest.fn(() => new Promise<void>((resolve) => {
            resolveState = resolve;
        }));
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
});
