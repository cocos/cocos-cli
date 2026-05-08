/// <reference types="node" />

/** 动画剪辑资源的 userData */
export declare interface AnimationClipAssetUserData {
    /** 动画名称 */
    name: string;
}

export declare interface AnimationImportSetting {
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

/** 所有资源处理器类型的常量数组（用于 Zod enum 和 TypeScript type） */
export declare const ASSET_HANDLER_TYPES: string[];

export declare interface AssetDBOptions {
    name: string;
    target: string;
    library: string;
    temp: string;
    interval: number;
    /**
     * 0: 忽略错误
     * 1: 仅仅打印错误
     * 2: 打印错误、警告
     * 3: 打印错误、警告、日志
     * 4: 打印错误、警告、日志、调试信息
     */
    level: number;
    ignoreFiles: string[];
    preImportExtList?: string[];
    readonly: boolean;
    visible: boolean;
    ignoreGlob?: string;
}

/**
 * 资源数据库启动参数
 */
export declare interface AssetDBOptions_2 {
    name: string;
    target: string;
    library: string;
    temp: string;
    /**
     * 0: 忽略错误
     * 1: 仅仅打印错误
     * 2: 打印错误、警告
     * 3: 打印错误、警告、日志
     * 4: 打印错误、警告、日志、调试信息
     */
    level: LogLevel;
    ignoreFiles: string[];
    globList?: string[];
    readonly: boolean;
    flags?: {
        reimportCheck?: boolean;
    };
    importConcurrency?: number;
}

/** 资源处理器类型（从常量数组派生） */
export declare type AssetHandlerType = typeof ASSET_HANDLER_TYPES[number] | 'database';

export declare interface AssetInfo extends IAssetInfo {
    // Asset name
    // 资源名字
    name: string;
    // Asset display name
    // 资源用于显示的名字
    displayName: string;
    // URL
    source: string;
    // loader 加载的层级地址
    path: string;
    // loader 加载地址会去掉扩展名，这个参数不去掉
    url: string;
    // 绝对路径
    file: string;
    // 资源的唯一 ID
    uuid: string;
    // 使用的导入器名字
    importer: string;
    // 类型
    type: IAssetType;
    // 是否是文件夹
    isDirectory: boolean;
    // 导入资源的 map
    library: { [key: string]: string };
    // 子资源 map
    subAssets: { [key: string]: AssetInfo };
    // 是否显示
    visible: boolean;
    // 是否只读
    readonly: boolean;

    // 虚拟资源可以实例化成实体的话，会带上这个扩展名
    instantiation?: string;
    // 跳转指向资源
    redirect?: IRedirectInfo;
    // 继承类型
    extends?: string[];
    // 是否导入完成
    imported: boolean;
    // 是否导入失败
    invalid: boolean;
}

export declare interface AssetOperationOption {
    // 是否强制覆盖已经存在的文件，默认 false，传递后会直接覆盖文件，未传递时有冲突会直接抛异常
    overwrite?: boolean;
    // 是否自动重命名冲突文件，默认 false ，传递后会以内部规则自动重命名冲突文件，新的文件名可以在返回值中获取
    rename?: boolean;
}

export declare interface AssetOperationOption {
    // 是否强制覆盖已经存在的文件，默认 false
    overwrite?: boolean;
    // 是否自动重命名冲突文件，默认 false
    rename?: boolean;
}

export declare interface AssetUserDataMap {
    'animation-clip': AnimationClipAssetUserData;
    'auto-atlas': AutoAtlasAssetUserData;
    'label-atlas': LabelAtlasAssetUserData;
    'render-texture': RenderTextureAssetUserData;
    'directory': DirectoryAssetUserData;
    'texture-cube': TextureCubeAssetUserData;
    'erp-texture-cube': TextureCubeAssetUserData;
    'image': ImageAssetUserData;
    'sprite-frame': SpriteFrameAssetUserData;
    'texture': Texture2DAssetUserData;
    'spine-data': SpineAssetUserData;
    'javascript': JavaScriptAssetUserData;
    'gltf-animation': GltfAnimationAssetUserData;
    'particle': ParticleAssetUserData;
    'json': JsonAssetUserData;
    'prefab': PrefabAssetUserData;
    'scene': PrefabAssetUserData;
    'effect': EffectAssetUserData;
    'audio-clip': AudioClipAssetUserData;
    'bitmap-font': BitmapFontAssetUserData;
    'gltf-skeleton': GltfSkeletonAssetUserData;
    'gltf-embeded-image': GltfEmbededImageAssetUserData;
    'gltf-mesh': IVirtualAssetUserData;
    'gltf-material': IVirtualAssetUserData;
    'gltf-scene': IVirtualAssetUserData;
    'gltf': GlTFUserData;
    'fbx': GlTFUserData;
    'sprite-atlas': SpriteAtlasAssetUserData;
    'rt-sprite-frame': RtSpriteFrameAssetUserData;
    'sign-image': ImageAssetUserData;
    'alpha-image': ImageAssetUserData;

