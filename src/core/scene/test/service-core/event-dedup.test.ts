/**
 * 场景事件契约测试
 *
 * 验证各 Manager 方法的完整事件行为：
 *   1. 应该发送的事件确实存在
 *   2. 事件参数正确
 *   3. 每个事件只发送正确的次数（不重复）
 *   4. 事件发送顺序正确
 *   5. 源码级保证 Service 层不额外 emit 已由 Manager 负责的事件
 */

// ==================== Mocks ====================

jest.mock('cc', () => {
    const Layers = { Enum: { GIZMOS: 1 << 21, EDITOR: 1 << 22 } };
    const NodeEventType = {
        TRANSFORM_CHANGED: 'transform-changed',
        SIZE_CHANGED: 'size-changed',
        ANCHOR_CHANGED: 'anchor-changed',
        CHILD_ADDED: 'child-added',
        CHILD_REMOVED: 'child-removed',
        PARENT_CHANGED: 'parent-changed',
        CHILD_CHANGED: 'child-changed',
        LIGHT_PROBE_CHANGED: 'light-probe-changed',
    };
    const TransformBit = { POSITION: 1, ROTATION: 2, SCALE: 4 };
    class MockNode {
        static EventType = NodeEventType;
        static TransformBit = TransformBit;
        uuid = 'mock-node-uuid';
        name = 'MockNode';
        layer = 0;
        parent: MockNode | null = null;
        children: MockNode[] = [];
        components: any[] = [];
        _objFlags = 0;
        setParent(p: MockNode | null) { this.parent = p; }
        removeComponent(_comp: any) { /* noop */ }
        getComponent(_type: any) { return null; }
        on() { /* noop */ }
        off() { /* noop */ }
        get isValid() { return true; }
        _getDependComponent() { return []; }
    }
    class MockComponent {
        uuid = 'mock-comp-uuid';
        node = new MockNode();
        constructor() { /* noop */ }
    }
    return {
        Node: MockNode,
        Component: MockComponent,
        MissingScript: class {},
        CCObject: { Flags: { Destroyed: 1 } },
        UITransform: class {},
        UITransformComponent: class {},
        LODGroup: class {},
        Prefab: class {},
        Scene: class {},
        Canvas: class {},
        Layers,
        director: { getScene: () => null },
        MeshRenderer: class {},
        Vec3: class {},
        SphereCollider: class {},
        BoxCollider: class {},
        PolygonCollider2D: class {},
        MeshCollider: class {},
        CapsuleCollider: class {},
        CylinderCollider: class {},
        TerrainCollider: class {},
        Terrain: class {},
        ConeCollider: class {},
        Camera: class {},
    };
});

(global as any).cc = {
    Object: { _deferredDestroy: jest.fn() },
};

(global as any).EditorExtends = {
    Node: {
        updateNodeParent: jest.fn(),
        generateUUID: jest.fn(() => 'generated-uuid'),
        getNodes: jest.fn(() => ({})),
        clear: jest.fn(),
    },
    Component: {
        on: jest.fn(),
        off: jest.fn(),
        clear: jest.fn(),
    },
};

jest.mock('../../scene-process/service/dump', () => ({
    __esModule: true,
    default: {
        restoreProperty: jest.fn().mockResolvedValue(undefined),
        dumpComponent: jest.fn(() => ({})),
    },
}));

jest.mock('../../scene-process/service/component/utils', () => ({
    __esModule: true,
    default: { addComponentMap: {} },
}));

jest.mock('../../scene-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request: jest.fn() }) },
}));

jest.mock('../../scene-process/service/prefab/utils', () => ({
    prefabUtils: {},
}));

jest.mock('../../scene-process/service/node/node-create', () => ({
    loadAny: jest.fn(),
}));

import { ServiceEvents } from '../../scene-process/service/core';
import {
    NodeEventType as SceneNodeEventType,
    NodeOperationType,
    EventSourceType,
} from '../../scene-process/service/public/event-enum';

// ==================== Helpers ====================

type EventRecord = { event: string; args: any[] };

function collectAllEvents(eventNames: string[]): EventRecord[] {
    const records: EventRecord[] = [];
    for (const name of eventNames) {
        ServiceEvents.on(name, (...args: any[]) => {
            records.push({ event: name, args });
        });
    }
    return records;
}

function createMockNode(uuid: string, parent?: any): any {
    const { Node: MockNode } = require('cc');
    const node = new MockNode();
    node.uuid = uuid;
    node.layer = 0;
    node.parent = parent ?? null;
    node.children = [];
    node._objFlags = 0;
    node.setParent = jest.fn((p: any) => { node.parent = p; });
    return node;
}

// ==================== Tests ====================

