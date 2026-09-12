# Light Probe 与 Lightmap 烘焙

## 功能概览

Cocos CLI 通过 Creator 随附的 LightFX 工具提供离线光照烘焙能力：

- Light Probe：计算场景内所有有效光照探针的球谐光照系数，并写回场景。
- Lightmap：为静态 Mesh 和 Terrain 生成 Lightmap，导入 Asset DB 并绑定到组件。
- 清理：解除 Light Probe 或 Lightmap 的烘焙结果，可选择保存场景及删除 Lightmap 资产。
- 取消：终止当前正在运行的 LightFX 任务。

MCP API 只负责参数校验和结果封装。场景运行时负责导出场景数据、应用烘焙结果、Undo、重绘和保存；Node Host 负责启动 LightFX、临时文件、Asset DB 导入和资产事务。Light Probe 与 Lightmap 共享场景导出、二进制协议、进程管理和临时目录管理。

在 Pink 等集成场景编辑器中，CLI 会把请求路由到当前可见且已加载场景的 WebGL Scene Webview，使烘焙结果立即显示在正在编辑的场景中。没有连接 Scene Webview 时，CLI 才回退到 scene-process worker。

## 使用前提

1. 当前场景必须是已保存的 `.scene` 资产；不支持未保存场景和 prefab。
2. Light Probe 烘焙前，场景中需要至少 4 个已生成的有效探针。
3. Lightmap 烘焙前，需要在 MeshRenderer、SkinnedMeshRenderer 或 Terrain 上配置有效的烘焙设置。
4. 同一 Scene host 下，Light Probe／Lightmap 的 Bake／Clear 共享事务预留；导出、结果应用、保存、Undo、失败恢复与可选资产清理期间拒绝新的冲突操作。
5. 在 Pink 中调用时，目标场景必须已在当前可见的场景视图中加载完成；不需要额外调用 `scene-open`。同时存在多个可见场景视图时，应先激活目标场景标签并关闭重复视图。

## 运行能力识别

公开 CLI API `Scene.LightProbeBake.queryCapabilities()` 会向实际 Scene renderer（没有 Webview 时为 worker）及其 Node host 查询：

```ts
const capabilities = await cli.Scene.LightProbeBake.queryCapabilities();
// { version: 1, resultLifecycleVersion: 1, sceneTransactionVersion: 1, busy: false }
```

`resultLifecycleVersion: 1` 表明本 Scene 实现包含 SH Undo／Redo 与多组重开结果保留修复；`sceneTransactionVersion: 1` 表明 Scene 与实际 host 均使用完整 Bake／Clear 事务预留协议。旧 host 缺少查询或协议不匹配时拒绝返回能力，调用方不能只检测 bake 方法存在或只检查包版本。集成方遇到方法缺失／查询失败应显示不支持或连接错误，不得自动尝试烘焙。

Lightmap 使用独立能力查询，不能复用 Probe 的生命周期判断：

```ts
const capabilities = await cli.Scene.LightmapBake.queryCapabilities();
// { version: 1, resultLifecycleVersion: 1, sceneTransactionVersion: 1, assetVersion: 1,
//   outputDirectory: true, assetCleanupVersion: 1, busy: false }
```

这里的 `resultLifecycleVersion: 1` 包含 Mesh／Terrain 的结果录制目标、空纹理引用、TerrainBlock 恢复刷新及保存基线；`assetVersion: 1` 必须由实际 Node host 的 `lightmapAssetVersion: 1` 确认，保证新 Bake 不覆盖旧纹理版本。旧 host 即使支持 Probe 事务，也可能缺少资产版本保护，此时 Lightmap 查询拒绝返回支持。`outputDirectory` 和 `assetCleanupVersion` 分别表示实际 Host 支持安全的自选输出目录和精确资产清理；字段缺失时不得调用对应能力。有归属取消另通过 `cancelVersion`／`cancellable` 声明，见下文。