    // 无特定 userData 的资源类型（仅保留 unknown）
    'unknown': any;
}

/** 音频资源的 userData */
export declare interface AudioClipAssetUserData {
    /** 下载模式：0-Web Audio, 1-DOM Audio */
    downloadMode: number;
}

/** 自动图集资源的 userData */
export declare interface AutoAtlasAssetUserData {
    compressed: boolean;
    dest: any;
    /** 打包图像的尺寸 */
    maxWidth: number;
    maxHeight: number;
    /** 图像的边距 */
    padding: number;
    allowRotation: boolean;
    forceSquared: boolean;
    powerOfTwo: boolean;
    algorithm: string;
    format: string;
    quality: number;
    contourBleed: boolean;
    paddingBleed: boolean;
    filterUnused: boolean;
    removeTextureInBundle: boolean;
    removeImageInBundle: boolean;
    removeSpriteAtlasInBundle: boolean;
    platformSettings: any;
    textureSetting: any;
}

/** 位图字体资源的 userData */
export declare interface BitmapFontAssetUserData {
    /** 字体配置 */
    _fntConfig: any;
    /** 字体大小 */
    fontSize: number;
    /** 纹理 UUID */
    textureUuid: string;
}

/**
 * Create Asset // 创建资源
 */
export declare function createAsset(options: CreateAssetOptions): Promise<IAssetInfo>;

/**
 * Create Asset By Type // 按类型创建资源
 */
export declare function createAssetByType(ccType: ISupportCreateType, dirOrUrl: string, baseName: string, options?: CreateAssetByTypeOptions): Promise<IAssetInfo>;

export declare interface CreateAssetByTypeOptions extends AssetOperationOption {
    /**
     * 指定的模板名称，默认为 default
     */
    templateName?: string;

    /**
     * 资源内容，当 content 与 template 都传递时，优先使用 content 创建文件
     */
    content?: string | Buffer | JSON;
}

export declare interface CreateAssetOptions {
    // 资源创建的输出地址，支持绝对路径和 url
    target: string;

    // 资源文件内容，支持字符串、Buffer、JSON
    content?: string | Buffer | JSON;
    // 资源文件模板地址，例如 db://xxx/ani ，支持 url 与绝对路径
    template?: string;
    // (当 content 与 template 都未传递时，将创建文件夹)
    // (当 content 与 template 都传递时，优先使用 content 创建文件)

