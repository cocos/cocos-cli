# Scene Undo/Redo

Last updated: 2026-06-10

## 目标

Scene undo/redo 是 scene-process 里的编辑历史系统。它记录当前正在编辑的 scene/prefab 资源里真实写入数据的操作，让用户可以撤销、重做，并能知道当前资源是否还有未保存的修改。gizmo 拖拽这类连续修改会合并成一条历史记录。

它不是 CLI 命令历史，也不是 MCP tool。它的本质是 scene-process 内的“可撤销命令”系统：哪个业务 API 修改了数据，就由这个业务 API 明确向 `UndoService` 记录一条 command。

## 当前范围
已实现：

- 当前打开资源的一套内存历史记录。
- `Undo.undo` / `Redo.redo`。
- `canUndo` / `canRedo`。
- `isDirty` / `markSaved`。
- `clearHistory`。
- `beginGroup` / `endGroup` / `cancelGroup` / `isGroupActive`。
- gizmo/drag recording：`beginRecording` / `endRecording` / `cancelRecording`。
- 节点结构命令：create、delete。
- 组件结构命令：add、remove。
- Prefab 命令：create/revert、apply、unlink/unpack。
- snapshot 命令：node set/reset/resetProperty、component set/reset、gizmo recording、UI align/distribute recording、子树 layer、children order、component order、reparent、node lock。
- open / close / reload 清空历史记录，save 标记 clean。

目前不覆盖：

- Animation 专用 undo：keyframe、curve、clip 编辑。
- Asset DB 文件级 undo：create、delete、move、rename、import。
- 多编辑上下文/多标签页历史：当前是一个 scene-process 只维护当前资源的一套历史记录。
- 持久化历史记录。
- History UI API：例如 getHistory、getNextUndo、getNextRedo。
- 任意数组属性的公开 undo 语义。当前 `Node.moveArrayElement` 只验证了 `children` 与 `__comps__/_components`；其他数组路径暂时不生成 undo command。

## 覆盖范围总览

Undo/redo 只覆盖“当前正在编辑的 scene/prefab 资源中，会被保存下来的数据变更”。dirty 表示当前内容和最近一次保存或标记为已保存时相比，是否还有未保存的变更；这个判断来自 `UndoService` 的历史状态，不从 `node:change`、`component:*`、reload、selection、camera 或 view 事件推断。

### 已覆盖并会影响 dirty

| 范围 | 已覆盖 API / 行为 | 记录方式 |
| --- | --- | --- |
| Node 生命周期 | create、delete、copy paste、duplicate | structure command |
| Node 属性 | setProperty、reset、resetProperty、updatePropertyFromNull、setNodeAndChildrenLayer、changeNodeLock | snapshot command |
| Node 层级 | setParent、reorder、children moveArrayElement、cut paste | reparent / order snapshot |
| Component 生命周期 | add、remove、removeArrayElement(`__comps__`) | component structure command |
| Component 属性 | setProperty、reset | snapshot command |
| Prefab 实例/资源 | createPrefabFromNode、applyPrefabChanges、revertToPrefab、unpackPrefabInstance、unlinkPrefab、apply/revert removed component override | prefab domain command |
| UI 编辑操作 | alignSelection、distributeSelection | scoped recording |
| Gizmo 拖拽 | transform gizmo drag begin/end | scoped recording |
| Undo 状态管理 | undo、redo、markSaved/save、clearHistory、open/close/reload | undo 历史位置 / 已保存状态 |

### 明确不进入 undo/dirty

| 范围 | API / 行为 | 原因 |
| --- | --- | --- |
| 查询 | query、queryNodeTree、getPrefabInfo、isPrefabInstance、canUndo、canRedo、isDirty | 只读 |
| 选择状态 | Selection.select、unselect、clear、query | 编辑器临时状态，不写 scene/prefab 持久化数据 |
| 预览属性 | previewSetProperty、cancelPreviewSetProperty | 预览态，可取消，不形成持久化 command |
| Camera / SceneView | camera pan/orbit/zoom、scene view light/visibility/view config | 视图状态，不是 scene 数据 dirty 来源 |
| Gizmo UI 状态 | tool/view mode、snap config、gizmo visibility、selection highlight | 编辑器 UI 状态，不是 scene 数据 dirty 来源 |
| Prefab soft reload | asset-change 触发的 editor reload、`prefab:asset-reload` | 刷新链路，不是持久化修改本身 |
| Asset DB 文件操作 | asset create/delete/move/rename/import/reimport/refresh/save | 不属于 scene 编辑历史 |

