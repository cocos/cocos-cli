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
});
