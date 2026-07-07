# Animation CLI 能力矩阵

本文记录旧动画编辑器依赖的 scene animation CLI 能力，以及当前 `cocos-cli-dev` scene-process `AnimationService` 的实现状态。状态只描述 CLI 后端能力，不包含 PinK 或旧 animator 面板的 UI 状态。

## 状态定义

- **完成**：当前 CLI 已有 typed API 覆盖旧能力，并进入 active scene state、undo/dirty、`queryClip` dump 或 save 流程。
- **部分完成**：CLI 已覆盖核心路径，但和旧编辑器能力相比存在参数形态、类型覆盖、批量语义或查询菜单缺口。
- **未完成**：当前 CLI 没有等价 typed operation 或查询接口。
- **不迁移**：旧能力属于 animator UI、profile/cache 或旧消息总线，不应放入 scene-process 核心。

## 旧能力来源

- 旧 animator IPC：`/Users/cocos/editor-3d-develop/app/builtin/animator/source/panel/share/ipc-event.ts`
- 旧 scene animation manager：`/Users/cocos/editor-3d-develop/app/builtin/scene/source/script/3d/manager/animation/index.ts`
- 旧 clip 编辑实现：`/Users/cocos/editor-3d-develop/app/builtin/scene/source/script/3d/manager/animation/editor-animation-clip.ts`
- 旧曲线实现：`editor-animation-curve.ts`、`editor-animation-combined-curve.ts`、`editor-animation-aux-curve.ts`

## 旧能力分组

| 能力组 | 旧编辑器覆盖范围 | 旧入口示例 |
|---|---|---|
| 编辑 session / 播放 / 保存 | 进入/退出动画编辑、切换 root、切换 edit clip、设置时间、播放/暂停/继续/停止、保存、查询当前状态。 | `record-animation`、`change-animation-root`、`change-edit-clip`、`set-edit-time`、`change-clip-state`、`save-clip`、`query-animation-state` |
| 查询 / dump | 查询 root 信息、clip dump、可编辑属性、节点树、属性帧值、编辑信息、embedded player 可添加菜单。 | `query-animation-root-info`、`query-animation-clip`、`query-animation-properties`、`query-node-tree`、`query-property-value-at-frame`、`query-animation-edit-info`、`query-EmbeddedPlayer-menu` |
| 属性轨道结构 | 创建/删除/复制属性轨道，删除节点动画数据，迁移节点动画路径，复制节点动画数据。 | `createProp`、`removeProp`、`copyPropTo`、`removeNode`、`changeNodeDataPath`、`copyNode` |
| 属性 key / 曲线 | 创建/更新/删除/移动/复制/间隔排列/清空 key，修改 keyData，设置曲线 extrapolation，自动重算 duration。 | `createKey`、`updateKey`、`removeKey`、`moveKeys`、`copyKeysTo`、`spacingKeys`、`clearKeys`、`modifyCurveOfKey` |
| 事件 | 添加、删除、更新、移动、复制 animation event。 | `addEvent`、`deleteEvent`、`updateEvent`、`moveEvents`、`copyEvent` |
| Embedded player / 辅助曲线 | embedded player group/player 增删改清，辅助曲线增删改名，辅助曲线 key 增删移复制和 keyData 修改，按帧查询辅助曲线值。 | `addEmbeddedPlayerGroup`、`addEmbeddedPlayer`、`clearEmbeddedPlayer`、`addAuxiliaryCurve`、`createAuxKey`、`modifyAuxCurveOfKey`、`query-aux-curve-value-at-frame` |

## 能力矩阵