### 暂未覆盖或新增时需要单独设计

| 范围 | 当前状态 |
| --- | --- |
| Animation 编辑 | 暂未定义 command，keyframe、curve、clip、时间轴选择需要单独设计 |
| Scene globals / 全局设置 | 当前没有统一公开的修改 API 纳入本轮覆盖；以后新增会写入 scene 的 globals 设置时，必须接入 undo/dirty |
| 任意数组属性 | 当前只验证 `children` 和 `__comps__/_components`，其他数组路径默认不生成 undo command |
| 多 editor context 历史 | 当前 scene-process 只有当前资源一套历史记录 |
| History UI 查询 | 暂无 getHistory/getNextUndo/getNextRedo |
| 持久化 undo 历史 | 暂无 |

## 代码位置

核心类型：

- `src/core/scene/common/undo.ts`
  - `IUndoScope`
  - `IUndoCommandMeta`
  - `IUndoRedoResult`
  - `IUndoCommand`
  - `IUndoGroupOptions`
  - `IUndoBeginOptions`
  - `IUndoService`
  - `IUndoEvents`

Manager 与 service：

- `src/core/scene/scene-process/service/undo/scene-undo-manager.ts`
  - 管理 stack、cursor、dirty 的已保存状态、group、recording、queue、isApplying、maxStackSize。
- `src/core/scene/scene-process/service/undo.ts`
  - scene-process 的 `UndoService`。
  - 包装 manager。
  - 广播 `undo:changed` / `dirty:changed`。
  - 提供 scene snapshot adapter 给 recording。
- `src/core/scene/scene-process/service/redo.ts`
  - scene-process 的 `RedoService`。
  - 只提供 `Redo.redo/canRedo` namespace，内部委托给 `UndoService`，不持有独立 stack。
- `src/core/scene/scene-process/engine-bootstrap.ts`
  - scene-process runtime 内把 `globalThis.cli.Scene` 绑定到 `DecoratorService`。
  - 因此 runtime `cli.Scene.Undo` / `cli.Scene.Redo` 来自 `@register('Undo')` / `@register('Redo')`。

Command：

- `src/core/scene/scene-process/service/undo/commands/snapshot-command.ts`
- `src/core/scene/scene-process/service/undo/commands/composite-command.ts`
- `src/core/scene/scene-process/service/undo/commands/create-node-command.ts`
- `src/core/scene/scene-process/service/undo/commands/remove-node-command.ts`
- `src/core/scene/scene-process/service/undo/commands/add-component-command.ts`
- `src/core/scene/scene-process/service/undo/commands/remove-component-command.ts`
- `src/core/scene/scene-process/service/undo/commands/node-structure-command-utils.ts`
- `src/core/scene/scene-process/service/undo/commands/component-command-utils.ts`
- `src/core/scene/scene-process/service/undo/commands/prefab-node-structure-command.ts`
- `src/core/scene/scene-process/service/undo/commands/prefab-apply-command.ts`
- `src/core/scene/scene-process/service/undo/commands/prefab-unwrap-command.ts`
- `src/core/scene/scene-process/service/undo/commands/prefab-command-utils.ts`

业务接入：

- `src/core/scene/scene-process/service/node.ts`
  - RPC/service 入口，负责参数解析、锁、调用 node manager、调用 undo helper。
- `src/core/scene/scene-process/service/node/node-undo.ts`
  - Node 相关 undo/redo helper，负责 snapshot capture/apply、children order、component order、reparent、create-node command 捕获。
- `src/core/scene/scene-process/service/ui.ts`
  - `alignSelection` / `distributeSelection` 通过 `Undo.beginRecording/endRecording` 记录选中节点位置变化。
