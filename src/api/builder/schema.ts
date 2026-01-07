import { z } from 'zod';

// ==================== Basic Type Definitions ==================== // 基础类型定义

// Scene Reference // 场景引用
export const SchemaSceneRef = z.object({
    url: z.string().describe('Scene URL'), // 场景 URL
    uuid: z.string().describe('Scene UUID') // 场景 UUID
}).describe('Scene Reference'); // 场景引用

// Polyfills Configuration // Polyfills 配置
export const SchemaPolyfills = z.object({
    asyncFunctions: z.boolean().optional().describe('Whether async function polyfill is needed'), // 是否需要 async 函数 polyfill
    coreJs: z.boolean().optional().describe('Whether core-js polyfill is needed'), // 是否需要 core-js polyfill
    targets: z.string().optional().describe('Specify the target environment for core-js polyfill') // 指定 core-js polyfill 的目标环境
}).describe('Implement JavaScript standard library not supported by the runtime environment'); // 实现运行环境并不支持的 JavaScript 标准库

// Bundle Configuration // Bundle 配置
export const SchemaBundleConfig = z.object({
    root: z.string().describe('Root directory of the bundle'), // bundle 的根目录
    priority: z.number().optional().describe('Priority'), // 优先级
    compressionType: z.enum(['none', 'merge_dep', 'merge_all_json', 'subpackage', 'zip']).default('none').optional().describe('Compression Type'), // 压缩类型
    isRemote: z.boolean().default(false).optional().describe('Is remote bundle'), // 是否是远程包
    output: z.boolean().default(true).optional().describe('Whether to output this bundle'), // 是否输出此 bundle 包
    name: z.string().describe('Bundle Name'), // bundle 名称
    dest: z.string().optional().describe('Output directory of the bundle'), // bundle 的输出目录
    scriptDest: z.string().optional().describe('Output path for scripts'), // 脚本的输出地址
}).describe('Bundle Configuration Options'); // Bundle 配置选项

// Platform Enum - Accepts any string, built-in platform names are for reference only // 平台枚举 - 接受任意字符串，内置平台名称仅作为参考
export const SchemaPlatform = z.string().describe('Platform Identifier (e.g., web-desktop, web-mobile, windows, mac, ios, etc.)'); // 平台标识符 (如: web-desktop, web-mobile, windows, mac, ios 等)
export const SchemaPlatformCanMake = z.string().describe('Platform Identifier supported for compilation (e.g., windows, mac, ios, android, etc.)'); // 支持编译的平台标识符 (如: windows, mac, ios, android 等)

export const SchemaRoot = z.string().min(1).describe('Build Output Directory'); // 构建发布目录
export type IPlatformRoot = z.infer<typeof SchemaRoot>;
export type TPlatform = z.infer<typeof SchemaPlatform>;
export type TPlatformCanMake = z.infer<typeof SchemaPlatformCanMake>;

// ==================== Platform Specific Packages Configuration ==================== // 平台特定的 Packages 配置

// Web Desktop Platform Configuration // Web Desktop 平台配置
export const SchemaWebDesktopPackages = z.object({
    useWebGPU: z.boolean().default(false).describe('Whether to use WebGPU rendering backend'), // 是否使用 WEBGPU 渲染后端
    resolution: z.object({
        designHeight: z.number().describe('Design Height'), // 设计高度
        designWidth: z.number().describe('Design Width'), // 设计宽度
    }).describe('Game View Resolution'), // 游戏视图分辨率
}).describe('Web Desktop Platform Configuration'); // Web Desktop 平台配置

// Web Mobile Platform Configuration // Web Mobile 平台配置
export const SchemaWebMobilePackages = z.object({
    useWebGPU: z.boolean().default(false).describe('Whether to use WebGPU rendering backend'), // 是否使用 WEBGPU 渲染后端
    orientation: z.enum(['portrait', 'landscape', 'auto']).default('auto').describe('Device Orientation'), // 设备方向
    embedWebDebugger: z.boolean().default(false).describe('Whether to embed Web debugger'), // 是否嵌入 Web 端调试工具
}).describe('Web Mobile Platform Configuration'); // Web Mobile 平台配置

