import { z } from 'zod';

export const SchemaBuildOption = z.object({
    configPath: z.string().optional().describe('构建配置 JSON 文件地址'),
    skipCheck: z.boolean().default(true).optional().describe('跳过构建参数的检查流程'),
    migrate: z.boolean().optional().default(false).describe('自动迁移传入的配置'),
    taskId: z.string().optional().describe('指定构建任务 ID'),
    taskName: z.string().optional().describe('指定构建任务名称'),
    logDest: z.string().optional().describe('指定构建日志输出地址'),
    name: z.string().optional().describe('指定游戏名称'),
    outputName: z.string().optional().describe('指定构建输出名称'),
    buildPath: z.string().optional().default('project://build').describe('指定构建后的游戏生成文件夹'),
    platform: z.enum(['web-desktop', 'web-mobile']).default('web-desktop').optional().describe('指定构建平台'),
    scenes: z.array(z.object({
        url: z.string(),
        uuid: z.string()
    })).optional().describe('指定构建场景列表'),
    skipCompressTexture: z.boolean().default(false).optional().describe('是否跳过纹理压缩'),
    packAutoAtlas: z.boolean().default(true).optional().describe('是否自动合图'),
    sourceMaps: z.boolean().default(false).optional().describe('是否生成 sourceMap'),
    experimentalEraseModules: z.boolean().default(false).optional().describe('是否使用实验性 eraseModules'),
    bundleCommonChunk: z.boolean().default(false).optional().describe('是否在 Bundle 中嵌入公共脚本'),
    startScene: z.string().optional().describe('指定打开游戏后进入的场景'),
    debug: z.boolean().default(false).optional().describe('是否是调试模式'),
    mangleProperties: z.boolean().default(false).optional().describe('是否混淆属性'),
    inlineEnum: z.boolean().default(false).optional().describe('是否内联枚举'),
    md5Cache: z.boolean().default(false).optional().describe('是否使用 MD5 缓存'),
    polyfills: z.object({
        asyncFunctions: z.boolean().optional().describe('是否需要 async 函数 polyfill'),
        coreJs: z.boolean().optional().describe('是否需要 core-js polyfill'),
        targets: z.string().optional().describe('指定 core-js polyfill 的目标环境')
    }).describe('实现运行环境并不支持的 JavaScript 标准库'),
    buildScriptTargets: z.string().optional().describe('项目需要支持的目标环境信息，可以传递一个和 browserslist 兼容的查询字符串，例如：> 0.4%'),
    mainBundleCompressionType: z.enum(['none', 'merge_dep', 'merge_all_json', 'subpackage', 'zip']).default('merge_dep').optional().describe('指定主 bundle 的压缩类型'),
    mainBundleIsRemote: z.boolean().default(false).optional().describe('main Bundle 是否是远程包'),
    server: z.string().optional().describe('远程资源服务器地址'),
    startSceneAssetBundle: z.boolean().default(false).optional().describe('指定初始场景为远程 Bundle包'),
    bundleConfigs: z.array(z.object({
        root: z.string().describe('指定 bundle 的根目录'),
        priority: z.number().optional().describe('优先级'),
        compressionType: z.enum(['none', 'merge_dep', 'merge_all_json', 'subpackage', 'zip']).default('none').optional(),
        isRemote: z.boolean().default(false).optional().describe('是否是远程包'),
        output: z.boolean().default(true).optional(),
        name: z.string(),
        dest: z.string().optional().describe('指定 bundle 的输出目录'),
    })).describe('构建 Bundle 的指定包含传参，未传递时按照项目内所有 Bundle 的原始配置打包'),
    nativeCodeBundleMode: z.enum(['wasm', 'asmjs', 'both']).default('asmjs').optional().describe('指定构建的 Native Code 的模式'),
    moveRemoteBundleScript: z.boolean().default(false).optional().describe('移除远程包 Bundle 的脚本, 小游戏平台将会自动勾选'),
    useSplashScreen: z.boolean().default(false).optional().describe('是否使用自定义启动画面'),
    stage: z.enum(['build', 'make', 'run']).default('build').optional().describe('构建阶段指定，默认为 build 可指定为 make/run 等'),
    nextStages: z.array(z.enum(['make', 'run'])).optional().describe('指定后续联合的构建阶段，可指定多个'),
});

export type SchemaBuildOptionType = z.infer<typeof SchemaBuildOption>;

export const SchemaBuildResult = z.object({
    exitCode: z.number().describe('构建的退出码'),
}).describe('构建项目后的结果');
