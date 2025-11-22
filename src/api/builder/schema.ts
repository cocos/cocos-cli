import { z } from 'zod';

// ==================== 基础类型定义 ====================

// 场景引用
export const SchemaSceneRef = z.object({
    url: z.string().describe('场景 URL'),
    uuid: z.string().describe('场景 UUID')
}).describe('场景引用');

// Polyfills 配置
export const SchemaPolyfills = z.object({
    asyncFunctions: z.boolean().optional().describe('是否需要 async 函数 polyfill'),
    coreJs: z.boolean().optional().describe('是否需要 core-js polyfill'),
    targets: z.string().optional().describe('指定 core-js polyfill 的目标环境')
}).describe('实现运行环境并不支持的 JavaScript 标准库');

// Bundle 配置
export const SchemaBundleConfig = z.object({
    root: z.string().describe('bundle 的根目录'),
    priority: z.number().optional().describe('优先级'),
    compressionType: z.enum(['none', 'merge_dep', 'merge_all_json', 'subpackage', 'zip']).default('none').optional().describe('压缩类型'),
    isRemote: z.boolean().default(false).optional().describe('是否是远程包'),
    output: z.boolean().default(true).optional().describe('是否输出此 bundle 包'),
    name: z.string().describe('bundle 名称'),
    dest: z.string().optional().describe('bundle 的输出目录'),
    scriptDest: z.string().optional().describe('脚本的输出地址'),
}).describe('Bundle 配置选项');

// 平台枚举
export const SchemaPlatform = z.enum(['web-desktop', 'web-mobile', 'windows', 
    // 'ios', 'mac', 'android'
]);
export const SchemaPlatformCanMake = z.enum(['windows',
    //  'ios', 'mac', 'android'
]);
export const SchemaRoot = z.string().min(1).describe('构建发布目录');
export type IPlatformRoot = z.infer<typeof SchemaRoot>;
export type TPlatform = z.infer<typeof SchemaPlatform>;
export type TPlatformCanMake = z.infer<typeof SchemaPlatformCanMake>;
// ==================== 平台特定的 Packages 配置 ====================

// Web Desktop 平台配置
export const SchemaWebDesktopPackages = z.object({
    useWebGPU: z.boolean().default(false).describe('是否使用 WEBGPU 渲染后端'),
    resolution: z.object({
        designHeight: z.number().describe('设计高度'),
        designWidth: z.number().describe('设计宽度'),
    }).describe('游戏视图分辨率'),
}).describe('Web Desktop 平台配置');

// Web Mobile 平台配置
export const SchemaWebMobilePackages = z.object({
    useWebGPU: z.boolean().default(false).describe('是否使用 WEBGPU 渲染后端'),
    orientation: z.enum(['portrait', 'landscape', 'auto']).default('auto').describe('设备方向'),
    embedWebDebugger: z.boolean().default(false).describe('是否嵌入 Web 端调试工具'),
}).describe('Web Mobile 平台配置');

// ==================== 基础构建配置 ====================

// 核心构建字段定义（不包含 platform 和 packages，这些在平台特定配置中定义）
const BuildConfigCoreFields = z.object({
    // 基础信息
    name: z.string().describe('游戏名称，默认为项目名称'),
    outputName: z.string().describe('构建输出名称，默认为平台名称'),
    buildPath: z.string().describe('构建后的游戏生成文件夹，项目下的地址请使用 project:// 协议'),

    // 场景配置
    scenes: z.array(SchemaSceneRef).describe('构建场景列表，默认为全部场景'),
    startScene: z.string().describe('打开游戏后进入的第一个场景，支持 db url 和 uuid 格式'),

    // 构建模式
    debug: z.boolean().describe('是否是调试模式'),
    md5Cache: z.boolean().describe('给构建后的所有资源文件名将加上 MD5 信息，解决 CDN 资源缓存问题'),

    // Polyfills 和脚本配置
    polyfills: SchemaPolyfills.describe('实现运行环境并不支持的 JavaScript 标准库'),
    buildScriptTargets: z.string().describe('项目需要支持的目标环境信息，可以传递一个和 browserslist 兼容的查询字符串，例如：> 0.4%'),

    // Bundle 配置
    mainBundleCompressionType: z.enum(['none', 'merge_dep', 'merge_all_json', 'subpackage', 'zip']).describe('指定主 bundle 的压缩类型'),
    mainBundleIsRemote: z.boolean().describe('main Bundle 是否是远程包'),
    server: z.string().describe('远程资源服务器地址'),
    startSceneAssetBundle: z.boolean().describe('指定初始场景为远程 Bundle 包'),
    bundleConfigs: z.array(SchemaBundleConfig).describe('构建 Bundle 的指定包含传参，未传递时按照项目内所有 Bundle 的原始配置打包'),
    moveRemoteBundleScript: z.boolean().describe('移除远程包 Bundle 的脚本，小游戏平台将会自动勾选'),

    // 代码处理
    nativeCodeBundleMode: z.enum(['wasm', 'asmjs', 'both']).describe('指定构建的 Native Code 的模式'),
    sourceMaps: z.union([z.boolean(), z.literal('inline')]).describe('是否生成 sourceMap。false: 关闭；true: 启用(独立文件)；inline: 启用(内联)'),
    experimentalEraseModules: z.boolean().describe('是否使用实验性 eraseModules'),
    bundleCommonChunk: z.boolean().describe('是否在 Bundle 中嵌入公共脚本'),
    mangleProperties: z.boolean().describe('是否混淆属性'),
    inlineEnum: z.boolean().describe('是否内联枚举'),

    // 资源处理
    skipCompressTexture: z.boolean().describe('是否跳过纹理压缩'),
    packAutoAtlas: z.boolean().describe('是否自动合图'),

    // 其他选项
    useSplashScreen: z.boolean().describe('是否使用自定义启动画面'),

    // 构建阶段
    nextStages: z.array(z.enum(['make', 'run'])).describe('指定后续联合的构建阶段，可指定多个'),

    // 缓存配置
    useCacheConfig: z.object({
        engine: z.boolean().optional().describe('是否使用引擎缓存'),
        textureCompress: z.boolean().optional().describe('是否使用纹理压缩缓存'),
        autoAtlas: z.boolean().optional().describe('是否使用自动合图缓存'),
        serializeData: z.boolean().optional().describe('是否使用序列化数据缓存'),
    }).optional().describe('缓存配置'),
});