- `src/core/scene/scene-process/service/prefab.ts`
  - Prefab 公开修改 API 负责 capture before/after，并通过 `PrefabUndoHelper` push Prefab command。
  - `applyPrefabChanges` 保存 prefab asset 后立即进入 undo/dirty 编排；asset change 触发的 soft reload 只负责刷新编辑器状态，并按 prefab asset uuid 保留当前 undo 历史。soft reload 会记住修改发生时的 editor uuid，避免 debounce 期间切换编辑器后 reload 到错误资源。
- `src/core/scene/scene-process/service/prefab/prefab-undo.ts`
  - Prefab 相关 undo/redo helper，负责 snapshot capture、before/after 比较、push command，以及 apply prefab reload 时保留 undo 历史的标记。

业务 API 已接入：

- `createByType`
- `createByAsset`
- `delete`
- `setProperty`
- `reset`
- `resetProperty`
- `updatePropertyFromNull`
- `setNodeAndChildrenLayer`
- `setParent`
- `reorder`
- `paste`（copy paste 创建节点、cut paste 移动节点）
- `duplicate`
- `moveArrayElement`
- `removeArrayElement`
- `changeNodeLock`
- `src/core/scene/scene-process/service/prefab.ts`
  - `createPrefabFromNode`
  - `applyPrefabChanges`
  - `revertToPrefab`
  - `unpackPrefabInstance`
  - `unlinkPrefab`
  - `revertRemovedComponent`
  - `applyRemovedComponent`
- `src/core/scene/scene-process/service/component.ts`
  - `add`
  - `remove`
  - `setProperty`
  - `reset`
- `src/core/scene/scene-process/service/gizmo/base/gizmo-base.ts`
  - gizmo drag begin/end recording。
- `src/core/scene/scene-process/service/editor.ts`
  - open / close / reload / save 生命周期清栈或 mark saved。

主进程 / MCP proxy：

- `src/core/scene/main-process/proxy/node-proxy.ts`
- `src/core/scene/main-process/proxy/component-proxy.ts`
- `src/core/scene/main-process/index.ts`

这层只是 Node 主进程、MCP、API 侧访问 scene-process 的 RPC 转发层，不是 runtime `cli.Scene` 的来源。Undo/Redo recording 不在 `main-process/proxy` 暴露，避免把 runtime Scene API 和 MCP/RPC proxy 混在一起。runtime 的直接入口是 scene-process 里通过 `@register(...)` 注册出来的 service。

测试：

- `src/core/scene/test/undo-manager.test.ts`
- `src/core/scene/test/undo-redo.testcase.ts`
- `src/core/scene/test/scene.test.ts`
- `packages/cocos-cli-types/__tests__/__snapshots__/dts-snapshot.test.ts.snap`

## 对外 API

Scene runtime 可直接使用的 undo/redo API：

```ts
await cli.Scene.Undo.undo();
await cli.Scene.Undo.canUndo();
await cli.Scene.Undo.isDirty();
await cli.Scene.Undo.markSaved();
await cli.Scene.Undo.clearHistory();

await cli.Scene.Redo.redo();
await cli.Scene.Redo.canRedo();
```

Group API：

```ts
const groupId = await cli.Scene.Undo.beginGroup({ label: 'Move Selection' });

try {
  await cli.Scene.Node.update(...);
  await cli.Scene.Component.setProperty(...);
  await cli.Scene.Undo.endGroup(groupId);
} catch (error) {
  await cli.Scene.Undo.cancelGroup(groupId);
  throw error;
}
```

`cancelGroup` 只丢弃 undo 记录，不回滚已经发生的业务变更。

下面这些 Node/Component 业务 API 已经接入 undo/dirty：

