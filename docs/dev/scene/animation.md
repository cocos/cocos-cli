# Animation Scene-Process Migration Plan

## 背景

旧动画编辑器入口在 `/Users/cocos/editor-3d-develop/app/builtin/animator`，但真正的后端能力主要落在旧 `scene` 的动画 message 和 `AnimationManager`。CLI 迁移不迁 UI、面板、快捷键、profile/preferences，也不复刻旧 `Editor.Message` 和 `SceneFacadeManager` 架构；本轮只在 `src/core/scene/scene-process` 内补动画编辑能力。

## 迁移边界

Scene process 负责：

- 动画编辑 session：进入、退出、查询状态、切 root、切 clip。
- 动画查询：root 信息、clip dump、可编辑属性、clip 列表、当前时间、帧采样值。
- 播放和采样：设置编辑时间、play/pause/resume/stop。
- 编辑操作：通过统一 `AnimationOperation[]` 批处理 clip/key/event/curve 操作。
- 保存：普通 `.anim` 保存到 asset，骨骼动画受限操作写回 meta。
- 退出恢复：停止播放、恢复普通 scene/prefab 模式、恢复 selection，并恢复 animation 模块捕获到的预览采样状态。

Scene process 不负责：

- MCP/API tool、main-process proxy、`SceneApi.animation` 暴露。
- animator 面板、curve-editor 面板、快捷键、菜单。
- 节点树展开、滚动、过滤、焦点等纯 UI 状态。
- clip cache 和 profile/preference 开关。
- 旧 `scene:ready` / `asset-db:*` 等 UI 事件总线名字。

## 能力矩阵

旧动画编辑器能力与当前 CLI 实现状态的完整清单见 [Animation CLI 能力矩阵](./animation-cli-capability-matrix.md)。下表只保留迁移计划早期的主链路摘要。

| 旧能力 | 旧入口 | Scene-process 方法 | 状态 |
|---|---|---|---|
| 进入动画编辑 | `record-animation(uuid,true,clipUuid)` | `AnimationService.enter` | 已落地第一阶段 |
| 退出动画编辑 | `record-animation(uuid,false)` / `close-scene` | `AnimationService.exit` | session 退出已落地；采样状态恢复为部分完成 |
| 查询 scene 模式 | `query-scene-mode` | `AnimationService.queryState` | 已落地第一阶段 |
| 当前 root/clip | `query-current-animation-info` | `AnimationService.queryState` | 已落地第一阶段 |
| 查询播放状态 | `query-animation-state` | `AnimationService.queryState` | 已合并到 state.playState |
| 查询动画 root | `query-animation-root` | `AnimationService.queryRoot` | 已落地第一阶段 |
| 查询 root 信息 | `query-animation-root-info` | `AnimationService.queryRootInfo` | 已落地基础信息；支持无 clip 的 root info，复杂旧 property dump 仍部分缺口 |
| 查询 clip dump | `query-animation-clip` | `AnimationService.queryClip` | 已落地基础 dump 和 material uniform track；复杂旧 property track 仍部分缺口 |
| 查询可编辑属性 | `query-animation-properties` | `AnimationService.queryProperties` | 已落地基础属性、`cc.Sprite.type` 和 material uniform；旧递归属性/其他 adapter 仍部分缺口 |
| 查询 clips | `query-animation-clips-info` | `AnimationService.queryClips` | 已落地第一阶段；Animation 组件 clips 为空时返回空 menu |
| 查询时间 | `query-animation-clips-time` | `AnimationService.queryTime` | 已落地第一阶段 |
| 设置时间/采样 | `set-edit-time` | `AnimationService.setTime` | CLI 已覆盖 root/child 采样；PinK 真实 gate 待复测 |
| 播放控制 | `change-clip-state` | `AnimationService.changePlayState` | 已落地第一阶段 |
| 切 clip | `change-edit-clip` | `AnimationService.changeEditClip` | 已落地第一阶段；旧 saveCheck 保护语义不在 CLI 内部 |
| 批处理编辑 | `animation-operation` | `AnimationService.applyOperation` | 已落地 typed operation 原语 |
| 保存 clip | `save-clip` | `AnimationService.save` | 已落地普通 clip 和骨骼 meta |
| 查询帧值 | `query-property-value-at-frame` | `AnimationService.queryPropertyValueAtFrame` | 已落地第二阶段；当前通过临时采样读取真实场景值 |
| 辅助曲线 | `query-auxiliary-*` / aux operations | `AnimationService.applyOperation` | 已落地第三阶段基础操作 |
| embedded player | operation | `AnimationService.applyOperation` | 已落地第三阶段基础操作 |
| inspector drop clip | `inspector-drop-animation` | 待定 | 后续按 UI 迁入需要补 |