// 构建配置基类：所有字段可选（用于 API 入参，不包含 platform 和 packages）
export const SchemaBuildBaseConfig = BuildConfigCoreFields.partial().describe('基础构建配置（所有字段可选）');

// 运行时/一次性选项（不进入配置结果）
export const SchemaBuildRuntimeOptions = z.object({
    configPath: z.string().optional().describe('构建配置 JSON 文件地址'),
    skipCheck: z.boolean().default(false).optional().describe('跳过构建参数的检查和自动补全流程，请在确认其他构建参数都是完整的情况才能设置为 true ，否则可能因为缺少配置导致构建失败'),
    taskId: z.string().optional().describe('指定构建任务 ID'),
    taskName: z.string().optional().describe('指定构建任务名称'),
    // logDest: z.string().optional().describe('指定构建日志输出地址'),
});

// ==================== 平台特定的完整构建选项 ====================

// Web Desktop 完整构建选项（入参，所有字段可选）
export const SchemaWebDesktopBuildOption = SchemaBuildRuntimeOptions
    .merge(SchemaBuildBaseConfig)
    .extend({
        platform: z.literal('web-desktop').describe('构建平台').optional(),
        packages: z.object({
            'web-desktop': SchemaWebDesktopPackages.partial()
        }).optional().describe('Web Desktop 平台特定配置')
    })
    .describe('Web Desktop 完整构建选项（所有字段可选）');

// Web Mobile 完整构建选项（入参，所有字段可选）
export const SchemaWebMobileBuildOption = SchemaBuildRuntimeOptions
    .merge(SchemaBuildBaseConfig)
    .extend({
        platform: z.literal('web-mobile').describe('构建平台').optional(),
        packages: z.object({
            'web-mobile': SchemaWebMobilePackages.partial()
        }).optional().describe('Web Mobile 平台特定配置')
    })
    .describe('Web Mobile 完整构建选项（所有字段可选）');

// 通用构建选项（用于 API 入参）
export const SchemaBuildOption = z.union([
    SchemaWebDesktopBuildOption,
    SchemaWebMobileBuildOption
]).optional();
export type TBuildOption = z.infer<typeof SchemaBuildOption>;

export const SchemaResultBase = z.object({
    code: z.number().int().describe('构建的退出码, 0 表示成功, 其他表示失败, 32 表示参数错误, 34 表示构建失败, 37 表示构建繁忙, 50 表示未知错误'),
    dest: z.string().optional().describe('构建后的游戏生成文件夹，目前输出为 project 协议地址'),
    reason: z.string().optional().describe('构建失败的错误信息'),
});

export const SchemaBuildResult = SchemaResultBase.extend({
    custom: z.object({
        nativePrjDir: z.string().optional().describe('构建后的原生项目地址'),
        previewUrl: z.string().optional().describe('web 平台构建的默认预览服务器地址'),
    }).optional().describe('不同构建平台结果的自定义字段, object 形式'),
}).nullable().describe('构建项目后的结果');

export const SchemaMakeResult = SchemaResultBase.extend({
    custom: z.object({
        nativePrjDir: z.string().optional().describe('构建后的原生项目地址'),
        executableFile: z.string().optional().describe('编译后的可执行文件地址'),
    }).optional().describe('编译项目后的自定义字段, object 形式'),
}).nullable().describe('编译项目后的结果');