// ==================== Basic Build Configuration ==================== // 基础构建配置

// Core Build Field Definitions (excluding platform and packages, defined in platform-specific configurations) // 核心构建字段定义（不包含 platform 和 packages，这些在平台特定配置中定义）
const BuildConfigCoreFields = z.object({
    // Basic Information // 基础信息
    name: z.string().describe('Game Name, defaults to project name'), // 游戏名称，默认为项目名称
    outputName: z.string().describe('Build Output Name, defaults to platform name'), // 构建输出名称，默认为平台名称
    buildPath: z.string().describe('Generated game folder after build, use project:// protocol for project path'), // 构建后的游戏生成文件夹，项目下的地址请使用 project:// 协议

    // Scene Configuration // 场景配置
    scenes: z.array(SchemaSceneRef).describe('List of scenes to build, defaults to all scenes'), // 构建场景列表，默认为全部场景
    startScene: z.string().describe('First scene to enter after opening the game, supports db url and uuid formats'), // 打开游戏后进入的第一个场景，支持 db url 和 uuid 格式

    // Build Mode // 构建模式
    debug: z.boolean().describe('Whether it is debug mode'), // 是否是调试模式
    md5Cache: z.boolean().describe('Add MD5 information to all built resource filenames to solve CDN resource caching issues'), // 给构建后的所有资源文件名将加上 MD5 信息，解决 CDN 资源缓存问题

    // Polyfills and Script Configuration // Polyfills 和脚本配置
    polyfills: SchemaPolyfills.describe('Implement JavaScript standard library not supported by the runtime environment'), // 实现运行环境并不支持的 JavaScript 标准库
    buildScriptTargets: z.string().describe('Target environment information required by the project, can pass a query string compatible with browserslist, e.g., > 0.4%'), // 项目需要支持的目标环境信息，可以传递一个和 browserslist 兼容的查询字符串，例如：> 0.4%

    // Bundle Configuration // Bundle 配置
    mainBundleCompressionType: z.enum(['none', 'merge_dep', 'merge_all_json', 'subpackage', 'zip']).describe('Specify the compression type of the main bundle'), // 指定主 bundle 的压缩类型
    mainBundleIsRemote: z.boolean().describe('Whether the main Bundle is a remote package'), // main Bundle 是否是远程包
    server: z.string().describe('Remote resource server address'), // 远程资源服务器地址
    startSceneAssetBundle: z.boolean().describe('Specify the initial scene as a remote Bundle package'), // 指定初始场景为远程 Bundle 包
    bundleConfigs: z.array(SchemaBundleConfig).describe('Specify parameters for building Bundles, if not passed, pack according to the original configuration of all Bundles in the project'), // 构建 Bundle 的指定包含传参，未传递时按照项目内所有 Bundle 的原始配置打包
    moveRemoteBundleScript: z.boolean().describe('Remove scripts from remote Bundle packages, automatically checked for mini-game platforms'), // 移除远程包 Bundle 的脚本，小游戏平台将会自动勾选

    // Code Processing // 代码处理
    nativeCodeBundleMode: z.enum(['wasm', 'asmjs', 'both']).describe('Specify the mode of Native Code to build'), // 指定构建的 Native Code 的模式
    sourceMaps: z.union([z.boolean(), z.literal('inline')]).describe('Whether to generate sourceMap. false: Disabled; true: Enabled (separate file); inline: Enabled (inline)'), // 是否生成 sourceMap。false: 关闭；true: 启用(独立文件)；inline: 启用(内联)
    experimentalEraseModules: z.boolean().describe('Whether to use experimental eraseModules'), // 是否使用实验性 eraseModules
    bundleCommonChunk: z.boolean().describe('Whether to embed common scripts in Bundle'), // 是否在 Bundle 中嵌入公共脚本
    mangleProperties: z.boolean().describe('Whether to mangle properties'), // 是否混淆属性
    inlineEnum: z.boolean().describe('Whether to inline enums'), // 是否内联枚举

    // Resource Processing // 资源处理
    skipCompressTexture: z.boolean().describe('Whether to skip texture compression'), // 是否跳过纹理压缩
    packAutoAtlas: z.boolean().describe('Whether to auto atlas'), // 是否自动合图

    // Other Options // 其他选项
    useSplashScreen: z.boolean().describe('Whether to use custom splash screen'), // 是否使用自定义启动画面

    // Build Stages // 构建阶段
    nextStages: z.array(z.enum(['make', 'run'])).describe('Specify subsequent combined build stages, multiple can be specified'), // 指定后续联合的构建阶段，可指定多个

    // Cache Configuration // 缓存配置
    useCacheConfig: z.object({
        engine: z.boolean().optional().describe('Whether to use engine cache'), // 是否使用引擎缓存
        textureCompress: z.boolean().optional().describe('Whether to use texture compression cache'), // 是否使用纹理压缩缓存
        autoAtlas: z.boolean().optional().describe('Whether to use auto atlas cache'), // 是否使用自动合图缓存
        serializeData: z.boolean().optional().describe('Whether to use serialized data cache'), // 是否使用序列化数据缓存
    }).optional().describe('Cache Configuration'), // 缓存配置
});