```ts
await cli.Scene.Component.reset({ path: componentPath });

await cli.Scene.Node.setNodeAndChildrenLayer({
  nodePath,
  path: 'layer',
  dump,
  record: true,
});

await cli.Scene.Node.setParent({
  paths: ['Canvas/Button'],
  parentPath: 'Canvas/Panel',
  keepWorldTransform: true,
});

await cli.Scene.Node.reorder({
  path: 'Canvas',
  target: 0,
  offset: 2,
});

await cli.Scene.Node.moveArrayElement({
  nodePath: 'Canvas',
  path: 'children',
  target: 2,
  offset: -2,
});

await cli.Scene.Node.moveArrayElement({
  nodePath: 'Canvas/Button',
  path: '__comps__',
  target: 0,
  offset: 1,
});

await cli.Scene.Node.removeArrayElement({
  nodePath: 'Canvas/Button',
  path: '__comps__',
  index: 0,
});

await cli.Scene.Node.changeNodeLock({
  paths: ['Canvas/Button'],
  locked: true,
  loop: false,
});
```

`copy`、`cut`、`queryClipboardState` 只更新剪贴板状态，本身不改变 scene，不单独进入 undo 栈。`paste` 才是真正修改 scene 的操作：copy paste 使用 `CreateNodeCommand`，cut paste 使用 reparent snapshot。

`moveArrayElement` 使用新的 params 形态。当前 undo/redo 已验证：

- `path: 'children'`：恢复同父节点 children 顺序。
- `path: '__comps__'` / `'_components'`：恢复组件数组顺序。

其他数组路径仍允许执行底层修改，但不会生成 undo command，避免产生“看起来能撤销、实际恢复不了”的假历史。要支持更多数组，必须先定义这个数组如何恢复，并补测试。

Recording API 当前在 scene-process `IUndoService` 内存在，并被 gizmo 使用：

```ts
const recordingId = Service.Undo.beginRecording([nodeUuid], { label: 'Drag Node' });
// dragging mutates scene many times
await Service.Undo.endRecording(recordingId);
```

Recording API 当前已经存在于 scene-process 的 `IUndoService`，runtime `cli.Scene.Undo` 可以通过 `beginRecording/endRecording/cancelRecording` 使用。`IPublicUndoService` 是给 MCP/RPC proxy 用的对外接口，目前仍然不暴露 recording；不要通过 `main-process/proxy` 暴露这组 API。

Recording 只适合现有 node/component 的连续属性编辑。它不会创建或删除 node/component，也不会自动把结构变化合成一个可撤销命令。多步骤结构变化应使用 `beginGroup/endGroup` 合并已有结构 command，或通过 `customCommand` 提供专用 undo/redo 逻辑。

## Command 模型

所有可撤销行为都实现同一个接口：

```ts
interface IUndoCommand {
  meta: IUndoCommandMeta;
  undo(): Promise<IUndoRedoResult>;
  redo(): Promise<IUndoRedoResult>;
}
```

`IUndoCommandMeta` 至少包含：

- `id`
- `label`
- `type`
- `scope`
- `timestamp`

`label` 和 `type` 是后续 History UI 展示历史记录时最基本的数据。当前还没有 history 查询 API，但 command metadata 要保持稳定。

Undo/redo 返回：

```ts
interface IUndoRedoResult {
  success: boolean;
  commandId?: string;
  label?: string;
  reason?: string;
}
```

空栈时：

```ts
await cli.Scene.Undo.undo(); // { success: false, reason: 'Cannot undo' }
await cli.Scene.Redo.redo(); // { success: false, reason: 'Cannot redo' }
```

`Redo` 是独立 namespace，但不是独立 history。`RedoService` 只把 `redo/canRedo` 转发到同一个 `UndoService` / `SceneUndoManager`。

## Manager 行为

`SceneUndoManager` 负责管理 undo/redo 的内部状态：

- command stack，也就是历史记录列表。
- cursor，也就是当前停在历史记录里的哪个位置。
- dirty 判断用的已保存状态。
- group。
- recording。
- `isApplying`。
- undo/redo action queue，用来保证撤销/重做按顺序执行。
- `maxStackSize`，当前默认 100。

关键规则：