`busy` 仅为共享宿主的瞬时占用提示，包含导出前预留、原生操作、提交后场景回写及失败恢复；查询不占锁、不释放锁、不返回内部凭据。即使 busy=false，执行入口仍需原子预留，调用方必须处理查询之后发生的并发拒绝。该接口不检查原生 LightFX 可执行文件、场景输入合法性或渲染质量，也不是持久任务／统一百分比协议。上方示例仅列基础字段；可选取消能力和原生诊断见下文。新旧 renderer 混用的限制仍见下文。

### 原生诊断

Probe／Lightmap 的 `queryCapabilities()` 和成功 Bake 结果可带 `diagnostics`：`{ version: 1, operationId?, stage, logs, progress?, rate? }`。Scene 只返回本运行实例、对应烘焙类型的当前或最近原生操作，内部 Host 查询校验 operation ID、target 与 transaction ID；不会返回其他场景的日志。没有可用诊断或查询失败时字段可缺省，集成方应降级显示，不能因此把烘焙成功改为失败。

Host 最多记住 32 个操作；每个操作保留最近 128 条日志，每条与进度文本上限为 2048 字符，隐藏该操作工作目录和目标资产目录的绝对路径。`progress` 保留 LightFX 原始文本（例如 `Build lighting 25%`）；仅当专用 Progress 事件严格匹配该已验证格式且数值位于 0–100 时，另提供 `rate`。未知格式不得从日志或任意数字推断百分比。`stage` 是最近采样的原生阶段，不代替上层 Scene 的成功／取消／恢复状态。进程重启后诊断不保留，不提供持久任务身份或失联事务恢复。

## MCP 工具

### 并发与故障边界

Scene runtime 先通过内部 `reserveSceneOperation` 取得宿主生成的事务凭据，业务结束后通过 `releaseSceneOperation` 释放。多个 Webview／worker 共用同一宿主预留；本地锁仍防止同一 runtime 重入。原生任务的 `operationId` 与场景事务的 `transactionId` 不同，原生 commit／rollback 结束不代表上层场景回写已经结束。内部凭据不是公开任务查询接口，也不是用户认证机制。

宿主校验事务凭据、目标和动作；错误或已过期的凭据不能开始新的原生烘焙／清理，重复释放旧事务不能释放新持有者。没有场景预留的旧原生 begin 入口仍独占原生操作；旧资产删除入口也会在删除及 Asset DB 刷新期间临时预留。旧 renderer 若完全绕过新增协议执行内存 Clear，并不受此机制保护，集成时必须统一运行产物版本。

运行实例失联或释放失败时采用 fail-closed：宿主不自动超时放开场景预留，以免暂停的旧实例恢复后与新任务同时写回。此时不要自动重试烘焙；先处理原实例并重启其 Scene host。原生回滚失败时保留恢复备份，不得手工删除以“解除忙状态”。自动失联回收与公共持久任务仍未实现；当前 Cancel 已按本 Scene、烘焙类型和内部操作归属核对，具体契约见“取消烘焙”。

### 烘焙 Light Probe

工具名：`scene-bake-light-probes`

```json
{
  "options": {
    "giScale": 8,
    "giSamples": 4096,
    "bounces": 1,
    "reduceRinging": 0,
    "showWireframe": true,
    "showConvex": false,
    "lightProbeSphereVolume": 1,
    "saveScene": true,
    "timeoutMs": 600000
  }
}
```

参数：

| 参数 | 范围 | 默认行为 |
| --- | --- | --- |
| `giScale` | 0–100 | 使用场景 `lightProbeInfo.giScale` |
| `giSamples` | 64–65535，整数 | 使用场景 `lightProbeInfo.giSamples` |
| `bounces` | 1–4，整数 | 使用场景 `lightProbeInfo.bounces` |
| `reduceRinging` | 0–0.05 | 使用场景 `lightProbeInfo.reduceRinging` |
| `showWireframe` | boolean | 使用场景 `lightProbeInfo.showWireframe` |
| `showConvex` | boolean | 使用场景 `lightProbeInfo.showConvex` |
| `lightProbeSphereVolume` | 0–100 | 使用场景 `lightProbeInfo.lightProbeSphereVolume` |
| `saveScene` | boolean | `true` |
| `timeoutMs` | 1000–3600000 ms | 600000 ms |

