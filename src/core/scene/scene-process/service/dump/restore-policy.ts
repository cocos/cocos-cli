/**
 * 快照恢复策略：定义 undo/redo 恢复时，哪些属性可以安全写回。
 *
 * 这里的常量必须和 dump encode 函数保持一致：
 * - NODE_SNAPSHOT_RESTORE_PROPERTY_PATHS  ↔  encodeNode()  (encode.ts)
 * - COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS  ↔  encodeComponent()  (encode.ts)
 *
 * 如果在 encodeNode 或 encodeComponent 里新增/移除了可编辑属性，
 * 这里对应的常量也要同步更新，确保 undo/redo 能正确覆盖这些属性。
 */

/**
 * Node 快照可恢复属性路径（白名单）。
 *
 * undo/redo 从 node 快照 dump 恢复时，只会写回这些属性。
 * 结构字段（uuid、parent、children、__comps__、__type__、__prefab__ 等）
 * 不在这里恢复，因为它们由 node-structure command 管理，不由 snapshot command 管理。
 *
 * `name` 和 `locked` 也不在这里恢复，因为它们需要特殊处理：
 * `name` 需要通知编辑器名称映射，`locked` 需要操作 objFlags bit；
 * 这两个属性由 undo 层单独处理。
 */
export const NODE_SNAPSHOT_RESTORE_PROPERTY_PATHS = ['active', 'layer', 'mobility', 'position', 'rotation', 'scale'] as const;

/**
 * Component 快照身份字段 / 编辑器内部字段（黑名单）。
 *
 * 恢复 component 快照 dump 时会跳过这些 key。
 * `dump.value` 里的其他 key 会被当成用户可编辑属性，
 * 并交给 `restoreProperty` 写回。
 */
export const COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS = ['uuid', 'node', '__scriptAsset', '__eventTargets'] as const;
