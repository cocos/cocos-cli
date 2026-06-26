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
- 退出恢复：停止播放、恢复普通 scene/prefab 模式、恢复 selection、清理预览采样状态。

Scene process 不负责：

- MCP/API tool、main-process proxy、`SceneApi.animation` 暴露。
- animator 面板、curve-editor 面板、快捷键、菜单。
- 节点树展开、滚动、过滤、焦点等纯 UI 状态。
- clip cache 和 profile/preference 开关。
- 旧 `scene:ready` / `asset-db:*` 等 UI 事件总线名字。

## 能力矩阵

| 旧能力 | 旧入口 | Scene-process 方法 | 状态 |
|---|---|---|---|
| 进入动画编辑 | `record-animation(uuid,true,clipUuid)` | `AnimationService.enter` | 已落地第一阶段 |
| 退出动画编辑 | `record-animation(uuid,false)` / `close-scene` | `AnimationService.exit` | 已落地第一阶段 |
| 查询 scene 模式 | `query-scene-mode` | `AnimationService.queryState` | 已落地第一阶段 |
| 当前 root/clip | `query-current-animation-info` | `AnimationService.queryState` | 已落地第一阶段 |
| 查询动画 root | `query-animation-root` | `AnimationService.queryRoot` | 已落地第一阶段 |
| 查询 root 信息 | `query-animation-root-info` | `AnimationService.queryRootInfo` | 已落地第一阶段 |
| 查询 clip dump | `query-animation-clip` | `AnimationService.queryClip` | 第二阶段 |
| 查询可编辑属性 | `query-animation-properties` | `AnimationService.queryProperties` | 已落地第一阶段 |
| 查询 clips | `query-animation-clips-info` | `AnimationService.queryClips` | 已落地第一阶段 |
| 查询时间 | `query-animation-clips-time` | `AnimationService.queryTime` | 已落地第一阶段 |
| 设置时间/采样 | `set-edit-time` | `AnimationService.setTime` | 已落地第一阶段 |
| 播放控制 | `change-clip-state` | `AnimationService.changePlayState` | 已落地第一阶段 |
| 切 clip | `change-edit-clip` | `AnimationService.changeEditClip` | 已落地第一阶段 |
| 批处理编辑 | `animation-operation` | `AnimationService.applyOperation` | 第二阶段 |
| 保存 clip | `save-clip` | `AnimationService.save` | 已落地普通 clip；骨骼 meta 后续补齐 |
| 查询帧值 | `query-property-value-at-frame` | `AnimationService.queryPropertyValueAtFrame` | 第二阶段 |
| 辅助曲线 | `query-auxiliary-*` / aux operations | `AnimationService.queryAuxiliaryCurves` / operation | 第三阶段 |
| embedded player | operation | `AnimationService.applyOperation` | 第三阶段 |
| inspector drop clip | `inspector-drop-animation` | `AnimationService.addClipToNode` | 第三阶段 |

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

## 状态恢复语义

`enter` 创建 CLI 内部 session，并保存：

- 进入前 `editorType`。
- 进入前 selection paths。
- root uuid/path、clip uuid。
- 当前时间和播放状态。

`exit` 统一做：

- 停止当前动画状态。
- 退出 `ANIMATION_MODE` tick 状态。
- 清理 animation state cache。
- 默认恢复进入前 selection。
- 返回退出后的状态。

节点树展开、滚动、过滤等 UI 状态不进 scene-process 核心。未来 UI 层需要在进入前自行保存，退出后根据 service 返回的 root/selection/state 恢复。

## 实施阶段

1. 建立 scene-process service 和文档，完成 session / 查询 / 播放 / 普通 clip 保存闭环。
2. 迁移 `EditorAnimationClip` 等价的普通 clip 编辑原语，补 `applyOperation`、clip dump、帧值查询。
3. 补骨骼动画 meta 保存、operation 白名单、auxiliary curve、embedded player。
4. 补 asset delete/refresh、script reload、dirty/undo/redo 事件一致性。
5. 根据 UI 迁入需要补事件订阅，但保持事件名和 scene-process 内部服务解耦。

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

第一阶段尚未覆盖旧 `EditorAnimationClip` 的曲线/key/event 编辑原语。第二阶段需要迁移或重写 clip dump、帧值查询、`applyOperation`，骨骼 meta、auxiliary curve 和 embedded player 放到第三阶段。
