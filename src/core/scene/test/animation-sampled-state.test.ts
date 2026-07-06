export {};

const mockAttr = jest.fn();

jest.mock('cc', () => {
    class Asset {
        _uuid: string;

        constructor(uuid = '') {
            this._uuid = uuid;
        }

        clone() {
            return new Asset();
        }
    }

    class Component {
        uuid = '';
        node: unknown;
    }

    class Animation extends Component { }

    class Node {
        uuid = '';
        children: Node[] = [];
        components: Component[] = [];
        active = true;
        position = { clone: () => ({ x: 0, y: 0, z: 0 }), set: jest.fn() };
        rotation = { clone: () => ({ x: 0, y: 0, z: 0, w: 1 }), set: jest.fn() };
        scale = { clone: () => ({ x: 1, y: 1, z: 1 }), set: jest.fn() };
    }

    return {
        Animation,
        Asset,
        CCClass: { attr: mockAttr },
        Component,
        Node,
        animation: {},
    };
});

describe('Animation sampled state', () => {
    beforeEach(() => {
        jest.resetModules();
        mockAttr.mockReset();
    });

    it('restores asset references without cloning them into empty placeholder assets', async () => {
        const { Asset, Component, Node } = require('cc');
        const {
            captureAnimationSampledState,
            restoreAnimationSampledState,
        } = require('../scene-process/service/animation/sampled-state');

        class SpriteComponent extends Component {
            uuid = 'sprite-component';
            spriteFrame = new Asset('sprite-frame-uuid');
        }
        (SpriteComponent as any).__props__ = ['spriteFrame'];

        mockAttr.mockImplementation((_ctor: Function, prop: string) => prop === 'spriteFrame'
            ? { animatable: true, readonly: false }
            : undefined);

        const node = new Node();
        node.uuid = 'node';
        const sprite = new SpriteComponent();
        sprite.node = node;
        node.components = [sprite];

        const state = captureAnimationSampledState(node);
        sprite.spriteFrame = null;

        await restoreAnimationSampledState(node, state);

        expect(sprite.spriteFrame).toBe(state.components[0].properties.spriteFrame);
        expect(sprite.spriteFrame._uuid).toBe('sprite-frame-uuid');
    });
});