## Service 设计

第一阶段新增 scene-process 能力：

- `enter({ rootPath?, rootUuid?, clipUuid?, restoreSelectionOnExit? })`
- `exit({ save?, restoreSelection?, restoreSampledSceneState? })`
- `queryState()`
- `queryRoot({ nodePath?, nodeUuid?, rootPath?, rootUuid? })`
- `queryRootInfo({ nodePath?, nodeUuid?, rootPath?, rootUuid? })`
- `queryClips({ nodePath?, nodeUuid?, rootPath?, rootUuid? })`
- `queryProperties({ nodePath?, nodeUuid?, rootPath?, rootUuid? })`
- `queryTime({ clipUuid? })`
- `setTime({ time })`
- `changePlayState({ operate, clipUuid? })`
- `changeEditClip({ clipUuid })`
- `save()`

第二阶段继续补：

- `queryClip`
- `queryPropertyValueAtFrame`
- `applyOperation`

当前第二阶段先落地普通 clip 的基础闭环：

- `queryClip` 返回 clip 基础 dump、事件帧 dump、当前时间和 baked animation 标记。
- `queryRootInfo` / `queryClips` 对齐旧编辑器的空 clip 查询语义：Animation 组件存在但 clips 为空时返回空 menu，`queryRootInfo.clipDump` 为 `null`。
- `queryPropertyValueAtFrame` 按帧采样当前编辑 clip，读取目标节点或组件属性后恢复原编辑时间。
- `applyOperation` 使用 typed `AnimationOperation` 批处理格式，基础操作支持 `changeSample`、`changeSpeed`、`changeWrapMode`、`addEvent`、`deleteEvent`、`updateEvent`、`moveEvents`、`copyEventsTo`。

第三阶段继续补：

- typed operation 不兼容旧 `{ funcName, args }`。后续 animator 面板走新实现，不需要保留旧 animator message 形态。
- `applyOperation` 增加 embedded player 基础操作：`addEmbeddedPlayer`、`deleteEmbeddedPlayer`、`updateEmbeddedPlayer`、`clearEmbeddedPlayer`、`addEmbeddedPlayerGroup`、`removeEmbeddedPlayerGroup`、`clearEmbeddedPlayerGroup`。其中 `clearEmbeddedPlayer` 当前对齐全清/按 group 清理，未完全覆盖旧编辑器按 `nodePath` 清空的语义。
- `applyOperation` 增加 auxiliary curve 基础操作：`addAuxiliaryCurve`、`removeAuxiliaryCurve`、`renameAuxiliaryCurve`、`createAuxKey`、`removeAuxKey`、`moveAuxKeys`、`copyAuxKey`。
- `queryClip` 返回 typed `curves`、`events`、`embeddedPlayers`、`embeddedPlayerGroups`、`auxiliaryCurves`、`isSkeleton`。
- `save` 对普通 `.anim` 写 asset，对骨骼动画 clip 写回 meta 的 events、embedded players、embedded player groups、wrapMode、speed、sample、auxiliary curves。

第四阶段继续补：

