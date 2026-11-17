// Legacy material state schema derived from Creator 3.7's scene asset manager.
// Compiled against the selected 3.7 engine; it does not import a 3.8 implementation.
import { CCInteger, CCString, Color, Enum, _decorator } from '../../cocos/core';
import * as gfx from '../../cocos/core/gfx';
import { RenderPassStage } from '../../cocos/core/pipeline/define';
const pipeline = { RenderPassStage };
function isNumber(value: unknown) { return typeof value === 'number' && !isNaN(value); }
function getEnumData(value: any) { return Object.fromEntries(Object.keys(value).filter(key => !isNumber(Number(key))).map(key => [key, value[key]])); }
const enumMap = (() => {
    const copyAsCCEnum = <T>(e: T) => Enum(getEnumData(e));
    return {
        PrimitiveMode: copyAsCCEnum(gfx.PrimitiveMode),
        RenderPassStage: copyAsCCEnum(pipeline.RenderPassStage),
        DynamicStateFlagBit: copyAsCCEnum(gfx.DynamicStateFlagBit),
        PolygonMode: copyAsCCEnum(gfx.PolygonMode),
        ShadeModel: copyAsCCEnum(gfx.ShadeModel),
        CullMode: copyAsCCEnum(gfx.CullMode),
        ComparisonFunc: copyAsCCEnum(gfx.ComparisonFunc),
        StencilOp: copyAsCCEnum(gfx.StencilOp),
        BlendFactor: copyAsCCEnum(gfx.BlendFactor),
        BlendOp: copyAsCCEnum(gfx.BlendOp),
        ColorMask: copyAsCCEnum(gfx.ColorMask),
    };
})();

// description of pipeline-state.ts class RasterizerState
@_decorator.ccclass('RasterizerState')
class RasterizerState {
    @_decorator.property
    public isDiscard = false;

    @_decorator.property({ type: enumMap.PolygonMode })
    public polygonMode = gfx.PolygonMode.FILL;

    @_decorator.property({ type: enumMap.ShadeModel })
    public shadeModel = gfx.ShadeModel.GOURAND;

    @_decorator.property({ type: enumMap.CullMode })
    public cullMode = gfx.CullMode.BACK;

    @_decorator.property
    public isFrontFaceCCW = true;

    @_decorator.property
    public depthBias = 0;

    @_decorator.property
    public depthBiasClamp = 0.0;

    @_decorator.property
    public depthBiasSlop = 0.0;

    @_decorator.property
    public isDepthClip = true;

    @_decorator.property
    public isMultisample = false;

    @_decorator.property
    public lineWidth = 1.0;
}

// description of pipeline-state.ts class DepthStencilState
@_decorator.ccclass('DepthStencilState')
class DepthStencilState {
    @_decorator.property
    public depthTest = true;

    @_decorator.property
    public depthWrite = true;

    @_decorator.property({ type: enumMap.ComparisonFunc })
    public depthFunc = gfx.ComparisonFunc.LESS;

    @_decorator.property
    public stencilTestFront = false;

    @_decorator.property({ type: enumMap.ComparisonFunc })
    public stencilFuncFront = gfx.ComparisonFunc.ALWAYS;

    @_decorator.property
    public stencilReadMaskFront = 0xffffffff;

    @_decorator.property
    public stencilWriteMaskFront = 0xffffffff;

    @_decorator.property({ type: enumMap.StencilOp })
    public stencilFailOpFront = gfx.StencilOp.KEEP;

    @_decorator.property({ type: enumMap.StencilOp })
    public stencilZFailOpFront = gfx.StencilOp.KEEP;

    @_decorator.property({ type: enumMap.StencilOp })
    public stencilPassOpFront = gfx.StencilOp.KEEP;

    @_decorator.property
    public stencilRefFront = 1;

    @_decorator.property
    public stencilTestBack = false;

    @_decorator.property({ type: enumMap.ComparisonFunc })
    public stencilFuncBack = gfx.ComparisonFunc.ALWAYS;

    @_decorator.property
    public stencilReadMaskBack = 0xffffffff;

    @_decorator.property
    public stencilWriteMaskBack = 0xffffffff;

    @_decorator.property({ type: enumMap.StencilOp })
    public stencilFailOpBack = gfx.StencilOp.KEEP;

    @_decorator.property({ type: enumMap.StencilOp })
    public stencilZFailOpBack = gfx.StencilOp.KEEP;

    @_decorator.property({ type: enumMap.StencilOp })
    public stencilPassOpBack = gfx.StencilOp.KEEP;

    @_decorator.property
    public stencilRefBack = 1;
}

// description of pipeline-state.ts class BlendTarget
@_decorator.ccclass('BlendTarget')
class BlendTarget {
    @_decorator.property
    public blend = false;

    @_decorator.property({ type: enumMap.BlendFactor })
    public blendSrc = gfx.BlendFactor.ONE;

    @_decorator.property({ type: enumMap.BlendFactor })
    public blendDst = gfx.BlendFactor.ZERO;

    @_decorator.property({ type: enumMap.BlendOp })
    public blendEq = gfx.BlendOp.ADD;

    @_decorator.property({ type: enumMap.BlendFactor })
    public blendSrcAlpha = gfx.BlendFactor.ONE;

    @_decorator.property({ type: enumMap.BlendFactor })
    public blendDstAlpha = gfx.BlendFactor.ZERO;

    @_decorator.property({ type: enumMap.BlendOp })
    public blendAlphaEq = gfx.BlendOp.ADD;

    @_decorator.property({ type: enumMap.ColorMask })
    public blendColorMask = gfx.ColorMask.ALL;
}

// description of pipeline-state.ts class BlendState
@_decorator.ccclass('BlendState')
class BlendState {
    @_decorator.property
    public isA2C = false;

    @_decorator.property
    public isIndepend = false;

    @_decorator.property(Color)
    public blendColor = Color.WHITE;

    @_decorator.property([BlendTarget])
    public targets: BlendTarget[] = [];

    public init(blendState: any) {
        let length = 1;
        if (blendState && blendState.targets) {
            length = blendState.targets.length;
        }

        for (let i = 0; i < length; i++) {
            this.targets.push(new BlendTarget());
        }
    }
}

// description of pipeline-state.ts class IPassStates
@_decorator.ccclass('PassStates')
class PassStates {
    @_decorator.property({ type: CCInteger })
    public priority = 128;

    @_decorator.property({ type: enumMap.PrimitiveMode })
    public primitive = gfx.PrimitiveMode.TRIANGLE_LIST;

    @_decorator.property({ type: enumMap.RenderPassStage })
    public stage = pipeline.RenderPassStage.DEFAULT;

    @_decorator.property({ type: RasterizerState })
    public rasterizerState: RasterizerState = new RasterizerState();

    @_decorator.property({ type: DepthStencilState })
    public depthStencilState: DepthStencilState = new DepthStencilState();

    @_decorator.property({ type: BlendState })
    public blendState: BlendState = new BlendState();

    @_decorator.property({ type: [enumMap.DynamicStateFlagBit] })
    public dynamics = [];

    @_decorator.property({ type: [CCString] })
    public customizations = [];

    @_decorator.property
    public phase = '';

    public init(passStateObj: any) {
        this.rasterizerState = new RasterizerState();
        this.depthStencilState = new DepthStencilState();
        this.blendState = new BlendState();
        this.blendState.init(passStateObj.blendState);
    }
}


export { PassStates as PassStatesEditor, RasterizerState as RasterizerStateEditor, DepthStencilState as DepthStencilStateEditor, BlendState as BlendStateEditor, BlendTarget as BlendTargetEditor };
