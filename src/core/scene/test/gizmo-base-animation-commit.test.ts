const broadcasts: Array<[string, unknown]> = [];
let endRecordingPromise: Promise<unknown> | null = null;
let endRecordingResolve: (() => void) | null = null;

jest.mock('cc', () => {
    class Vec3 {
        static ZERO = new Vec3();
        constructor(public x = 0, public y = 0, public z = 0) {}
        set(value: Vec3) { this.x = value.x; this.y = value.y; this.z = value.z; return this; }
        add(value: Vec3) { this.x += value.x; this.y += value.y; this.z += value.z; return this; }
        equals(value: Vec3) { return this.x === value.x && this.y === value.y && this.z === value.z; }
    }
    class Node {
        uuid = 'node-uuid';
        isValid = true;
        parent = null;
        components: unknown[] = [];
        position = new Vec3();
        getWorldPosition() { return new Vec3().set(this.position); }
        setWorldPosition = jest.fn((value: Vec3) => this.position.set(value));
    }
    class Component {
        node = new Node();
    }
    return {
        Component, Node, Scene: class extends Node {}, Vec3, Quat: class { static identity() {} },
        Layers: { Enum: {}, makeMaskExclude: () => 0 }, CCObject: { Flags: { IsPositionLocked: 1 } },
    };
});

jest.mock('../scene-process/service/scene/light-probe-transform', () => ({ beginLightProbeTransformEdit: jest.fn() }));
jest.mock('../scene-process/service/gizmo/utils/editor-node', () => ({ getEditorNodeByPath: jest.fn() }));
jest.mock('../scene-process/service/gizmo/node/position-controller', () => ({
    __esModule: true,
    default: class {
        updated = true;
        transformToolData = { pivot: 'pivot', coordinate: 'global' };
        getDeltaPosition() { return new (require('cc').Vec3)(1, 0, 0); }
        setPosition() {}
        setRotation() {}
        hide() {}
    },
}));
jest.mock('../scene-process/service/gizmo/controller/origin-axis', () => ({ __esModule: true, default: class {} }));
jest.mock('../scene-process/service/gizmo/utils/engine-utils', () => ({}));
jest.mock('../scene-process/service/camera/utils', () => ({ CameraUtils: {} }));

jest.mock('../scene-process/service/core/decorator', () => ({
    Service: {
        Selection: { query: jest.fn(() => []) },
        Undo: {
            beginRecording: jest.fn(() => 'recording-1'),
            endRecording: jest.fn(() => {
                if (endRecordingPromise) {
                    return endRecordingPromise;
                }
                return Promise.resolve();
            }),
        },
    },
}));