- `applyOperation` 默认记录 undo/dirty；一次批处理对应一条 `animation:clip-snapshot` undo command。
- `applyOperation({ recordUndo: false })` 只修改当前 clip，不写入 undo 栈，不改变 dirty 状态。
- undo/redo 恢复当前 typed operation 会修改的 clip 数据：sample、speed、wrapMode、普通属性曲线、events、embedded players/groups、auxiliary curves，并在恢复后重新采样当前编辑时间。
- 当前编辑 clip 收到 `asset-refresh` 后清理旧 `AnimationState` 并基于刷新后的 clip 重建采样状态。
- 当前编辑 clip 被删除时退出 animation session；editor close/reload 时清理 animation session 和 state cache，script reload 复用 editor reload 生命周期。

## 状态恢复语义

`enter` 创建 CLI 内部 session，并保存：

- 进入前 `editorType`。
- 进入前 selection paths。
- root uuid/path、clip uuid。
- 进入前 root 子树的采样状态快照。

`exit` 统一做：

- 停止当前动画状态。
- 尽量恢复进入前 root 子树采样状态。当前覆盖 node `active` / `position` / `rotation` / `scale`，以及可克隆或普通对象/数组的 animatable component 属性；不等价于旧编辑器全量 node dump restore。
- 退出 `ANIMATION_MODE` tick 状态。
- 清理 animation state cache。
- 默认恢复进入前 selection。
- 返回退出后的状态。

节点树展开、滚动、过滤等 UI 状态不进 scene-process 核心。未来 UI 层需要在进入前自行保存，退出后根据 service 返回的 root/selection/state 恢复。

## 实施阶段

1. 建立 scene-process service 和文档，完成 session / 查询 / 播放 / 普通 clip 保存闭环。
2. 迁移 `EditorAnimationClip` 等价的普通 clip 基础编辑原语，补 `applyOperation`、clip dump、帧值查询。
3. 补骨骼动画 meta 保存、typed operation 白名单、auxiliary curve、embedded player。
4. 补 asset delete/refresh、script reload、dirty/undo/redo 事件一致性。
5. 根据 UI 迁入需要补事件订阅，但保持事件名和 scene-process 内部服务解耦。
6. 补普通属性曲线 keyframe 最小闭环，先覆盖 node TRS Vec3 属性。

## 验收标准

- 类型层：`IServiceManager.Animation` 可用，`IPublicServiceManager`、MCP API、main-process proxy 不暴露 Animation。
- 行为层：打开 scene 后可进入动画 session、查询状态、设置时间、播放控制、退出并恢复 selection。
- 保存层：普通 `.anim` clip 修改后可保存到 asset。
- 失败语义：没有打开 scene、节点不存在、clip 不存在、未进入 session 时必须显式失败，不返回默认成功。

## 当前落地状态

已完成第一阶段 scene-process 链路：

- `src/core/scene/common/animation.ts`
- `src/core/scene/scene-process/service/animation.ts`
- `src/core/scene/scene-process/service/engine.ts`
- `src/core/scene/scene-process/service/index.ts`
- `src/core/scene/scene-process/service/interfaces.ts`

第二阶段已补 `queryClip`、`queryPropertyValueAtFrame`、`applyOperation` 的基础普通 clip 闭环，并覆盖 sample、speed、wrapMode 和事件原语。

第三阶段已补 typed operation、基础 embedded player、基础 auxiliary curve、骨骼动画 meta 保存，并将 Animation scene-process 实现拆为：

- `src/core/scene/scene-process/service/animation.ts`：service 入口和 session / 查询 / 播放 / 保存主流程。
- `src/core/scene/scene-process/service/animation/clip-operations.ts`：typed operation 分发和 clip/event 操作。
- `src/core/scene/scene-process/service/animation/embedded-player.ts`：embedded player dump、增删改和 meta 序列化。
- `src/core/scene/scene-process/service/animation/auxiliary-curve.ts`：auxiliary curve dump、key 操作和 meta 序列化。
- `src/core/scene/scene-process/service/animation/clip-dump.ts`：clip dump 组装。
- `src/core/scene/scene-process/service/animation/skeleton-meta.ts`：骨骼动画 meta 写回。