// Build Configuration Base Class: All fields optional (for API input, excluding platform and packages) // 构建配置基类：所有字段可选（用于 API 入参，不包含 platform 和 packages）
export const SchemaBuildBaseConfig = BuildConfigCoreFields.partial().describe('Basic Build Configuration (all fields optional)'); // 基础构建配置（所有字段可选）

// Runtime/One-time Options (not included in configuration result) // 运行时/一次性选项（不进入配置结果）
export const SchemaBuildRuntimeOptions = z.object({
    configPath: z.string().optional().describe('Build configuration JSON file path'), // 构建配置 JSON 文件地址
    skipCheck: z.boolean().default(false).optional().describe('Skip build parameter check and auto-completion process. Only set to true when confirming other build parameters are complete, otherwise build may fail due to missing configuration'), // 跳过构建参数的检查和自动补全流程，请在确认其他构建参数都是完整的情况才能设置为 true ，否则可能因为缺少配置导致构建失败
    taskId: z.string().optional().describe('Specify build task ID'), // 指定构建任务 ID
    taskName: z.string().optional().describe('Specify build task name'), // 指定构建任务名称
    // logDest: z.string().optional().describe('Specify build log output path'), // 指定构建日志输出地址
});

// ==================== Platform Specific Complete Build Options ==================== // 平台特定的完整构建选项

// Web Desktop Complete Build Options (Input, all fields optional) // Web Desktop 完整构建选项（入参，所有字段可选）
export const SchemaWebDesktopBuildOption = SchemaBuildRuntimeOptions
    .merge(SchemaBuildBaseConfig)
    .extend({
        platform: z.literal('web-desktop').describe('Build Platform').optional(), // 构建平台
        packages: z.object({
            'web-desktop': SchemaWebDesktopPackages.partial()
        }).optional().describe('Web Desktop Platform Specific Configuration') // Web Desktop 平台特定配置
    })
    .describe('Web Desktop Complete Build Options (all fields optional)'); // Web Desktop 完整构建选项（所有字段可选）

// Web Mobile Complete Build Options (Input, all fields optional) // Web Mobile 完整构建选项（入参，所有字段可选）
export const SchemaWebMobileBuildOption = SchemaBuildRuntimeOptions
    .merge(SchemaBuildBaseConfig)
    .extend({
        platform: z.literal('web-mobile').describe('Build Platform').optional(), // 构建平台
        packages: z.object({
            'web-mobile': SchemaWebMobilePackages.partial()
        }).optional().describe('Web Mobile Platform Specific Configuration') // Web Mobile 平台特定配置
    })
    .describe('Web Mobile Complete Build Options (all fields optional)'); // Web Mobile 完整构建选项（所有字段可选）

