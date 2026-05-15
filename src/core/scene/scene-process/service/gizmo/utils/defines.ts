import { Vec3, Vec2, primitives, Node, Color, MeshRenderer, IVec3Like, Event as CCEvent } from 'cc';

export interface IMeshPrimitive {
    primitiveType?: number; // 图元类型
    positions: Readonly<IVec3Like>[]; // 顶点坐标
    normals?: Vec3[]; // 法线
    uvs?: Vec2[]; // uv坐标
    indices?: number[]; // 顶点索引
    minPos?: Vec3; // 最小位置
    maxPos?: Vec3; // 最大位置
    boundingRadius?: number;
    doubleSided?: boolean; // 是否开启模型的双面检测，用于射线检测
}

export class DynamicMeshPrimitive implements IMeshPrimitive {
    boundingRadius?: number;
    doubleSided?: boolean;
    indices?: number[];
    maxPos?: Vec3;
    minPos?: Vec3;
    normals?: Vec3[];
    positions: Readonly<IVec3Like>[];
    primitiveType?: number;
    uvs?: Vec2[];

    constructor(primitive: IMeshPrimitive) {
        this.boundingRadius = primitive.boundingRadius;
        this.doubleSided = primitive.doubleSided;
        this.indices = primitive.indices;
        this.maxPos = primitive.maxPos;
        this.minPos = primitive.minPos;
        this.normals = primitive.normals;
        this.positions = primitive.positions;
        this.primitiveType = primitive.primitiveType;
        this.uvs = primitive.uvs;
    }

    transformToDynamicGeometry(): primitives.IDynamicGeometry {
        return {
            primitiveMode: this.primitiveType,
            positions: flatPosition(this.positions),
            indices32: Uint32Array.from(this.indices ?? []),
            minPos: this.minPos,
            maxPos: this.maxPos,
        };
    }
}

export interface ICreateMeshOption {
    dashed?: boolean; // 使用虚线
}

export interface IMaterialOption {
    /** 使用的effect名字 */
    effectName?: string;
    /** 剔除类型 */
    cullMode?: number;
    /** 图元类型 */
    primitive?: number;
    /** 渲染优先级 */
    priority?: number;
    /** 透明度值 */
    alpha?: number;
    /** 使用第几个technique */
    technique?: number;
    /** 使用无光照的technique */
    unlit?: boolean;
    /** 使用带贴图的technique */
    texture?: boolean;
    /** 使用纯颜色的 technique */
    pureColor?: boolean;
    /** 使用不进行深度测试的technique */
    noDepthTestForLines?: boolean;
    /** 使用深度测试的technique */
    depthTestForTriangles?: boolean;
    /** 使用虚线 */
    dashed?: boolean;
    /** 使用球谐渲染 */
    useLightProbe?: boolean;
}

export interface IAddMeshToNodeOption extends IMaterialOption {
    forwardPipeline?: boolean; // 是否使用前向渲染管线
    /** 节点名称 */
    name?: string;
    instancing?: boolean; // 是否开启instancing以使用合批渲染
    /** 深度模板状态覆盖 */
    depthStencilState?: Record<string, any>;
}

export interface IAddQuadToNodeOptions extends IAddMeshToNodeOption {
    needBoundingBox?: boolean;
}

export interface IAddLineToNodeOptions extends IAddMeshToNodeOption {
    bodyBBSize?: number;
}

export interface IRectangleControllerOption {
    needAnchor?: boolean; // 是否需要中间的anchor控制点
}

export interface IHandleData {
    name: string; // handle名字
    topNode: Node; // 最外层节点
    rendererNodes: Node[]; // 组成handle的所有渲染节点
    oriColors: Color[]; // 原始颜色
    oriOpacities: number[]; // 原始透明度
    normalTorusNode: Node | null;
    indicatorCircle: Node | null;
    arrowNode: Node | null;
    normalTorusMR: MeshRenderer | null;
    panPlane: Node | null;
    customData: any;
}

/**
 * 简化版 GizmoMouseEvent
 * 编辑器版本继承自 CCEvent，此处作为独立的纯数据类
 */
export class GizmoMouseEvent<T extends Record<string, any> = {}> extends CCEvent {
    ctrlKey = false;
    shiftKey = false;
    altKey = false;
    metaKey = false;

    x = 0;
    y = 0;
    clientX = 0;
    clientY = 0;
    deltaX = 0;
    deltaY = 0;
    wheelDeltaX = 0;
    wheelDeltaY = 0;
    moveDeltaX = 0;
    moveDeltaY = 0;

    leftButton = false;
    middleButton = false;
    rightButton = false;

    button = 0;
    buttons = 0;

    movementX = 0;
    movementY = 0;

    hitPoint?: Vec3;
    handleName = '';
    node?: Node;
    customData?: T;

    constructor(type: string, bubbles = true) {
        super(type, bubbles);
    }
}

const zeroFloat32 = new Float32Array();
export const flatPositionBitArrayPool: { key: number; value: Float32Array }[] = [];

export function flatPosition(arr: Readonly<IVec3Like>[]): Float32Array {
    if (!arr.length) return zeroFloat32;

    let res = flatPositionBitArrayPool.find(e => e && e.key === arr.length * 3)?.value;
    if (!res) {
        res = new Float32Array(arr.length * 3);
        flatPositionBitArrayPool.unshift({
            key: arr.length * 3,
            value: res,
        });
        // 撤消、重做、移动完成三处会频繁触发线段数量不相等
        flatPositionBitArrayPool.length = 4;
    }

    let tempIndex = 0;
    for (let i = 0; i < arr.length; i++) {
        tempIndex = i * 3;
        res[tempIndex] = arr[i].x;
        res[tempIndex + 1] = arr[i].y;
        res[tempIndex + 2] = arr[i].z;
    }
    return res;
}