第四阶段已补 animation operation 的 undo/dirty 接入和生命周期清理：

- `src/core/scene/scene-process/service/animation/clip-snapshot.ts`：捕获和恢复 operation 涉及的 clip 编辑快照。
- `src/core/scene/scene-process/service/animation/undo.ts`：animation clip 快照 undo command。
- `AnimationService.applyOperation` 默认 push undo command；显式 `recordUndo:false` 跳过 undo/dirty。
- `AnimationService` 处理当前 clip 的 asset refresh/delete，以及 editor close/reload 时的 session 和 state cache 清理。

第五阶段已补 animation 事件订阅基础契约：

- `animation:state-changed`：session、播放状态和当前 clip 状态变化。
- `animation:time-changed`：编辑时间采样变化。
- `animation:clip-changed`：当前 clip 数据变化、undo/redo 恢复和 asset refresh。
- 事件通过 scene-process `ServiceEvents` 广播并进入 `messageManager`，不复用旧 animator message 名称。

第六阶段已补普通属性曲线 keyframe 最小闭环：

- `queryClip.curves` 现在 dump node TRS Vec3 曲线，当前覆盖 `position`、`scale`、`eulerAngles`。
- `applyOperation` 新增 `createPropertyKey`、`removePropertyKey`、`movePropertyKeys`，支持用 `nodePath` 或 `nodeUuid` 定位动画 root 下的目标节点。
- property operation 会重新初始化当前 `AnimationState` evaluator，保证新增 track 可立即被 `setTime` / `queryPropertyValueAtFrame` 采样。
- undo/redo snapshot 已纳入普通属性曲线，恢复后会重新初始化 evaluator 并按当前编辑时间重采样。

第七阶段已补 PinK authoring gate 相关 CLI 代码路径，但 PinK 真实 scene Product gate 仍需复测后才能按 PinK 口径标完成：

- `applyOperation` 在普通 property key、event、embedded player、auxiliary curve 变化后重算 clip duration；CLI 场景测试已覆盖，PinK 真实 scene gate 待复测。
- `setTime` 对 root 和 child `nodePath` 属性轨道采样到真实节点；CLI 场景测试已覆盖，PinK G2-B 真实插件链路仍需复测关闭。
- root keyframe move/copy/remove 后的 `queryClip` dump 和 evaluator 重建已有 CLI 覆盖；PinK G3 save / exit / reenter 后 seek / sampling 仍按真实插件链路复测结果为准。
- `createPropertyKey`、`updatePropertyKey`、`updatePropertyKeyData` 支持 RealCurve keyData 写入和 `queryClip` 读回，包含 `interpMode`、显式 0 值、切线/权重和 `broken`；CLI 场景测试已覆盖，PinK 真实 scene gate 待复测。
- `createAuxKey`、`updateAuxKeyData` 支持 auxiliary curve keyData 写入和读回，`queryAuxiliaryCurveValueAtFrame` 支持按帧采样辅助曲线。
- `applyOperation` 批处理中任一 operation 失败时恢复批处理前 clip snapshot，避免局部写入残留。
- `queryClip` 普通查询路径不再为了恢复缺失 clip 而重绑 `Animation.clips/defaultClip`；clip rebind 只保留在 `enter`、`changeEditClip`、asset refresh 等明确写入/恢复路径。
- `exit` 的采样状态恢复收敛在 animation 模块内，不再依赖全量 node dump restore；当前恢复范围是部分完成，详见能力矩阵。
- 当前未完整迁移的旧能力以能力矩阵为准，主要集中在 property/node 结构型操作、`spacingKeys`、`clearKeys`、嵌入播放器菜单查询、旧 saveCheck 保护语义、旧 `isLock` / 2D 过滤语义和 AnimationController 结构编辑契约。