所有参数均可选，未传入时使用场景当前值。`giScale`、`giSamples` 和 `bounces` 参与 LightFX 计算；`reduceRinging`、`showWireframe`、`showConvex` 和 `lightProbeSphereVolume` 用于烘焙结果后处理或编辑器显示。烘焙成功后，本次的有效参数与 SH 结果作为同一次 Undo 操作写回 `LightProbeInfo`；计算失败、提交未确认或取消胜出时不应用结果。结果已录制后的保存失败保留新结果，详见下文。

平移已启用探针组或其父节点时，CLI 同步全局采样点和四面体，并保留所有组的原 SH 系数，刷新光照缓存；对齐 Creator 3.8.8 移动 A 组后 A／B 组系数都保留的行为。不重新生成组件内手工编辑过的采样点，也不自动重新烘焙。普通节点属性操作和 Gizmo recording 仍记录位置编辑的 Undo／Redo，保存仍由调用方决定；保留系数不代表已按新位置重烘焙。

此同步沿用当前引擎的 `localProbe + worldPosition` 约定，探针球、范围盒与框选投影也采用相同约定，不额外给局部采样点乘旋转／缩放。祖先旋转／缩放若改变子组世界位置，采样位置同步并使旧 SH 失效；改父级将受影响 Scene 的结果快照放在节点恢复之后，Scene 自身不参与重挂。组件 Undo 替换 probes 数组后重新同步引擎注册引用，避免后续变换再次使用旧数组。

### 探针组编辑与显示

`Scene.Gizmo` 提供探针 vertex／box 模式查询与切换、生成、全选／取消全选、选中数量、复制／删除以及区域选择接口。选择按实际可见、有效、启用的组统计；隐藏或池化实例换目标时清空旧选择。支持空白或探针球起手框选，Shift／Ctrl／Cmd 追加，追加框选缩小时按按下时的选择基线重新计算。

`duplicateSelectedLightProbes()`／`deleteSelectedLightProbes()` 返回 `Promise<number>`，等待 CLI 的 Undo 录制结束后给出实际变更点数；复制副本位于原位置并选中新点。`generateLightProbes()` 只生成采样点，调用方需要为它建立一次 Undo recording，不能把生成当作 GI 烘焙。键盘操作应在场景焦点与正确编辑模式下路由，避免删除节点或修改其他组。

凸包外边界、边界法线与内部四面体线框分别绘制，读取 `showConvex`／`showWireframe`；缓存失效覆盖显示参数、采样数据和变换变化。范围逐坐标、复杂拖动／焦点组合、编辑结果保存重开及最终材质显示仍需按场景扩展验收。

### Light Probe 烘焙返回结果

成功返回示例：

```json
{
  "result": {
    "code": 200,
    "data": {
      "sceneUrl": "db://assets/LightProbe.scene",
      "probeCount": 125,
      "giScale": 8,
      "giSamples": 4096,
      "bounces": 1,
      "reduceRinging": 0,
      "showWireframe": true,
      "showConvex": false,
      "lightProbeSphereVolume": 1,
      "durationMs": 1630
    }
  }
}
```

### 清理 Light Probe

工具名：`scene-clear-light-probes`

```json
{
  "options": {
    "saveScene": true
  }
}
```

该操作清除当前场景全部探针的烘焙结果，通知引擎刷新，并作为一次 Undo 操作记录。成功结果中的 `probeCount` 表示处理的探针数量。

Probe Clear 保留完整旧 SH 撤销。Lightmap 的当前契约为：成功重烘焙后不恢复此前旧纹理／UV／场景标记，本次有效结果可以 Redo；删除模式 Clear 后本次及更早结果均失效。两者的 Undo 语义不同。

Probe／Lightmap Bake／Clear 的 `saveScene` 默认是 `true`：完整成功后，当前结果作为已保存基线；Undo 离开保存点会变脏，Redo 回到已保存的有效结果恢复干净。Lightmap 旧结果须经过失效过滤，不能因历史尚存就恢复已被替换的贴图。显式传 `false` 时只修改内存并保留 dirty，调用方需要另行保存。

