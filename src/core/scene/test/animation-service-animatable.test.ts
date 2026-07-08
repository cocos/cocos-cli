export {};

const mockAttr = jest.fn();

jest.mock('cc', () => {
    class Component { }
    class Renderer extends Component { }
    class Color {
        constructor(
            public r = 0,
            public g = 0,
            public b = 0,
            public a = 255,
        ) { }
    }
    class Vec2 {
        constructor(public x = 0, public y = 0) { }
    }
    class Vec3 {
        constructor(public x = 0, public y = 0, public z = 0) { }
    }
    class Vec4 {
        constructor(public x = 0, public y = 0, public z = 0, public w = 0) { }
    }
    class Mat4 { }
    class Rect {
        constructor(
            public x = 0,
            public y = 0,
            public width = 0,
            public height = 0,
        ) { }
    }
    class Node {
        components: Component[] = [];
        children: Node[] = [];
        name = '';

        constructor(name = '') {
            this.name = name;
        }

        getChildByPath(path: string) {
            return path ? this.children.find((child) => child.name === path) || null : this;
        }
    }
    class Scene extends Node { }
    class Animation extends Component { }
    class SkeletalAnimation extends Animation { }
    class AnimationClip {
        static WrapMode = { Reverse: 1 };
        sample = 60;
        _tracks: any[] = [];

        addTrack(track: any) {
            this._tracks.push(track);
        }

        getTrack(index: number) {
            return this._tracks[index];
        }

        removeTrack(index: number) {
            this._tracks.splice(index, 1);
        }
    }
    const gfx = {
        Type: {
            FLOAT: 13,
            FLOAT2: 14,
            FLOAT3: 15,
            FLOAT4: 16,
            MAT4: 24,
            SAMPLER1D: 27,
            SAMPLER2D: 28,
            SAMPLER_CUBE: 31,
        },
    };
    class ComponentPath {
        constructor(public component: string) { }
    }
    class HierarchyPath {
        constructor(public path: string) { }
    }
    class TrackPath {
        private _paths: any[] = [];

        get length() {
            return this._paths.length;
        }

        toHierarchy(path: string) {
            this._paths.push(new HierarchyPath(path));
            return this;
        }

        toComponent(component: string) {
            this._paths.push(new ComponentPath(component));
            return this;
        }

        toProperty(name: string) {
            this._paths.push(name);
            return this;
        }

        toElement(index: number) {
            this._paths.push(index);
            return this;
        }

        isHierarchyAt(index: number) {
            return this._paths[index] instanceof HierarchyPath;
        }

        parseHierarchyAt(index: number) {
            return this._paths[index].path;
        }

        isComponentAt(index: number) {
            return this._paths[index] instanceof ComponentPath;
        }

        parseComponentAt(index: number) {
            return this._paths[index].component;
        }

        isPropertyAt(index: number) {
            return typeof this._paths[index] === 'string';
        }

        parsePropertyAt(index: number) {
            return this._paths[index];
        }

        isElementAt(index: number) {
            return typeof this._paths[index] === 'number';
        }

        parseElementAt(index: number) {
            return this._paths[index];
        }
    }
    class Curve {
        keyFramesCount = 0;
        private _keyframes: any[] = [];

        assignSorted(keyframes: any[]) {
            this._keyframes = keyframes;
            this.keyFramesCount = keyframes.length;
        }

        keyframes() {
            return this._keyframes;
        }
    }
    class Track {
        path = new TrackPath();
        proxy: any;
        protected _channels = [{ curve: new Curve() }];

        channels() {
            return this._channels;
        }
    }
    class VectorTrack extends Track {
        set componentsCount(value: number) {
            this._channels = Array.from({ length: value }, () => ({ curve: new Curve() }));
        }
    }
    class ColorTrack extends Track {
        protected _channels = Array.from({ length: 4 }, () => ({ curve: new Curve() }));
    }
    class SizeTrack extends Track {
        protected _channels = Array.from({ length: 2 }, () => ({ curve: new Curve() }));
    }
    class RealTrack extends Track { }
    class QuatTrack extends Track { }
    class ObjectTrack extends Track { }
    class UniformProxyFactory {
        passIndex = 0;
        uniformName = '';
        channelIndex: number | undefined;

        constructor(uniformName?: string, passIndex?: number) {
            this.uniformName = uniformName || '';
            this.passIndex = passIndex || 0;
        }
    }
    class PrimitiveType {
        constructor(public name: string) { }
    }
    (Component as any).__className = 'cc.Component';
    (Node as any).__className = 'cc.Node';
    const classMap: Record<string, any> = {
        'cc.Color': Color,
        'cc.Mat4': Mat4,
        'cc.Rect': Rect,
        'cc.Vec2': Vec2,
        'cc.Vec3': Vec3,
        'cc.Vec4': Vec4,
    };

    return {
        Animation,
        AnimationClip,
        AnimationState: class AnimationState { },
        CCClass: {
            attr: mockAttr,
            Attr: { PrimitiveType },
        },
        Color,
        Component,
        gfx,
        Mat4,
        Node,
        Rect,
        Renderer,
        renderer: {
            Pass: {
                getTypeFromHandle: (handle: number) => handle,
            },
        },
        Scene,
        SkeletalAnimation,
        Vec2,
        Vec3,
        Vec4,
        animation: {
            ColorTrack,
            ObjectTrack,
            QuatTrack,
            RealTrack,
            SizeTrack,
            Track,
            TrackPath,
            UniformProxyFactory,
            VectorTrack,
        },
        editorExtrasTag: '__editorExtras__',
        deserialize(value: any) {
            const ctor = classMap[value?.__type__];
            if (!ctor) {
                return value;
            }
            const result = new ctor();
            Object.assign(result, value);
            delete result.__type__;
            return result;
        },
        js: {
            getClassByName(name: string) {
                return classMap[name] || null;
            },
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
        (global as any).cc = require('cc');
        (global as any).EditorExtends = {
            Node: {},
        };
    });

    it('按旧编辑器规则过滤组件属性的 animatable、visible 和 cc.Node 类型', () => {
        const { Component, Node } = require('cc');
        const { queryComponentAnimableProperties } = require('../scene-process/service/animation/property-metadata');

        class TestComponent extends Component {
            visibleNumber = 1;
            hiddenNumber = 2;
            forcedHiddenNumber = 3;
            disabledNumber = 4;
            nodeRef = {};
            nodeCtorRef = {};
            componentCtorRef = {};
            readonlyNumber = 5;
        }
        (TestComponent as any).__className = 'cc.TestComponent';
        (TestComponent as any).__props__ = [
            'visibleNumber',
            'hiddenNumber',
            'forcedHiddenNumber',
            'disabledNumber',
            'nodeRef',
            'nodeCtorRef',
            'componentCtorRef',
            'readonlyNumber',
        ];

        const attrs: Record<string, any> = {
            visibleNumber: { type: 'cc.Number' },
            hiddenNumber: { type: 'cc.Number', visible: false },
            forcedHiddenNumber: { type: 'cc.Number', visible: false, animatable: true },
            disabledNumber: { type: 'cc.Number', animatable: false },
            nodeRef: { type: 'cc.Node' },
            nodeCtorRef: { type: Node },
            componentCtorRef: { type: Component },
            readonlyNumber: { type: 'cc.Number', readonly: true },
        };
        mockAttr.mockImplementation((_ctor: Function, prop: string) => attrs[prop]);

        const properties = queryComponentAnimableProperties(new TestComponent());
        const keys = properties.map((property: any) => property.key);

        expect(keys).toEqual([
            'cc.TestComponent.visibleNumber',
            'cc.TestComponent.forcedHiddenNumber',
        ]);
    });

    it('过滤 getter-only 的组件 accessor 属性', () => {
        const { Component } = require('cc');
        const { queryComponentAnimableProperties } = require('../scene-process/service/animation/property-metadata');

        class WidgetLike extends Component {
            private _alignLeft = false;

            get isAlignLeft() {
                return this._alignLeft;
            }

            set isAlignLeft(value: boolean) {
                this._alignLeft = value;
            }

            get isStretchWidth() {
                return this._alignLeft;
            }
        }
        (WidgetLike as any).__className = 'cc.WidgetLike';
        (WidgetLike as any).__props__ = ['isAlignLeft', 'isStretchWidth'];

        mockAttr.mockImplementation((_ctor: Function, prop: string) => ({
            type: 'cc.Boolean',
            visible: true,
        }));

        const properties = queryComponentAnimableProperties(new WidgetLike());

        expect(properties.map((property: any) => property.key)).toEqual([
            'cc.WidgetLike.isAlignLeft',
        ]);
    });

    it('按旧编辑器 queryProperties 的实际行为保留组件 type 属性', () => {
        const { Component } = require('cc');
        const { queryComponentAnimableProperties } = require('../scene-process/service/animation/property-metadata');

        class Sprite extends Component {
            type = 0;
            __scriptAsset = null;
        }
        (Sprite as any).__className = 'cc.Sprite';
        (Sprite as any).__props__ = ['type', '__scriptAsset'];

        const enumList = [
            { name: 'SIMPLE', value: 0 },
            { name: 'SLICED', value: 1 },
        ];
        mockAttr.mockImplementation((_target: Function, prop: string) => {
            if (prop === 'type') {
                return { type: 'Enum', enumList, visible: true };
            }
            if (prop === '__scriptAsset') {
                return { type: 'cc.Asset', visible: true };
            }
            return undefined;
        });

        const properties = queryComponentAnimableProperties(new Sprite());

        expect(properties).toEqual([
            expect.objectContaining({
                key: 'cc.Sprite.type',
                name: 'type',
                type: {
                    value: 'Enum',
                    enumList,
                },
            }),
        ]);
    });

    it('按旧编辑器规则展开材质 pass uniform 属性', () => {
        const { Component, gfx } = require('cc');
        const { queryComponentAnimableProperties } = require('../scene-process/service/animation/property-metadata');

        class Sprite extends Component {
            material = {
                passes: [
                    {
                        properties: {
                            mainColor: { editor: { type: 'color' } },
                            mainTexture: {},
                        },
                        getHandle(name: string) {
                            return name === 'mainColor' ? gfx.Type.FLOAT4 : gfx.Type.SAMPLER2D;
                        },
                    },
                ],
            };
        }
        (Sprite as any).__className = 'cc.Sprite';
        (Sprite as any).__props__ = ['material'];

        mockAttr.mockImplementation((_target: Function, prop: string) => prop === 'material'
            ? { type: 'cc.MaterialInstance', visible: true }
            : undefined);

        const properties = queryComponentAnimableProperties(new Sprite());

        expect(properties).toEqual(expect.arrayContaining([
            expect.objectContaining({
                key: 'cc.Sprite.material.pass.0.mainColor',
                displayName: 'cc.Sprite.material.pass[0].mainColor',
                menuName: 'pass[0].mainColor',
                name: 'mainColor',
                type: { value: 'cc.Color' },
                comp: 'cc.Sprite',
            }),
            expect.objectContaining({
                key: 'cc.Sprite.material.pass.0.mainTexture',
                displayName: 'cc.Sprite.material.pass[0].mainTexture',
                menuName: 'pass[0].mainTexture',
                name: 'mainTexture',
                type: { value: 'cc.TextureBase' },
                comp: 'cc.Sprite',
            }),
        ]));
        expect(properties.map((property: any) => property.key)).not.toContain('cc.Sprite.material');
    });

    it('按旧编辑器 Renderer 规则从 sharedMaterials 查询 materials 材质实例', () => {
        const { Renderer, gfx } = require('cc');
        const { queryComponentAnimableProperties } = require('../scene-process/service/animation/property-metadata');

        const materialInstance = {
            passes: [
                {
                    properties: {
                        mainColor: { editor: { type: 'color' } },
                    },
                    getHandle() {
                        return gfx.Type.FLOAT4;
                    },
                },
            ],
        };

        class Sprite extends Renderer {
            sharedMaterials = [];
            get materials() {
                return [materialInstance];
            }
        }
        (Sprite as any).__className = 'cc.Sprite';
        (Sprite as any).__props__ = ['sharedMaterials'];

        mockAttr.mockImplementation((_target: Function, prop: string) => prop === 'sharedMaterials'
            ? { type: 'cc.Material', visible: false }
            : undefined);

        const properties = queryComponentAnimableProperties(new Sprite());

        expect(properties).toEqual([
            expect.objectContaining({
                key: 'cc.Sprite.materials.0.pass.0.mainColor',
                displayName: 'cc.Sprite.materials[0].pass[0].mainColor',
                menuName: 'pass[0].mainColor',
                name: 'mainColor',
                type: { value: 'cc.Color' },
                comp: 'cc.Sprite',
            }),
        ]);
    });

    it('为 Renderer material uniform 查询 metadata 并读取当前 uniform 值', () => {
        const { Color, Node, Renderer, gfx } = require('cc');
        const {
            queryAnimationPropertyMetadata,
        } = require('../scene-process/service/animation/property-metadata');
        const { readPropertyValue } = require('../scene-process/service/animation/scene-node');

        const pass = {
            properties: {
                mainColor: { editor: { type: 'color' } },
            },
            getHandle() {
                return gfx.Type.FLOAT4;
            },
            getUniform(_handle: number, out: any) {
                out.r = 12;
                out.g = 34;
                out.b = 56;
                out.a = 255;
                return out;
            },
        };
        const materialInstance = { passes: [pass] };
        class Sprite extends Renderer {
            sharedMaterials = [];
            get materials() {
                return [materialInstance];
            }
        }
        (Sprite as any).__className = 'cc.Sprite';
        (Sprite as any).__props__ = ['sharedMaterials'];
        mockAttr.mockImplementation((_target: Function, prop: string) => prop === 'sharedMaterials'
            ? { type: 'cc.Material', visible: false }
            : undefined);

        const root = new Node('Root');
        const sprite = new Sprite();
        root.components = [sprite];
        const key = 'cc.Sprite.materials.0.pass.0.mainColor';

        expect(queryAnimationPropertyMetadata(root, '', key)).toEqual({
            type: { value: 'cc.Color' },
            valueCtor: undefined,
        });
        expect(readPropertyValue(root, key)).toBeInstanceOf(Color);
        expect(readPropertyValue(root, key)).toMatchObject({ r: 12, g: 34, b: 56, a: 255 });
    });

    it('创建 material uniform key 时生成带 UniformProxyFactory 的材质轨道', () => {
        const { AnimationClip, animation } = require('cc');
        const { createPropertyKey } = require('../scene-process/service/animation/property-curve');
        const { parsePropertyTrack } = require('../scene-process/service/animation/property-curve-track');

        const clip = new AnimationClip();
        const key = 'cc.Sprite.materials.0.pass.0.mainColor';
        const result = createPropertyKey(clip, {
            rootNode: {} as any,
            rootPath: '',
            queryPropertyMetadata: () => ({
                type: { value: 'cc.Color' },
            }),
        }, {
            type: 'createPropertyKey',
            clipUuid: 'clip',
            propKey: key,
            frame: 0,
            value: { r: 12, g: 34, b: 56, a: 255 },
        });

        expect(result).toBe(true);
        expect(clip._tracks).toHaveLength(1);
        const [track] = clip._tracks;
        expect(track.proxy).toBeInstanceOf(animation.UniformProxyFactory);
        expect(track.proxy).toMatchObject({
            passIndex: 0,
            uniformName: 'mainColor',
        });
        expect(track.path.parseComponentAt(0)).toBe('cc.Sprite');
        expect(track.path.parsePropertyAt(1)).toBe('materials');
        expect(track.path.parseElementAt(2)).toBe(0);
        expect(parsePropertyTrack(track)?.descriptor.propKey).toBe(key);
    });

    it('parsePropertyTrack 忽略没有 path 的引擎轨道', () => {
        const { animation } = require('cc');
        const { parsePropertyTrack } = require('../scene-process/service/animation/property-curve-track');
        const track = new animation.VectorTrack();
        track.path = null;

        expect(parsePropertyTrack(track)).toBeNull();
    });

    it('dumpPropertyCurves 保留属性轨道添加顺序', () => {
        const { AnimationClip } = require('cc');
        const { addPropertyCurve, dumpPropertyCurves } = require('../scene-process/service/animation/property-curve');
        const clip = new AnimationClip();
        const context = {
            rootNode: {} as any,
            rootPath: '',
        };

        expect(addPropertyCurve(clip, context, { type: 'addPropertyCurve', clipUuid: 'clip', propKey: 'position', value: { x: 0, y: 0, z: 0 } })).toBe(true);
        expect(addPropertyCurve(clip, context, { type: 'addPropertyCurve', clipUuid: 'clip', propKey: 'eulerAngles', value: { x: 0, y: 0, z: 0 } })).toBe(true);
        expect(addPropertyCurve(clip, context, { type: 'addPropertyCurve', clipUuid: 'clip', propKey: 'scale', value: { x: 1, y: 1, z: 1 } })).toBe(true);

        expect(dumpPropertyCurves(clip).map((curve: any) => curve.key)).toEqual([
            'position',
            'eulerAngles',
            'scale',
        ]);
    });

    it('按旧编辑器规则把 object track 的 ccClass dump 还原为实例', () => {
        const { AnimationClip, Rect } = require('cc');
        const { createPropertyKey, dumpPropertyCurves } = require('../scene-process/service/animation/property-curve');
        const queryPropertyMetadata = () => ({
            type: { value: 'cc.Rect' },
            valueCtor: Rect,
        });

        const clip = new AnimationClip();
        const result = createPropertyKey(clip, {
            rootNode: {} as any,
            rootPath: '',
            queryPropertyMetadata,
        }, {
            type: 'createPropertyKey',
            clipUuid: 'clip',
            propKey: 'cc.Test.rect',
            frame: 0,
            value: { x: 1, y: 2, width: 3, height: 4 },
        });

        expect(result).toBe(true);
        const value = clip._tracks[0].channels()[0].curve.keyframes()[0][1];
        expect(value).toBeInstanceOf(Rect);
        expect(value).toMatchObject({ x: 1, y: 2, width: 3, height: 4 });

        const dumpValue = dumpPropertyCurves(clip, { queryPropertyMetadata })[0].keyframes[0].dump.value;
        expect(dumpValue).not.toBeInstanceOf(Rect);
        expect(dumpValue).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    });

    it('读取 material sampler uniform 时使用 pass index', () => {
        const { Node, Renderer, gfx } = require('cc');
        const { readPropertyValue } = require('../scene-process/service/animation/scene-node');

        const passes = [0, 1].map(() => ({
            properties: {
                mainTexture: {},
            },
            getHandle() {
                return gfx.Type.SAMPLER2D;
            },
        }));
        const textures = [{ name: 'pass0' }, { name: 'pass1' }];
        const materialInstance = {
            passes,
            getProperty: jest.fn((_name: string, passIndex?: number) => textures[passIndex ?? 0]),
        };
        class Sprite extends Renderer {
            get materials() {
                return [materialInstance];
            }
        }
        (Sprite as any).__className = 'cc.Sprite';

        const root = new Node('Root');
        root.components = [new Sprite()];

        expect(readPropertyValue(root, 'cc.Sprite.materials.0.pass.1.mainTexture')).toBe(textures[1]);
        expect(materialInstance.getProperty).toHaveBeenCalledWith('mainTexture', 1);
    });

    it('读取 material sampler uniform 时按 pass property type 兼容缺失的 handle type API', () => {
        const { Node, Renderer, gfx, renderer } = require('cc');
        const { readPropertyValue } = require('../scene-process/service/animation/scene-node');
        const originalGetTypeFromHandle = renderer.Pass.getTypeFromHandle;

        renderer.Pass.getTypeFromHandle = undefined;
        try {
            const passes = [0, 1].map(() => ({
                properties: {
                    mainTexture: { type: gfx.Type.SAMPLER2D },
                },
                getHandle() {
                    return 1;
                },
            }));
            const textures = [{ name: 'pass0' }, { name: 'pass1' }];
            const materialInstance = {
                passes,
                getProperty: jest.fn((_name: string, passIndex?: number) => textures[passIndex ?? 0]),
            };
            class Sprite extends Renderer {
                get materials() {
                    return [materialInstance];
                }
            }
            (Sprite as any).__className = 'cc.Sprite';

            const root = new Node('Root');
            root.components = [new Sprite()];

            expect(readPropertyValue(root, 'cc.Sprite.materials.0.pass.1.mainTexture')).toBe(textures[1]);
            expect(materialInstance.getProperty).toHaveBeenCalledWith('mainTexture', 1);
        } finally {
            renderer.Pass.getTypeFromHandle = originalGetTypeFromHandle;
        }
    });

    it('按旧编辑器 type map 兼容 lowercase primitive material uniform type', () => {
        const { Renderer } = require('cc');
        const { queryComponentAnimableProperties } = require('../scene-process/service/animation/property-metadata');

        const materialInstance = {
            passes: [
                {
                    properties: {
                        threshold: { type: 'number' },
                    },
                },
            ],
        };
        class Sprite extends Renderer {
            get materials() {
                return [materialInstance];
            }
            sharedMaterials = [];
        }
        (Sprite as any).__className = 'cc.Sprite';
        (Sprite as any).__props__ = ['sharedMaterials'];

        mockAttr.mockImplementation((_target: Function, prop: string) => prop === 'sharedMaterials'
            ? { type: 'cc.Material', visible: false }
            : undefined);

        expect(queryComponentAnimableProperties(new Sprite())).toEqual([
            expect.objectContaining({
                key: 'cc.Sprite.materials.0.pass.0.threshold',
                type: { value: 'cc.Number' },
            }),
        ]);
    });

    it('从 accessor 当前值推导 UITransform 这类组件属性类型', () => {
        const { Component } = require('cc');
        const { queryComponentAnimableProperties } = require('../scene-process/service/animation/property-metadata');

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

        const properties = queryComponentAnimableProperties(new UITransform());

        expect(properties).toEqual(expect.arrayContaining([
            expect.objectContaining({ key: 'cc.UITransform.contentSize', type: { value: 'cc.Size' } }),
            expect.objectContaining({ key: 'cc.UITransform.anchorPoint', type: { value: 'cc.Vec2' } }),
        ]));
    });

    it('从 attr.ctor 推导当前值为空的 asset 引用属性类型', () => {
        const { Component } = require('cc');
        const { queryComponentAnimableProperties } = require('../scene-process/service/animation/property-metadata');

        class SpriteFrame { }
        (SpriteFrame as any).__className = 'cc.SpriteFrame';

        class AssetRefComponent extends Component {
            icon = null;
        }
        (AssetRefComponent as any).__className = 'cc.AssetRefComponent';
        (AssetRefComponent as any).__props__ = ['icon'];

        mockAttr.mockImplementation((_target: Function, prop: string) => prop === 'icon'
            ? { type: 'Object', ctor: SpriteFrame, visible: true }
            : undefined);

        const properties = queryComponentAnimableProperties(new AssetRefComponent());

        expect(properties).toEqual(expect.arrayContaining([
            expect.objectContaining({ key: 'cc.AssetRefComponent.icon', type: { value: 'cc.SpriteFrame' } }),
        ]));
    });

    it('从 attr 保留 enumList 元数据', () => {
        const { Component } = require('cc');
        const { queryComponentAnimableProperties } = require('../scene-process/service/animation/property-metadata');

        class EnumComponent extends Component {
            mode = 1;
        }
        (EnumComponent as any).__className = 'cc.EnumComponent';
        (EnumComponent as any).__props__ = ['mode'];

        const enumList = [
            { name: 'None', value: 0 },
            { name: 'Add', value: 1 },
        ];
        mockAttr.mockImplementation((_target: Function, prop: string) => prop === 'mode'
            ? { type: 'Enum', enumList, visible: true }
            : undefined);

        const properties = queryComponentAnimableProperties(new EnumComponent());

        expect(properties).toEqual([
            expect.objectContaining({
                key: 'cc.EnumComponent.mode',
                type: {
                    value: 'Enum',
                    enumList,
                },
            }),
        ]);
    });

    it('只为 Enum 类型暴露 enumList 元数据', () => {
        const { Component } = require('cc');
        const { queryComponentAnimableProperties } = require('../scene-process/service/animation/property-metadata');

        class NumberComponent extends Component {
            amount = 1;
        }
        (NumberComponent as any).__className = 'cc.NumberComponent';
        (NumberComponent as any).__props__ = ['amount'];

        mockAttr.mockImplementation((_target: Function, prop: string) => prop === 'amount'
            ? { type: 'cc.Number', enumList: [{ name: 'Ignored', value: 1 }], visible: true }
            : undefined);

        const properties = queryComponentAnimableProperties(new NumberComponent());

        expect(properties).toEqual([
            expect.objectContaining({
                key: 'cc.NumberComponent.amount',
                type: { value: 'cc.Number' },
            }),
        ]);
    });
});