    // 资源处理器名称，决定了此新建资源将由哪个资源处理器处理，未指定时将由 target 的后缀查找处理器
    handler?: string;
    // 指定 uuid ，由于 uuid 也有概率冲突，uuid 冲突时会自动重新分配 uuid
    uuid?: string;
    // 默认 false 不覆盖同名时文件将会重命名指定的 path
    overwrite?: boolean;
    // 是否自动重命名冲突文件，默认 false
    rename?: boolean;
    // 新建资源时指定的一些 userData 默认配置值
    userData?: Record<string, any>;
    // 传递一些自定义配置信息，可以在自定义资源处理器内使用
    customOptions?: Record<string, any>;
}

/**
 * Delete Asset // 删除资源
 */
export declare function deleteAsset(dbPath: string): Promise<IAssetInfo | null>;

/** 文件夹资源的 userData */
export declare interface DirectoryAssetUserData {
    /** 是否是资源包 */
    isBundle?: boolean;
    /** 资源包配置 ID */
    bundleConfigID?: string;
    /** 资源包名称 */
    bundleName?: string;
    /** 优先级 */
    priority?: number;
}

/** Effect 着色器资源的 userData */
export declare interface EffectAssetUserData {
    /** 预编译组合 */
    combinations?: any;
    /** 编辑器相关数据 */
    editor?: any;
}

export declare interface ExecuteAssetDBScriptMethodOptions {
    name: string;
    method: string;
    args?: any[];
}

export declare interface FileNameCheckConfig {
    // 匹配规则
    regStr: string;
    // 匹配失败时的提示类型
    failedType: 'error' | 'warn' | 'info',
    // 匹配失败时的提示信息，支持 i18n:xxx
    failedInfo: string;
}

export declare type Filter = 'none' | 'nearest' | 'linear';

export declare interface FilterPluginOptions {
    loadPluginInEditor?: boolean;
    loadPluginInWeb?: boolean;
    loadPluginInNative?: boolean;
    loadPluginInMiniGame?: boolean;
}

export declare interface FntData {
    commonHeight?: number;
    fontSize?: number;
    atlasName?: string;
    fontDefDictionary?: FontDefDictionary;
    kerningDict?: KerningDict;
}

export declare interface FontDef {
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    xOffset: number;
    yOffset: number;
    xAdvance: number;
}

export declare interface FontDefDictionary {
    [charId: number]: FontDef;
}

/**
 * Generate Thumbnail // 生成资源缩略图
 */
export declare function generateThumbnail(urlOrUUIDOrPath: string, size?: ThumbnailSize): Promise<ThumbnailInfo | null>;

/** glTF 动画资源的 userData */
export declare interface GltfAnimationAssetUserData {
    gltfIndex: number;
    events: Array<{
        frame: number;
        func: string;
        params: string[];
    }>;
    editorExtras?: unknown;
    embeddedPlayers?: Array<{
        editorExtras?: unknown;
        begin: number;
        end: number;
        reconciledSpeed: boolean;
        playable:
        | {
            type: 'animation-clip';
            path: string;
            clip: string;
        }
        | {
            type: 'particle-system';
            path: string;
        };
    }>;
    auxiliaryCurves?: Record<string, { curve: any }>;
    wrapMode: number;
    speed?: number;
    sample?: number;
    span?: {
        from: number;
        to: number;
    };
    additive?: any;
}

/** glTF 嵌入图片子资源的 userData */
export declare interface GltfEmbededImageAssetUserData extends IVirtualAssetUserData {
    /** 是否修复 Alpha 透明度瑕疵 */
    fixAlphaTransparencyArtifacts?: boolean;
}

export declare type GltfpackOptions = Record<string, any>;

/** glTF Skeleton 子资源的 userData */
export declare interface GltfSkeletonAssetUserData extends IVirtualAssetUserData {
    /** 骨骼数量 */
    jointsLength?: number;
}

export declare interface GlTFUserData {
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

export declare interface IAssetConfig {
    displayName?: string;
    description?: string;
    docURL?: string;
    userDataConfig?: Record<string, IUerDataConfigItem>;
}

export declare interface IAssetDBInfo extends AssetDBOptions_2 {
    // 当前数据库的启动状态
    state: 'none' | 'start' | 'startup' | 'refresh'; // 是否已启动

    // 数据库是否可见
    visible: boolean;

    // 提前预导入的资源后缀，将会在 afterPreStart 之前完成预导入的资源
    preImportExtList: string[];
}

export declare interface IAssetInfo {
    name: string; // 资源名字
    source: string; // url 地址
    loadUrl: string; // loader 加载的层级地址
    url: string; // loader 加载地址会去掉扩展名，这个参数不去掉
    file: string; // 绝对路径
    uuid: string; // 资源的唯一 ID
    importer: AssetHandlerType; // 使用的导入器名字
    imported: boolean; // 是否结束导入过程
    invalid: boolean; // 是否导入成功
    type: IAssetType; // 类型
    isDirectory: boolean; // 是否是文件夹
    library: { [key: string]: string }; // 导入资源的 map