### 提交与保存失败

Bake 按「确认原生产物提交 → 应用场景结果 → 完成 Undo 录制 → 可选保存」执行；Clear 无原生提交，先完成结果录制再保存。Host 的 `committed` 只表示产物不再被取消／超时／rollback 删除，不代表 Scene 已应用或保存，也不代表整个任务成功。

- 原生提交拒绝或回应丢失：不应用结果、不创建结果历史、不保存场景。Host 若实际上已提交，则新版本可能成为未引用资产；保留它，不强删、不自动重新 Bake。
- 结果应用或录制前失败：恢复旧内存，不保存。已确认提交的产物仍保留，避免把不可逆的资产提交误当成可回滚事务。
- Undo 已入栈后的保存失败／回应丢失：抛出包含 `LightFX result retained` 和原始原因的错误，**保留当前结果、Undo 和产物**。保存请求可能未写盘，也可能已写盘但没有返回确认；不能通过自动恢复旧内存或删除贴图来猜测磁盘状态。调用方应刷新实际结果，允许用户检查后重新保存或 Undo，不要把失败解释为“场景未改变”。
- 失败时不会额外标记已保存。保存尚未写盘时结果保持 dirty；若保存已确认完成后才发生外层回应错误，内存与已保存结果相同，可以保持 clean。dirty 不是保存失败原因或磁盘写入状态的唯一证据。
- 场景保存先等待 Terrain 资产保存。已注册 Terrain 服务抛错或批量结果报告失败时，不继续保存 `.scene`、不广播保存成功、不更新保存点；后一个 Terrain 成功也不能覆盖前一个失败。已经成功写入的 Terrain 文件不做猜测性回滚，失败项保留 dirty 供重试。

这保证正常运行实例中不先发布可被原生回滚删除的场景引用，但不是磁盘／Terrain／资产的多文件原子事务。进程崩溃恢复、任意并发编辑与保存协调、未引用版本安全回收仍需独立协议，不由此提交顺序承诺。

### 烘焙 Lightmap

工具名：`scene-bake-lightmap`

```json
{
  "options": {
    "msaa": 4,
    "resolution": 1024,
    "filter": true,
    "highp": false,
    "giScale": 1,
    "giSamples": 25,
    "giPathLength": 4,
    "aoLevel": 0,
    "aoStrength": 0.5,
    "aoRadius": 1,
    "aoColor": [136, 136, 136, 255],
    "threads": 1,
    "saveScene": true,
    "timeoutMs": 600000
  }
}
```

参数：

| 参数 | 范围 | CLI 默认值 |
| --- | --- | --- |
| `outputUrl` | 已存在的 `db://assets` 内父目录 URL，仅 Lightmap 支持 | 发布父目录 `db://assets/LightFX` |
| `msaa` | 1、2、4、8 | 4 |
| `resolution` | 128、256、512、1024、2048 | 1024 |
| `filter` | boolean | `true` |
| `highp` | boolean | `false` |
| `giScale` | 0–100 | 1 |
| `giSamples` | 1–2590，整数 | 25 |
| `giPathLength` | 1、2、3、4 | 4 |
| `aoLevel` | 0、1、2 | 0 |
| `aoStrength` | ≥ 0 | 0.5 |
| `aoRadius` | ≥ 0 | 1 |
| `aoColor` | 3 个 RGB 值及可选 Alpha，单项 0–255 | `[136, 136, 136]` |
| `threads` | 1–256，整数 | 1 |
| `saveScene` | boolean | `true` |
| `timeoutMs` | 1000–3600000 ms | 600000 ms |

未传入的参数使用 CLI 默认值。参数只影响本次烘焙，不写回 Creator 的 Lightmap 面板配置。

成功返回示例：

```json
{
  "result": {
    "code": 200,
    "data": {
      "sceneUrl": "db://assets/LightProbe.scene",
      "textureUrls": [
        "db://assets/LightFX/scene-<scene-uuid>/output/LFX_Mesh_0000.png",
        "db://assets/LightFX/scene-<scene-uuid>/output/LFX_Terrain_0000.png"
      ],
      "meshCount": 7,
      "terrainCount": 1,
      "durationMs": 4668
    }
  }
}
```