export const SchemaPreviewSettingsResult = z.object({
    settings: z.object({
        CocosEngine: z.string().describe('Cocos Engine 版本'),
        engine: z.object({
            debug: z.boolean().describe('是否是调试模式'),
            platform: z.string().describe('构建平台'),
            customLayers: z.array(z.object({ name: z.string(), bit: z.number() })).describe('自定义层级'),
            sortingLayers: z.array(z.object({ id: z.number(), name: z.string(), value: z.number() })).describe('排序层级'),
            macros: z.record(z.string(), z.any()).describe('宏定义'),
            builtinAssets: z.array(z.string()).describe('内置资源'),
        }),
    }),
    script2library: z.record(z.string(), z.string()).describe('脚本与库的映射关系'),
    bundleConfigs: z.array(z.object({
        name: z.string().describe('bundle 名称'),
        uuids: z.array(z.string()).describe('bundle 中的资源 UUID 列表'),
        paths: z.record(z.string(), z.array(z.string())).describe('bundle 中的资源路径列表'),
        scenes: z.record(z.string(), z.union([z.string(), z.number()])).describe('bundle 中的场景列表'),
        packs: z.record(z.string(), z.array(z.union([z.string(), z.number()]))).describe('bundle 中的合并的 json 列表'),
        versions: z.record(z.string(), z.array(z.union([z.string(), z.number()]))).describe('bundle 中的资源版本列表'),
        redirect: z.array(z.union([z.string(), z.number()])).describe('bundle 中的重定向资源列表'),
        debug: z.boolean().describe('bundle 是否是 debug 模式'),
        types: z.array(z.string()).optional().describe('bundle 中的资源类型列表'),
        encrypted: z.boolean().optional().describe('bundle 中的资源是否加密'),
        isZip: z.boolean().optional().describe('bundle 是否是 zip 模式'),
        zipVersion: z.string().optional().describe('bundle 的 zip 版本'),
        extensionMap: z.record(z.string(), z.array(z.union([z.string(), z.number()]))).describe('bundle 中的扩展资源列表'),
        dependencyRelationships: z.record(z.string(), z.array(z.union([z.string(), z.number()]))).describe('bundle 中的依赖关系列表'),
        hasPreloadScript: z.boolean().describe('bundle 是否有需要预加载的脚本'),
    })).describe('bundle 配置'),
}).describe('获取预览信息结果').nullable();

export type TPreviewSettingsResult = z.infer<typeof SchemaPreviewSettingsResult>;

// ==================== 构建配置查询结果 ====================

// Web Desktop 构建配置查询结果（所有字段必填，包含 packages，不包含运行时选项）
const SchemaWebDesktopBuildConfigResult = BuildConfigCoreFields.partial()
    .extend({
        platform: z.literal('web-desktop').describe('构建平台'),
        packages: z.object({
            'web-desktop': SchemaWebDesktopPackages
        }).describe('Web Desktop 平台特定配置')
    })
    .describe('Web Desktop 构建配置查询结果');

// Web Mobile 构建配置查询结果（所有字段必填，包含 packages，不包含运行时选项）
const SchemaWebMobileBuildConfigResult = BuildConfigCoreFields.partial()
    .extend({
        platform: z.literal('web-mobile').describe('构建平台'),
        packages: z.object({
            'web-mobile': SchemaWebMobilePackages
        }).describe('Web Mobile 平台特定配置')
    })
    .describe('Web Mobile 构建配置查询结果');

// 构建配置查询结果：union 类型，所有字段必填，包含 packages，不包含运行时选项
export const SchemaBuildConfigResult = z.union([
    SchemaWebDesktopBuildConfigResult,
    SchemaWebMobileBuildConfigResult
]).nullable().describe('构建配置查询结果（所有字段必填，包含 packages）');

export type TBuildConfigResult = z.infer<typeof SchemaBuildConfigResult>;

// 导出更多类型
export type TBuildBaseConfig = z.infer<typeof SchemaBuildBaseConfig>;
export type TBuildRuntimeOptions = z.infer<typeof SchemaBuildRuntimeOptions>;
export type TBuildResultData = z.infer<typeof SchemaBuildResult>;
export type IMakeResultData = z.infer<typeof SchemaMakeResult>;
export type IRunResultData = z.infer<typeof SchemaBuildResult>;
export type TBundleConfig = z.infer<typeof SchemaBundleConfig>;
export type TPolyfills = z.infer<typeof SchemaPolyfills>;
export type TSceneRef = z.infer<typeof SchemaSceneRef>;
export type TWebDesktopPackages = z.infer<typeof SchemaWebDesktopPackages>;
export type TWebMobilePackages = z.infer<typeof SchemaWebMobilePackages>;

// Run API 相关 Schema
export const SchemaBuildDest = z.string().min(1).describe('构建输出目录，支持绝对路径和 project:// 协议 URL');
export type TBuildDest = z.infer<typeof SchemaBuildDest>;

export const SchemaRunResult = z.string().describe('运行 URL');
export type TRunResult = z.infer<typeof SchemaRunResult>;