    // dataKeys 作用范围
    isBundle?: boolean; // 是否是文件夹
    displayName?: string; // 资源用于显示的名字
    readonly?: boolean; // 是否只读
    visible?: boolean; // 是否显示
    subAssets?: { [key: string]: IAssetInfo }; // 子资源 map
    // 虚拟资源可以实例化成实体的话，会带上这个扩展名
    instantiation?: string;
    redirect?: IRedirectInfo; // 跳转指向资源
    meta?: IAssetMeta,
    parent?: {
        source: string;
        library: { [key: string]: string };
        uuid: string;
    };
    extends?: string[]; // 资源的继承链信息
    mtime?: number; // 资源文件的 mtime
    depends?: string[]; // 依赖的资源 uuid 信息
    dependeds?: string[]; // 被依赖的资源 uuid 信息
    temp?: string; // 资源临时文件目录
}

export declare interface IAssetMeta<T extends ISupportCreateType | 'unknown' = 'unknown'> {
    ver: string;
    importer: AssetHandlerType;
    imported: boolean;
    uuid: string;
    files: string[];
    subMetas: {
        [index: string]: IAssetMeta<'unknown'>;
    };
    userData: AssetUserDataMap[T extends keyof AssetUserDataMap ? T : 'unknown'];
    displayName?: string;
    id?: string;
    name?: string;
}

export declare type IAssetType =
| ISupportCreateCCType
| 'cc.Asset'               // 基础资源类型（instantiation-asset）
| 'cce.Database'           // 数据库资源
| 'cce.EffectHeader'       // 着色器头文件
| 'cc.VideoClip'           // 视频剪辑
| 'cc.TiledMapAsset'       // 瓦片地图
| 'cc.TTFFont'             // TTF 字体
| 'cc.Texture2D'           // 2D 纹理
| 'cc.SpriteFrame'         // 精灵帧（sprite-frame、rt-sprite-frame）
| 'cc.ImageAsset'          // 图片资源（image、gltf/image、image/alpha、image/sign、texture-cube-face）
| 'cc.TextAsset'           // 文本资源
| 'cc.JsonAsset'           // JSON 资源
| 'cc.AudioClip'           // 音频剪辑
| 'cc.BitmapFont'          // 位图字体
| 'cc.BufferAsset'         // 缓冲区资源
| 'cc.ParticleAsset'       // 粒子资源
| 'cc.RenderPipeline'     // 渲染管线
| 'cc.Skeleton'            // 骨骼（gltf/skeleton、instantiation-asset/skeleton）
| 'cc.Mesh'                // 网格（gltf/mesh、instantiation-asset/mesh）
| 'sp.SkeletonData'        // Spine 骨骼数据
| 'dragonBones.DragonBonesAsset'      // DragonBones 资源
| 'dragonBones.DragonBonesAtlasAsset' // DragonBones 图集资源
| 'RenderStage'            // 渲染阶段
| 'RenderFlow';

export declare interface ICreateMenuInfo {
    // 新建菜单名称，支持 i18n:xxx
    label: string;
    // 模板名称，默认为 default ，作为模板选择的唯一标识符
    name: string;
    // 创建的默认文件名称带后缀，具体实际上是为 assets 面板提供的数据，assets 面板新建时，需要先让用户填写清楚命名最后才创建
    fullFileName: string;

    // 资源文件模板地址，例如 db://xxx/ani ，支持 url 与绝对路径
    template?: string;

    // 创建类型的 handler 名称，默认为当前处理器名称
    handler?: string;

    // 创建子菜单
    submenu?: ICreateMenuInfo[];
    // 分组名称
    group?: string;

    // 资源创建时的名称校验规则
    fileNameCheckConfigs?: FileNameCheckConfig[];
}

export declare interface IFbxSetting {
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

/** 图片资源的 userData  */
export declare interface ImageAssetUserData {
    /** 图片类型 */
    type: ImageImportType;
    /** 垂直翻转 */
    flipVertical?: boolean;
    /** 消除透明伪影 */
    fixAlphaTransparencyArtifacts?: boolean;
    /** 是否为 RGBE */
    isRGBE?: boolean;
    /** 这个图片是不是拥有 alpha 通道 */
    hasAlpha?: boolean;
    /** 重定向的 uuid */
    redirect?: string;
    visible?: boolean;
    /** 是否翻转绿通道 */
    flipGreenChannel?: boolean;

    /**
     * 部分资源导入后可能产生多张图像资源
     */
    sign?: string;
    alpha?: string;
}

export declare type ImageImportType = 'raw' | 'texture' | 'normal map' | 'sprite-frame' | 'texture cube';

export declare interface ImageMeta {
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

/**
 * Import Asset // 导入资源
 */
export declare function importAsset(source: string, target: string, options?: AssetOperationOption): Promise<IAssetInfo[]>;

export declare function init(): Promise<void>;

export declare interface IPluginScriptInfo extends PluginScriptInfo {
    url: string;
}

export declare interface IRedirectInfo {
    // 跳转资源的类型
    type: string;
    // 跳转资源的 uuid
    uuid: string;
}

export declare type ISupportCreateCCType =
| 'cc.AnimationClip'        // 动画剪辑
| 'cc.Script'               // 脚本（TypeScript/JavaScript）
| 'cc.SpriteAtlas'          // 精灵图集（自动图集）
| 'cc.EffectAsset'          // 着色器效果
| 'cc.SceneAsset'           // 场景
| 'cc.Prefab'               // 预制体
| 'cc.Material'             // 材质
| 'cc.TextureCube'          // 立方体贴图
| 'cc.TerrainAsset'         // 地形
| 'cc.PhysicsMaterial'      // 物理材质
| 'cc.LabelAtlas'           // 标签图集
| 'cc.RenderTexture'        // 渲染纹理
| 'cc.AnimationGraph'       // 动画图
| 'cc.AnimationMask'        // 动画遮罩
| 'cc.AnimationGraphVariant';

/** 支持创建的资源类型（从常量数组派生） */
export declare type ISupportCreateType = typeof SUPPORT_CREATE_TYPES[number];

export declare interface IUerDataConfigItem {
    key?: string; // 唯一标识符
    // 配置显示的名字，如果需要翻译，则传入 i18n:${key}
    label?: string;
    // 设置的简单说明
    description?: string;

