// 记录一些会在运行时使用的类型常量，确保编译后可用
/** 所有资源处理器类型的常量数组（用于 Zod enum 和 TypeScript type） */
export const ASSET_HANDLER_TYPES = [
    'directory',
    'unknown',
    'text',
    'json',
    'spine-data',
    'dragonbones',
    'dragonbones-atlas',
    'terrain',
    'javascript',
    'typescript',
    'scene',
    'prefab',
    'sprite-frame',
    'tiled-map',
    'buffer',
    'image',
    'sign-image',
    'alpha-image',
    'texture',
    'texture-cube',
    'erp-texture-cube',
    'render-texture',
    'texture-cube-face',
    'rt-sprite-frame',
    'gltf',
    'gltf-mesh',
    'gltf-animation',
    'gltf-skeleton',
    'gltf-material',
    'gltf-scene',
    'gltf-embeded-image',
    'fbx',
    'material',
    'physics-material',
    'effect',
    'effect-header',
    'audio-clip',
    'animation-clip',
    'animation-graph',
    'animation-graph-variant',
    'animation-mask',
    'ttf-font',
    'bitmap-font',
    'particle',
    'sprite-atlas',
    'auto-atlas',
    'label-atlas',
    'render-pipeline',
    'render-stage',
    'render-flow',
    'instantiation-material',
    'instantiation-mesh',
    'instantiation-skeleton',
    'instantiation-animation',
    'video-clip',
    '*',
    'database',
];

/** 支持创建的资源类型常量数组（用于 Zod enum 和 TypeScript type） */
export const SUPPORT_CREATE_TYPES = [
    'animation-clip',          // 动画剪辑
    'typescript',              // TypeScript 脚本
    'auto-atlas',              // 自动图集
    'effect',                  // 着色器效果
    'scene',                   // 场景
    'prefab',                  // 预制体
    'material',                // 材质
    // 'texture-cube',            // 立方体贴图
    'terrain',                 // 地形
    'physics-material',        // 物理材质
    'label-atlas',             // 标签图集
    'render-texture',          // 渲染纹理
    // 'animation-graph',         // 动画图
    // 'animation-mask',          // 动画遮罩
    // 'animation-graph-variant', // 动画图变体
    'directory',               // 文件夹
    'effect-header',           // 着色器头文件（chunk）
] as const;

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
