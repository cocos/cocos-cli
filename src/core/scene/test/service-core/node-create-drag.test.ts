import type { Node } from 'cc';
import NodeManager from '../../../engine/editor-extends/manager/node';
import type { ICreateDragHost } from '../../scene-process/service/node/node-create-drag';

class MockCanvas {}

let mockNodeId = 0;
const mockNodeRegistry = new NodeManager();

/** 模拟引擎延迟销毁：destroy 后仍在父级 children 中，帧末才递归移除 */
class MockNode {
    children: MockNode[] = [];
    components: MockCanvas[] = [];
    parent: MockNode | null = null;
    objFlags = 0;
    layer = 0;
    isValid = true;
    pendingDestroy = false;

    readonly uuid = `node-${++mockNodeId}`;

    constructor(public name = 'Node') {}

    isChildOf(root: MockNode): boolean {
        return this === root || !!this.parent?.isChildOf(root);
    }

    setParent(parent: MockNode | null): void {
        const wasAttached = this.isChildOf(mockScene);
        if (this.parent) {
            this.parent.children = this.parent.children.filter(child => child !== this);
        }
        this.parent = parent;
        parent?.children.push(this);

        // 对齐引擎的挂载注册；隐藏节点在场景内换父级时不走普通节点的路径更新
        const attached = this.isChildOf(mockScene);
        if (!wasAttached && attached) {
            this.walk(node => mockNodeRegistry.add(node.uuid, node as unknown as Node));
        } else if (wasAttached && !attached) {
            this.walk(node => mockNodeRegistry.remove(node.uuid));
        } else if (attached && !isEditorNode(this as unknown as Node)) {
            mockNodeRegistry.updateNodeParent(this.uuid, parent?.uuid);
        }
    }

    walk(visitor: (node: MockNode) => void): void {
        visitor(this);
        this.children.forEach(child => child.walk(visitor));
    }

    worldPosition = { x: 0, y: 0, z: 0 };

    setWorldPosition(position: { x: number; y: number; z: number }): void {
        this.worldPosition = { ...position };
    }

    destroy(): void {
        this.pendingDestroy = true;
    }

    flushDestroy(): void {
        for (const child of [...this.children]) {
            child.flushDestroy();
        }
        this.setParent(null);
        this.isValid = false;
    }
}

let mockScene: MockNode;
let mockSlider: MockNode;
let mockPreviewCanvas: MockNode;
const mockEvents = { on: jest.fn(), off: jest.fn(), emit: jest.fn() };
const mockRepaint = jest.fn(async () => undefined);

jest.mock('cc', () => ({
    Node: MockNode,
    Canvas: MockCanvas,
    Layers: { Enum: { GIZMOS: 1 << 20 } },
    CCObject: { Flags: { DontSave: 1, HideInHierarchy: 2, LockedInEditor: 4 } },
    director: { getScene: () => mockScene },
    instantiate: () => mockPreviewCanvas,
}));

jest.mock('../../scene-process/service/core', () => ({
    ServiceEvents: mockEvents,
    Service: {
        Editor: {
            getRootNode: () => mockScene,
            getCurrentEditorType: () => 'scene',
            getEditorSession: () => ({ generation: 1 }),
            isCurrentEditorSession: () => true,
            lock: async () => undefined,
            unlock: () => undefined,
        },
        Camera: { is2D: true },
        Engine: { repaintInEditMode: mockRepaint },
        PreviewPlay: { getState: () => 'stop' },
        Prefab: { removePrefabInfoFromNode: () => undefined },
        Undo: { beginGroup: () => 'group', endGroup: () => undefined },
    },
}));
jest.mock('../../scene-process/rpc', () => ({
    Rpc: { getInstance: () => ({
        request: async () => ({ uuid: 'prefab-uuid', type: 'cc.Prefab' }),
    }) },
}));
jest.mock('../../scene-process/service/node/node-create', () => ({
    createNodeByAsset: async () => ({ node: mockSlider, canvasRequired: true }),
    loadAny: async () => ({}),
}));
jest.mock('../../scene-process/service/node/index', () => ({ __esModule: true, default: {} }));
jest.mock('../../scene-process/service/node/drag-placement', () => ({
    computeWorldDropPoint: (point: { x: number; y: number }) => ({ x: point.x, y: point.y, z: 0 }),
    pointerMatchesCanvas: () => true,
    validatePointer: () => true,
}));

Object.assign(globalThis, {
    EditorExtends: { Node: mockNodeRegistry },
    cc: { director: { getScene: () => mockScene } },
});

const { NodeCreateDragManager } = require('../../scene-process/service/node/node-create-drag') as
    typeof import('../../scene-process/service/node/node-create-drag');
const { getUICanvasNode, isEditorNode } = require('../../scene-process/service/node/node-utils') as
    typeof import('../../scene-process/service/node/node-utils');

const pointer = {
    x: 100, y: 100, width: 800, height: 600, sequence: 1,
    viewport: { x: 0, y: 0, width: 1, height: 1 },
};

