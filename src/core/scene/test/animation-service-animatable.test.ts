const mockAttr = jest.fn();

jest.mock('cc', () => {
    class Component { }
    class Node { }
    class Scene extends Node { }
    class Animation extends Component { }
    class SkeletalAnimation extends Animation { }
    class AnimationClip {
        static WrapMode = { Reverse: 1 };
    }
    class PrimitiveType {
        constructor(public name: string) { }
    }
    (Node as any).__className = 'cc.Node';

    return {
        Animation,
        AnimationClip,
        AnimationState: class AnimationState { },
        CCClass: {
            attr: mockAttr,
            Attr: { PrimitiveType },
        },
        Component,
        Node,
        Scene,
        SkeletalAnimation,
        animation: {},
        editorExtrasTag: '__editorExtras__',
        js: {
            getClassName(target: any) {
                return target?.__className || target?.constructor?.__className || target?.name || '';
            },
        },
    };
});

jest.mock('cc/editor/embedded-player', () => ({
    EmbeddedAnimationClipPlayable: class EmbeddedAnimationClipPlayable { },
    EmbeddedParticleSystemPlayable: class EmbeddedParticleSystemPlayable { },
    EmbeddedPlayable: class EmbeddedPlayable { },
    EmbeddedPlayer: class EmbeddedPlayer { },
    addEmbeddedPlayerTag: Symbol('addEmbeddedPlayerTag'),
    clearEmbeddedPlayersTag: Symbol('clearEmbeddedPlayersTag'),
    getEmbeddedPlayersTag: Symbol('getEmbeddedPlayersTag'),
}));

describe('AnimationService animatable property metadata', () => {
    beforeEach(() => {
        jest.resetModules();
        mockAttr.mockReset();
        (global as any).EditorExtends = {
            Node: {},
        };
    });

    it('按旧编辑器规则过滤组件属性的 animatable、visible 和 cc.Node 类型', () => {
        const { Component } = require('cc');
        const { AnimationService } = require('../scene-process/service/animation');

        class TestComponent extends Component {
            visibleNumber = 1;
            hiddenNumber = 2;
            forcedHiddenNumber = 3;
            disabledNumber = 4;
            nodeRef = {};
            readonlyNumber = 5;
        }
        (TestComponent as any).__className = 'cc.TestComponent';
        (TestComponent as any).__props__ = [
            'visibleNumber',
            'hiddenNumber',
            'forcedHiddenNumber',
            'disabledNumber',
            'nodeRef',
            'readonlyNumber',
        ];

        const attrs: Record<string, any> = {
            visibleNumber: { type: 'cc.Number' },
            hiddenNumber: { type: 'cc.Number', visible: false },
            forcedHiddenNumber: { type: 'cc.Number', visible: false, animatable: true },
            disabledNumber: { type: 'cc.Number', animatable: false },
            nodeRef: { type: 'cc.Node' },
            readonlyNumber: { type: 'cc.Number', readonly: true },
        };
        mockAttr.mockImplementation((_ctor: Function, prop: string) => attrs[prop]);

        const service = new AnimationService();
        const properties = (service as any)._queryComponentAnimableProperties(new TestComponent());
        const keys = properties.map((property: any) => property.key);

        expect(keys).toEqual([
            'cc.TestComponent.visibleNumber',
            'cc.TestComponent.forcedHiddenNumber',
        ]);
    });

    it('从 accessor 当前值推导 UITransform 这类组件属性类型', () => {
        const { Component } = require('cc');
        const { AnimationService } = require('../scene-process/service/animation');

        class SizeValue { }
        class Vec2Value { }
        (SizeValue as any).__className = 'cc.Size';
        (Vec2Value as any).__className = 'cc.Vec2';

        class UITransform extends Component {
            contentSize = new SizeValue();
            anchorPoint = new Vec2Value();
        }
        (UITransform as any).__className = 'cc.UITransform';
        (UITransform as any).__props__ = ['contentSize', 'anchorPoint'];

        const attrs: Record<string, any> = {
            contentSize: { visible: true },
            anchorPoint: { visible: true },
        };
        mockAttr.mockImplementation((_ctor: Function, prop: string) => attrs[prop]);

        const service = new AnimationService();
        const properties = (service as any)._queryComponentAnimableProperties(new UITransform());

        expect(properties).toEqual(expect.arrayContaining([
            expect.objectContaining({ key: 'cc.UITransform.contentSize', type: { value: 'cc.Size' } }),
            expect.objectContaining({ key: 'cc.UITransform.anchorPoint', type: { value: 'cc.Vec2' } }),
        ]));
    });
});
