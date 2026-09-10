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

`busy` 仅为共享宿主的瞬时占用提示，包含导出前预留、原生操作、提交后场景回写及失败恢复；查询不占锁、不释放锁、不返回内部凭据。即使 busy=false，执行入口仍需原子预留，调用方必须处理查询之后发生的并发拒绝。该接口不检查原生 LightFX 可执行文件、场景输入合法性或渲染质量，也不是可恢复的任务状态／百分比／有归属取消接口。新旧 renderer 混用的限制仍见下文。

## MCP 工具

### 并发与故障边界

Scene runtime 先通过内部 `reserveSceneOperation` 取得宿主生成的事务凭据，业务结束后通过 `releaseSceneOperation` 释放。多个 Webview／worker 共用同一宿主预留；本地锁仍防止同一 runtime 重入。原生任务的 `operationId` 与场景事务的 `transactionId` 不同，原生 commit／rollback 结束不代表上层场景回写已经结束。内部凭据不是公开任务查询接口，也不是用户认证机制。

宿主校验事务凭据、目标和动作；错误或已过期的凭据不能开始新的原生烘焙／清理，重复释放旧事务不能释放新持有者。没有场景预留的旧原生 begin 入口仍独占原生操作；旧资产删除入口也会在删除及 Asset DB 刷新期间临时预留。旧 renderer 若完全绕过新增协议执行内存 Clear，并不受此机制保护，集成时必须统一运行产物版本。

运行实例失联或释放失败时采用 fail-closed：宿主不自动超时放开场景预留，以免暂停的旧实例恢复后与新任务同时写回。此时不要自动重试烘焙；先处理原实例并重启其 Scene host。原生回滚失败时保留恢复备份，不得手工删除以“解除忙状态”。自动失联回收、公开任务状态和按任务归属取消尚未包含在这层协议中；现有 Cancel 仍是共享操作，不应直接当作某个面板私有任务的取消按钮。

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

所有参数均可选，未传入时使用场景当前值。`giScale`、`giSamples` 和 `bounces` 参与 LightFX 计算；`reduceRinging`、`showWireframe`、`showConvex` 和 `lightProbeSphereVolume` 用于烘焙结果后处理或编辑器显示。烘焙成功后，本次的有效参数与 SH 结果作为同一次 Undo 操作写回 `LightProbeInfo`；烘焙失败或取消时保留原场景配置。

编辑已启用探针组或其父节点的位置时，CLI 会同步全局采样点和四面体。只有实际采样位置改变才清空旧 SH，避免把旧位置的烘焙结果用于新位置；不会重新生成组件内手工编辑过的采样点。普通节点属性操作和 Gizmo recording 会把受影响的 Scene 数据纳入同一次撤销记录：Undo 恢复旧位置与旧 SH，Redo 恢复新位置与失效状态。保存仍由调用方决定，移动后需要重新烘焙。

此同步沿用当前引擎的 `localProbe + worldPosition` 约定；完整旋转／缩放与 Gizmo 的 TRS 一致性、重设父级和增删采样点的结构事务仍需独立验收，不等同于所有探针编辑操作已完成。

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

Probe Bake／Clear 的 `saveScene` 默认是 `true`：完整成功后，当前结果作为 Undo 的已保存基线；Undo 回到旧结果会变脏，Redo 回到已保存结果恢复干净。显式传 `false` 时只修改内存并保留 dirty，调用方需要另行保存。保存失败不提交新录制；原生提交失败、提交期间发生其他编辑或历史重置时，不额外把当前历史标成已保存。这不代表跨磁盘与原生资产提交的失败回滚已经具备完整原子性。

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
| `msaa` | 1、2、4、8 | 4 |
| `resolution` | 128、256、512、1024、2048 | 1024 |
| `filter` | boolean | `true` |
| `highp` | boolean | `false` |
| `giScale` | 0–100 | 1 |
| `giSamples` | 1–65535，整数 | 25 |
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
        "db://assets/LightProbe/lightmap/LFX_Mesh_0000.png",
        "db://assets/LightProbe/lightmap/LFX_Terrain_0000.png"
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
          "url": "db://assets/LightProbe/lightmap/LFX_Mesh_0000.png",
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

解除绑定并删除当前场景生成的 Lightmap 目录：

```json
{
  "options": {
    "saveScene": true,
    "deleteAssets": true
  }
}
```

`saveScene` 默认为 `true`，`deleteAssets` 默认为 `false`。成功结果中的 `clearedCount` 是解除绑定的 Mesh 和 Terrain block 总数。

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

取消成功后，取消工具本身返回 `code: 200`；原烘焙请求结束并返回 `code: 500`、`reason: "LightFX bake was cancelled."`。这是被取消任务的预期终态。

## Lightmap 资产规则

Lightmap 统一输出到：

```text
db://assets/<scene-name>/lightmap/
```

典型文件包括：

```text
LFX_Mesh_0000.png
LFX_Terrain_0000.png
```

- Mesh 与 Terrain 使用独立的类型和索引映射，避免两者均从索引 0 开始时串绑贴图。
- 重复烘焙会保留同名贴图的 `.meta`，从而复用 Asset UUID。
- 导入后将 `fixAlphaTransparencyArtifacts` 设置为 `false`，再加载 Texture2D 子资源并绑定。
- 资产导入、组件绑定或场景保存失败时，恢复原贴图目录、组件绑定和场景全局标记。
- 成功、失败、取消和超时都会清理本次 LightFX workspace。

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

## 错误与事务

常见错误包括：

- 当前没有打开已保存场景。
- 探针不足、未生成或没有可烘焙 Mesh/Terrain。
- 场景依赖资产缺失。
- LightFX 缺失、启动失败、连接失败、超时或异常退出。
- 输出协议不兼容或结果损坏。
- Asset DB 导入、Texture2D 加载或场景保存失败。
- 已有另一个 LightFX 任务运行。
- 当前可见场景尚未加载完成，或同时存在多个可见的场景渲染器。

Bake 和 Clear 都记录为单次 Undo 操作。场景结果提交失败时恢复原组件数据和全局标记；Lightmap 资产提交失败时还会恢复原 PNG 与 `.meta`。

## 验证范围

当前实现已经验证：

- Light Probe Bake/Clear，包含 SH 数据保存和重新加载。
- Mesh Lightmap Bake/Clear。
- Terrain Lightmap Bake/Clear。
- Mesh 与 Terrain 混合场景的独立贴图绑定。
- 重复烘焙的 `.meta` 与 UUID 复用。
- Pink 当前可见场景中的即时结果应用、清理和取消。
- TypeScript 编译、ESLint、API、协议和资产事务测试。

新增材质类型、灯光类型、LightFX 版本或目标平台时，应补充对应真实场景回归。
