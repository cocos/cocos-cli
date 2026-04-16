/**
 * Cocos 配置元数据定义。
 *
 * 基于 COCOS_CONFIG 类型（@types/cocos.config.d.ts）展开，
 * 按 group(顶级模块) → node(二级字段) 组织。
 *
 * 供 Pink 配置面板渲染使用，通过 CocosHostConfiguration.getMetadata() 返回。
 */

export interface ICocosConfigurationPropertySchema {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    default?: unknown;
    title?: string;
    description?: string;
    scope: string[];
    enum?: any[];
    enumDescriptions?: string[];
    minimum?: number;
    maximum?: number;
    step?: number;
    order?: number;
}

export interface ICocosConfigurationNode {
    id: string;
    title: string;
    group: string;
    order?: number;
    properties: Record<string, ICocosConfigurationPropertySchema>;
}

export function getCocosConfigNodes(): ICocosConfigurationNode[] {
    const scope = ['cocos'] as const;
    let order = 0;

    function node(id: string, title: string, group: string, props: Record<string, Omit<ICocosConfigurationPropertySchema, 'scope'>>): ICocosConfigurationNode {
        const properties: Record<string, ICocosConfigurationPropertySchema> = {};
        for (const key in props) {
            properties[key] = { ...props[key], scope: [...scope] };
        }
        return { id, title, group, order: ++order, properties };
    }

    return [

        // ==================== engine — 物理配置 ====================

        node('engine.physicsConfig', '物理配置', 'engine', {
            'engine.physicsConfig.gravity': { type: 'object', default: { x: 0, y: -10, z: 0 }, title: '重力', description: '物理世界重力向量' },
            'engine.physicsConfig.allowSleep': { type: 'boolean', default: true, title: '允许休眠', description: '是否允许刚体休眠' },
            'engine.physicsConfig.sleepThreshold': { type: 'number', default: 0.1, minimum: 0, title: '休眠阈值', description: '刚体进入休眠的速度阈值' },
            'engine.physicsConfig.autoSimulation': { type: 'boolean', default: true, title: '自动模拟', description: '是否自动进行物理模拟' },
            'engine.physicsConfig.fixedTimeStep': { type: 'number', default: 1 / 60, minimum: 0, title: '固定时间步长', description: '物理模拟固定时间步长 (秒)' },
            'engine.physicsConfig.maxSubSteps': { type: 'number', default: 1, minimum: 0, title: '最大子步数', description: '每帧最大物理子步数' },
            'engine.physicsConfig.useNodeChains': { type: 'boolean', default: true, title: '使用节点链' },
            'engine.physicsConfig.physicsEngine': { type: 'string', default: '', title: '物理引擎', description: '使用的物理引擎后端' },
            'engine.physicsConfig.collisionMatrix': { type: 'object', default: { 0: 1 }, title: '碰撞矩阵', description: '碰撞分组矩阵' },
            'engine.physicsConfig.defaultMaterial': { type: 'string', default: '', title: '默认物理材质', description: '默认物理材质 UUID' },
            'engine.physicsConfig.physX': { type: 'object', default: { notPackPhysXLibs: false, multiThread: false, subThreadCount: 0, epsilon: 0.0001 }, title: 'PhysX 配置', description: 'PhysX 引擎配置' },
        }),

        // ==================== engine — 设计分辨率 ====================

        node('engine.designResolution', '设计分辨率', 'engine', {
            'engine.designResolution.width': { type: 'number', default: 1280, title: '宽度' },
            'engine.designResolution.height': { type: 'number', default: 720, title: '高度' },
            'engine.designResolution.fitWidth': { type: 'boolean', default: true, title: '适配宽度' },
            'engine.designResolution.fitHeight': { type: 'boolean', default: false, title: '适配高度' },
        }),

        // ==================== engine — 启动画面 ====================

        node('engine.splashScreen', '启动画面', 'engine', {
            'engine.splashScreen.displayRatio': { type: 'number', default: 1, title: '显示比例' },
            'engine.splashScreen.totalTime': { type: 'number', default: 2000, minimum: 0, title: '显示时长 (ms)' },
            'engine.splashScreen.watermarkLocation': { type: 'string', default: 'default', title: '水印位置', enum: ['default', 'topLeft', 'topRight', 'topCenter', 'bottomLeft', 'bottomCenter', 'bottomRight'] },
            'engine.splashScreen.autoFit': { type: 'boolean', default: true, title: '自动适配' },
            'engine.splashScreen.logo': { type: 'object', default: { type: 'default', image: '' }, title: 'Logo 配置' },
            'engine.splashScreen.background': { type: 'object', default: { type: 'default', color: { x: 0.0156862745098039, y: 0.0352941176470588, z: 0.0392156862745098, w: 1 }, image: '' }, title: '背景配置' },
        }),

        // ==================== engine — 模块配置 ====================

        node('engine.moduleConfig', '模块配置', 'engine', {
            'engine.includeModules': { type: 'array', default: ['2d', '3d', 'animation', 'audio', 'base', 'ui', 'particle', 'physics-ammo', 'tween', 'spine-3.8', 'dragon-bones', 'terrain', 'tiled-map'], title: '包含模块', description: '引擎包含的功能模块列表' },
            'engine.flags': { type: 'object', default: { LOAD_BULLET_MANUALLY: false, LOAD_SPINE_MANUALLY: false }, title: '特性标志', description: '引擎特性开关' },
            'engine.noDeprecatedFeatures': { type: 'object', default: undefined, title: '禁用废弃特性', description: '是否禁用废弃特性' },
        }),

        // ==================== engine — 渲染 ====================

        node('engine.rendering', '渲染', 'engine', {
            'engine.renderPipeline': { type: 'string', default: 'fd8ec536-a354-4a17-9c74-4f3883c378c8', title: '渲染管线', description: '渲染管线 UUID' },
            'engine.customPipeline': { type: 'boolean', default: undefined, title: '自定义管线', description: '是否使用自定义渲染管线' },
            'engine.highQuality': { type: 'boolean', default: false, title: '高画质' },
            'engine.downloadMaxConcurrency': { type: 'number', default: 15, minimum: 1, title: '最大下载并发数' },
            'engine.customJointTextureLayouts': { type: 'array', default: [], title: '自定义骨骼贴图布局', description: '自定义骨骼动画贴图布局' },
        }),

        // ==================== engine — 宏配置 ====================

        node('engine.macroConfig', '宏配置', 'engine', {
            'engine.macroConfig': { type: 'object', default: { ENABLE_TILEDMAP_CULLING: true, TOUCH_TIMEOUT: 5000, ENABLE_TRANSPARENT_CANVAS: false, ENABLE_WEBGL_ANTIALIAS: true, ENABLE_FLOAT_OUTPUT: false, CLEANUP_IMAGE_CACHE: false, ENABLE_MULTI_TOUCH: true, MAX_LABEL_CANVAS_POOL_SIZE: 20, ENABLE_WEBGL_HIGHP_STRUCT_VALUES: false, BATCHER2D_MEM_INCREMENT: 144 }, title: '宏配置', description: '引擎宏定义配置' },
            'engine.macroCustom': { type: 'array', default: [], title: '自定义宏', description: '自定义宏列表' },
        }),

        // ==================== engine — 图层配置 ====================

        node('engine.layers', '图层配置', 'engine', {
            'engine.customLayers': { type: 'array', default: [], title: '自定义图层', description: '自定义图层列表' },
            'engine.sortingLayers': { type: 'array', default: [], title: '排序图层', description: '排序图层列表' },
        }),

        // ==================== script ====================

        node('script', '脚本', 'script', {
            'script.useDefineForClassFields': { type: 'boolean', default: true, title: '使用 defineProperty 定义类字段' },
            'script.allowDeclareFields': { type: 'boolean', default: true, title: '允许声明字段' },
            'script.loose': { type: 'boolean', default: false, title: '宽松模式' },
            'script.guessCommonJsExports': { type: 'boolean', default: false, title: '推测 CommonJS 导出', description: '是否自动推测 CommonJS 模块的导出' },
            'script.exportsConditions': { type: 'array', default: [], title: '导出条件' },
            'script.preserveSymlinks': { type: 'boolean', default: false, title: '保留符号链接' },
            'script.importMap': { type: 'string', default: '', title: 'Import Map' },
            'script.previewBrowserslistConfigFile': { type: 'string', default: '', title: '预览 Browserslist 配置文件' },
            'script.updateAutoUpdateImportConfig': { type: 'boolean', default: false, title: '自动更新 Import 配置' },
        }),

        // ==================== import ====================

        node('import', '资源导入', 'import', {
            'import.globList': { type: 'array', default: [], title: 'Glob 列表', description: '资源导入 glob 匹配规则' },
            'import.restoreAssetDBFromCache': { type: 'boolean', default: false, title: '从缓存恢复资源库' },
            'import.createTemplateRoot': { type: 'string', default: '', title: '模板根目录' },
        }),

        // ==================== builder — 构建通用配置 ====================

        node('builder.common', '构建通用配置', 'builder', {
            'builder.common.buildPath': { type: 'string', default: 'project://build', title: '构建路径', description: '构建输出目录' },
            'builder.common.debug': { type: 'boolean', default: true, title: '调试模式', description: '是否为调试模式' },
            'builder.common.sourceMaps': { type: 'string', default: false, title: 'Source Maps', description: '是否生成 sourceMap', enum: [false, true, 'inline'], enumDescriptions: ['关闭', '启用 (独立文件)', '启用 (内联)'] },
            'builder.common.md5Cache': { type: 'boolean', default: false, title: 'MD5 缓存', description: '给构建后的资源文件名加上 MD5 信息' },
            'builder.common.packAutoAtlas': { type: 'boolean', default: true, title: '自动合图', description: '是否自动合图' },
            'builder.common.skipCompressTexture': { type: 'boolean', default: false, title: '跳过纹理压缩' },
            'builder.common.experimentalEraseModules': { type: 'boolean', default: false, title: '实验性 EraseModules' },
            'builder.common.mangleProperties': { type: 'boolean', default: false, title: '混淆属性名' },
            'builder.common.inlineEnum': { type: 'boolean', default: true, title: '内联枚举' },
            'builder.common.bundleCommonChunk': { type: 'boolean', default: false, title: '在 Bundle 中嵌入公共脚本', description: '在 Bundle 中包含所有依赖的公共脚本' },
            'builder.common.mainBundleCompressionType': { type: 'string', default: 'merge_dep', title: '主包压缩类型', enum: ['none', 'merge_dep', 'merge_all_json', 'subpackage', 'zip'] },
            'builder.common.mainBundleIsRemote': { type: 'boolean', default: false, title: '主包为远程包' },
            'builder.common.moveRemoteBundleScript': { type: 'boolean', default: false, title: '移除远程包 Bundle 脚本' },
            'builder.common.useSplashScreen': { type: 'boolean', default: true, title: '使用启动画面' },
            'builder.common.nativeCodeBundleMode': { type: 'string', default: 'asmjs', title: '原生代码打包模式', enum: ['wasm', 'asmjs', 'both'], enumDescriptions: ['WebAssembly', 'asm.js', '两者'] },
        }),

        // ==================== builder — 缓存配置 ====================

        node('builder.useCacheConfig', '缓存配置', 'builder', {
            'builder.useCacheConfig.serializeData': { type: 'boolean', default: true, title: '序列化数据缓存' },
            'builder.useCacheConfig.engine': { type: 'boolean', default: true, title: '引擎缓存' },
            'builder.useCacheConfig.textureCompress': { type: 'boolean', default: true, title: '纹理压缩缓存' },
            'builder.useCacheConfig.autoAtlas': { type: 'boolean', default: true, title: '自动合图缓存' },
        }),

        // ==================== builder — 纹理压缩配置 ====================

        node('builder.textureCompressConfig', '纹理压缩配置', 'builder', {
            'builder.textureCompressConfig': { type: 'object', default: { userPreset: {}, defaultConfig: {}, customConfigs: {}, genMipmaps: false }, title: '纹理压缩配置', description: '纹理压缩预设和自定义配置' },
        }),

        // ==================== builder — 平台配置 ====================

        node('builder.platforms', '平台配置', 'builder', {
            'builder.platforms': { type: 'object', default: {}, title: '平台配置', description: 'TODO: 各平台构建选项（web-desktop, web-mobile 等）' },
        }),

        // ==================== builder — Bundle 配置 ====================

        node('builder.bundleConfig', 'Bundle 配置', 'builder', {
            'builder.bundleConfig': { type: 'object', default: { custom: {} }, title: 'Bundle 配置', description: 'TODO: 自定义 Bundle 配置' },
        }),
    ];
}