describe('GizmoBase animation property commit event', () => {
    beforeEach(() => {
        broadcasts.length = 0;
        endRecordingPromise = null;
        endRecordingResolve = null;
        const { Service } = require('../scene-process/service/core/decorator');
        Service.Undo.beginRecording.mockClear();
        Service.Undo.endRecording.mockClear();
        const { globalEventEmitter } = require('../scene-process/service/core/global-events');
        globalEventEmitter.removeAllListeners('gizmo:control-end');
        globalEventEmitter.removeAllListeners('animation:property-committed');
        globalEventEmitter.removeAllListeners('node:change');
        globalEventEmitter.on('gizmo:control-end', (payload: unknown) => {
            broadcasts.push(['gizmo:control-end', payload]);
        });
        globalEventEmitter.on('animation:property-committed', (payload: unknown) => {
            broadcasts.push(['animation:property-committed', payload]);
        });
        (globalThis as any).EditorExtends = {
            Node: {
                getNodePath: (node: { uuid: string }) => `Canvas/${node.uuid}`,
            },
        };
        (globalThis as any).cc = {};
    });

    afterEach(() => {
        const { globalEventEmitter } = require('../scene-process/service/core/global-events');
        globalEventEmitter.removeAllListeners('gizmo:control-end');
        globalEventEmitter.removeAllListeners('animation:property-committed');
        globalEventEmitter.removeAllListeners('node:change');
    });

    describe('node-transform light probe batches', () => {
        function createTransformGizmo() {
            const { Component } = require('cc');
            const TransformBaseGizmo = require('../scene-process/service/gizmo/node/transform-base').default;
            const { Service } = require('../scene-process/service/core/decorator');
            const { getEditorNodeByPath } = require('../scene-process/service/gizmo/utils/editor-node');
            const target = new Component();
            target.node.uuid = 'ProbeGroup';
            Service.Selection.query.mockReturnValue(['ProbeGroup']);
            getEditorNodeByPath.mockReturnValue(target.node);
            const gizmo = new TransformBaseGizmo(target);
            gizmo._controller = { hide: jest.fn() };
            return { gizmo, target, Service };
        }

        beforeEach(() => {
            const { beginLightProbeTransformEdit } = require('../scene-process/service/scene/light-probe-transform');
            beginLightProbeTransformEdit.mockReset();
        });

        it.each(['position', 'rotation', 'scale'])('captures before %s batching and flushes before after-state capture', async propPath => {
            const { gizmo, target, Service } = createTransformGizmo();
            const { beginLightProbeTransformEdit } = require('../scene-process/service/scene/light-probe-transform');
            const order: string[] = [];
            const finish = jest.fn(() => order.push('flush'));
            Service.Undo.beginRecording.mockImplementationOnce(() => { order.push('before'); return 'recording-1'; });
            Service.Undo.endRecording.mockImplementationOnce(() => { order.push('after'); return Promise.resolve(); });
            beginLightProbeTransformEdit.mockImplementationOnce(() => { order.push('begin-batch'); return finish; });

            gizmo.onControlUpdate(propPath);
            gizmo.onControlUpdate(propPath);
            await gizmo.onControlEnd(propPath);
            await gizmo.commitChanges();

            expect(order).toEqual(['before', 'begin-batch', 'flush', 'after']);
            expect(beginLightProbeTransformEdit).toHaveBeenCalledWith([target.node]);
            expect(finish).toHaveBeenCalledTimes(1);
            expect(Service.Undo.beginRecording).toHaveBeenCalledTimes(1);
            expect(Service.Undo.endRecording).toHaveBeenCalledTimes(1);
            expect(broadcasts).toContainEqual(['gizmo:control-end', propPath]);
            expect(broadcasts).toContainEqual(['animation:property-committed', {
                nodePath: 'Canvas/ProbeGroup', propPath, source: 'engine',
            }]);
        });

        it.each(['hide', 'target', 'destroy', 'wrapper-destroy'])('finishes an interrupted batch once on %s', async action => {
            const { gizmo, Service } = createTransformGizmo();
            const { beginLightProbeTransformEdit } = require('../scene-process/service/scene/light-probe-transform');
            const finish = jest.fn();
            beginLightProbeTransformEdit.mockReturnValueOnce(finish);
            endRecordingPromise = new Promise(resolve => { endRecordingResolve = () => resolve(undefined); });
            gizmo.onControlUpdate('position');
            if (action === 'hide') {
                // onHide normally returns early for the one still-selected node.
                gizmo.onHide();
                expect(gizmo._controller.hide).not.toHaveBeenCalled();
            } else if (action === 'target') {
                const { Component } = require('cc');
                const { getEditorNodeByPath } = require('../scene-process/service/gizmo/utils/editor-node');
                const next = new Component();
                next.node.uuid = 'Next';
                getEditorNodeByPath.mockReturnValue(next.node);
                gizmo.target = next;
            } else if (action === 'destroy') gizmo.destroy();
            else gizmo.onDestroy();
            // The next lifecycle callback can happen while endRecording awaits.
            gizmo.onDestroy();
            expect(finish).toHaveBeenCalledTimes(1);
            expect(Service.Undo.endRecording).toHaveBeenCalledTimes(1);
            expect(gizmo._isControlBegin).toBe(false);

            endRecordingResolve?.();
            await new Promise<void>(resolve => setImmediate(resolve));

            expect(broadcasts.filter(([event]) => event === 'animation:property-committed')).toEqual([
                ['animation:property-committed', { nodePath: 'Canvas/ProbeGroup', propPath: 'position', source: 'engine' }],
            ]);
        });

        it('leaves ordinary-node hide and non-transform property recordings unchanged', async () => {
            const { gizmo, Service } = createTransformGizmo();
            const { beginLightProbeTransformEdit } = require('../scene-process/service/scene/light-probe-transform');
            // No probe scene: the helper returns undefined, not a deferred batch.
            gizmo.onControlUpdate('position');
            gizmo.onHide();
            expect(Service.Undo.endRecording).not.toHaveBeenCalled();
            await gizmo.onControlEnd('position');
            beginLightProbeTransformEdit.mockClear();
            gizmo.onControlUpdate('_components.0.size');
            expect(beginLightProbeTransformEdit).not.toHaveBeenCalled();
            await gizmo.onControlEnd('_components.0.size');
            expect(Service.Undo.endRecording).toHaveBeenCalledTimes(2);
        });

        it('releases the previous gesture without clearing a new batch while Undo is pending', async () => {
            const { gizmo, Service } = createTransformGizmo();
            const { beginLightProbeTransformEdit } = require('../scene-process/service/scene/light-probe-transform');
            const first = jest.fn();
            const second = jest.fn();
            beginLightProbeTransformEdit.mockReturnValueOnce(first).mockReturnValueOnce(second);
            endRecordingPromise = new Promise(resolve => { endRecordingResolve = () => resolve(undefined); });
            gizmo.onControlUpdate('position');
            const finishing = gizmo.onControlEnd('position');
            gizmo.onControlUpdate('position');
            expect(first).toHaveBeenCalledTimes(1);
            expect(second).not.toHaveBeenCalled();
            endRecordingResolve?.();
            await finishing;
            await gizmo.onControlEnd('position');
            expect(second).toHaveBeenCalledTimes(1);
            expect(Service.Undo.endRecording).toHaveBeenCalledTimes(2);
        });

        describe('delayed Position moves', () => {
            beforeEach(() => jest.useFakeTimers());
            afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

            function scheduleMove() {
                const { target, Service } = createTransformGizmo();
                const PositionGizmo = require('../scene-process/service/gizmo/node/position').default;
                const gizmo = new PositionGizmo(target);
                gizmo.disableSnap = true;
                gizmo.createController();
                const event = { handleName: 'x' };
                gizmo.onControllerMouseDown(event);
                gizmo.updateDataFromController(event);
                expect(jest.getTimerCount()).toBe(1);
                return { gizmo, target, Service };
            }

            it.each(['hide', 'target', 'destroy', 'wrapper-destroy'])('clears the pending move before %s flushes Undo', action => {
                const { beginLightProbeTransformEdit } = require('../scene-process/service/scene/light-probe-transform');
                const timerCountsAtFlush: number[] = [];
                const finish = jest.fn(() => { timerCountsAtFlush.push(jest.getTimerCount()); });
                beginLightProbeTransformEdit.mockReturnValueOnce(finish);
                const { gizmo, target, Service } = scheduleMove();
                const { Component } = require('cc');
                const { getEditorNodeByPath } = require('../scene-process/service/gizmo/utils/editor-node');
                const next = new Component();
                next.node.uuid = 'Next';

                if (action === 'hide') gizmo.onHide();
                else if (action === 'target') gizmo.target = next;
                else if (action === 'destroy') gizmo.destroy();
                else gizmo.onDestroy();
                getEditorNodeByPath.mockReturnValue(next.node);
                jest.runOnlyPendingTimers();
                gizmo.onDestroy();

                expect(timerCountsAtFlush).toEqual([0]);
                expect(target.node.setWorldPosition).not.toHaveBeenCalled();
                expect(next.node.setWorldPosition).not.toHaveBeenCalled();
                expect(finish).toHaveBeenCalledTimes(1);
                expect(Service.Undo.endRecording).toHaveBeenCalledTimes(1);
            });

            it('keeps the pending move for the same target and applies normal movement', async () => {
                const { gizmo, target } = scheduleMove();

                gizmo.target = target;
                jest.advanceTimersByTime(16);

                expect(target.node.setWorldPosition).toHaveBeenCalledTimes(1);
                expect(target.node.position.x).toBe(1);
                await gizmo.onControlEnd('position');
                gizmo.onDestroy();
            });
        });
    });

    it('broadcasts normalized committed property payload on control end', async () => {
        const GizmoBase = require('../scene-process/service/gizmo/base/gizmo-base').default;
        class TestGizmo extends GizmoBase {
            get nodes() {
                return [{ uuid: 'Hero' }];
            }
        }

        await new (TestGizmo as any)(null).onControlEnd('_components.0.size');

        expect(broadcasts).toContainEqual(['gizmo:control-end', '_components.0.size']);
        expect(broadcasts).toContainEqual(['animation:property-committed', {
            nodePath: 'Canvas/Hero',
            propPath: '__comps__.0.size',
            source: 'engine',
        }]);
    });

    it('still broadcasts animation commit when the legacy gizmo end event fails', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const { ServiceEvents } = require('../scene-process/service/core/global-events');
        const originalBroadcast = ServiceEvents.broadcast.bind(ServiceEvents);
        const broadcastSpy = jest.spyOn(ServiceEvents, 'broadcast').mockImplementation((event: unknown, ...args: unknown[]) => {
            if (event === 'gizmo:control-end') {
                throw new Error('legacy gizmo broadcast failed');
            }
            return originalBroadcast(event as string, ...args);
        });
        const GizmoBase = require('../scene-process/service/gizmo/base/gizmo-base').default;
        class TestGizmo extends GizmoBase {
            get nodes() {
                return [{ uuid: 'Hero' }];
            }
        }

        try {
            await new (TestGizmo as any)(null).onControlEnd('position');

            expect(warnSpy).toHaveBeenCalled();
            expect(broadcasts).toContainEqual(['animation:property-committed', {
                nodePath: 'Canvas/Hero',
                propPath: 'position',
                source: 'engine',
            }]);
        } finally {
            broadcastSpy.mockRestore();
            warnSpy.mockRestore();
        }
    });

    it('waits for the scene undo recording before broadcasting animation commit', async () => {
        endRecordingPromise = new Promise((resolve) => {
            endRecordingResolve = () => resolve(undefined);
        });
        const GizmoBase = require('../scene-process/service/gizmo/base/gizmo-base').default;
        class TestGizmo extends GizmoBase {
            get nodes() {
                return [{ uuid: 'Hero' }];
            }
        }

        const gizmo = new (TestGizmo as any)(null);
        gizmo.onControlBegin('position');
        const { Service } = require('../scene-process/service/core/decorator');
        expect(Service.Undo.beginRecording).toHaveBeenCalledWith(['Hero'], {
            label: 'Gizmo position',
            scope: {
                editorType: 'scene',
                nodePath: 'Canvas/Hero',
                propPath: 'position',
            },
        });
        const controlEnd = gizmo.onControlEnd('position');

        await Promise.resolve();
        expect(broadcasts).not.toContainEqual(['animation:property-committed', {
            nodePath: 'Canvas/Hero',
            propPath: 'position',
            source: 'engine',
        }]);

        endRecordingResolve?.();
        await controlEnd;

        expect(broadcasts).toContainEqual(['animation:property-committed', {
            nodePath: 'Canvas/Hero',
            propPath: 'position',
            source: 'engine',
        }]);
    });

    it('preserves the animation commit target when the gizmo target is detached during async undo', async () => {
        endRecordingPromise = new Promise((resolve) => {
            endRecordingResolve = () => resolve(undefined);
        });
        const { Component } = require('cc');
        const GizmoBase = require('../scene-process/service/gizmo/base/gizmo-base').default;
        const target = new Component();
        target.node.uuid = 'JointNode';
        const gizmo = new GizmoBase(target);
        const propPath = '_components.0.anchor';

        gizmo.onControlBegin(propPath);
        const controlEnd = gizmo.onControlEnd(propPath);
        gizmo.target = null;
        const { Service } = require('../scene-process/service/core/decorator');

        await Promise.resolve();
        expect(Service.Undo.endRecording).toHaveBeenCalledTimes(1);
        expect(broadcasts).not.toContainEqual(['animation:property-committed', {
            nodePath: 'Canvas/JointNode',
            propPath: '__comps__.0.anchor',
            source: 'engine',
        }]);

        endRecordingResolve?.();
        await controlEnd;

        expect(Service.Undo.endRecording).toHaveBeenCalledTimes(1);
        expect(broadcasts.filter(([event]) => event === 'animation:property-committed')).toEqual([
            ['animation:property-committed', {
                nodePath: 'Canvas/JointNode',
                propPath: '__comps__.0.anchor',
                source: 'engine',
            }],
        ]);
    });

    it('records and commits a normalized Joint2D anchor component scope', async () => {
        const GizmoBase = require('../scene-process/service/gizmo/base/gizmo-base').default;
        class TestGizmo extends GizmoBase {
            get nodes() {
                return [{ uuid: 'JointNode' }];
            }
        }
        const gizmo = new (TestGizmo as any)(null);
        const propPath = '_components.0.anchor';

        gizmo.onControlUpdate(propPath);
        gizmo.onControlUpdate(propPath);
        const { Service } = require('../scene-process/service/core/decorator');
        expect(Service.Undo.beginRecording).toHaveBeenCalledTimes(1);
        expect(Service.Undo.beginRecording).toHaveBeenCalledWith(['JointNode'], {
            label: 'Gizmo _components.0.anchor',
            scope: {
                editorType: 'scene',
                nodePath: 'Canvas/JointNode',
                propPath: '__comps__.0.anchor',
            },
        });

        await gizmo.onControlEnd(propPath);

        expect(Service.Undo.endRecording).toHaveBeenCalledTimes(1);
        expect(broadcasts).toContainEqual(['animation:property-committed', {
            nodePath: 'Canvas/JointNode',
            propPath: '__comps__.0.anchor',
            source: 'engine',
        }]);
    });

    it('records one Box primary property scope and commits a single animation property', async () => {
        const GizmoBase = require('../scene-process/service/gizmo/base/gizmo-base').default;
        class TestGizmo extends GizmoBase {
            get nodes() {
                return [{ uuid: 'BoxColliderNode' }];
            }
        }
        const gizmo = new (TestGizmo as any)(null);
        const propPath = '_components.0.size';

        gizmo.onControlUpdate(propPath);
        gizmo.onControlUpdate(propPath);
        const { Service } = require('../scene-process/service/core/decorator');
        expect(Service.Undo.beginRecording).toHaveBeenCalledTimes(1);
        expect(Service.Undo.beginRecording).toHaveBeenCalledWith(['BoxColliderNode'], {
            label: 'Gizmo _components.0.size',
            scope: {
                editorType: 'scene',
                nodePath: 'Canvas/BoxColliderNode',
                propPath: '__comps__.0.size',
            },
        });

        await gizmo.onControlEnd('_components.0.size');

        expect(Service.Undo.endRecording).toHaveBeenCalledTimes(1);
        expect(broadcasts).toContainEqual(['gizmo:control-end', '_components.0.size']);
        expect(broadcasts.filter(([event]) => event === 'animation:property-committed')).toEqual([
            ['animation:property-committed', {
                nodePath: 'Canvas/BoxColliderNode',
                propPath: '__comps__.0.size',
                source: 'engine',
            }],
        ]);
    });

    it('does not end the same recording twice when destroy races an async control end', async () => {
        endRecordingPromise = new Promise((resolve) => {
            endRecordingResolve = () => resolve(undefined);
        });
        const GizmoBase = require('../scene-process/service/gizmo/base/gizmo-base').default;
        class TestGizmo extends GizmoBase {
            get nodes() {
                return [{ uuid: 'JointNode' }];
            }
        }
        const gizmo = new (TestGizmo as any)(null);
        gizmo.onControlBegin('_components.0.connectedAnchor');

        const controlEnd = gizmo.onControlEnd('_components.0.connectedAnchor');
        gizmo.destroy();
        const { Service } = require('../scene-process/service/core/decorator');
        expect(Service.Undo.endRecording).toHaveBeenCalledTimes(1);

        endRecordingResolve?.();
        await controlEnd;
        expect(Service.Undo.endRecording).toHaveBeenCalledTimes(1);
    });

    it('restores all snapshot changes under one primary scope and isolates the next gesture', async () => {
        const { SceneUndoManager } = require('../scene-process/service/undo/scene-undo-manager');
        let state = { size: 10, offset: 0 };
        const manager = new SceneUndoManager({
            snapshotAdapter: {
                capture: () => new Map([['Box', { ...state }]]),
                apply: (snapshot: Map<string, typeof state>) => {
                    state = { ...snapshot.get('Box')! };
                    return { success: true };
                },
                equals: (a: Map<string, typeof state>, b: Map<string, typeof state>) => JSON.stringify([...a]) === JSON.stringify([...b]),
            },
        });
        const { Service } = require('../scene-process/service/core/decorator');
        const begin = Service.Undo.beginRecording.getMockImplementation();
        const end = Service.Undo.endRecording.getMockImplementation();
        Service.Undo.beginRecording.mockImplementation((uuids: string[], options: unknown) => manager.beginRecording(uuids, options));
        Service.Undo.endRecording.mockImplementation((id: string) => manager.endRecording(id));
        const GizmoBase = require('../scene-process/service/gizmo/base/gizmo-base').default;
        class TestGizmo extends GizmoBase {
            get nodes() { return [{ uuid: 'Box' }]; }
        }
        try {
            const checkpoint = manager.createCheckpoint();
            const gizmo = new (TestGizmo as any)(null);
            gizmo.onControlUpdate('_components.0.size');
            state.size = 14;
            gizmo.onControlUpdate('_components.0.size');
            state = { size: 16, offset: 3 };
            await gizmo.onControlEnd('_components.0.size');
            expect(Service.Undo.beginRecording).toHaveBeenCalledTimes(1);
            expect(manager.getHistoryForTesting()).toHaveLength(1);
            expect(manager.hasScopedDifference(checkpoint, { propPath: '__comps__.0.offset' })).toBe(false);
            expect(manager.hasScopedDifference(checkpoint, { propPath: '__comps__.0.size' })).toBe(true);
            expect(broadcasts.filter(([event]) => event === 'animation:property-committed')).toEqual([
                ['animation:property-committed', {
                    nodePath: 'Canvas/Box', propPath: '__comps__.0.size', source: 'engine',
                }],
            ]);
            expect(await manager.undo({ scope: { propPath: '__comps__.0.size' } })).toMatchObject({ success: true });
            expect(state).toEqual({ size: 10, offset: 0 });
            expect(await manager.redo({ scope: { propPath: '__comps__.0.size' } })).toMatchObject({ success: true });
            expect(state).toEqual({ size: 16, offset: 3 });
            gizmo.onControlUpdate('_components.0.offset');
            state.offset = 6;
            await gizmo.onControlEnd('_components.0.offset');
            expect(manager.getHistoryForTesting()[0].meta.scope).toEqual({
                editorType: 'scene', nodePath: 'Canvas/Box', propPath: '__comps__.0.size',
            });
            expect(manager.getHistoryForTesting()[1].meta.scope).toEqual({
                editorType: 'scene', nodePath: 'Canvas/Box', propPath: '__comps__.0.offset',
            });
        } finally {
            Service.Undo.beginRecording.mockImplementation(begin);
            Service.Undo.endRecording.mockImplementation(end);
        }
    });

    it('returns null when the target is absent from the node component list', () => {
        const { Component } = require('cc');
        const GizmoBase = require('../scene-process/service/gizmo/base/gizmo-base').default;
        const target = new Component();
        target.node._components = [];
        const gizmo = new GizmoBase(target);

        expect(gizmo.getCompPropPath('anchor')).toBeNull();

        target.node._components.push(target);
        expect(gizmo.getCompPropPath('anchor')).toBe('_components.0.anchor');
    });

    it('emits a component-changed node event when a component gizmo updates data', () => {
        const { globalEventEmitter } = require('../scene-process/service/core/global-events');
        const { NodeEventType } = require('../common');
        const changes: unknown[][] = [];
        globalEventEmitter.on('node:change', (...args: unknown[]) => {
            changes.push(args);
        });
        const GizmoBase = require('../scene-process/service/gizmo/base/gizmo-base').default;
        class TestGizmo extends GizmoBase {
            emitComponentChanged(node: any) {
                this.onComponentChanged(node);
            }
        }
        const node = { uuid: 'Light' };

        new (TestGizmo as any)(null).emitComponentChanged(node);

        expect(changes).toEqual([
            [node, { type: NodeEventType.COMPONENT_CHANGED }],
        ]);
    });
});
