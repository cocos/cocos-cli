const broadcasts: Array<[string, unknown]> = [];
let endRecordingPromise: Promise<unknown> | null = null;
let endRecordingResolve: (() => void) | null = null;

jest.mock('cc', () => {
    class Node {
        uuid = 'node-uuid';
    }
    class Component {
        node = new Node();
    }
    return { Component, Node };
});

jest.mock('../scene-process/service/core/decorator', () => ({
    Service: {
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