// General Build Options (for API input) // 通用构建选项（用于 API 入参）
export const SchemaBuildOption = z.union([
    SchemaWebDesktopBuildOption,
    SchemaWebMobileBuildOption,
    SchemaBuildRuntimeOptions
    .merge(SchemaBuildBaseConfig)
    .extend({
        platform: SchemaPlatform.optional().describe('Build Platform'), // 构建平台
        packages: z.any().optional().describe('Platform Specific Configuration'), // 平台特定配置
    })
]).optional().describe('Build Options (for API input)'); // 构建选项（用于 API 入参）
export type TBuildOption = z.infer<typeof SchemaBuildOption>;

export const SchemaResultBase = z.object({
    code: z.number().int().describe('Build exit code, 0 means success, others mean failure, 32 means parameter error, 34 means build failure, 37 means build busy, 38 means static compile error, 50 means unknown error'), // 构建的退出码, 0 表示成功, 其他表示失败, 32 表示参数错误, 34 表示构建失败, 37 表示构建繁忙, 38 表示静态编译错误, 50 表示未知错误
    dest: z.string().optional().describe('Generated game folder after build, currently output as project protocol address'), // 构建后的游戏生成文件夹，目前输出为 project 协议地址
    reason: z.string().optional().describe('Error message for build failure'), // 构建失败的错误信息
});

export const SchemaBuildResult = SchemaResultBase.extend({
    custom: z.object({
        nativePrjDir: z.string().optional().describe('Native project path after build'), // 构建后的原生项目地址
        previewUrl: z.string().optional().describe('Default preview server address for web platform build'), // web 平台构建的默认预览服务器地址
    }).optional().describe('Custom fields for different build platform results, in object format'), // 不同构建平台结果的自定义字段, object 形式
}).nullable().describe('Result after building the project'); // 构建项目后的结果

export const SchemaMakeResult = SchemaResultBase.extend({
    custom: z.object({
        nativePrjDir: z.string().optional().describe('Native project path after build'), // 构建后的原生项目地址
        executableFile: z.string().optional().describe('Compiled executable file path'), // 编译后的可执行文件地址
    }).optional().describe('Custom fields after compiling the project, in object format'), // 编译项目后的自定义字段, object 形式
}).nullable().describe('Result after compiling the project'); // 编译项目后的结果

export const SchemaPreviewSettingsResult = z.object({
    settings: z.object({
        CocosEngine: z.string().describe('Cocos Engine Version'), // Cocos Engine 版本
        engine: z.object({
            debug: z.boolean().describe('Whether it is debug mode'), // 是否是调试模式
            platform: z.string().describe('Build Platform'), // 构建平台
            customLayers: z.array(z.object({ name: z.string(), bit: z.number() })).describe('Custom Layers'), // 自定义层级
            sortingLayers: z.array(z.object({ id: z.number(), name: z.string(), value: z.number() })).describe('Sorting Layers'), // 排序层级
            macros: z.record(z.string(), z.any()).describe('Macro Definitions'), // 宏定义
            builtinAssets: z.array(z.string()).describe('Built-in Assets'), // 内置资源
        }),
    }),
    script2library: z.record(z.string(), z.string()).describe('Mapping between scripts and libraries'), // 脚本与库的映射关系
    bundleConfigs: z.array(z.object({
        name: z.string().describe('Bundle Name'), // bundle 名称
        uuids: z.array(z.string()).describe('List of resource UUIDs in the bundle'), // bundle 中的资源 UUID 列表
        paths: z.record(z.string(), z.array(z.string())).describe('List of resource paths in the bundle'), // bundle 中的资源路径列表
        scenes: z.record(z.string(), z.union([z.string(), z.number()])).describe('List of scenes in the bundle'), // bundle 中的场景列表
        packs: z.record(z.string(), z.array(z.union([z.string(), z.number()]))).describe('List of merged jsons in the bundle'), // bundle 中的合并的 json 列表
        versions: z.record(z.string(), z.array(z.union([z.string(), z.number()]))).describe('List of resource versions in the bundle'), // bundle 中的资源版本列表
        redirect: z.array(z.union([z.string(), z.number()])).describe('List of redirected resources in the bundle'), // bundle 中的重定向资源列表
        debug: z.boolean().describe('Whether the bundle is in debug mode'), // bundle 是否是 debug 模式
        types: z.array(z.string()).optional().describe('List of resource types in the bundle'), // bundle 中的资源类型列表
        encrypted: z.boolean().optional().describe('Whether resources in the bundle are encrypted'), // bundle 中的资源是否加密
        isZip: z.boolean().optional().describe('Whether the bundle is in zip mode'), // bundle 是否是 zip 模式
        zipVersion: z.string().optional().describe('Zip version of the bundle'), // bundle 的 zip 版本
        extensionMap: z.record(z.string(), z.array(z.union([z.string(), z.number()]))).describe('List of extended resources in the bundle'), // bundle 中的扩展资源列表
        dependencyRelationships: z.record(z.string(), z.array(z.union([z.string(), z.number()]))).describe('List of dependency relationships in the bundle'), // bundle 中的依赖关系列表
        hasPreloadScript: z.boolean().describe('Whether the bundle has scripts that need to be preloaded'), // bundle 是否有需要预加载的脚本
    })).describe('Bundle Configuration'), // bundle 配置
}).describe('Get Preview Information Result').nullable(); // 获取预览信息结果

