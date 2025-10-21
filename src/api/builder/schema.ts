import { z } from 'zod';

// 可复用的子 Schema
export const SchemaSceneRef = z.object({
    url: z.string(),
    uuid: z.string()
});

export const SchemaPolyfills = z.object({
    asyncFunctions: z.boolean().optional().describe('是否需要 async 函数 polyfill'),
    coreJs: z.boolean().optional().describe('是否需要 core-js polyfill'),
    targets: z.string().optional().describe('指定 core-js polyfill 的目标环境')
}).describe('实现运行环境并不支持的 JavaScript 标准库');

export const SchemaBundleConfig = z.object({
    root: z.string().describe('指定 bundle 的根目录'),
    priority: z.number().optional().describe('优先级'),
    compressionType: z.enum(['none', 'merge_dep', 'merge_all_json', 'subpackage', 'zip']).default('none').optional(),
    isRemote: z.boolean().default(false).optional().describe('是否是远程包'),
    output: z.boolean().default(true).optional(),
    name: z.string(),
    dest: z.string().optional().describe('指定 bundle 的输出目录'),
});
export const SchemaPlatform = z.enum(['web-desktop', 'web-mobile']);

// 构建配置（可导出到配置文件/结果中）
export const SchemaBuildConfig = z.object({
    name: z.string().optional().describe('指定游戏名称'),
    outputName: z.string().optional().describe('指定构建输出名称'),
    buildPath: z.string().optional().default('project://build').describe('指定构建后的游戏生成文件夹'),
    platform: SchemaPlatform.default('web-desktop').optional().describe('指定构建平台'),
    scenes: z.array(SchemaSceneRef).optional().describe('指定构建场景列表'),
    startScene: z.string().optional().describe('指定打开游戏后进入的场景'),
    debug: z.boolean().default(false).optional().describe('是否是调试模式'),
    md5Cache: z.boolean().default(false).optional().describe('是否使用 MD5 缓存'),
    polyfills: SchemaPolyfills.optional().describe('实现运行环境并不支持的 JavaScript 标准库'),
    buildScriptTargets: z.string().optional().describe('项目需要支持的目标环境信息，可以传递一个和 browserslist 兼容的查询字符串，例如：> 0.4%'),
    mainBundleCompressionType: z.enum(['none', 'merge_dep', 'merge_all_json', 'subpackage', 'zip']).default('merge_dep').optional().describe('指定主 bundle 的压缩类型'),
    mainBundleIsRemote: z.boolean().default(false).optional().describe('main Bundle 是否是远程包'),
    server: z.string().optional().describe('远程资源服务器地址'),
    startSceneAssetBundle: z.boolean().default(false).optional().describe('指定初始场景为远程 Bundle包'),
    bundleConfigs: z.array(SchemaBundleConfig).optional().describe('构建 Bundle 的指定包含传参，未传递时按照项目内所有 Bundle 的原始配置打包'),
    nativeCodeBundleMode: z.enum(['wasm', 'asmjs', 'both']).default('asmjs').optional().describe('指定构建的 Native Code 的模式'),
    moveRemoteBundleScript: z.boolean().default(false).optional().describe('移除远程包 Bundle 的脚本, 小游戏平台将会自动勾选'),
    useSplashScreen: z.boolean().default(false).optional().describe('是否使用自定义启动画面'),
    stage: z.enum(['build', 'make', 'run']).default('build').optional().describe('构建阶段指定，默认为 build 可指定为 make/run 等'),
    nextStages: z.array(z.enum(['make', 'run'])).optional().describe('指定后续联合的构建阶段，可指定多个'),
    // 其他功能开关
    skipCompressTexture: z.boolean().default(false).optional().describe('是否跳过纹理压缩'),
    packAutoAtlas: z.boolean().default(true).optional().describe('是否自动合图'),
    sourceMaps: z.boolean().default(false).optional().describe('是否生成 sourceMap'),
    experimentalEraseModules: z.boolean().default(false).optional().describe('是否使用实验性 eraseModules'),
    bundleCommonChunk: z.boolean().default(false).optional().describe('是否在 Bundle 中嵌入公共脚本'),
    mangleProperties: z.boolean().default(false).optional().describe('是否混淆属性'),
    inlineEnum: z.boolean().default(false).optional().describe('是否内联枚举'),
});

// 运行时/一次性选项（不进入配置结果）
export const SchemaBuildRuntimeOptions = z.object({
    configPath: z.string().optional().describe('构建配置 JSON 文件地址'),
    skipCheck: z.boolean().default(true).optional().describe('跳过构建参数的检查和自动补全流程'),
    taskId: z.string().optional().describe('指定构建任务 ID'),
    taskName: z.string().optional().describe('指定构建任务名称'),
    logDest: z.string().optional().describe('指定构建日志输出地址'),
});

// 对外暴露：完整的构建入参选项
export const SchemaBuildOption = SchemaBuildRuntimeOptions.merge(SchemaBuildConfig).optional();
export type SchemaBuildOptionType = z.infer<typeof SchemaBuildOption>;

export const SchemaBuildResult = z.object({
    code: z.number().int().describe('构建的退出码, 0 表示成功, 其他表示失败'),
    dest: z.string().optional().describe('构建后的游戏生成文件夹'),
    reason: z.string().optional().describe('构建失败的原因'),
}).nullable().describe('构建项目后的结果');

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

// 让配置查询/输出结果与入参配置复用同一套定义
export const SchemaBuildConfigResult = SchemaBuildConfig.nullable().describe('构建配置结果');
export type TBuildConfigResult = z.infer<typeof SchemaBuildConfigResult>;

export type SchemaPlatformType = z.infer<typeof SchemaPlatform>;

export type TBuildResultData = z.infer<typeof SchemaBuildResult>;

// Run API 相关 Schema
export const SchemaRunDest = z.string().min(1).describe('构建输出目录路径');
export type TRunDest = z.infer<typeof SchemaRunDest>;

export const SchemaRunResult = z.string().describe('运行 URL');
export type TRunResult = z.infer<typeof SchemaRunResult>;