import { VirtualAsset } from '@editor/asset-db';

export enum NormalImportSetting {
    /**
     * 如果模型文件中包含法线信息则导出法线，否则不导出法线。
     */
    optional,

    /**
     * 不在导出的网格中包含法线信息。
     */
    exclude,

    /**
     * 如果模型文件中包含法线信息则导出法线，否则重新计算并导出法线。
     */
    require,

    /**
     * 不管模型文件中是否包含法线信息，直接重新计算并导出法线。
     */
    recalculate,
}

export enum TangentImportSetting {
    /**
     * 不在导出的网格中包含正切信息。
     */
    exclude,

    /**
     * 如果模型文件中包含正切信息则导出正切，否则不导出正切。
     */
    optional,

    /**
     * 如果模型文件中包含正切信息则导出正切，否则若纹理坐标存在则重新计算并导出正切。
     */
    require,

    /**
     * 不管模型文件中是否包含正切信息，直接重新计算并导出正切。
     */
    recalculate,
}

export interface AnimationImportSetting {
    /**
     * glTf 中原始动画资源的名称。
     */
    name: string;

    /**
     * 原始动画的长度，单位为秒。
     */
    duration: number;

    /**
     * 用户查看、切割原始动画时的 FPS 设定。
     */
    fps: number;

    /**
     * 对原始动画的划分，由用户配置。
     * 若此资源存在，所有划分出的动画成为 glTf 资源下的独立动画并将被导出；
     * 否则，直接导入原始动画资源。
     */
    splits: Array<{
        /**
         * 以前的 ID。如果存在，优先使用这个 ID 来创建子资源，以防止改名后 UUID 变化。
         */
        previousId?: string;

        /**
         * 划分出的动画的名称。
         */
        name: string;

        /**
         * 划分的起始时刻，单位为秒。
         */
        from: number;

        /**
         * 划分的终止时刻，单位为秒。
         */
        to: number;

        /**
         * 用户查看划分出的子动画时的 FPS 设定。
         */
        fps?: number;

        /**
         * 速度。
         */
        speed?: number;

        /**
         * 动画循环模式。
         */
        wrapMode?: number;

        /**
         * 额外的动画辅助曲线信息。
         */
        auxiliaryCurves?: Record<
            string,
            {
                /**
                 * 序列化后的曲线。
                 */
                curve: unknown;
            }
        >;

        /**
         * 加性动画导入设置。
         */
        additive?: {
            /**
             * 是否将动画导入为加性动画。
             */
            enabled: boolean;

            /**
             * 参考动画。
             * 若设置，将参考该动画第 0 帧的姿势计算加性动画；
             * 否则，则将参考第动画本身第 0 帧的姿势进行计算。
             */
            refClip?: string;
        };
    }>;
}

export interface ImageMeta {
    /**
     * 图片名字。
     */
    name?: string;

    /**
     * 模型文件中该图片的 URI，可能是以下形式：
     *   - Database URL，这种路径的图片存在项目目录中；
     *   - uuid URI，这种路径的图片已经作为子资源导入，路径代表子资源的 uuid。
     * 如果未定义，表示此图片未指定源或指定的源无法解析。
     */
    uri?: string;

    /**
     * 用户设置的图片对象。
     * 3.8.0 以前使用路径，3.8.0 之后使用 UUID。
     */
    remap?: string;
}

export interface SerializedAssetFinder {
    meshes?: Array<string | null>;
    animations?: Array<string | null>;
    skeletons?: Array<string | null>;
    textures?: Array<string | null>;
    materials?: Array<string | null>;
    scenes?: Array<string | null>;
}

export interface GlTFUserData {
    assetFinder?: SerializedAssetFinder;

    imageMetas: ImageMeta[];

    // Normal import settings
    // @default required
    normals?: NormalImportSetting;

    // Tangent import settings;
    // @default required
    tangents?: TangentImportSetting;

    /**
     * Controls how to import morph normals.
     * @default Exclude.
     */
    morphNormals?: NormalImportSetting.exclude | NormalImportSetting.optional;

    // Whether to extract material assets out of embedded (sub)assets,
    // so that the assets become editable.
    // @default false
    dumpMaterials?: boolean;

    // only for chat avatar
    redirectMaterialMap?: Record<string, string>;

    // The directory to dump the materials.
    // Default to a direct sub-folder prefixed with 'Materials_' under current path.
    materialDumpDir?: string;

    /**
     * Whether to use vertex colors(if valid) in material.
     * @default false
     */
    useVertexColors?: boolean;

    /**
     * Whether to enable depth-write if the material specify the `BLEND` mode.
     * See https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#alpha-coverage
     * @default false
     */
    depthWriteInAlphaModeBlend?: boolean;

    // @default true
    skipValidation?: boolean;

    /**
     * 整个数组由导入器创建。`name` 和 `duration` 也都由导入器写入修改，外部不允许修改。
     * `splits` 是允许用户配置的。
     */
    animationImportSettings?: AnimationImportSetting[];

    /**
     * 是否将所有动画挂载到生成的预制体上。
     * @default false
     */
    mountAllAnimationsOnPrefab?: boolean;