### 查询 Lightmap 烘焙信息

工具名：`scene-query-lightmap-bake-info`

该只读工具不接收参数。它从当前活动场景中 MeshRenderer 和 Terrain 的实际 Lightmap 绑定反查资源，不依赖 Creator Lightmap 面板的私有 Profile：

```json
{
  "result": {
    "code": 200,
    "data": {
      "sceneUrl": "db://assets/LightProbe.scene",
      "baked": true,
      "meshCount": 1,
      "terrainCount": 0,
      "highp": false,
      "stationaryMainLight": false,
      "textures": [
        {
          "uuid": "texture-asset-uuid",
          "url": "db://assets/LightFX/scene-<scene-uuid>/output/LFX_Mesh_0000.png",
          "filename": "LFX_Mesh_0000.png",
          "size": 45650,
          "createdAt": 1788782429000,
          "modifiedAt": 1788782429000
        }
      ],
      "missingTextureUuids": []
    }
  }
}
```

`size` 的单位为字节，时间字段为 Unix 毫秒时间戳。`meshCount` 和 `terrainCount` 是当前绑定 Lightmap 的组件数量；重复使用的贴图在 `textures` 中只返回一次。场景仍然存在贴图绑定但 Asset DB 或源文件缺失时，根资源 UUID 会列入 `missingTextureUuids`。

Pink 应在场景打开、烘焙完成和清理完成后调用该工具刷新面板。缩略图加载、RGBA 通道切换和时间格式化由 Pink 根据资源 URL/UUID 实现，CLI 不传输图片像素。

#### 导出输入校验

`queryBakeInfo()` 只查询已烘焙的绑定与贴图信息，不提供额外的下次烘焙对象诊断。接收贴图的 Mesh 在实际导出时仍检查 UV1 长度是否等于顶点数的两倍、所有值是否有限；检查不包含 UV 重叠或自动展开。参与配置由 Inspector 的 Bake Settings 编辑；查询成功不代表输入有效或保证最终画质。

### 清理 Lightmap

工具名：`scene-clear-lightmap`

只解除场景绑定并保留贴图：

```json
{
  "options": {
    "saveScene": true,
    "deleteAssets": false
  }
}
```

解除绑定并删除没有其他引用的 LightFX 贴图及已登记的配套文件：

```json
{
  "options": {
    "saveScene": true,
    "deleteAssets": true
  }
}
```

`saveScene` 默认为 `true`，`deleteAssets` 默认为 `false`。调用 `deleteAssets:true` 前必须确认 `queryCapabilities().assetCleanupVersion === 1`；服务也会在修改场景前再次校验实际 Host 能力。成功结果中的 `clearedCount` 是解除绑定的 Mesh 和 Terrain block 总数，`deletedAssetCount`、`retainedAssetCount` 和 `failedAssetCount` 分别表示删除、因引用保留和删除失败的资产数量，包含原生配套文件。

删除模式先清空绑定，再序列化实时场景检查候选资源是否仍被其他字段引用；仍存在的根资源或子资源引用会保留。保存成功后才逐项删除经过 Asset DB 验证、归属明确且没有其他引用的产物，不删除父目录或同目录无关文件。外部引用、依赖查询失败或删除失败均保留并报告。

删除模式不清空节点移动等无关历史：保存成功后只取消 Clear 自身录制，并推进场景级结果代次。Undo／Redo 不恢复任何 Clear 前的 Lightmap 结果（包括未被物理删除的更早 Bake），但保留普通属性和 SH；Clear 后新的 Bake 历史仍可恢复。同一场景内部重建会转交代次，以兼容保留历史的软重载。实际删除的 UUID 另有悬空引用保护；明确保留／失败项解除删除保护，删除结果未知时保守保留。

成功 Bake 会替换完整场景结果：先清空旧绑定再应用本次输出，本次未参与的禁用／排除对象不继续展示旧结果；这些对象纳入结果记录及应用失败恢复范围。只有应用／录制／保存失败时才保留旧结果撤销；完整成功后旧 Lightmap 历史失效，普通属性和探针历史不变。