export type TPreviewSettingsResult = z.infer<typeof SchemaPreviewSettingsResult>;

// ==================== Build Configuration Query Result ==================== // 构建配置查询结果

// Web Desktop Build Configuration Query Result (All fields required, including packages, excluding runtime options) // Web Desktop 构建配置查询结果（所有字段必填，包含 packages，不包含运行时选项）
const SchemaWebDesktopBuildConfigResult = BuildConfigCoreFields.partial()
    .extend({
        platform: z.literal('web-desktop').describe('Build Platform'), // 构建平台
        packages: z.object({
            'web-desktop': SchemaWebDesktopPackages
        }).describe('Web Desktop Platform Specific Configuration') // Web Desktop 平台特定配置
    })
    .describe('Web Desktop Build Configuration Query Result'); // Web Desktop 构建配置查询结果

// Web Mobile Build Configuration Query Result (All fields required, including packages, excluding runtime options) // Web Mobile 构建配置查询结果（所有字段必填，包含 packages，不包含运行时选项）
const SchemaWebMobileBuildConfigResult = BuildConfigCoreFields.partial()
    .extend({
        platform: z.literal('web-mobile').describe('Build Platform'), // 构建平台
        packages: z.object({
            'web-mobile': SchemaWebMobilePackages
        }).describe('Web Mobile Platform Specific Configuration') // Web Mobile 平台特定配置
    })
    .describe('Web Mobile Build Configuration Query Result'); // Web Mobile 构建配置查询结果

// Build Configuration Query Result: Union type, all fields required, including packages, excluding runtime options // 构建配置查询结果：union 类型，所有字段必填，包含 packages，不包含运行时选项
export const SchemaBuildConfigResult = z.union([
    SchemaWebDesktopBuildConfigResult,
    SchemaWebMobileBuildConfigResult,
    BuildConfigCoreFields.partial()
    .extend({
        platform: SchemaPlatform,
        packages: z.any().optional().describe('Platform Specific Configuration'), // 平台特定配置
    })
]).nullable().describe('Build Configuration Query Result (all fields required, including packages)'); // 构建配置查询结果（所有字段必填，包含 packages）

export type TBuildConfigResult = z.infer<typeof SchemaBuildConfigResult>;

// Export More Types // 导出更多类型
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

// Run API Related Schema // Run API 相关 Schema
export const SchemaBuildDest = z.string().min(1).describe('Build Output Directory, supports absolute path and project:// protocol URL'); // 构建输出目录，支持绝对路径和 project:// 协议 URL
export type TBuildDest = z.infer<typeof SchemaBuildDest>;

export const SchemaRunResult = z.string().describe('Run URL'); // 运行 URL
export type TRunResult = z.infer<typeof SchemaRunResult>;