    // 默认值
    default?: any;
    // 配置的类型
    type?: 'array' | 'object';
    itemConfigs?: IUerDataConfigItem[] | Record<string, IUerDataConfigItem>;
    render?: {
        ui: string;
        attributes?: Record<string, string | boolean | number>;
        items?: Array<{
            label: string;
            value: string;
        }>;
    };
}

/** glTF 虚拟子资源的通用 userData */
export declare interface IVirtualAssetUserData {
    /** 在 glTF 文件中的索引 */
    gltfIndex?: number;
    /** mesh 资源的面数 */
    triangleCount?: number;
    /** mesh 所在 lod 层级 */
    lodLevel?: number;
    /** 根据 lod 配置自动生成 */
    lodOptions?: {
        /** 自动生成的 mesh 占原 mesh 的百分比 */
        faceCount: number;
    };
    [key: string]: any;
}

/** JavaScript 资源的 userData */
export declare type JavaScriptAssetUserData = ScriptModuleUserData | PluginScriptUserData;

/** JSON 资源的 userData */
export declare interface JsonAssetUserData {
    /** 是否启用 JSON5 解析 */
    json5?: boolean;
}

export declare interface KerningDict {
    [key: number]: number;
}

/** 标签图集资源的 userData */
export declare interface LabelAtlasAssetUserData {
    itemWidth: number;
    itemHeight: number;
    startChar: string;
    fontSize: number;
    spriteFrameUuid: string;
    _fntConfig: FntData;
}

export declare interface LODsOption {
    // 屏占比
    screenRatio: number;
    // 和 lod0 的减面比
    faceCount: number;
}

export declare const enum LogLevel {
    NONE = 0,
    Error = 1,
    WARN = 2,
    LOG = 3,
    DEBUG = 4
}

export declare interface MeshClusterOptions {
    enable: boolean;
    coneCluster?: boolean;
}

export declare interface MeshCompressOptions {
    enable: boolean;
    encode?: boolean;
    compress?: boolean;
    quantize?: boolean;
}

export declare interface MeshOptimizeOptions {
    enable: boolean;
    vertexCache?: boolean;
    vertexFetch?: boolean;
    overdraw?: boolean;
}

export declare interface MeshOptimizerOption {
    // 是否启用此功能
    enable: boolean;
    // 减面算法，默认 simplify
    algorithm?: 'gltfpack' | 'simplify';
    simplifyOptions?: SimplifyOptions;
    // 已废弃，仅做简单记录
    gltfpackOptions?: GltfpackOptions;
}

export declare interface MeshSimplifyOptions {
    enable: boolean;
    targetRatio?: number;
    autoErrorRate?: boolean;
    errorRate?: number;
    lockBoundary?: boolean;
}

/**
 * Move Asset // 移动资源
 */
export declare function moveAsset(source: string, target: string, options?: AssetOperationOption): Promise<any>;

export declare enum NormalImportSetting {
    /**
     * 如果模型文件中包含法线信息则导出法线，否则不导出法线。
     */
    optional = 0,
    /**
     * 不在导出的网格中包含法线信息。
     */
    exclude = 1,
    /**
     * 如果模型文件中包含法线信息则导出法线，否则重新计算并导出法线。
     */
    require = 2,
    /**
     * 不管模型文件中是否包含法线信息，直接重新计算并导出法线。
     */
    recalculate = 3
}

/**
 * Listen to Asset Added Event // 监听资源添加事件
 * @param listener Callback function that receives asset information
 * @returns Function to remove the listener
 *
 * 推荐用法：
 * ```typescript
 * const removeListener = onAssetAdded((info) => {
 *     console.log(`资源已添加: ${info.name}`);
 *     console.log(`  逻辑路径: ${info.url}`);
 *     console.log(`  物理路径: ${info.file}`);
 * });
 * // 稍后移除监听
 * removeListener();
 * ```
 */
export declare function onAssetAdded(listener: (info: IAssetInfo) => void): () => void;

/**
 * Listen to Asset Changed Event // 监听资源变更事件
 * @param listener Callback function that receives asset information
 * @returns Function to remove the listener
 *
 * 推荐用法：
 * ```typescript
 * const removeListener = onAssetChanged((info) => {
 *     console.log(`资源已变更: ${info.name}`);
 * });
 * // 稍后移除监听
 * removeListener();
 * ```
 */
export declare function onAssetChanged(listener: (info: IAssetInfo) => void): () => void;

/**
 * Listen to Asset Removed Event // 监听资源删除事件
 * @param listener Callback function that receives asset information
 * @returns Function to remove the listener
 *
 * 推荐用法：
 * ```typescript
 * const removeListener = onAssetRemoved((info) => {
 *     console.log(`资源已删除: ${info.name}`);
 * });
 * // 稍后移除监听
 * removeListener();
 * ```
 */
export declare function onAssetRemoved(listener: (info: IAssetInfo) => void): () => void;

/**
 * Register listener for when a specific database finishes starting.
 *
 * 注册单个数据库启动完成后的事件监听。
 *
 * **注意事项 (Notice)**:
 * - 这个事件可能会被触发多次（如果项目存在多个子数据库，如 `assets`, `internal`）。
 * - 主要用于需要做更精细化并行控制的上层逻辑，通常情况下普通的业务逻辑不需要关心此事件，直接监听 `onReady` 即可。
 *
 * @param listener 回调函数，接收启动完成的 dbInfo
 * @returns 移除监听的函数
 */
export declare function onDBReady(listener: (dbInfo: IAssetDBInfo) => void): () => void;

/**
 * Register listener for initialization progress.
 *
 * 注册初始化过程中的进度监听。
 *
 * **注意事项 (Notice)**:
 * - **仅在启动阶段有效**。一旦触发过一次 `ready` 事件（即启动阶段结束），将不再会有新的进度消息。
 * - 启动时的资源冷导入会抛出密集的进度信息，建议在 UI 层面进行适当的节流（throttle）渲染。
 *
 * @param listener 回调函数，包含当前进度、总数、当前处理的资源 url 和导入状态
 * @returns 移除监听的函数
 */
export declare function onProgress(listener: (current: number, total: number, url: string, state: 'processing' | 'success' | 'failed') => void): () => void;

/**
 * Register listener for when all asset databases are fully initialized.
 *
 * 注册数据库初始化完全完成后的事件监听。
 *
 * **注意事项 (Notice)**:
 * - 触发此事件代表**所有**注册的资源数据库都已经完全导入并初始化完成（启动阶段结束）。
 * - 收到此事件后，表示所有的资源查询、操作 API 都可以安全调用。
 * - 第一次 ready 后，将不再有 progress 进度消息。
 *
 * @param listener 回调函数
 * @returns 移除监听的函数
 */
export declare function onReady(listener: () => void): () => void;

/** 粒子资源的 userData */
export declare interface ParticleAssetUserData {
    totalParticles: number;
    life: number;
    lifeVar: number;
    emissionRate: number;
    duration: number;
    srcBlendFactor: number;
    dstBlendFactor: number;
    startColor: any;
    startColorVar: any;
    endColor: any;
    endColorVar: any;
    startSize: number;
    startSizeVar: number;
    endSize: number;
    endSizeVar: number;
    positionType: number;
    sourcePos: any;
    posVar: any;
    angle: number;
    angleVar: number;
    startSpin: number;
    startSpinVar: number;
    endSpin: number;
    endSpinVar: number;
    emitterMode: number;
    gravity: any;
    speed: number;
    speedVar: number;
    radialAccel: number;
    radialAccelVar: number;
    tangentialAccel: number;
    tangentialAccelVar: number;
    rotationIsDir: boolean;
    startRadius: number;
    startRadiusVar: number;
    endRadius: number;
    endRadiusVar: number;
    rotatePerS: number;
    rotatePerSVar: number;
    spriteFrameUuid: string;
}

export declare interface PluginScriptInfo {
    /**
     * 脚本文件。
     */
    file: string;
    uuid: string;
}

/** JavaScript 插件脚本的 userData */
export declare interface PluginScriptUserData {
    isPlugin: true;
    /** 界面没有开放给用户。默认开启 */
    experimentalHideCommonJs?: boolean;
    /** 界面没有开放给用户。默认开启 */
    experimentalHideAmd?: boolean;
    /** 仅当 executionScope 为 enclosed 时有效。指定了要模拟的全局变量 */
    simulateGlobals?: string[];
    /** 执行作用域 */
    executionScope?: 'enclosed' | 'global';
    /** 插件执行时机 */
    loadPluginInEditor?: boolean;
    loadPluginInWeb?: boolean;
    loadPluginInMiniGame?: boolean;
    loadPluginInNative?: boolean;
}

/** 场景/预制体资源的 userData */
export declare interface PrefabAssetUserData {
    /** 是否为持久节点 */
    persistent?: boolean;
    /** 同步节点名称 */
    syncNodeName?: string;
}

/**
 * Query Asset Config Map // 查询资源配置映射表
 */
export declare function queryAssetConfigMap(): Promise<Record<string, IAssetConfig>>;

/**
 * Query All Asset Database Info // 查询所有资源数据库信息
 */
export declare function queryAssetDBInfos(): Promise<Record<string, IAssetDBInfo>>;

/**
 * Query Asset Dependencies // 查询资源依赖
 */
export declare function queryAssetDependencies(uuidOrUrl: string, type?: QueryAssetType): Promise<string[]>;

/**
 * Query Asset Info // 查询资源信息
 */
export declare function queryAssetInfo(urlOrUUIDOrPath: string, dataKeys?: string[] | undefined): Promise<IAssetInfo | null>;

/**
 * Batch Query Asset Info // 批量查询资源信息
 */
export declare function queryAssetInfos(options?: QueryAssetsOption): Promise<IAssetInfo[]>;

/**
 * Query Asset Metadata // 查询资源元数据
 */
export declare function queryAssetMeta(urlOrUUIDOrPath: string): Promise<IAssetMeta<'unknown'> | null>;

export declare interface QueryAssetsOption {
    ccType?: string | string[], // 'cc.ImageAsset' 这类，多个用数组
    isBundle?: boolean, // 筛选 asset bundle 信息，搜索子包只能与 pattern 选项共存
    importer?: string | string[], // 导入名称，多个用数组
    pattern?: string, // 路径匹配，globs 格式
    extname?: string | string[], // 扩展名匹配，多个用数组