    /**
     * 使用旧的 FBX 导入器。（在非 FBX 导入器上是 `undefined`）
     */
    legacyFbxImporter?: boolean;

    /**
     * 禁用 Mesh 分割，默认勾选
     */
    disableMeshSplit?: boolean;

    /**
     * 允许数据访问。
     */
    allowMeshDataAccess?: boolean;

    /**
     * 是否添加填充顶点色
     * @default false
     */
    addVertexColor?: boolean;

    /**
     * 若开启并且模型场景顶部仅有一个节点，那么以该节点作为根节点转换为 Prefab。
     * 否则，以场景为根节点转换为 Prefab。见 cocos/cocos-engine#11858 。
     */
    promoteSingleRootNode?: boolean;
    /*
     * 若开启则自动生成 Lightmap UV，并将 UV 写入第二个通道（若第二个通道有 UV ， 则该 UV 会被覆盖）
     * 否则，使用默认 UV 。
     */
    generateLightmapUVNode?: boolean;

    /**
     * 关于 FBX 的配置。仅当 `legacyFbxImporter === false` 时有效。
     */
    fbx?: IFbxSetting;

    /**
     * 减面配置
     */
    meshOptimizer?: MeshOptimizerOption;

    /**
     * mesh 优化配置
     */
    meshOptimize?: MeshOptimizeOptions;

    /**
     * 是否开启 mesh 减面
     */
    meshSimplify?: MeshSimplifyOptions;

    /**
     * MeshCluster Options
     */
    meshCluster?: MeshClusterOptions;

    /**
     * Mesh compression options
     */
    meshCompress?: MeshCompressOptions;

    lods?: {
        // 是否开启 LODS
        enable: boolean;
        // fbx 是否自带 LOD
        hasBuiltinLOD: boolean;
        // fbx 各层级 lod 的配置
        options: LODsOption[];
    };
}

export interface LODsOption {
    // 屏占比
    screenRatio: number;
    // 和 lod0 的减面比
    faceCount: number;
}

export interface IVirtualAssetUserData {
    // 依赖的原 mesh 的 gltfIndex
    gltfIndex?: number;
    // mesh 资源的面数
    triangleCount?: number;
    // mesh 所在 lod 层级
    lodLevel?: number;
    // 根据 lod 配置自动生成，lodOptions 属性存在说明需要自动生成
    lodOptions?: {
        // 自动生成的 mesh 占原 mesh 的百分比
        faceCount: number;
    };
    [index: string]: any;
}

export interface MeshOptimizerOption {
    // 是否启用此功能
    enable: boolean;
    // 减面算法，默认 simplify
    algorithm?: 'gltfpack' | 'simplify';
    simplifyOptions?: SimplifyOptions;
    // 已废弃，仅做简单记录
    gltfpackOptions?: GltfpackOptions;
}

export interface MeshSimplifyOptions {
    enable: boolean;
    targetRatio?: number;
    autoErrorRate?: boolean;
    errorRate?: number;
    lockBoundary?: boolean;
}

export interface MeshClusterOptions {
    enable: boolean;
    coneCluster?: boolean;
}

export interface MeshCompressOptions {
    enable: boolean;
    encode?: boolean;
    compress?: boolean;
    quantize?: boolean;
}

/**
 * @deprecated
 */
export type MeshOptimizerOptions = MeshSimplifyOptions;

export interface MeshOptimizeOptions {
    enable: boolean;
    vertexCache?: boolean;
    vertexFetch?: boolean;
    overdraw?: boolean;
}

// 已废弃，仅做简单记录
export type GltfpackOptions = Record<string, any>;

export interface SimplifyOptions {
    // 压缩比例
    targetRatio?: number;
    // 防止破面
    enableSmartLink?: boolean;
    // 误差距离
    agressiveness?: number;
    // 计算迭代次数
    maxIterationCount?: number;
}

interface IFbxSetting {
    /**
     * https://github.com/cocos-creator/FBX-glTF-conv/pull/26
     */
    unitConversion?: 'geometry-level' | 'hierarchy-level' | 'disabled';

    /**
     * 动画烘焙速率。单位为 FPS。
     * 一般来说有以下几种 FPS 选项。
     * - NTSC video 30/60
     * - PAL video 25
     * - Film 24
     * 见 https://knowledge.autodesk.com/support/3ds-max/learn-explore/caas/CloudHelp/cloudhelp/2020/ENU/3DSMax-Reference/files/GUID-92B75FD6-C112-44D6-AB89-DB50D11AE0DE-htm.html 。
     * 为了以后的拓展性，我们目前仅支持用户从这几种选项中选择。
     * @default 24
     */
    animationBakeRate?: 0 | 24 | 25 | 30 | 60;

    /**
     * 在导出动画时，是否优先使用 FBX 内记录的时间范围。
     * @default true
     */
    preferLocalTimeSpan?: boolean;

    /**
     * 是否为导入的材质匹配DCC的光照模型.
     * 在导入时,若此字段为 `undefined` 时,该字段将被初始化为当前配置的"是否开启智能材质转换".
     */
    smartMaterialEnabled?: boolean;

    /**
     * 匹配 DCC 原始模型名称。
     */
    matchMeshNames?: boolean;
}
