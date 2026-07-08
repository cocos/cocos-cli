export {};

const mockAttr = jest.fn();
const mockNodePositionSetter = jest.fn();

jest.mock('cc', () => {
    function createValueType<T extends Record<string, any>>(value: T): T & { clone: () => T; set: jest.Mock } {
        const result = { ...value } as T & { clone: () => T; set: jest.Mock };
        result.clone = () => {
            const { clone, set, ...plain } = result;
            return createValueType(plain as unknown as T);
        };
        result.set = jest.fn((next) => Object.assign(result, next));
        return result;
    }

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
        private _position = createValueType({ x: 0, y: 0, z: 0 });
        rotation = { clone: () => ({ x: 0, y: 0, z: 0, w: 1 }), set: jest.fn() };
        scale = { clone: () => ({ x: 1, y: 1, z: 1 }), set: jest.fn() };

        get position() {
            return this._position;
        }

        set position(value) {
            mockNodePositionSetter(value);
            this._position = value;
        }
    }

    return {
        Animation,
        Asset,
        CCClass: { attr: mockAttr },
        Component,
        Node,
        animation: {},
        __test: { mockNodePositionSetter },
    };
});

describe('Animation sampled state', () => {
    beforeEach(() => {
        jest.resetModules();
        mockAttr.mockReset();
        mockNodePositionSetter.mockReset();
    });

    it('restores node transform through the property setter instead of mutating the current value type in place', async () => {
        const { Node, __test } = require('cc');
        const {
            captureAnimationSampledState,
            restoreAnimationSampledState,
        } = require('../scene-process/service/animation/sampled-state');

        const node = new Node();
        node.uuid = 'node';
        node.position = { x: 148.3992, y: 0, z: 0, clone: () => ({ x: 148.3992, y: 0, z: 0 }), set: jest.fn() };
        const state = captureAnimationSampledState(node);
        __test.mockNodePositionSetter.mockClear();

        node.position = { x: 694.70697, y: 0, z: 0, clone: () => ({ x: 694.70697, y: 0, z: 0 }), set: jest.fn() };
        __test.mockNodePositionSetter.mockClear();

        await restoreAnimationSampledState(node, state);

        expect(__test.mockNodePositionSetter).toHaveBeenCalledTimes(1);
        expect(node.position.x).toBeCloseTo(148.3992);
    });

    it('restores component value-type properties through their property setter', async () => {
        const { Component, Node } = require('cc');
        const {
            captureAnimationSampledState,
            restoreAnimationSampledState,
        } = require('../scene-process/service/animation/sampled-state');

        type TintValue = {
            r: number;
            g: number;
            b: number;
            a: number;
            clone: () => TintValue;
            set: jest.Mock;
        };
        function createTintValue(value: { r: number; g: number; b: number; a: number }): TintValue {
            const tint = {
                ...value,
                clone: null as unknown as () => TintValue,
                set: null as unknown as jest.Mock,
            } as TintValue;
            tint.clone = () => createTintValue({ r: tint.r, g: tint.g, b: tint.b, a: tint.a });
            tint.set = jest.fn((next) => Object.assign(tint, next));
            return tint;
        }

        const setter = jest.fn();
        class TintComponent extends Component {
            uuid = 'tint-component';
            private _tint = createTintValue({ r: 10, g: 20, b: 30, a: 255 });

            get tint() {
                return this._tint;
            }

            set tint(value) {
                setter(value);
                this._tint = value;
            }
        }
        (TintComponent as any).__props__ = ['tint'];

        mockAttr.mockImplementation((_ctor: Function, prop: string) => prop === 'tint'
            ? { animatable: true, readonly: false }
            : undefined);

        const node = new Node();
        node.uuid = 'node';
        const component = new TintComponent();
        component.node = node;
        node.components = [component];

        const state = captureAnimationSampledState(node);
        component.tint = createTintValue({ r: 200, g: 20, b: 30, a: 255 });
        setter.mockClear();

        await restoreAnimationSampledState(node, state);

        expect(setter).toHaveBeenCalledTimes(1);
        expect(component.tint.r).toBe(10);
    });

    it('skips getter-only component accessor properties in sampled state restore', async () => {
        const { Component, Node } = require('cc');
        const {
            captureAnimationSampledState,
            restoreAnimationSampledState,
        } = require('../scene-process/service/animation/sampled-state');

        class WidgetLike extends Component {
            uuid = 'widget-like';
            private _alignLeft = false;

            get isAlignLeft() {
                return this._alignLeft;
            }

            set isAlignLeft(value: boolean) {
                this._alignLeft = value;
            }

            get isStretchWidth() {
                return true;
            }
        }
        (WidgetLike as any).__props__ = ['isAlignLeft', 'isStretchWidth'];

        mockAttr.mockImplementation((_ctor: Function, prop: string) => prop === 'isAlignLeft' || prop === 'isStretchWidth'
            ? { animatable: true, readonly: false }
            : undefined);

        const node = new Node();
        node.uuid = 'node';
        const component = new WidgetLike();
        component.node = node;
        node.components = [component];

        const state = captureAnimationSampledState(node);

        expect(state.components[0].properties).toEqual({
            isAlignLeft: false,
        });

        await expect(restoreAnimationSampledState(node, {
            ...state,
            components: [{
                uuid: component.uuid,
                properties: {
                    isAlignLeft: true,
                    isStretchWidth: false,
                },
            }],
        })).resolves.toBeUndefined();
        expect(component.isAlignLeft).toBe(true);
        expect(component.isStretchWidth).toBe(true);
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