- push 新 command 时，如果当前不在历史记录末尾，清除后面的 redo 记录。
- undo 成功后，历史位置向前移动。
- redo 成功后，历史位置向后移动。
- command 失败时，历史位置不变。
- undo/redo 期间 `isApplying = true`，业务 service 应跳过新的 undo 记录。
- undo/redo 串行执行，避免并发点击破坏历史位置。
- active group 存在时，push 的 command 先进入 group children。
- `endGroup` 把 children 包成 `CompositeCommand` 后入主栈。
- `cancelGroup` 只丢弃 group children，不回滚已经发生的业务修改。
- 不支持嵌套 group。

dirty 规则：

- 初始 clean。
- push command 后 dirty。
- `markSaved` 后 clean。
- undo 回到最近一次保存或标记为已保存时的状态后 clean。
- redo 离开这个已保存状态后 dirty。
- `clearHistory` 后 clean。
- open / close / reload 调用 `clearHistory`。
- save 调用 `markSaved`。

事件：

- `undo:changed`：undo/redo stack 状态改变时广播。
- `dirty:changed`：dirty 状态发生翻转时广播。

## 当前已接入的业务

| 业务 | API / 入口 | command 类型 | 文件 |
| --- | --- | --- | --- |
| 创建节点 | `NodeService.createByType` | `node:create` | `src/core/scene/scene-process/service/node.ts` |
| 通过资源创建节点 | `NodeService.createByAsset` | `node:create` | `src/core/scene/scene-process/service/node.ts` |
| 删除节点 | `NodeService.delete` | `node:delete` | `src/core/scene/scene-process/service/node.ts` |
| 设置节点属性 | `NodeService.setProperty` | `node:set-property` snapshot | `src/core/scene/scene-process/service/node.ts` |
| 重置节点 | `NodeService.reset` | `node:reset` snapshot | `src/core/scene/scene-process/service/node.ts` |
| 重置节点属性 | `NodeService.resetProperty` | `node:reset-property` snapshot | `src/core/scene/scene-process/service/node.ts` |
| 初始化 null/默认属性 | `NodeService.updatePropertyFromNull` | `node:update-property-from-null` snapshot | `src/core/scene/scene-process/service/node.ts` |
| 递归设置 layer | `NodeService.setNodeAndChildrenLayer` | `node:set-node-and-children-layer` snapshot | `src/core/scene/scene-process/service/node.ts` |
| 跨父节点移动 | `NodeService.setParent` | `node:set-parent` reparent snapshot | `src/core/scene/scene-process/service/node/node-undo.ts` |
| 同父节点 children 排序 | `NodeService.moveArrayElement` with `path: 'children'` / `NodeService.reorder` | `node:move-array-element` child-order snapshot | `src/core/scene/scene-process/service/node/node-undo.ts` |
| 组件顺序排序 | `NodeService.moveArrayElement` with `path: '__comps__'` | `node:move-array-element` component-order snapshot | `src/core/scene/scene-process/service/node/node-undo.ts` |
| copy paste 创建节点 | `NodeService.copy` + `NodeService.paste` | `node:create` | `src/core/scene/scene-process/service/node.ts` |
| cut paste 移动节点 | `NodeService.cut` + `NodeService.paste` | `node:paste-cut` reparent snapshot | `src/core/scene/scene-process/service/node/node-undo.ts` |
| 复制节点 | `NodeService.duplicate` | `node:create` | `src/core/scene/scene-process/service/node.ts` |
| 删除组件数组元素 | `NodeService.removeArrayElement` with `path: '__comps__'` | `component:remove` | `src/core/scene/scene-process/service/undo/commands/remove-component-command.ts` |
| 锁定/解锁节点 | `NodeService.changeNodeLock` | `node:change-lock` snapshot | `src/core/scene/scene-process/service/node/node-undo.ts` |
| 添加组件 | `ComponentService.add` | `component:add` | `src/core/scene/scene-process/service/component.ts` |
| 删除组件 | `ComponentService.remove` | `component:remove` | `src/core/scene/scene-process/service/component.ts` |
| 设置组件属性 | `ComponentService.setProperty` | `component:set-property` snapshot | `src/core/scene/scene-process/service/component.ts` |
| 重置组件 | `ComponentService.reset` | `component:reset` snapshot | `src/core/scene/scene-process/service/component.ts` |
| 创建 Prefab | `PrefabService.createPrefabFromNode` | `prefab:create` | `src/core/scene/scene-process/service/undo/commands/prefab-node-structure-command.ts` |
| 应用 Prefab 修改 | `PrefabService.applyPrefabChanges` | `prefab:apply` | `src/core/scene/scene-process/service/undo/commands/prefab-apply-command.ts` |
| 还原到 Prefab | `PrefabService.revertToPrefab` | `prefab:revert` | `src/core/scene/scene-process/service/undo/commands/prefab-node-structure-command.ts` |
| 解包 Prefab 实例 | `PrefabService.unpackPrefabInstance` | `prefab:unpack` | `src/core/scene/scene-process/service/undo/commands/prefab-unwrap-command.ts` |
| 解绑 Prefab | `PrefabService.unlinkPrefab` | `prefab:unlink` | `src/core/scene/scene-process/service/undo/commands/prefab-unwrap-command.ts` |
| 应用/还原移除组件 override | `PrefabService.applyRemovedComponent` / `PrefabService.revertRemovedComponent` | `prefab:apply-removed-component` / `prefab:revert-removed-component` | `src/core/scene/scene-process/service/undo/commands/prefab-node-structure-command.ts` |
| UI 对齐/分布 | `UIService.alignSelection` / `UIService.distributeSelection` | `recording:snapshot` | `src/core/scene/scene-process/service/ui.ts` |
| gizmo 拖拽 | `GizmoBase` begin/end recording | `recording:snapshot` | `src/core/scene/scene-process/service/gizmo/base/gizmo-base.ts` |
| 多操作合并 | `Undo.beginGroup/endGroup` | `group:composite` | `src/core/scene/scene-process/service/undo/commands/composite-command.ts` |