| 旧编辑器能力 | 旧入口 | 当前 CLI 状态 | 当前入口 | 缺口 / 备注 |
|---|---|---|---|---|
| 进入动画编辑 | `record-animation` / `Irecord(..., true)` | 完成 | `enter` | 建立 session、初始化 `AnimationState`、广播状态。 |
| 退出动画编辑 | `close-scene` / `Irecord(..., false)` | 部分完成 | `exit` | session 退出、停止播放、恢复 selection 已完成；采样状态恢复已收敛到 animation 模块，但仅覆盖 root 子树 node TRS/active 与可克隆或普通对象/数组的 animatable component 属性，不等价于旧全量 node dump restore。 |
| 切换动画 root | `change-animation-root` / `IchangeAnimNode` | 部分完成 | `enter` | 新 root 通过重新 `enter` 表达；旧 `saveCheck` 脏数据确认/阻断语义不在 CLI 内部，调用方需要先完成保存或确认。 |
| 切换 edit clip | `change-edit-clip` / `IsetEditClip` | 部分完成 | `changeEditClip` | 会停止当前采样并重置时间到 0；旧 `saveCheck` 脏数据确认/阻断语义不在 CLI 内部。 |
| 查询 scene mode | `query-scene-mode` | 完成 | `queryState` | 返回 `mode/editorType/active`。 |
| 查询当前 root/clip | `query-current-animation-info` | 完成 | `queryState` | 返回 root path/uuid、clip uuid、time、play state。 |
| 查询播放状态 | `query-animation-state` | 完成 | `queryState` | 旧接口只返回 play state；当前统一在 session state 内返回 `playState`。 |
| 查询动画 root | `query-animation-root` | 完成 | `queryRoot` | 支持 node path/uuid 推导 root。 |
| 查询 root 综合信息 | `query-animation-root-info` | 部分完成 | `queryRootInfo` | 返回 clips menu、node tree、默认 clip dump、time、baked 标记；Animation 组件 clips 为空时返回空 menu 且 `clipDump: null`；复杂旧轨道 dump 未完全覆盖。 |
| 查询 clip dump | `query-animation-clip` | 部分完成 | `queryClip` | 当前 session clip 优先走 session state，避免 asset refresh 窗口反查组件 clips 失败；普通查询路径不再为了恢复缺失 clip 而重绑 `Animation.clips/defaultClip`，clip rebind 只保留在 `enter`、`changeEditClip`、asset refresh 等明确写入/恢复路径；已支持 material uniform 的 `UniformProxyFactory` 轨道解析和 dump；旧编辑器支持的 nested object、array、其他 valueAdapter 轨道未完全迁移，旧 `isLock` 与 2D 曲线/partKeys 过滤语义也未完整迁移。 |
| 查询 clips menu | `query-animation-clips-info` | 完成 | `queryClips` | `Animation.defaultClip` 也会纳入候选 clips；Animation 组件 clips 为空时返回空 menu 和空 `defaultClip`。 |
| 查询播放时间 | `query-animation-clips-time` | 完成 | `queryTime` | time 使用秒。 |
| 设置编辑时间 / 采样 | `set-edit-time` | 完成 | `setTime` | 受 clip duration clamp，采样后 repaint；CLI 场景测试已覆盖 root 和 child `nodePath` 属性轨道采样，PinK Product gate 仍需在真实插件链路复测关闭。 |
| 播放控制 | `change-clip-state` | 完成 | `changePlayState` | 支持 play/pause/resume/stop。 |
| 保存 clip | `save-clip` | 完成 | `save` | 普通 `.anim` 写 asset；骨骼动画写 meta。 |
| 查询可编辑属性 | `query-animation-properties` | 部分完成 | `queryProperties` | 覆盖 node TRS/active、组件顶层 animatable 属性、`cc.Sprite.type`、Renderer `sharedMaterials -> materials` 和 material `passes[].properties` uniform 展开；旧递归对象、普通数组下标、类型继承链、其他 `targetPaths/valueAdapter` 体系未完全迁移。 |
| 查询嵌入播放器菜单 | `query-EmbeddedPlayer-menu` | 未完成 | 无 | 仅已支持 embedded player 数据编辑和 dump；可添加项菜单查询未迁移。 |
| 查询动画编辑信息 | `query-animation-edit-info` | 部分完成 | `queryRootInfo` / `queryState` | 当前分散在 root info 和 state；旧结构的完整 `IAniEditInfo` 未保留。 |
| 查询节点树 | `query-node-tree` | 完成 | `Service.Node.queryNodeTree` / `queryRootInfo.nodeTreeDump` | 不属于 AnimationService 专属能力。 |
| 查询属性帧值 | `query-property-value-at-frame` | 部分完成 | `queryPropertyValueAtFrame` | 当前通过临时 `AnimationState.setTime/sample/repaint` 读取真实场景值，然后恢复原时间；能力可用，但不是旧编辑器那种纯曲线求值读路径，旧 2D lock UI 元信息不在 CLI 返回。 |
| 查询辅助曲线列表 | `query-auxiliary-curves` | 完成 | `queryClip.auxiliaryCurves` | 通过 clip dump 返回。 |
| 查询辅助曲线帧值 | `query-aux-curve-value-at-frame` | 完成 | `queryAuxiliaryCurveValueAtFrame` | 本次补齐，按帧采样辅助曲线值。 |
| 批处理动画操作 | `animation-operation(funcName,args)` | 完成 | `applyOperation({ operations })` | 新 CLI 只接受 typed operation；旧 `{ funcName,args }` 明确失败。 |
| 失败批处理回滚 | 旧 manager 内部状态更新 | 完成 | `applyOperation` | 本次补齐：任一 operation normalize/validate/apply 失败都会恢复进入批处理前的 clip snapshot。 |
| 修改 sample | `changeSample` | 完成 | `changeSample` operation | 纳入 undo/dirty/save。 |
| 修改 speed | `changeSpeed` | 完成 | `changeSpeed` operation | 纳入 undo/dirty/save。 |
| 修改 wrapMode | `changeWrapMode` | 完成 | `changeWrapMode` operation | 纳入 undo/dirty/save。 |
| 自动重算 duration | `recalculateDuration()` | 部分完成 | `applyOperation` 内部 `syncAnimationClipDuration` | CLI 场景测试已覆盖普通曲线、event、embedded player、auxiliary curve；PinK 真实 scene Product gate 仍需复测 save / undo / exit / reenter 全链路，不能按 PinK 口径标完成。 |
| 创建属性轨道 | `createProp` | 部分完成 | `addPropertyCurve` / `createPropertyKey` | 支持当前 flat `propKey` 模型和 material uniform propKey，并会为 material uniform 创建 `UniformProxyFactory` 轨道；旧 `targetPaths/valueAdapter` 的其他用法、nested/object/array 路径体系未完全表达。 |
| 删除属性轨道 | `removeProp` | 未完成 | 无 | 当前只能删除 key；缺少「删除整条 track」operation。 |
| 复制属性轨道 | `copyProp` / `copyPropTo` | 未完成 | 无 | 当前 `copyPropertyKeysTo` 只覆盖同一曲线内按帧复制。 |
| 创建属性 key | `createKey` | 部分完成 | `createPropertyKey` | 对当前 flat property 模型支持 nodePath/nodeUuid、channel、value 省略时从当前 scene 采样、keyData；复杂旧 property path 未完全覆盖。 |
| 更新属性 key 值 | `updateKey` | 部分完成 | `updatePropertyKey` | 支持指定 frame/value 更新；旧多帧按当前场景批量更新语义未完整迁移。 |
| 更新属性 key 曲线数据 | `modifyCurveOfKey` | 部分完成 | `updatePropertyKeyData` / `updatePropertyKey(keyData)` | CLI 代码路径和场景测试已覆盖 RealCurve keyData、`interpMode`、显式 0 值、切线/权重和 `broken`；PinK 真实 scene 读回仍需复测，Quat/Object 等非 RealCurve 的旧能力仍有限。 |
| 属性曲线 extrapolation | `preExtrap` / `postExtrap` | 完成 | `setPropertyCurveExtrapolation` | 支持 RealCurve track 的 pre/post extrapolation 设置和 `queryClip` dump。 |
| 删除属性 key | `removeKey` | 完成 | `removePropertyKey` / `removePropertyKeys` | 支持 channel 和批量 frames。 |
| 移动属性 key | `moveKeys` | 部分完成 | `movePropertyKeys` | 支持统一 offset；旧接口支持每个 key 独立 offset，尚未迁移。 |
| 复制属性 key | `copyKey` / `copyKeysTo` | 部分完成 | `copyPropertyKeysTo` | 支持同一 node/prop 曲线内复制到目标帧；跨 node/prop 粘贴未完成。 |
| 间隔排列 key | `spacingKeys` | 未完成 | 无 | 缺少等价 operation。 |
| 清空轨道 key | `clearKeys` | 未完成 | 无 | 可由前端查询全部 frames 后删除，但 CLI 没有原子 operation。 |
| 删除节点动画数据 | `removeNode` | 未完成 | 无 | 缺少按 nodePath 删除所有曲线的 operation。 |
| 迁移节点动画路径 | `changeNodeDataPath` | 未完成 | 无 | 缺少批量改 track path 并处理目标覆盖的 operation。 |
| 复制节点动画数据 | `copyNode` | 未完成 | 无 | 缺少跨 node 复制所有曲线的 operation。 |
| 添加事件 | `addEvent` | 完成 | `addEvent` operation | 纳入 undo/dirty/save。 |
| 删除事件 | `deleteEvent` | 完成 | `deleteEvent` operation | 支持 frames。 |
| 更新事件 | `updateEvent` | 完成 | `updateEvent` operation | 支持 frames + events dump。 |
| 移动事件 | `moveEvents` | 完成 | `moveEvents` operation | 支持统一 offset。 |
| 复制事件 | `copyEvent` | 完成 | `copyEventsTo` operation | 按旧 base frame 语义复制。 |
| 添加 embedded player group | `addEmbeddedPlayerGroup` | 完成 | 同名 operation | 纳入 dump、undo、save、骨骼 meta。 |
| 删除 embedded player group | `removeEmbeddedPlayerGroup` | 完成 | 同名 operation | 删除 group 并清理关联 players。 |
| 清空 embedded player group | `clearEmbeddedPlayerGroup` | 完成 | 同名 operation | 清理 group 下 players。 |
| 添加 embedded player | `addEmbeddedPlayer` | 完成 | 同名 operation | 支持 particle-system 等 playable dump。 |
| 删除 embedded player | `deleteEmbeddedPlayer` | 完成 | 同名 operation | 按 dump key 匹配删除。 |
| 更新 embedded player | `updateEmbeddedPlayer` | 完成 | 同名 operation | 按旧 dump 替换为新 dump。 |
| 清空 embedded player | `clearEmbeddedPlayer` | 部分完成 | 同名 operation | 当前支持全清或按 group 清理；旧编辑器支持按 `nodePath` 清空，语义未完全对齐。 |
| 添加辅助曲线 | `addAuxiliaryCurve` | 完成 | 同名 operation | 使用 engine experimental auxiliary curve API。 |
| 删除辅助曲线 | `removeAuxiliaryCurve` | 完成 | 同名 operation | dump/save/undo 覆盖。 |
| 重命名辅助曲线 | `renameAuxiliaryCurve` | 完成 | 同名 operation | dump/save/undo 覆盖。 |
| 创建辅助曲线 key | `createAuxKey` | 完成 | 同名 operation | 本次补齐 keyData 写入。 |
| 删除辅助曲线 key | `removeAuxKey` | 完成 | 同名 operation | 支持单帧。 |
| 移动辅助曲线 key | `moveAuxKeys` | 部分完成 | 同名 operation | 支持统一 offset；旧接口支持数组 offset。 |
| 复制辅助曲线 key | `copyAuxKey` | 部分完成 | 同名 operation | 当前复制同一曲线 key 到目标帧；旧 src/dest data 形态更灵活。 |
| 修改辅助曲线 keyData | `modifyAuxCurveOfKey` | 完成 | `updateAuxKeyData` | 本次补齐 keyData 写入和 `queryClip` 读回。 |
| 骨骼动画安全操作限制 | `skelAnimAllowOperations` | 完成 | `applyOperation` 内部 gate | 对 skeleton clip 只允许 sample/speed/wrap、event、embedded player 和 auxiliary curve 操作，拒绝 property track 编辑。 |
| AnimationController clip 枚举 | 旧 manager 支持 controller clips | 部分完成 | `queryClips` / `enter` | 可枚举和编辑 clip；Controller 状态机结构编辑契约未定义。 |
| animator 最近 clip cache | `query-last-clip-cache` / `save-clip-cache` | 不迁移 | 无 | 属于旧 animator 面板 profile/cache。 |
| 旧消息名与事件名 | `scene:animation-*` / `Editor.Message` | 不迁移 | `animation:*` service events | CLI 使用 typed service event，不复刻旧消息总线名字。 |