/** 保留真实 Canvas 查找逻辑，隔离资源加载、坐标计算和 Undo 存储 */
function createManager(): InstanceType<typeof NodeCreateDragManager> {
    const host: ICreateDragHost = {
        resolveCanvasTransaction: async () => {
            let parent = getUICanvasNode(mockScene as unknown as Node);
            if (!parent) {
                const canvas = new MockNode('Canvas');
                canvas.components.push(new MockCanvas());
                canvas.setParent(mockScene);
                parent = canvas as unknown as Node;
            }
            return { parent, mutation: null };
        },
        collectSceneNodeUuidsForUndo: () => new Set(),
        beginPrefabCanvasUndoCapture: () => [],
        endPrefabCanvasUndoCapture: () => undefined,
        recordCreateNodeCommand: () => undefined,
    };
    return new NodeCreateDragManager(host);
}

describe('NodeCreateDragManager preview', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockNodeRegistry.clear();
        mockNodeRegistry.allow = true;
        mockScene = new MockNode('Scene');
        mockNodeRegistry.add(mockScene.uuid, mockScene as unknown as Node);
        mockSlider = new MockNode('Slider');
        mockPreviewCanvas = new MockNode('PreviewCanvas');
        mockPreviewCanvas.components.push(new MockCanvas());
    });

    it.each([true, false])('keeps a committed Slider after deferred destruction (existing Canvas: %s)', async existing => {
        if (existing) {
            const canvas = new MockNode('Canvas');
            canvas.components.push(new MockCanvas());
            canvas.setParent(mockScene);
        }
        const manager = createManager();
        try {
            const sessionId = 'slider-drag';
            expect(await manager.begin({
                sessionId, pointer, items: [{ dbURL: 'db://internal/node-library/slider' }],
            })).toEqual({ ok: true, value: { sessionId, state: 'previewing' } });

            const result = await manager.commit({ sessionId, pointer });
            expect(mockPreviewCanvas.pendingDestroy).toBe(true);
            mockPreviewCanvas.flushDestroy();

            expect({
                state: result.ok ? result.value.state : result.error.code,
                sliderValid: mockSlider.isValid,
                parent: mockSlider.parent?.name,
                flags: mockSlider.objFlags,
            }).toEqual({ state: 'committed', sliderValid: true, parent: 'Canvas', flags: 0 });
        } finally {
            manager.dispose();
        }
    });

    it.each([
        'db://internal/node-library/slider',
        'db://assets/Test.prefab',
    ])('repaints preview position changes for %s', async dbURL => {
        const manager = createManager();
        const sessionId = 'moving-drag';
        try {
            await manager.begin({ sessionId, pointer, items: [{ dbURL }] });
            expect(mockSlider.worldPosition).toEqual({ x: 100, y: 100, z: 0 });
            expect(mockRepaint).toHaveBeenCalled();
            mockRepaint.mockClear();

            const result = await manager.update({
                sessionId, pointer: { ...pointer, x: 240, y: 180, sequence: 2 },
            });
            expect(result).toEqual({ ok: true, value: { sessionId, state: 'previewing' } });
            expect(mockSlider.worldPosition).toEqual({ x: 240, y: 180, z: 0 });
            expect(mockRepaint).toHaveBeenCalled();
            expect(mockEvents.emit).not.toHaveBeenCalled();
        } finally {
            manager.dispose();
        }
    });

    it('repaints after cancellation removes the preview', async () => {
        const manager = createManager();
        const sessionId = 'cancel-drag';
        try {
            await manager.begin({
                sessionId, pointer, items: [{ dbURL: 'db://internal/node-library/slider' }],
            });
            mockRepaint.mockClear();
            await manager.cancel({ sessionId, reason: 'leave' });
            expect(mockSlider.pendingDestroy).toBe(true);
            expect(mockRepaint).toHaveBeenCalled();
        } finally {
            manager.dispose();
        }
    });

    it.each([true, false])('registers Button and Label paths after commit (existing Canvas: %s)', async existing => {
        if (existing) {
            const canvas = new MockNode('Canvas');
            canvas.components.push(new MockCanvas());
            canvas.setParent(mockScene);
        }
        mockSlider = new MockNode('Button');
        const label = new MockNode('Label');
        label.setParent(mockSlider);
        const manager = createManager();
        const sessionId = 'button-paths';
        try {
            await manager.begin({
                sessionId, pointer, items: [{ dbURL: 'db://internal/node-library/button' }],
            });
            const result = await manager.commit({ sessionId, pointer });
            mockPreviewCanvas.flushDestroy();
            expect({
                result,
                buttonPath: mockNodeRegistry.getNodePath(mockSlider as unknown as Node),
                labelPath: mockNodeRegistry.getNodePath(label as unknown as Node),
            }).toEqual({
                result: { ok: true, value: { sessionId, state: 'committed', nodePaths: ['Canvas/Button'] } },
                buttonPath: 'Canvas/Button',
                labelPath: 'Canvas/Button/Label',
            });
        } finally {
            manager.dispose();
        }
    });
});