describe('场景事件契约测试', () => {
    beforeEach(() => {
        ServiceEvents.clear();
        jest.clearAllMocks();
    });

    afterEach(() => {
        ServiceEvents.clear();
    });

    // ==================== CompManager ====================

    describe('CompManager', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CompManager } = require('../../scene-process/service/component/index');

        describe('onComponentAddedFromEditor', () => {
            it('应发送 component:add 1 次，参数为 component 实例', () => {
                const compMgr = new CompManager();
                const listener = jest.fn();
                ServiceEvents.on('component:add', listener);

                const mockComp = { uuid: 'comp-1', node: { uuid: 'node-1' }, constructor: { name: 'TestComp' } };
                compMgr.onComponentAddedFromEditor(mockComp);

                expect(listener).toHaveBeenCalledTimes(1);
                expect(listener).toHaveBeenCalledWith(mockComp);
            });

            it('传入 null 不发送任何事件', () => {
                const compMgr = new CompManager();
                const listener = jest.fn();
                ServiceEvents.on('component:add', listener);

                compMgr.onComponentAddedFromEditor(null);

                expect(listener).not.toHaveBeenCalled();
            });

            it('不应发送 component:added（两个是不同事件）', () => {
                const compMgr = new CompManager();
                const addedListener = jest.fn();
                ServiceEvents.on('component:added', addedListener);

                compMgr.onComponentAddedFromEditor({ uuid: 'comp-1', node: {}, constructor: { name: 'X' } });

                expect(addedListener).not.toHaveBeenCalled();
            });
        });

        describe('add（引擎回调）', () => {
            it('应发送 component:added 1 次', () => {
                const compMgr = new CompManager();
                const listener = jest.fn();
                ServiceEvents.on('component:added', listener);

                const mockComp = { uuid: 'comp-1' };
                compMgr.add('comp-1', mockComp);

                expect(listener).toHaveBeenCalledTimes(1);
                expect(listener).toHaveBeenCalledWith(mockComp);
            });
        });

        describe('remove（引擎回调）', () => {
            it('应发送 component:removed 1 次', () => {
                const compMgr = new CompManager();
                const listener = jest.fn();
                ServiceEvents.on('component:removed', listener);

                const mockComp = { uuid: 'comp-1' };
                compMgr.remove('comp-1', mockComp);

                expect(listener).toHaveBeenCalledTimes(1);
                expect(listener).toHaveBeenCalledWith(mockComp);
            });
        });

        describe('removeComponent', () => {
            it('应按顺序发送 component:before-remove-component → component:remove 各 1 次', () => {
                const compMgr = new CompManager();
                const events = collectAllEvents(['component:before-remove-component', 'component:remove']);

                const { Node: MockNode } = require('cc');
                const mockNode = new MockNode();
                mockNode._getDependComponent = () => [];
                mockNode.removeComponent = jest.fn();
                const mockComp = { uuid: 'comp-1', node: mockNode };

                compMgr.removeComponent(mockComp);

                expect(events).toHaveLength(2);
                expect(events[0].event).toBe('component:before-remove-component');
                expect(events[0].args).toEqual([mockComp]);
                expect(events[1].event).toBe('component:remove');
                expect(events[1].args).toEqual([mockComp]);
            });

            it('有依赖组件时不发送任何事件', () => {
                const compMgr = new CompManager();
                const events = collectAllEvents(['component:before-remove-component', 'component:remove']);

                const { Node: MockNode } = require('cc');
                const mockNode = new MockNode();
                mockNode._getDependComponent = () => [{ name: 'DepComp' }];
                const mockComp = { uuid: 'comp-1', node: mockNode };

                compMgr.removeComponent(mockComp);

                expect(events).toHaveLength(0);
            });

            it('不应发送 component:removed（该事件由引擎回调负责）', () => {
                const compMgr = new CompManager();
                const removedListener = jest.fn();
                ServiceEvents.on('component:removed', removedListener);

                const { Node: MockNode } = require('cc');
                const mockNode = new MockNode();
                mockNode._getDependComponent = () => [];
                mockNode.removeComponent = jest.fn();

                compMgr.removeComponent({ uuid: 'comp-1', node: mockNode });

                expect(removedListener).not.toHaveBeenCalled();
            });
        });
    });

    // ==================== NodeManager ====================

    describe('NodeManager', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { NodeManager } = require('../../scene-process/service/node/index');

        describe('onNodeParentChanged', () => {
            it('child added 时应发送 node:change(parent, CHILD_CHANGED) + node:change(child, PARENT_CHANGED) 各 1 次', () => {
                const nodeMgr = new NodeManager();
                const events = collectAllEvents(['node:change']);

                const parent = createMockNode('parent-1');
                const child = createMockNode('child-1', parent);

                nodeMgr.onNodeParentChanged(parent, child);

                expect(events).toHaveLength(2);
                expect(events[0]).toEqual({ event: 'node:change', args: [parent, { type: SceneNodeEventType.CHILD_CHANGED }] });
                expect(events[1]).toEqual({ event: 'node:change', args: [child, { type: SceneNodeEventType.PARENT_CHANGED }] });
            });

            it('child removed 时只发送 parent 的 CHILD_CHANGED，不发 child 的 PARENT_CHANGED', () => {
                const nodeMgr = new NodeManager();
                const events = collectAllEvents(['node:change']);

                const parent = createMockNode('parent-1');
                const otherParent = createMockNode('other-parent');
                const child = createMockNode('child-1', otherParent);

                nodeMgr.onNodeParentChanged(parent, child);

                expect(events).toHaveLength(1);
                expect(events[0]).toEqual({ event: 'node:change', args: [parent, { type: SceneNodeEventType.CHILD_CHANGED }] });
            });

            it('editor 节点（GIZMOS layer）不发送任何事件', () => {
                const nodeMgr = new NodeManager();
                const events = collectAllEvents(['node:change']);

                const { Layers } = require('cc');
                const parent = createMockNode('parent-1');
                const editorChild = createMockNode('editor-child', parent);
                editorChild.layer = Layers.Enum.GIZMOS;

                nodeMgr.onNodeParentChanged(parent, editorChild);

                expect(events).toHaveLength(0);
            });
        });

        describe('onNodeTransformChanged', () => {
            it('POSITION 变化时应发送 node:change(TRANSFORM_CHANGED) 1 次，propPath 为 position', () => {
                const nodeMgr = new NodeManager();
                const listener = jest.fn();
                ServiceEvents.on('node:change', listener);

                const { Node: MockNode } = require('cc');
                const node = createMockNode('node-1');

                nodeMgr.onNodeTransformChanged(node, MockNode.TransformBit.POSITION);

                expect(listener).toHaveBeenCalledTimes(1);
                expect(listener).toHaveBeenCalledWith(node, {
                    type: SceneNodeEventType.TRANSFORM_CHANGED,
                    source: EventSourceType.ENGINE,
                    propPath: 'position',
                });
            });

            it('ROTATION 变化时 propPath 为 rotation', () => {
                const nodeMgr = new NodeManager();
                const listener = jest.fn();
                ServiceEvents.on('node:change', listener);

                const { Node: MockNode } = require('cc');
                nodeMgr.onNodeTransformChanged(createMockNode('n'), MockNode.TransformBit.ROTATION);

                expect(listener).toHaveBeenCalledTimes(1);
                expect(listener.mock.calls[0][1].propPath).toBe('rotation');
            });

            it('SCALE 变化时 propPath 为 scale', () => {
                const nodeMgr = new NodeManager();
                const listener = jest.fn();
                ServiceEvents.on('node:change', listener);

                const { Node: MockNode } = require('cc');
                nodeMgr.onNodeTransformChanged(createMockNode('n'), MockNode.TransformBit.SCALE);

                expect(listener).toHaveBeenCalledTimes(1);
                expect(listener.mock.calls[0][1].propPath).toBe('scale');
            });
        });

        describe('onLightProbeChanged', () => {
            it('应发送 node:change(LIGHT_PROBE_CHANGED, ENGINE) 1 次', () => {
                const nodeMgr = new NodeManager();
                const listener = jest.fn();
                ServiceEvents.on('node:change', listener);

                const node = createMockNode('node-1');
                nodeMgr.onLightProbeChanged(node);

                expect(listener).toHaveBeenCalledTimes(1);
                expect(listener).toHaveBeenCalledWith(node, {
                    type: SceneNodeEventType.LIGHT_PROBE_CHANGED,
                    source: EventSourceType.ENGINE,
                });
            });
        });

        describe('add（注册节点）', () => {
            it('普通节点应通过 ServiceEvents.emit 发送 node:added', () => {
                const nodeMgr = new NodeManager();
                const listener = jest.fn();
                ServiceEvents.on('node:added', listener);

                const node = createMockNode('node-1');
                nodeMgr.add('node-1', node);

                expect(listener).toHaveBeenCalledTimes(1);
                expect(listener).toHaveBeenCalledWith(node);
            });

            it('editor 节点不发送 node:added', () => {
                const nodeMgr = new NodeManager();
                const listener = jest.fn();
                ServiceEvents.on('node:added', listener);

                const { Layers } = require('cc');
                const node = createMockNode('editor-node');
                node.layer = Layers.Enum.GIZMOS;
                nodeMgr.add('editor-node', node);

                expect(listener).not.toHaveBeenCalled();
            });
        });

        describe('remove（注销节点）', () => {
            it('普通节点应通过 ServiceEvents.emit 发送 node:removed，source 为 ENGINE', () => {
                const nodeMgr = new NodeManager();
                const listener = jest.fn();
                ServiceEvents.on('node:removed', listener);

                const node = createMockNode('node-1');
                nodeMgr.remove('node-1', node);

                expect(listener).toHaveBeenCalledTimes(1);
                expect(listener).toHaveBeenCalledWith(node, { source: EventSourceType.ENGINE });
            });

            it('editor 节点不发送 node:removed', () => {
                const nodeMgr = new NodeManager();
                const listener = jest.fn();
                ServiceEvents.on('node:removed', listener);

                const { Layers } = require('cc');
                const node = createMockNode('editor-node');
                node.layer = Layers.Enum.GIZMOS;
                nodeMgr.remove('editor-node', node);

                expect(listener).not.toHaveBeenCalled();
            });
        });

        describe('baseRemoveNode', () => {
            it('应按顺序发送 node:before-remove → node:before-change(parent) → node:remove 各 1 次', () => {
                const nodeMgr = new NodeManager();
                const events = collectAllEvents(['node:before-remove', 'node:before-change', 'node:remove']);

                const parent = createMockNode('parent-1');
                const node = createMockNode('node-1', parent);

                nodeMgr.baseRemoveNode(node);

                expect(events).toHaveLength(3);
                expect(events[0]).toEqual({ event: 'node:before-remove', args: [node] });
                expect(events[1]).toEqual({ event: 'node:before-change', args: [parent] });
                expect(events[2]).toEqual({ event: 'node:remove', args: [node, { source: EventSourceType.EDITOR }] });
            });

            it('无父节点时发送 node:before-remove + node:remove，不发 node:before-change', () => {
                const nodeMgr = new NodeManager();
                const events = collectAllEvents(['node:before-remove', 'node:before-change', 'node:remove']);

                const node = createMockNode('orphan-node');
                nodeMgr.baseRemoveNode(node);

                expect(events).toHaveLength(2);
                expect(events[0].event).toBe('node:before-remove');
                expect(events[1].event).toBe('node:remove');
            });

            it('传入 null 不发送任何事件', () => {
                const nodeMgr = new NodeManager();
                const events = collectAllEvents(['node:before-remove', 'node:before-change', 'node:remove']);

                nodeMgr.baseRemoveNode(null);

                expect(events).toHaveLength(0);
            });

            it('不应发送 node:change（删除时不需要 change 通知）', () => {
                const nodeMgr = new NodeManager();
                const changeListener = jest.fn();
                ServiceEvents.on('node:change', changeListener);

                const parent = createMockNode('parent-1');
                const node = createMockNode('node-1', parent);
                nodeMgr.baseRemoveNode(node);

                expect(changeListener).not.toHaveBeenCalled();
            });
        });

        describe('setProperty', () => {
            it('普通属性应按顺序发送 node:before-change → node:change(SET_PROPERTY) 各 1 次', async () => {
                const nodeMgr = new NodeManager();
                const events = collectAllEvents(['node:before-change', 'node:change']);

                const node = createMockNode('node-1');
                // mock query 方法让 setProperty 能找到节点
                nodeMgr.query = jest.fn(() => node);

                await nodeMgr.setProperty('node-1', 'active', { value: true });

                expect(events).toHaveLength(2);
                expect(events[0]).toEqual({ event: 'node:before-change', args: [node] });
                expect(events[1]).toEqual({
                    event: 'node:change',
                    args: [node, { type: NodeOperationType.SET_PROPERTY, propPath: 'active', record: true }],
                });
            });

            it('设置 parent 属性时应额外发送 parent 的 before-change 和 change', async () => {
                const nodeMgr = new NodeManager();
                const events = collectAllEvents(['node:before-change', 'node:change']);

                const parent = createMockNode('parent-1');
                const node = createMockNode('node-1', parent);
                nodeMgr.query = jest.fn(() => node);

                await nodeMgr.setProperty('node-1', 'parent', { value: 'new-parent-uuid' });

                const beforeChangeEvents = events.filter(e => e.event === 'node:before-change');
                const changeEvents = events.filter(e => e.event === 'node:change');

                // node + parent 各一次 before-change
                expect(beforeChangeEvents).toHaveLength(2);
                expect(beforeChangeEvents[0].args[0]).toBe(node);
                expect(beforeChangeEvents[1].args[0]).toBe(parent);

                // node 的 SET_PROPERTY + parent 的 children change
                expect(changeEvents).toHaveLength(2);
                expect(changeEvents[0].args[1].propPath).toBe('parent');
                expect(changeEvents[1].args[0]).toBe(parent);
                expect(changeEvents[1].args[1].propPath).toBe('children');
            });

            it('数组属性应为每个元素额外发送 node:change', async () => {
                const nodeMgr = new NodeManager();
                const changeListener = jest.fn();
                ServiceEvents.on('node:change', changeListener);

                const node = createMockNode('node-1');
                nodeMgr.query = jest.fn(() => node);

                await nodeMgr.setProperty('node-1', 'items', {
                    isArray: true,
                    value: ['a', 'b', 'c'],
                });

                // 1 次主 change + 3 次数组元素 change
                expect(changeListener).toHaveBeenCalledTimes(4);
                expect(changeListener.mock.calls[0][1].propPath).toBe('items');
                expect(changeListener.mock.calls[1][1].propPath).toBe('items.0');
                expect(changeListener.mock.calls[2][1].propPath).toBe('items.1');
                expect(changeListener.mock.calls[3][1].propPath).toBe('items.2');
            });

            it('节点不存在时不发送任何事件', async () => {
                const nodeMgr = new NodeManager();
                const events = collectAllEvents(['node:before-change', 'node:change']);
                nodeMgr.query = jest.fn(() => null);

                await nodeMgr.setProperty('nonexistent', 'active', { value: true });

                expect(events).toHaveLength(0);
            });
        });

        describe('change（EditorExtends 回调）', () => {
            it('普通节点应发送 node:change(SET_PROPERTY) 1 次', () => {
                const nodeMgr = new NodeManager();
                const listener = jest.fn();
                ServiceEvents.on('node:change', listener);

                const node = createMockNode('node-1');
                nodeMgr.change('node-1', node);

                expect(listener).toHaveBeenCalledTimes(1);
                expect(listener).toHaveBeenCalledWith(node, {
                    type: NodeOperationType.SET_PROPERTY,
                    propPath: '',
                });
            });

            it('editor 节点不发送事件', () => {
                const nodeMgr = new NodeManager();
                const listener = jest.fn();
                ServiceEvents.on('node:change', listener);

                const { Layers } = require('cc');
                const node = createMockNode('editor-node');
                node.layer = Layers.Enum.GIZMOS;
                nodeMgr.change('editor-node', node);

                expect(listener).not.toHaveBeenCalled();
            });
        });
    });

    // ==================== 源码级去重保证 ====================

    describe('源码级去重保证', () => {
        const fs = require('fs');
        const path = require('path');

        function readSourceFile(relativePath: string): string {
            return fs.readFileSync(
                path.resolve(__dirname, '../../scene-process/service', relativePath),
                'utf-8',
            );
        }

        function extractMethodBody(source: string, methodSignature: RegExp): string {
            const match = source.match(methodSignature);
            if (!match) return '';
            const startIdx = source.indexOf(match[0]);
            let braceCount = 0;
            let started = false;
            let bodyStart = startIdx;
            let bodyEnd = startIdx;
            for (let i = startIdx; i < source.length; i++) {
                if (source[i] === '{') {
                    if (!started) bodyStart = i;
                    started = true;
                    braceCount++;
                } else if (source[i] === '}') {
                    braceCount--;
                    if (started && braceCount === 0) {
                        bodyEnd = i + 1;
                        break;
                    }
                }
            }
            return source.slice(bodyStart, bodyEnd);
        }

        function countEmitCalls(body: string, eventPattern: string | RegExp): number {
            const regex = typeof eventPattern === 'string'
                ? new RegExp(`this\\.(emit|broadcast)\\(\\s*['"]${eventPattern}['"]`, 'g')
                : eventPattern;
            return (body.match(regex) || []).length;
        }

        // ---------- ComponentService ----------

        describe('ComponentService (component.ts)', () => {
            const source = readSourceFile('component.ts');

            it('add 不直接 emit component:add（由 compMgr.onComponentAddedFromEditor 负责）', () => {
                const body = extractMethodBody(source, /async add\(params:/);
                expect(body.length).toBeGreaterThan(0);
                expect(body).not.toMatch(/this\.emit\(\s*['"]component:add['"]/);
            });

            it('add 应 emit node:before-change 和 node:change(CREATE_COMPONENT) 各 1 次', () => {
                const body = extractMethodBody(source, /async add\(params:/);
                expect(countEmitCalls(body, 'node:before-change')).toBe(1);
                expect(countEmitCalls(body, 'node:change')).toBe(1);
                expect(body).toMatch(/CREATE_COMPONENT/);
            });

            it('add 应调用 compMgr.onComponentAddedFromEditor', () => {
                const body = extractMethodBody(source, /async add\(params:/);
                expect(body).toMatch(/compMgr\.onComponentAddedFromEditor/);
            });

            it('remove 不直接 emit component:remove（由 compMgr.removeComponent 负责）', () => {
                const body = extractMethodBody(source, /async remove\(params:/);
                expect(body.length).toBeGreaterThan(0);
                expect(body).not.toMatch(/this\.emit\(\s*['"]component:remove['"]/);
            });

            it('add 应 emit component:before-add-component 1 次', () => {
                const body = extractMethodBody(source, /async add\(params:/);
                expect(countEmitCalls(body, 'component:before-add-component')).toBe(1);
            });

            it('component:set-property 在接口定义中但未直接 emit（通过 undo snapshot type 使用）', () => {
                const allEmits = (source.match(/this\.(emit|broadcast)\(\s*['"]component:set-property['"]/g) || []);
                expect(allEmits).toHaveLength(0);
            });
        });

        // ---------- NodeService ----------

        describe('NodeService (node.ts)', () => {
            const source = readSourceFile('node.ts');

            it('_createNode 不直接 emit node:change CHILD_CHANGED（由引擎事件回调负责）', () => {
                const body = extractMethodBody(source, /async _createNode\(/);
                expect(body.length).toBeGreaterThan(0);
                expect(body).not.toMatch(/this\.emit\(\s*['"]node:change['"].*CHILD_CHANGED/);
            });

            it('_createNode 应 emit node:before-add 和 node:add 各 1 次', () => {
                const body = extractMethodBody(source, /async _createNode\(/);
                expect(countEmitCalls(body, 'node:before-add')).toBe(1);
                expect(countEmitCalls(body, 'node:add')).toBe(1);
            });
        });

        // ---------- NodeManager ----------

        describe('NodeManager (node/index.ts)', () => {
            const source = readSourceFile('node/index.ts');

            it('createNodeFromStash 不直接 emit node:change CHILD_CHANGED（由引擎事件回调负责）', () => {
                const body = extractMethodBody(source, /createNodeFromStash\(parentUuid/);
                expect(body.length).toBeGreaterThan(0);
                expect(body).not.toMatch(/this\.emit\(\s*['"]node:change['"].*CHILD_CHANGED/);
            });

            it('createNodeFromStash 应 emit node:before-add、node:before-change、node:add 各 1 次', () => {
                const body = extractMethodBody(source, /createNodeFromStash\(parentUuid/);
                expect(countEmitCalls(body, 'node:before-add')).toBe(1);
                expect(countEmitCalls(body, 'node:before-change')).toBe(1);
                expect(countEmitCalls(body, 'node:add')).toBe(1);
            });

            it('baseRemoveNode 应 emit node:before-remove、node:remove 各 1 次，before-change 最多 1 次', () => {
                const body = extractMethodBody(source, /baseRemoveNode\(/);
                expect(countEmitCalls(body, 'node:before-remove')).toBe(1);
                expect(countEmitCalls(body, 'node:remove')).toBe(1);
                expect(countEmitCalls(body, 'node:before-change')).toBeLessThanOrEqual(1);
            });
        });

        // ---------- EditorService ----------

        describe('EditorService (editor.ts)', () => {
            const source = readSourceFile('editor.ts');

            it('open 应 emit editor:open 1 次', () => {
                const body = extractMethodBody(source, /async open\(params:/);
                expect(body.length).toBeGreaterThan(0);
                expect(countEmitCalls(body, 'editor:open')).toBe(1);
            });

            it('open 不应 broadcast editor:open', () => {
                const body = extractMethodBody(source, /async open\(params:/);
                expect(body).not.toMatch(/this\.broadcast\(\s*['"]editor:open['"]/);
            });

            it('close 应 emit editor:close 1 次', () => {
                const body = extractMethodBody(source, /async close\(params:/);
                expect(body.length).toBeGreaterThan(0);
                expect(countEmitCalls(body, 'editor:close')).toBe(1);
            });

            it('save 应 emit editor:save 1 次', () => {
                const body = extractMethodBody(source, /async save\(params:/);
                expect(body.length).toBeGreaterThan(0);
                expect(countEmitCalls(body, 'editor:save')).toBe(1);
            });

            it('reload 应 broadcast editor:reload 1 次（不额外 emit）', () => {
                const body = extractMethodBody(source, /async reload\(params:/);
                expect(body.length).toBeGreaterThan(0);
                expect(body).toMatch(/this\.broadcast\(\s*['"]editor:reload['"]/);
                expect(body).not.toMatch(/this\.emit\(\s*['"]editor:reload['"]/);
            });
        });

        // ---------- SelectionService ----------

        describe('SelectionService (selection.ts)', () => {
            const source = readSourceFile('selection.ts');

            it('select 应 broadcast selection:select 1 次', () => {
                const body = extractMethodBody(source, /select\(path: string\)/);
                expect(body.length).toBeGreaterThan(0);
                expect(body).toMatch(/this\.broadcast\(\s*['"]selection:select['"]/);
                expect(countEmitCalls(body, /this\.broadcast\(\s*['"]selection:select['"]/g)).toBe(1);
            });

            it('select 不应同时 emit selection:select（broadcast 已包含本地 emit）', () => {
                const body = extractMethodBody(source, /select\(path: string\)/);
                expect(body).not.toMatch(/this\.emit\(\s*['"]selection:select['"]/);
            });

            it('unselect 应 broadcast selection:unselect 1 次', () => {
                const body = extractMethodBody(source, /unselect\(path: string\)/);
                expect(body.length).toBeGreaterThan(0);
                expect(body).toMatch(/this\.broadcast\(\s*['"]selection:unselect['"]/);
                expect(countEmitCalls(body, /this\.broadcast\(\s*['"]selection:unselect['"]/g)).toBe(1);
            });

            it('unselect 不应同时 emit selection:unselect', () => {
                const body = extractMethodBody(source, /unselect\(path: string\)/);
                expect(body).not.toMatch(/this\.emit\(\s*['"]selection:unselect['"]/);
            });

            it('clear 应 broadcast selection:clear 1 次', () => {
                const body = extractMethodBody(source, /clear\(\): void/);
                expect(body.length).toBeGreaterThan(0);
                expect(body).toMatch(/this\.broadcast\(\s*['"]selection:clear['"]/);
                expect(countEmitCalls(body, /this\.broadcast\(\s*['"]selection:clear['"]/g)).toBe(1);
            });

            it('clear 中对每个已选项 emit selection:unselect（与 broadcast selection:clear 是不同事件，不构成重复）', () => {
                const body = extractMethodBody(source, /clear\(\): void/);
                expect(body).toMatch(/this\.emit\(\s*['"]selection:unselect['"]/);
            });
        });

        // ---------- AssetService ----------

        describe('AssetService (asset.ts)', () => {
            const source = readSourceFile('asset.ts');

            it('assetChanged 应 emit asset:change 1 次', () => {
                const body = extractMethodBody(source, /async assetChanged\(/);
                expect(body.length).toBeGreaterThan(0);
                expect(countEmitCalls(body, 'asset:change')).toBe(1);
            });

            it('assetDeleted 应 emit asset:deleted 1 次', () => {
                const body = extractMethodBody(source, /async assetDeleted\(/);
                expect(body.length).toBeGreaterThan(0);
                expect(countEmitCalls(body, 'asset:deleted')).toBe(1);
            });
        });

        describe('AssetWatcher — asset-refresh (asset/asset-watcher.ts)', () => {
            const source = readSourceFile('asset/asset-watcher.ts');

            it('应通过 ServiceEvents.emit 发送 asset-refresh（全文仅 1 处）', () => {
                const count = (source.match(/ServiceEvents\.emit.*['"]asset-refresh['"]/g) || []).length;
                expect(count).toBe(1);
            });

            it('不应 broadcast asset-refresh（该事件已从 SERVICE_EVENTS_MAP 中排除）', () => {
                expect(source).not.toMatch(/broadcast.*['"]asset-refresh['"]/);
            });
        });

        // ---------- UndoService ----------

        describe('UndoService (undo.ts)', () => {
            const source = readSourceFile('undo.ts');

            it('endRecording 应 broadcast undo:changed 最多 1 次', () => {
                const body = extractMethodBody(source, /async endRecording\(/);
                expect(body.length).toBeGreaterThan(0);
                expect(countEmitCalls(body, 'undo:changed')).toBeLessThanOrEqual(1);
            });

            it('undo 应 broadcast undo:changed 1 次', () => {
                const body = extractMethodBody(source, /async undo\(\)/);
                expect(body.length).toBeGreaterThan(0);
                expect(countEmitCalls(body, 'undo:changed')).toBe(1);
            });

            it('redo 应 broadcast undo:changed 1 次', () => {
                const body = extractMethodBody(source, /async redo\(\)/);
                expect(body.length).toBeGreaterThan(0);
                expect(countEmitCalls(body, 'undo:changed')).toBe(1);
            });

            it('push 应 broadcast undo:changed 1 次', () => {
                const body = extractMethodBody(source, /push\(command:/);
                expect(body.length).toBeGreaterThan(0);
                expect(countEmitCalls(body, 'undo:changed')).toBe(1);
            });

            it('clearHistory 应 broadcast undo:changed 最多 1 次', () => {
                const body = extractMethodBody(source, /clearHistory\(\):/);
                expect(body.length).toBeGreaterThan(0);
                expect(countEmitCalls(body, 'undo:changed')).toBeLessThanOrEqual(1);
            });

            it('undo/redo 不应同时 emit 和 broadcast undo:changed', () => {
                const undoBody = extractMethodBody(source, /async undo\(\)/);
                const redoBody = extractMethodBody(source, /async redo\(\)/);
                expect(undoBody).not.toMatch(/this\.emit\(\s*['"]undo:changed['"]/);
                expect(redoBody).not.toMatch(/this\.emit\(\s*['"]undo:changed['"]/);
            });
        });

        // ---------- ScriptService ----------

        describe('ScriptService (script.ts)', () => {
            const source = readSourceFile('script.ts');

            it('应 emit script:execution-finished（全文仅出现 1 次）', () => {
                const count = (source.match(/this\.emit\(\s*['"]script:execution-finished['"]/g) || []).length;
                expect(count).toBe(1);
            });

            it('不应 broadcast script:execution-finished', () => {
                expect(source).not.toMatch(/this\.broadcast\(\s*['"]script:execution-finished['"]/);
            });
        });

        // ---------- EngineService ----------

        describe('EngineService (engine.ts)', () => {
            const source = readSourceFile('engine.ts');

            it('应 broadcast engine:update 和 engine:ticked（不额外 emit）', () => {
                expect(source).toMatch(/this\.broadcast\(\s*['"]engine:update['"]/);
                expect(source).toMatch(/this\.broadcast\(\s*['"]engine:ticked['"]/);
                expect(source).not.toMatch(/this\.emit\(\s*['"]engine:update['"]/);
                expect(source).not.toMatch(/this\.emit\(\s*['"]engine:ticked['"]/);
            });
        });

        // ---------- CameraService ----------

        describe('CameraService (camera.ts)', () => {
            const source = readSourceFile('camera.ts');

            it('应 emit camera:mode-change（全文仅 1 次）', () => {
                const count = (source.match(/this\.emit\(\s*['"]camera:mode-change['"]/g) || []).length;
                expect(count).toBe(1);
            });

            it('应 emit camera:projection-changed（全文仅 1 次）', () => {
                const count = (source.match(/this\.emit\(\s*['"]camera:projection-changed['"]/g) || []).length;
                expect(count).toBe(1);
            });

            it('应 emit camera:fov-changed（全文仅 1 次）', () => {
                const count = (source.match(/this\.emit\(\s*['"]camera:fov-changed['"]/g) || []).length;
                expect(count).toBe(1);
            });

            it('不应 broadcast 任何 camera 事件（camera 事件仅限本地）', () => {
                expect(source).not.toMatch(/this\.broadcast\(\s*['"]camera:/);
            });
        });

        // ---------- GizmoService ----------

        describe('GizmoService (gizmo.ts)', () => {
            const source = readSourceFile('gizmo.ts');

            it('应 emit gizmo:tool-changed（全文仅 1 次）', () => {
                const count = (source.match(/this\.emit\(\s*['"]gizmo:tool-changed['"]/g) || []).length;
                expect(count).toBe(1);
            });

            it('不应 broadcast gizmo:tool-changed', () => {
                expect(source).not.toMatch(/this\.broadcast\(\s*['"]gizmo:tool-changed['"]/);
            });

            it('gizmo:control-begin/end 在 IGizmoEvents 接口定义但未在 gizmo.ts 中 emit（由 gizmo-base 使用 hyphen 格式发送）', () => {
                expect(source).not.toMatch(/this\.(emit|broadcast)\(\s*['"]gizmo:control-begin['"]/);
                expect(source).not.toMatch(/this\.(emit|broadcast)\(\s*['"]gizmo:control-end['"]/);
            });
        });

        describe('GizmoBase (gizmo/base/gizmo-base.ts)', () => {
            const source = readSourceFile('gizmo/base/gizmo-base.ts');

            it('onControlBegin 应 broadcast gizmo:control-begin 1 次', () => {
                const body = extractMethodBody(source, /onControlBegin\(/);
                expect(body.length).toBeGreaterThan(0);
                const count = (body.match(/broadcast.*['"]gizmo:control-begin['"]/g) || []).length;
                expect(count).toBe(1);
            });

            it('onControlEnd 应 broadcast gizmo:control-end 1 次', () => {
                const body = extractMethodBody(source, /onControlEnd\(/);
                expect(body.length).toBeGreaterThan(0);
                const count = (body.match(/broadcast.*['"]gizmo:control-end['"]/g) || []).length;
                expect(count).toBe(1);
            });

            it('onControlBegin 不应同时 emit gizmo:control-begin', () => {
                const body = extractMethodBody(source, /onControlBegin\(/);
                expect(body).not.toMatch(/\.emit\(\s*['"]gizmo:control-begin['"]/);
            });

            it('onControlEnd 不应同时 emit gizmo:control-end', () => {
                const body = extractMethodBody(source, /onControlEnd\(/);
                expect(body).not.toMatch(/\.emit\(\s*['"]gizmo:control-end['"]/);
            });
        });

        // ---------- UIService ----------

        describe('UIService (ui.ts)', () => {
            const source = readSourceFile('ui.ts');

            it('应 emit ui:align-selection（全文仅 1 次）', () => {
                const count = (source.match(/this\.emit\(\s*['"]ui:align-selection['"]/g) || []).length;
                expect(count).toBe(1);
            });

            it('应 emit ui:distribute-selection（全文仅 1 次）', () => {
                const count = (source.match(/this\.emit\(\s*['"]ui:distribute-selection['"]/g) || []).length;
                expect(count).toBe(1);
            });

            it('不应 broadcast 任何 ui 事件', () => {
                expect(source).not.toMatch(/this\.broadcast\(\s*['"]ui:/);
            });
        });

        // ---------- OperationService ----------

        describe('OperationService (operation.ts)', () => {
            const source = readSourceFile('operation.ts');

            it('应 broadcast pointer-lock（出现 2 次：lock + unlock）', () => {
                const count = (source.match(/this\.broadcast\(\s*['"]pointer-lock['"]/g) || []).length;
                expect(count).toBe(2);
            });

            it('应 broadcast pointer-change（全文仅 1 次）', () => {
                const count = (source.match(/this\.broadcast\(\s*['"]pointer-change['"]/g) || []).length;
                expect(count).toBe(1);
            });

            it('不应同时 emit pointer-lock/pointer-change', () => {
                expect(source).not.toMatch(/this\.emit\(\s*['"]pointer-lock['"]/);
                expect(source).not.toMatch(/this\.emit\(\s*['"]pointer-change['"]/);
            });
        });

        // ---------- SceneViewService ----------

        describe('SceneViewService (scene-view.ts)', () => {
            const source = readSourceFile('scene-view.ts');

            it('应 emit scene-view:visibility-changed（全文仅 1 次）', () => {
                const count = (source.match(/this\.emit\(\s*['"]scene-view:visibility-changed['"]/g) || []).length;
                expect(count).toBe(1);
            });

            it('应 emit scene-view:light-changed（全文仅 1 次）', () => {
                const count = (source.match(/this\.emit\(\s*['"]scene-view:light-changed['"]/g) || []).length;
                expect(count).toBe(1);
            });

            it('不应 broadcast 任何 scene-view 事件', () => {
                expect(source).not.toMatch(/this\.broadcast\(\s*['"]scene-view:/);
            });
        });

        // ---------- UndoService dirty:changed ----------

        describe('UndoService dirty:changed 防重复', () => {
            const source = readSourceFile('undo.ts');

            it('_emitDirtyIfChanged 仅在状态变化时 broadcast dirty:changed（全文仅 1 处 broadcast dirty:changed）', () => {
                const count = (source.match(/this\.broadcast\(\s*['"]dirty:changed['"]/g) || []).length;
                expect(count).toBe(1);
            });

            it('不应直接 emit dirty:changed（应通过 broadcast）', () => {
                expect(source).not.toMatch(/this\.emit\(\s*['"]dirty:changed['"]/);
            });
        });
    });
});