## PinK 当前 gate 状态

本节按 PinK 真实 Product gate 判定，不等同于上方「当前 CLI 状态」。CLI 场景测试通过只能说明代码路径已具备，不能直接标记 PinK gate 完成。

| PinK gate | 当前状态 | CLI 依据 | 仍需验证 |
|---|---|---|---|
| 空 clip 创建首个 key 后 duration 不为 0 | 部分完成 | CLI 场景测试覆盖空 clip property key、child `nodePath` property key、event、embedded player、auxiliary curve 后重算 duration | PinK 权威需求文档已记录 root authoring 和 child `query-clip durationFrames=60` 通过；仍需完整 Product gate 的 save / undo / exit / reenter 回归。 |
| child `nodePath` track 的 `setTime` / sampling | 部分完成 | CLI 场景测试覆盖 60fps 空 clip 在 child `position.x@60f=100` 后 `setTime(1)` 采样真实子节点，且回到 0 秒恢复为 0 | PinK 权威需求文档仍记录真实插件链路 `query-time=0`、child `position.x=0`；需要把当前 CLI 同步到 PinK 使用路径后复测 G2-B。 |
| root keyframe edit save/reenter 后 `setTime` / sampling | 未完成 | CLI 已覆盖 move/copy/remove 后重建 evaluator 和本地 keyframe dump，但缺少 PinK G3 同等 save / exit / reenter 场景验证 | PinK 权威需求文档仍记录 exit/reenter 后 `query-time=0`、root `position.x=0`；需要补真实 scene service 路径回归。 |
| RealCurve `interpMode` / tangent / weight 写入读回 | 部分完成 | CLI 场景测试覆盖 `createPropertyKey`、`updatePropertyKey`、`updatePropertyKeyData` 写入读回，并补显式 0 值保留 | PinK 权威需求文档仍记录真实 scene `query-clip` 未读回；需要同步当前 CLI 后复测曲线菜单 smoke。 |
| RealCurve `broken` 写入读回 | 部分完成 | CLI 代码路径使用 `editorExtrasTag` 保存和 dump `broken`，场景测试覆盖 `broken: true` 和 `broken: false` 的 undo/redo、save/reenter | PinK 权威需求文档仍记录真实 scene `query-clip` 未读回；需要同步当前 CLI 后复测曲线菜单 smoke。 |

