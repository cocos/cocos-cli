const broadcasts: Array<[string, unknown]> = [];

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
        broadcast: (event: string, payload: unknown) => broadcasts.push([event, payload]),
    },
}));

describe('GizmoBase animation property commit event', () => {
    beforeEach(() => {
        broadcasts.length = 0;
        const { globalEventEmitter } = require('../scene-process/service/core/global-events');
        globalEventEmitter.removeAllListeners('animation:property-committed');
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
        globalEventEmitter.removeAllListeners('animation:property-committed');
    });

    it('broadcasts normalized committed property payload on control end', () => {
        const GizmoBase = require('../scene-process/service/gizmo/base/gizmo-base').default;
        class TestGizmo extends GizmoBase {
            get nodes() {
                return [{ uuid: 'Hero' }];
            }
        }

        new (TestGizmo as any)(null).onControlEnd('_components.0.size');

        expect(broadcasts).toContainEqual(['gizmo:control-end', '_components.0.size']);
        expect(broadcasts).toContainEqual(['animation:property-committed', {
            nodePath: 'Canvas/Hero',
            propPath: '__comps__.0.size',
            source: 'engine',
        }]);
    });
});