## Snapshot 和 Structure 的边界

Snapshot command 适合属性修改：

- capture before dump。
- 执行业务修改。
- capture after dump。
- before/after 相同时不入栈。
- undo 应用 before。
- redo 应用 after。

Structure command 适合对象结构变化：

- 节点创建/删除。
- 组件添加/删除。

结构命令不能只依赖 uuid。恢复时还需要 path、parent path、sibling index、component index 等兜底信息，避免对象被删除后找不回来。

## 特殊实现说明

### `setNodeAndChildrenLayer`

这个操作会递归修改整棵子树的 layer。当前实现会：

- 收集目标节点及全部子孙。
- capture before snapshot。
- 调用底层 `nodeMgr.setNodeAndChildrenLayer`。
- capture after snapshot。
- 只 push 一个 command。

如果 `record: false`、正在执行 undo/redo，或当前 recording 已经覆盖相关节点，则不会重复记录。

### `moveArrayElement`

这个 API 使用 params 形态：

```ts
await cli.Scene.Node.moveArrayElement({
  nodePath,
  path,
  target,
  offset,
});
```

`path: 'children'` 不使用通用 node dump 恢复 children 顺序，而是单独保存：

- parent uuid。
- parent path。
- child uuid 顺序。

undo/redo 时按 child uuid 调用 `setSiblingIndex` 恢复顺序。

`path: '__comps__'` / `'_components'` 使用 component-order snapshot，保存：

- node uuid。
- node path。
- component uuid 顺序。

undo/redo 时按 component uuid 重排节点的 `_components` 数组。

当前限制：

- 只验证 `children` 和 `__comps__/_components`。
- 其他数组路径仍可执行底层修改，但不会生成 undo command。
- 新增数组路径支持前，必须先确认该数组是否能通过 uuid/path 等稳定标识恢复。

### Reparent / Paste / Duplicate

`setParent` 与 cut paste 都使用 reparent snapshot。snapshot 包含节点 uuid/path、父节点 uuid/path、sibling index 与节点 dump。undo/redo 时先恢复父节点和 sibling index，再恢复基础 node dump。