## 本次补充能力状态

| 能力 | 当前状态 | CLI 依据 | 仍需验证 |
|---|---|---|---|
| auxiliary curve keyData 写入读回 | 完成 | `createAuxKey(keyData)`、`updateAuxKeyData`、`queryClip.auxiliaryCurves` | 仍需 PinK 真实使用路径复测。 |
| auxiliary curve 按帧采样 | 完成 | `queryAuxiliaryCurveValueAtFrame` | 仍需 PinK 真实使用路径复测。 |
| 批处理失败不留下局部写入 | 完成 | `applyOperation` 失败时恢复批处理前 clip snapshot | 仍需 PinK 真实 scene smoke 覆盖。 |
| 退出动画编辑恢复采样状态 | 部分完成 | animation 模块内 sampled state restore，覆盖 node TRS/active 与可克隆或普通对象/数组的 animatable component 属性 | 不等价于旧全量 node dump restore，仍需 PinK 真实 scene smoke 覆盖。 |

## 后续补齐优先级

1. **P0：同步当前 CLI 到 PinK 使用路径并复测 Product gate**。CLI 场景测试通过不等于 PinK release gate 通过，仍需用真实 PinK scene 覆盖 child authoring / seek / play / save / exit / reenter 和曲线 keyData 菜单 smoke。
2. **P1：结构型 property/node operation**。优先补 `removeProp`、`copyProp`、`removeNode`、`changeNodeDataPath`、`copyNode`，这些不能靠 Web 本地状态安全替代。
3. **P1：批量 key 操作语义补齐**。补 `spacingKeys`、`clearKeys`，并评估 `moveKeys` / `moveAuxKeys` 的 per-key offset 是否需要兼容。
4. **P2：查询菜单与旧 UI 辅助信息**。评估 `query-EmbeddedPlayer-menu`、旧 `IAniEditInfo`、2D lock 元信息是否由 PinK UI 自己管理，还是需要 CLI 暴露。
5. **P2：AnimationController 编辑契约**。当前可枚举 clip，但状态机结构编辑不应在没有明确产品需求时迁入。
