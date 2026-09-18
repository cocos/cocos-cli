/**
 * 拖拽创建专用的内置目标目录，覆盖现有 Node Library 创建项及空节点
 * 地址不对应实际资源，仅供 beginCreateDrag 使用，createByAsset 不支持这些地址
 * 模板、Canvas 和 Prefab 策略由 CLI 内部实现，目录存在不代表拖拽创建已可用
 */
export const BUILTIN_NODE_CREATE_TARGETS = Object.freeze({
    empty: 'db://internal/node-library/empty',
    label: 'db://internal/node-library/label',
    'particle-system-2d': 'db://internal/node-library/particle-system-2d',
    'rich-text': 'db://internal/node-library/rich-text',
    sprite: 'db://internal/node-library/sprite',
    'sprite-splash': 'db://internal/node-library/sprite-splash',
    'tiled-map': 'db://internal/node-library/tiled-map',
    button: 'db://internal/node-library/button',
    'canvas-2d': 'db://internal/node-library/canvas-2d',
    'canvas-3d': 'db://internal/node-library/canvas-3d',
    'edit-box': 'db://internal/node-library/edit-box',
    layout: 'db://internal/node-library/layout',
    mask: 'db://internal/node-library/mask',
    'progress-bar': 'db://internal/node-library/progress-bar',
    'scroll-view': 'db://internal/node-library/scroll-view',
    slider: 'db://internal/node-library/slider',
    toggle: 'db://internal/node-library/toggle',
    'toggle-group': 'db://internal/node-library/toggle-group',
    'video-player': 'db://internal/node-library/video-player',
    'web-view': 'db://internal/node-library/web-view',
    widget: 'db://internal/node-library/widget',
} as const);

export type BuiltinNodeCreateEntryId = keyof typeof BUILTIN_NODE_CREATE_TARGETS;