copy paste 与 duplicate 会产生新节点，所以复用 `CreateNodeCommand`。记录前先收集 scene 中已有 node uuid，修改后只捕获新增 root 节点，避免把新增节点的子树拆成多个 command。

### UI align/distribute

`UIService.alignSelection` 和 `UIService.distributeSelection` 会修改选中节点 world position。它们不需要新 command，使用 `Undo.beginRecording(selectedUuids)` / `Undo.endRecording(id)` 让一次对齐或分布变成一个 snapshot command。

### PrefabService

Prefab 时序、soft reload、风险和后续重构方向见 [prefab.md](./prefab.md)。

Prefab 不使用普通 node dump snapshot 覆盖。原因是 prefab 关系包含 `_prefab`、fileId、mounted children/components、propertyOverrides 等 metadata，普通属性 snapshot 只适合稳定对象的属性恢复。

当前结论：

- `createPrefabFromNode` / `revertToPrefab` 使用 `PrefabNodeStructureCommand`，通过 prefab-aware node structure snapshot 恢复前后结构和 metadata。
- `applyPrefabChanges` 使用 `PrefabApplyCommand`，同时恢复 prefab asset 内容与场景中的 prefab-aware node structure snapshot。undo/redo 不等待全局 `Editor.reload`，避免 dirty/undo command 被异步刷新链路阻塞。
- `unlinkPrefab` / `unpackPrefabInstance` 使用 `PrefabUnwrapCommand`。undo 通过 before snapshot 恢复 prefab 关系，redo 重新执行底层 unwrap 语义。
- `applyPrefabChanges` 会保存 prefab asset 并触发 soft reload。soft reload 由 asset change 消息驱动，属于编辑器状态刷新；dirty 只表示当前内容相对最近一次保存或标记为已保存时是否还有未保存的持久化变更，不从 reload 或 `node:change` 推断。soft reload 的 500ms 是合并连续 asset change 的 debounce，不是 undo/dirty 正确性的等待条件。
- soft reload 会记住修改发生时的 editor uuid，并在 asset change / delete 到达时一次性消费“保留 undo 历史”的状态；即使当前资源不需要 reload，也不会污染后续同 uuid 的外部刷新。
- 会修改数据的 Prefab API 执行前会等待本服务已排队的 soft reload 完成，避免上一次 prefab asset change 的延迟 reload 在下一次 create/revert/unlink 等操作中途重载当前场景；这里不持有 `Editor.lock()`，避免和 asset 加载/刷新链路互等。
- Prefab 相关 command 进入同一条 `UndoService.push` / dirty 编排链路。dirty 仍只由 `Undo.isDirty()` 状态翻转产生的 `dirty:changed` 表示，不能从 `node:change` / `component:*` 推断。
- `getPrefabInfo` / `isPrefabInstance` 是只读 API，不入 undo。

### `Component.reset`

`Component.reset` 会 capture 整个 component dump。undo 恢复 reset 前的可编辑属性，redo 再应用 reset 后状态。

当前没有 `record?: false` 参数。如果未来有内部 reset 不希望入栈，需要扩展 `IQueryComponentOptions` 或新增专用 options。

### Gizmo recording

Gizmo 开始拖拽时调用 `beginRecording(uuids)` 捕获 before，拖拽过程中连续修改不入栈，结束时调用 `endRecording(id)` 捕获 after。这样一次拖拽只产生一个 command。

Recording 只捕获传入 uuid 范围，不扫描全场景。

Recording 的恢复范围是现有对象的 dump。不要用它包 `Node.create/delete`、`Component.add/remove`、Prefab unpack/revert 这类结构变化，否则 history 边界会不清晰；这些变化应该走结构 command 或 custom command。

## 接入新业务的规则

新增一个会改变当前编辑资源的业务 API 时，按下面流程处理：

1. 判断是 snapshot 还是 structure。
2. 在业务 service 入口显式记录，不依赖底层 `node:change` 自动推断。
3. 修改前检查 `Service.Undo?.isApplying?.()`，undo/redo 恢复过程中不能再次记录。
4. 如果 API 支持 `record?: false`，尊重它。
5. 如果目标正在 active recording 中，避免重复入栈。
6. capture before。
7. 执行业务修改。
8. 修改失败则不入栈。
9. capture after。
10. before/after 相同则不入栈。
11. push command。
12. 添加 `undo-redo.testcase.ts` 集成测试。
13. 如新增公开 API，更新 `common/*`、proxy、dts snapshot。