### 取消烘焙

工具名：`scene-cancel-lightfx-bake`

该工具没有输入参数：

```json
{}
```

成功返回示例：

```json
{
  "result": {
    "code": 200,
    "data": {
      "cancelled": true,
      "target": "lightmap"
    }
  }
}
```

没有任务运行时，返回 `cancelled: false` 和 `target: null`。

Scene 侧 `LightProbeBake.cancel()`／`LightmapBake.cancel()` 只取消本 renderer 内对应类型的 Bake，不再取消共享 host 上其他场景／其他类型的任务。内部请求须带精确 operation ID、目标和 scene transaction ID；缺失／过期归属返回 `cancelled:false`，旧 host 缺少取消归属协议时拒绝请求，不回退到全局取消。导出阶段或 native begin 尚未返回 ID 时也返回 false；因此 false 不一定表示没有烘焙，而是这次请求没有取消任务。

`LightProbeBake.queryCapabilities()`／`LightmapBake.queryCapabilities()` 仅在实际 host 支持上述归属协议时额外返回 `cancelVersion:1` 和 `cancellable`，不支持时省略。`cancellable` 仅在本 Scene 对应类型的原生 operation 已取得 ID 时为 true；准备阶段为 false，供 UI 据实启用按钮，执行时仍核对精确归属。就绪快照不保证取消一定先于 commit，已提交的任务仍返回 false。该能力不代表持久任务快照；UI 可用自身的 renderer 会话 ID 保护取消消息，再调用该 Scene 的取消入口，任务结束仍以原 Bake Promise 完成回滚为准。

通用 MCP 工具保留按 Probe／Lightmap 依次尝试的行为，主进程已跟踪的 Bake 仍路由到原 renderer，不因切标签改投另一个场景。它不是跨客户端认证或公共持久任务句柄；需要严格防止客户端旧消息取消后续任务的 UI，仍须先接入独立任务身份契约。

取消成功后，取消工具本身返回 `code: 200`；原烘焙请求结束并返回 `code: 500`、`reason: "LightFX bake was cancelled."`。这是被取消任务的预期终态。

## 场景会话与资产规则

- Bake／Clear 在申请 Host 事务前同步捕获源 Scene 实例及编辑器会话代次；申请完成后再次校验，若已切换或重载则释放该事务并拒绝执行，不对新场景烘焙、清理或保存。原生烘焙期间允许打开或重载场景，结果应用前仍校验同一源会话；同 UUID 重载也视为新会话。
- 结果应用、Undo 录制、保存和清理在原会话的生命周期队列内完成，打开、关闭、重载不会穿插其间。此保护不等同于锁住所有普通属性编辑；烘焙期间仍应避免修改输入几何和灯光。
- 新产物先导入独立暂存目录：默认 `db://assets/<scene-name>/lightmap/bake-<operation-uuid>/`，指定父目录时为 `<outputUrl>/bake-<operation-uuid>/`。原生提交前失败或取消只回滚本轮产物。
- 保存并清理旧产物成功后，PNG 保留 UUID 移动到 `<父目录>/scene-<完整场景UUID>/output/`。默认父目录为 `db://assets/LightFX`；`outputUrl: "db://assets"` 与省略相同。相同名称或相同自选父目录的不同场景也互相隔离。调用方必须使用返回的 `textureUrls`，不要拼路径。
- 同一场景目录内包含 `output/LFX_Mesh_0000.png`、`output/LFX_Terrain_0000.png` 等 PNG，以及实际生成的 `tmp/lfx.in`、`output/lfx.out`、可选 `lfx.log`。配套文件不进入纹理预览列表；输入文件不承诺可脱离项目重放。
- 新烘焙使用新 UUID，不覆盖同名资产。保存后精确清理旧产物，再发布新文件；冲突或部分移动失败保留已保存的新产物，不伪装成未修改场景。
- `saveScene:false` 不固定发布、不删除旧资产、不隐式保存。保存失败也不清理旧产物。已确认提交的产物不再用原生 rollback 删除。
- 归属记录在项目 `settings/lightfx-assets/<场景UUID>.json`，包含 textures 和 auxiliary UUID。旧平铺或自选目录中已记录的产物可以清理；旧版未记录且已解绑的文件不扫描、猜删。
- 清理检查实时场景引用以及主资源和子资源的外部依赖，逐项确认源文件与 meta 删除。共享资源保留；当前重烘焙若有旧资源保留，仍报告清理未完成并保留已保存结果，不能当作未执行。
- 已登记的资源在初始化完成、空闲的 Asset DB 中明确不存在时，移除失效归属记录，不计作本次物理删除。数据库未就绪、忙碌或查询抛错时保留记录供重试。
- 文件移动遇到冲突不覆盖目标；失败时只恢复本次移走且内容未变化的 meta。若源/目标 meta 已被其他操作替换，明确报告安全恢复失败，保留现场，不覆盖别人的元数据。
- 只非递归删除已清空的 `bake-UUID` 暂存目录；不递归删除输出父目录。损坏归属文件、恢复失败或宿主失联需要排查，不通过手工删记录来解除保护。