    // 筛选一些符合 userData 配置的资源
    userData?: Record<string, boolean | string | number>;

    /**
     * @deprecated use ccType instead
     */
    type?: string;
}

export declare type QueryAssetType = 'asset' | 'script' | 'all';

/**
 * Query Asset User Data Config // 查询资源用户数据配置
 */
export declare function queryAssetUserDataConfig(urlOrUuidOrPath: string): Promise<false | Record<string, IUerDataConfigItem> | undefined>;

/**
 * Query Asset Users // 查询资源使用者
 */
export declare function queryAssetUsers(uuidOrUrl: string, type?: QueryAssetType): Promise<string[]>;

/**
 * Query Creatable Asset Map // 查询可创建资源映射表
 */
export declare function queryCreateMap(): Promise<ICreateMenuInfo[]>;

/**
 * Query Asset Path // 查询资源路径
 */
export declare function queryPath(urlOrUuid: string): Promise<string>;

/**
 * Query Sorted Plugin Scripts // 查询排序后的插件脚本
 */
export declare function querySortedPlugins(filterOptions?: FilterPluginOptions): Promise<IPluginScriptInfo[]>;

/**
 * Query Thumbnail Handlers // 查询支持缩略图生成的资源处理器列表
 */
export declare function queryThumbnailHandlers(): string[];

/**
 * Query Asset URL // 查询资源 URL
 */
export declare function queryUrl(uuidOrPath: string): Promise<string>;

/**
 * Query Asset UUID // 查询资源 UUID
 */
export declare function queryUUID(urlOrPath: string): Promise<string | null>;

/**
 * Refresh Asset Directory // 刷新资源目录
 */
export declare function refresh(dir: string): Promise<number>;

/**
 * Reimport Asset // 重新导入资源
 */
export declare function reimportAsset(pathOrUrlOrUUID: string): Promise<IAssetInfo>;

/**
 * Rename Asset // 重命名资源
 */
export declare function renameAsset(source: string, newName: string, options?: AssetOperationOption): Promise<any>;

/** 渲染纹理资源的 userData */
export declare interface RenderTextureAssetUserData extends TextureBaseAssetUserData {
    width: number;
    height: number;
}

/** 渲染纹理精灵帧的 userData */
export declare interface RtSpriteFrameAssetUserData {
    /** 图片 UUID 或数据库 URI */
    imageUuidOrDatabaseUri: string;
    /** 宽度 */
    width?: number;
    /** 高度 */
    height?: number;
}

/**
 * Save Asset // 保存资源
 */
export declare function saveAsset(pathOrUrlOrUUID: string, data: string | Buffer): Promise<IAssetInfo>;

/** JavaScript 脚本模块的 userData */
export declare interface ScriptModuleUserData {
    isPlugin: false;
}

export declare interface SerializedAssetFinder {
    meshes?: Array<string | null>;
    animations?: Array<string | null>;
    skeletons?: Array<string | null>;
    textures?: Array<string | null>;
    materials?: Array<string | null>;
    scenes?: Array<string | null>;
}

export declare interface SimplifyOptions {
    // 压缩比例
    targetRatio?: number;
    // 防止破面
    enableSmartLink?: boolean;
    // 误差距离
    agressiveness?: number;
    // 计算迭代次数
    maxIterationCount?: number;
}

/** Spine 资源的 userData */
export declare interface SpineAssetUserData {
    /** 图集资源的 UUID */
    atlasUuid: string;
}

/** 精灵图集资源的 userData */
export declare interface SpriteAtlasAssetUserData {
    /** 图集纹理名称 */
    atlasTextureName: string;
    /** 纹理 UUID */
    textureUuid: string | null;
    /** 精灵帧列表 */
    frames: SpriteFrameAssetUserData[];
    /** 资源 UUID */
    uuid: string;
    /** 格式版本 */
    format: number;
}

export declare interface SpriteFrameAssetUserData extends SpriteFrameBaseAssetUserData {
    isUuid?: boolean;
    imageUuidOrDatabaseUri: string;
}

export declare interface SpriteFrameBaseAssetUserData {
    trimType?: string;
    trimThreshold: number;
    rotated: boolean;
    offsetX: number;
    offsetY: number;
    trimX: number;
    trimY: number;
    width: number;
    height: number;
    rawWidth: number;
    rawHeight: number;
    borderTop: number;
    borderBottom: number;
    borderLeft: number;
    borderRight: number;
    packable?: boolean;
    pixelsToUnit: number;
    pivotX: number;
    pivotY: number;
    meshType: number;
    vertices: SpriteFrameVertices;
}

export declare interface SpriteFrameVertices {
    rawPosition: number[];
    indexes: number[];
    uv: number[];
    nuv: number[];
    triangles?: number[];
    minPos: number[];
    maxPos: number[];
}

/**
 * Start Asset DB // 启动资源数据库，开始扫描和导入资源
 */
export declare function start(): Promise<void>;

/** 支持创建的资源类型常量数组（用于 Zod enum 和 TypeScript type） */
export declare const SUPPORT_CREATE_TYPES: readonly ["animation-clip", "typescript", "auto-atlas", "effect", "scene", "prefab", "material", "terrain", "physics-material", "label-atlas", "render-texture", "directory", "effect-header"];

export declare enum TangentImportSetting {
    /**
     * 不在导出的网格中包含正切信息。
     */
    exclude = 0,
    /**
     * 如果模型文件中包含正切信息则导出正切，否则不导出正切。
     */
    optional = 1,
    /**
     * 如果模型文件中包含正切信息则导出正切，否则若纹理坐标存在则重新计算并导出正切。
     */
    require = 2,
    /**
     * 不管模型文件中是否包含正切信息，直接重新计算并导出正切。
     */
    recalculate = 3
}

export declare interface Texture2DAssetUserData extends TextureBaseAssetUserData {
    isUuid?: boolean;
    imageUuidOrDatabaseUri?: string;
}

export declare interface TextureBaseAssetUserData {
    wrapModeS: WrapMode;
    wrapModeT: WrapMode;
    minfilter: Filter;
    magfilter: Filter;
    mipfilter: Filter;
    anisotropy: number;
}

export declare interface TextureCubeAssetUserData extends TextureBaseAssetUserData {
    imageDatabaseUri?: string;
    isRGBE: boolean;

    mipBakeMode: number;
    /**
     * `0` 意味着默认。见 https://github.com/cocos-creator/3d-tasks/issues/2253
     */
    faceSize?: number;
    // 符号资源 uuid
    sign?: string;

    // 六个面的 UUID
    front?: string;
    back?: string;
    left?: string;
    right?: string;
    top?: string;
    bottom?: string;
}

export declare interface ThumbnailInfo {
    type: 'icon' | 'image',
    value: string; // 具体 icon 名字或者 image 路径，image 路径支持绝对路径、 db:// 、 project:// 、和 packages:// 下的路径
}

export declare type ThumbnailSize = 'large' | 'small' | 'middle' | 'origin';

/**
 * Update Asset User Data // 更新资源用户数据
 */
export declare function updateAssetUserData(urlOrUuidOrPath: string, path: string, value: any): Promise<any>;

/**
 * Update Default User Data // 更新默认用户数据
 */
export declare function updateDefaultUserData(handler: string, path: string, value: any): Promise<void>;

export declare type WrapMode = 'repeat' | 'clamp-to-edge' | 'mirrored-repeat';

export { }