不要把 `cancelGroup` 当 rollback 使用。业务失败后是否回滚，需要调用方显式补偿或 reload。

## 后续需要补的内容

优先级高：

- History UI API：至少返回 undo/redo 栈的 readonly metadata，不暴露 command 内部数据。

优先级中：

- Animation 编辑模式专用 command：keyframe、curve、clip、selection/time cursor 是否入 history 需要单独定义。
- Snapshot 性能基准：深层节点、多选节点、大型 prefab-like 子树。
- Snapshot dump 裁剪：确认不会保存 Mesh/Texture/Audio 二进制内容，只保存引用。
- Component reset 的 `record?: false` 需求。
- 任意数组属性 move 的 undo 语义。当前只验证 `children` 和 `__comps__/_components`，其他数组需要先补恢复策略和测试。
- UI 对齐/分布的集成测试：当前实现已使用 recording，后续可补 `alignSelection` / `distributeSelection` 的 undo/redo 用例。

优先级低：

- 按内存预算裁剪 history，而不是固定 `maxStackSize = 100`。
- diff/patch 存储，减少 snapshot 内存。
- 持久化 undo history。
- 多 context/tab history。

纯重构 TODO：

- 统一节点查找逻辑：现在多个 command 都在重复写“先按 uuid 找，找不到再按 path 找”的代码。后续可以抽成一个公共方法，例如 `resolveNode(uuid, path)`。重构时不要只做简单搬代码，需要逐个确认原来的行为没有变：哪些情况算节点无效、path 查找失败时返回什么、错误信息怎么写，都要保持一致。
- 做 undo 专用 snapshot dump：现在 undo 直接复用 inspector 使用的 dump，所以里面会带很多 undo 不需要的展示字段；为了让快照不被后续运行时对象修改污染，还需要再 clone 一次。后续可以新增 `dumpNodeSnapshot` / `dumpComponentSnapshot`，只生成 undo 恢复需要的纯数据。确认它不再持有运行时对象引用后，再逐步替换 `UndoService`、`NodeUndoHelper`、`ComponentService` 里的 clone。

## 验证命令

修改 undo/redo 相关代码后至少跑：

```bash
npm run build
npm test -- --runTestsByPath src/core/scene/test/undo-manager.test.ts --runInBand
npm test -- --runTestsByPath src/core/scene/test/scene.test.ts --runInBand --testNamePattern "Undo/Redo 集成测试"
npm run generate:dts
```

如果只改某个新接入点，可以先跑更小范围：

```bash
npm test -- --runTestsByPath src/core/scene/test/scene.test.ts --runInBand --testNamePattern "Component reset|Node tree mutations"
```

Prefab undo/dirty 或 soft reload 相关改动至少补跑：

```bash
npm test -- --runTestsByPath src/core/scene/test/prefab-soft-reload.test.ts --runInBand
npm test -- --runTestsByPath src/core/scene/test/scene.test.ts --runInBand --testNamePattern "Prefab dirty/undo contract"
```

`scene.test.ts` 使用 `dist/core/scene/scene-process/main.js`，因此改 scene-process 代码后要先 `npm run build`。

已知测试噪音：

- scene 集成测试可能输出 `@cocos/ccbuild` 的 `CustomGC` open handle warning。
- build 可能输出已有 scene bundle circular dependency warning。

## 当前维护原则

- UndoManager 保持 domain-agnostic，不写 Node/Component/Prefab/Animation 细节。
- 业务 service 显式 push command。
- 属性变化优先 snapshot。
- 结构变化使用专门 command。
- Group 只合并 history，不负责业务 rollback。
- Recording 用于连续编辑，不用于普通单次 API。
- Prefab/Animation 通过 domain command 扩展，不重构 UndoManager。