## Creator 互操作说明

CLI 烘焙并保存后，Creator 重新打开场景可以正常加载和显示 Light Probe 与 Lightmap 结果。在 Pink 中通过当前可见的 Scene Webview 烘焙时，结果会直接应用并重绘，无需重启编辑器。

Creator Lightmap 面板的“清除”操作依赖该面板自己保存的 `latestLightmapResultDir`。CLI 不写入 Creator 的私有面板状态，因此 Creator 面板可能无法清除 CLI 生成的 Lightmap。请使用 `scene-clear-lightmap` 清理 CLI 烘焙结果。CLI 不伪造 Creator Profile 状态，以避免耦合面板内部实现或误删资源。

Pink 的烘焙信息面板应使用 `scene-query-lightmap-bake-info`，以当前场景真实绑定作为数据源，不需要兼容 Creator 的 `latestLightmapResultMap`。

## 运行时兼容性

随 Creator 提供的 LightFX 可执行程序使用 Socket.IO 2.x 协议，而 CLI 现有服务使用 Socket.IO 4.x。项目通过 npm alias `socket.io-v2` 提供仅供 LightFX 本地进程桥接使用的 2.3.0 服务：

- 只监听本机随机端口。
- 不替换 MCP 或其他现有 Socket.IO 4.x 服务。
- LightFX 升级并支持 Socket.IO 4.x 后可以移除该兼容依赖。

LightFX 当前可能输出 Creator 历史协议版本。解析器只接受已知兼容版本，并拒绝未知版本、截断数据、非法长度及非有限浮点数。

## main 合并兼容性与验证

- `Scene.Gizmo.deleteSelectedLightProbes()` 和 `duplicateSelectedLightProbes()` 返回 `Promise<number>`，调用方须 `await` 后读取数量。
- 地形保存异常会阻止场景保存，批量成功项不掩盖失败项；这修正了之前吞错的行为。
- 普通无生成探针的场景跳过新增子树扫描。探针同步、结果历史保护仍集中于专用辅助模块，公共入口保留调用。
- 烘焙目录结构已按场景 UUID 隔离；更新 CLI 后重启实际 Node Host 和 Scene runtime，不混用旧产物。
- 自动回归覆盖场景切换/同 UUID 重载、生命周期队列内保存、双场景同目录重烘焙/清理、旧目录迁移、已删配套文件重试和 meta 冲突恢复。
- Pink 手动验证：A 场景开始烘焙后打开/重载场景，确认旧任务拒绝写回；A/B 使用相同输出父目录分别 Bake，重烘焙并清理 A，确认 B 不变；删除生成的 log 后重试；最后验证普通节点编辑、Undo/Redo、Terrain 保存和关闭重开。
- 自动测试不替代当前版本的原生烘焙与画面验收。历史联调证据见 [历史验证记录](history/lightfx-bake-validation.md)，不作为当前版本全量通过的证明。
