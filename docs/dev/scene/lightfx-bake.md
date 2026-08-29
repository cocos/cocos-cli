# LightFX 烘焙能力接入设计

## 1. 背景与目标

Cocos CLI 需要接入以下两种离线烘焙能力：

- Light Probe Bake：计算场景中光照探针的球谐光照系数（SH coefficients），将结果写回场景全局数据。
- Lightmap Bake：生成场景静态模型和地形使用的 Lightmap 纹理，导入 Asset DB 后绑定到对应组件。

两种能力都使用 Creator 的 LightFX 工具，并共享场景导出、二进制协议、外部进程管理和结果解析。实现采用“一套公共 LightFX 内核、两个独立业务服务和独立 MCP 工具”的结构。

本设计的目标是：

1. Light Probe Bake 与 Lightmap Bake 共享同一套 LightFX 基础设施。
2. 两种烘焙可以独立调用、独立失败和独立回滚。
3. 不直接复制 Creator 中同时混合面板、Metrics、Lightmap 和 Light Probe 的大文件。
4. 保持烘焙输入、LightFX 协议和结果应用逻辑与 Creator 兼容。
5. 支持 MCP、CLI 场景服务以及未来 VSCode/Pink 场景编辑器调用。

非目标：

- 不提供同时烘焙 Light Probe 和 Lightmap 的公开 `both` 接口；调用方按需分别调用两个工具。
- MCP 可以可选覆盖真正参与计算的烘焙参数；未传参数时读取场景或项目现有配置。编辑器可视化参数不混入 Bake 接口。
- 不实现新的 LightFX 算法，也不修改引擎的光照探针或 Lightmap 数据结构。
- 不要求浏览器 `/scene-editor/` 提供 WebGL 捕获能力。

## 2. Creator 现有流程

### 2.1 Light Probe

Creator 的调用链为：

```text
Light Probe 面板
  -> 获取 Lightmap 配置并设置 temp/light-probe 输出目录
  -> lightmap 扩展的 bakeLightProbe
  -> scene process 中导出场景
  -> 写入 tmp/lfx.in
  -> 启动本地 Socket.IO 服务和 LightFX 进程
  -> LightFX 输出 output/lfx.out
  -> 解析 Position、Normal、SH coefficients
  -> 写回 scene.globals.lightProbeInfo.data.probes
  -> lightProbeInfo.onProbeBakeFinished()
  -> repaint、记录场景修改
```

相关 Creator 代码：

- `app/modules/editor-extensions/extensions/light-probe/source/renderer.ts`
- `app/modules/editor-extensions/extensions/lightmap/source/lightmap/index.ts`
- `app/modules/editor-extensions/extensions/lightmap/source/lightmap/backer/LFX_App.ts`
- `app/modules/editor-extensions/extensions/lightmap/source/lightmap/backer/LFX_Baker.ts`
- `app/modules/editor-extensions/extensions/lightmap/source/lightmap/backer/LFX_Types.ts`

### 2.2 Lightmap

Lightmap 与 Light Probe 使用相同的场景导出和 LightFX 进程。区别在于结果包含纹理以及模型、地形对应的 UV offset/scale。Creator 在完成后还会：

- 刷新并导入输出 PNG。
- 修改图片 meta，使其作为纹理导入。
- 加载 Texture2D 子资源。
- 调用 MeshRenderer/Terrain 的 Lightmap 更新接口。
- 更新 `bakedWithStationaryMainLight`、`bakedWithHighpLightmap` 等场景全局状态。

### 2.3 引擎数据

Light Probe 配置和结果位于：

```text
scene.globals.lightProbeInfo
  giScale
  giSamples
  bounces
  reduceRinging
  data.probes[]
    position
    normal
    coefficients[]
  data.tetrahedrons[]
```

`LightProbeGroup` 负责生成局部探针位置，并通过 `LightProbeInfo.syncData()`、`update()` 汇总世界坐标及更新四面体。烘焙完成后应调用 `onProbeBakeFinished()`，通知使用探针的模型刷新。

引擎参考代码：

- `resources/3d/engine/cocos/gi/light-probe/light-probe-group.ts`
- `resources/3d/engine/cocos/gi/light-probe/light-probe.ts`
- `resources/3d/engine/cocos/scene-graph/scene-globals.ts`

## 3. 总体架构

```text
MCP/API
  |-- scene-bake-light-probes
  `-- scene-bake-lightmap
             |
             v
scene-process business services
  |-- LightProbeBakeService  -- 写回 SH、通知引擎、Undo、保存场景
  `-- LightmapBakeService    -- 导入纹理、绑定组件、Undo、保存场景
             |
             v
shared LightFX baking core
  |-- scene exporter
  |-- texture resolver
  |-- lfx.in/out codec
  |-- LightFX process and Socket.IO lifecycle
  `-- workspace and cleanup
             |
             v
static/tools/lightmap-tools/LightFX(.exe)
```

公共内核只产生结构化烘焙结果，不直接修改场景或 Asset DB。结果提交和回滚由业务服务负责。

建议目录：

```text
src/core/scene/scene-process/service/baking/lightfx/
  types.ts
  buffer.ts
  format.ts
  exporter.ts
  texture-resolver.ts
  process.ts
  workspace.ts
  baker.ts

src/core/scene/scene-process/service/light-probe.ts
src/core/scene/scene-process/service/lightmap.ts
```

公共类型和 API：

```text
src/core/scene/common/light-probe.ts
src/core/scene/common/lightmap.ts
src/api/scene/light-probe-schema.ts
src/api/scene/light-probe.ts
src/api/scene/lightmap-schema.ts
src/api/scene/lightmap.ts
```

## 4. 公共 LightFX 内核

### 4.1 烘焙目标

内核内部支持目标枚举：

```ts
type LightFXBakeTarget = 'light-probe' | 'lightmap';
```

内部协议保留两个烘焙目标位，但不公开 `both`，也不让一个业务服务同时提交两类结果。

### 4.2 场景导出

导出器从当前 scene-process 中的真实引擎对象读取数据，至少覆盖：

- 场景名称和全局烘焙配置。
- 非 `Movable` 的有效节点。
- MeshRenderer/SkinnedMeshRenderer 所需网格数据。
- Terrain 数据。
- DirectionalLight、SphereLight、SpotLight。
- 材质的 diffuse、emissive、metallic、roughness、alpha cutoff 及相关贴图。
- Light Probe 的世界坐标和法线。

过滤规则必须与 Creator 对齐：

- Light Probe Bake 只导出 `bakeSettings.bakeToLightProbe` 为真的模型。
- Lightmap Bake 根据 `bakeable`、`castShadow` 和 `receiveShadow` 决定导出和接收行为。
- inactive 节点、不可用组件和 `Movable` 节点不参与静态烘焙。
- HDR 与非 HDR 下的光强换算保持 Creator 行为。

导出器不能访问 MCP、Undo 或场景保存服务，使其可以用构造的场景对象单独测试。

### 4.3 纹理解析

材质可能引用普通资源 UUID或带子资源后缀的 UUID。纹理解析器通过主进程 Asset DB RPC：

- 普通 UUID：查询真实文件路径。
- library 子资源：定位项目 `library/<prefix>/<uuid>` 文件。
- 缺失资源：记录明确的资源和材质信息；必要贴图缺失时失败，可选贴图可降级为空。

纹理文件复制到本次烘焙 workspace，文件名必须稳定并避免不同目录同名冲突。

### 4.4 二进制协议

`format.ts` 和 `buffer.ts` 负责 Creator/LightFX 使用的 `lfx.in`、`lfx.out` 协议，包括：

- 文件版本和 chunk ID。
- Settings。
- Terrain、Mesh、Material、Light、LightProbe 输入。
- Terrain/Mesh Lightmap 信息和 LightProbe 输出。
- 数组长度、字符串、整数和浮点数的边界检查。

解析输出时必须拒绝：

- 不支持的版本。
- 未知或截断的 chunk。
- 非有限浮点数。
- 负数或异常大的数组长度。
- 探针、模型或地形索引越界。

### 4.5 Workspace

每次烘焙使用唯一工作目录，不能复用 Creator 固定的 `temp/light-probe`：

```text
<project>/temp/lightfx-bake/<operation-id>/
  tmp/lfx.in
  tmp/<textures>
  output/lfx.out
  output/<lightmap pngs>
```

规则：

- 成功后默认清理临时输入；Lightmap 输出完成资产提交后再清理。
- 失败、取消和超时均执行 finally 清理。
- 临时文件不作为 MCP 输出；成功、失败、取消和超时均由服务清理自身 workspace。
- 不删除 operation-id 目录以外的任何文件。

### 4.6 LightFX 进程生命周期

进程层负责：

1. 从 `GlobalPaths.staticDir/tools/lightmap-tools` 定位平台可执行文件。
2. 创建本地 Socket.IO 服务并监听随机端口。
3. 启动 LightFX，将本地 URL 作为参数传入。
4. 等待 Login，发送 Start，接收 Log、Progress、Finished。
5. Finished 后读取完整 `lfx.out`，再发送 Stop。
6. 关闭 Socket.IO 服务并终止子进程。

必须处理：

- 工具不存在或没有执行权限。
- 端口创建失败。
- Login 超时。
- LightFX 非零退出或异常退出。
- 输出文件缺失、尚未写完或解析失败。
- 用户取消和总流程超时。
- 服务或进程只能完成一次清理，避免重复 resolve/reject。

公共内核同一时间默认只允许一个 LightFX 烘焙任务，避免多个进程争用 CPU、端口或项目资源。

### 4.7 进度事件

公共进度阶段：

```ts
type LightFXBakeStage =
    | 'validating'
    | 'exporting-scene'
    | 'resolving-textures'
    | 'starting-baker'
    | 'baking'
    | 'reading-result'
    | 'applying-result'
    | 'saving-scene'
    | 'completed';
```

业务服务广播内部进度事件；MCP 调用等待最终结果，不依赖 Inspector 对通知的展示能力。

## 5. Light Probe Bake

### 5.1 MCP 接口

工具名：

```text
scene-bake-light-probes
```

调用参数：

```ts
interface ILightProbeBakeOptions {
    giScale?: number;
    giSamples?: number;
    bounces?: number;
    saveScene?: boolean;
    timeoutMs?: number;
}
```

- `saveScene` 默认 `true`。
- `timeoutMs` 覆盖完整流程，默认建议 600 秒，并设置合理最大值。
- `giScale`、`giSamples`、`bounces` 真正参与 LightFX 计算，允许 MCP 对本次烘焙进行可选覆盖。
- 未传入覆盖值时，从 `scene.globals.lightProbeInfo` 读取当前值。
- 覆盖值默认只作用于本次烘焙，不修改 `LightProbeInfo` 的持久化配置；如需永久修改，应通过场景属性编辑接口完成。
- 参数校验与引擎约束一致：`giScale` 为 `[0, 100]` 的有限数，`giSamples` 为 `[64, 65535]` 的整数，`bounces` 为 `[1, 4]` 的整数。
- 烘焙范围为当前打开场景中的全部有效 LightProbeGroup，而不是某个 `nodePath`。

以下 `LightProbeInfo` 参数不进入 Bake 接口：

- `reduceRinging`：运行时对 SH 系数的振铃抑制参数，不参与 LightFX 烘焙计算。
- `showProbe`、`showWireframe`、`showConvex`：编辑器可视化开关。
- `lightProbeSphereVolume`：编辑器中的探针显示尺寸。

这些参数仍保留在场景中，烘焙不会覆盖它们。

MCP JSON 示例：

```json
{
  "options": {
    "giScale": 8,
    "giSamples": 4096,
    "bounces": 1,
    "saveScene": true,
    "timeoutMs": 600000
  }
}
```

返回值：

```ts
interface ILightProbeBakeResult {
    sceneUrl: string;
    probeCount: number;
    giScale: number;
    giSamples: number;
    bounces: number;
    durationMs: number;
}
```

### 5.2 前置校验

- 当前打开的是具有 Asset URL 的场景，不支持 prefab。
- `lightProbeInfo.data` 存在。
- 至少存在 4 个有效探针，并已建立四面体数据。
- 所有 position、normal 和配置值均为有限数。
- 当前没有其他 LightFX 烘焙任务。
- LightFX 工具存在并可启动。

若用户只添加了 LightProbeGroup 但没有生成探针，应返回明确提示，而不是输出空结果。

### 5.3 结果校验与提交

提交前校验：

- 输出探针数量与请求输入一致。
- 探针顺序与输入一致；位置应在允许误差内匹配。
- 每个探针的 SH coefficient 数量符合引擎 `SH.getBasisCount()`。
- 所有系数均为有限数。

提交时序：

```text
保存旧 coefficients
  -> begin Undo recording
  -> 一次性写入全部 coefficients/normal
  -> lightProbeInfo.onProbeBakeFinished()
  -> Engine.repaintInEditMode()
  -> 按需保存场景
  -> end Undo recording
```

若提交或保存失败：

- cancel Undo recording。
- 恢复旧 coefficients 和 normal。
- 再次通知引擎并重绘。
- 返回失败，不留下部分探针的新数据。

Light Probe 结果直接序列化在 `.scene` 中，不创建新的 Asset DB 资源。

### 5.4 清除接口

清除烘焙结果使用独立工具：

```text
scene-clear-light-probes
```

该工具调用 `lightProbeInfo.onProbeBakeCleared()`，进入 Undo，并按需保存场景。

## 6. Lightmap Bake

### 6.1 MCP 接口

工具名：

```text
scene-bake-lightmap
```

调用参数：

```ts
interface ILightmapBakeOptions {
    msaa?: 1 | 2 | 4 | 8;
    resolution?: number;
    filter?: boolean;
    highp?: boolean;
    giScale?: number;
    giSamples?: number;
    giPathLength?: number;
    aoLevel?: number;
    aoStrength?: number;
    aoRadius?: number;
    aoColor?: [number, number, number, number?];
    threads?: number;
    saveScene?: boolean;
    timeoutMs?: number;
}
```

- `msaa`、`resolution`、`filter`、`highp`、GI、AO 和 `threads` 都会影响 LightFX 计算，允许 MCP 对本次烘焙进行可选覆盖。
- 未传入的参数使用与 Creator 面板初始值一致的 CLI 默认值。
- MCP 覆盖值默认只作用于本次烘焙，不写回项目 Lightmap 配置。永久修改配置应使用独立配置接口。
- 不开放 `outputDir`，统一输出到场景对应目录，不允许传入任意文件系统路径。

面板参数映射：

| Creator 面板 | MCP 参数 | LightFX 字段 |
| --- | --- | --- |
| 多重采样抗锯齿 | `msaa` | `MSAA` |
| 烘焙分辨率 | `resolution` | `Size` |
| 应用线性过滤 | `filter` | `Filter` |
| 高精度烘焙 | `highp` | `Highp` |
| 全局光照倍数 | `giScale` | `GIScale` |
| 全局光照采样点 | `giSamples` | `GISamples` |
| 光线追踪次数 | `giPathLength` | `GIPathLength` |
| 环境光遮蔽等级 | `aoLevel` | `AOLevel` |
| 环境光遮蔽强度 | `aoStrength` | `AOStrength` |
| 环境光遮蔽半径 | `aoRadius` | `AORadius` |
| 环境光遮蔽颜色 | `aoColor` | `AOColor` |

MCP JSON 示例：

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
    "saveScene": true,
    "timeoutMs": 600000
  }
}
```

返回值包含：

```ts
interface ILightmapBakeResult {
    sceneUrl: string;
    textureUrls: string[];
    meshCount: number;
    terrainCount: number;
    durationMs: number;
}
```

### 6.2 资产输出

建议稳定输出到：

```text
db://assets/<scene-name>/lightmap/
```

不能直接让 LightFX 写入最终资产目录。流程应为：

1. LightFX 写入唯一临时 workspace。
2. 完整校验 `lfx.out` 和所有引用 PNG。
3. 将 PNG 和 meta 暂存到最终目录旁的临时名称。
4. 原子替换最终文件，并保留事务备份。
5. Asset DB refresh/import。
6. 等待 Texture2D 子资源可查询和加载。
7. 绑定模型与地形。
8. 保存场景后提交文件事务。

重烘焙必须尽量复用已有资源 UUID，避免场景引用和版本管理中持续产生新资产。

### 6.3 图片导入

图片 meta 至少保证：

- 作为 Texture2D 导入。
- `fixAlphaTransparencyArtifacts=false`，与 Creator 行为一致。
- 高精度、颜色空间、filter、wrap 等选项由 Lightmap 输出规范明确设置，不能依赖导入器偶然默认值。

Asset DB refresh 后必须轮询目标 Texture2D 是否真正可加载，不能只等待文件事件。

### 6.4 结果绑定

根据 `lfx.out` 中稳定的导出索引绑定：

- MeshRenderer：纹理、offset.x/y、scale.x/y。
- Terrain block：纹理、block id、offset 和 scale。
- Stationary 主灯及高精度 Lightmap 对应的场景全局标志。

导出阶段必须建立 `export index -> engine object/component UUID` 映射，禁止在结果阶段重新按场景遍历顺序猜测对象。

### 6.5 Lightmap 事务

Lightmap 同时修改文件资产和场景，事务边界为：

```text
生成并校验临时结果
  -> 备份/替换最终 PNG 和 meta
  -> Asset DB 导入并加载 Texture2D
  -> begin Undo recording
  -> 绑定全部 Mesh/Terrain 并更新 globals
  -> 保存场景
  -> end Undo recording
  -> 删除文件备份
```

失败时按相反顺序回滚：

- 恢复组件原 Lightmap 引用和 globals。
- cancel Undo recording。
- 恢复旧 PNG/meta 或删除本次新增文件。
- 刷新 Asset DB，使内存资源状态与磁盘一致。

回滚实现应复用 Reflection Probe Bake 已验证的文件替换事务思想，但抽成通用文件事务后再由 Lightmap 使用。

### 6.6 清除接口

清理工具：

```text
scene-clear-lightmap
```

`scene-clear-lightmap` 解除组件绑定并更新 globals。是否删除磁盘纹理由 `deleteAssets` 显式控制，默认只解除绑定，避免破坏被其他场景引用的资源。

## 7. 进程与运行环境边界

LightFX 烘焙不同于 Reflection Probe 捕获：

- 不需要 WebGL 六面渲染。
- 不需要 `/scene-editor/` 保持打开或可见。
- 不通过 Socket.IO 回传大块 RGBA 数据。
- 不依赖 MCP Server 的 `maxHttpBufferSize`。

烘焙运行在 Node scene-process，文件、Asset DB、配置和工具路径等 Node 能力通过现有 RPC 访问主进程。LightFX 自己使用的本地 Socket.IO 只用于 CLI 与外部烘焙进程通信，不是浏览器场景渲染器通道。

因此未来 VSCode/Pink 编辑器只要通过 CLI 打开了可在 scene-process 中完整加载的场景，即可调用这两个 MCP 工具。

## 8. 并发、取消和超时

- 全局同一时间只允许一个 LightFX 任务。
- 重复调用立即返回“已有烘焙任务运行中”，不进入等待队列。
- 业务接口内部使用 operation id，所有事件、workspace 和结果均绑定该 id。
- 超时覆盖导出、工具启动、烘焙、结果解析、资源导入和场景保存。
- 取消应同时终止 LightFX、关闭 Socket.IO、停止结果提交并清理 workspace。
- 一旦进入结果提交阶段，取消按失败处理并执行事务回滚。

公开的 `scene-cancel-lightfx-bake` 可取消当前任务，并返回是否取消成功及任务类型。

## 9. 错误模型

错误信息至少区分：

- 场景未打开或不是场景资产。
- 没有探针、探针不足或未生成四面体。
- 没有可烘焙模型/地形。
- 场景依赖资产缺失。
- LightFX 工具缺失或不支持当前平台。
- LightFX 启动、连接、执行或退出失败。
- 输入/输出协议不兼容或结果损坏。
- 探针、Mesh、Terrain 结果数量不匹配。
- Asset DB 导入或 Texture2D 加载超时。
- 场景保存失败及回滚失败。

对用户返回简洁原因；详细子进程 stdout/stderr、阶段和 operation id 写入 CLI 日志。日志不能输出完整二进制数据或大块纹理内容。

## 10. 测试方案

### 10.1 公共内核单元测试

- `lfx.in` 固定 fixture 编码结果与 Creator 兼容。
- `lfx.out` fixture 能正确解析 Light Probe、Mesh 和 Terrain 结果。
- 截断、未知版本、非法长度、NaN/Infinity 被拒绝。
- 场景过滤和导出索引稳定。
- 纹理 UUID、子资源和缺失资源解析。
- LightFX 正常结束、异常退出、超时、取消和重复清理。
- workspace 只清理自身目录。

### 10.2 Light Probe 测试

- API schema 和 MCP 工具注册。
- 无场景、无探针、少于 4 个探针。
- 未传覆盖参数时从场景读取 `giScale/giSamples/bounces`。
- 覆盖参数只影响本次 LightFX 输入，不意外改写场景配置。
- `reduceRinging` 和可视化参数不进入烘焙参数。
- 探针数量或位置不匹配时不写回。
- 成功时一次性写回 SH、通知引擎并保存。
- 写回或保存失败时恢复全部旧系数。
- 重复烘焙和并发调用。

### 10.3 Lightmap 测试

- Mesh/Terrain 导出和结果索引映射。
- Lightmap 项目配置默认值、MCP 部分覆盖及参数校验。
- MCP 覆盖参数只影响本次任务，不意外写回项目配置。
- PNG/meta 创建、覆盖及 UUID 复用。
- Asset DB 导入后等待 Texture2D。
- 绑定 offset/scale 和 globals。
- 文件替换后导入失败、绑定失败、保存失败的完整回滚。
- 重复烘焙不残留 backup、staging 或临时目录。

### 10.4 端到端验证场景

至少准备：

1. 基础 Mesh、DirectionalLight 和单个 LightProbeGroup。
2. 多个 LightProbeGroup，验证世界坐标汇总与顺序。
3. SphereLight、SpotLight、发光材质和纹理材质。
4. HDR 与非 HDR 场景。
5. Mesh 与 Terrain 混合的 Lightmap 场景。
6. 重复烘焙、取消、超时和缺失贴图场景。

端到端验证需在重新打开场景后确认：

- Light Probe SH 数据仍存在，动态模型间接光正确。
- Lightmap 纹理引用有效，模型和 Terrain 显示正确。
- 场景和资产目录没有 staging、backup 或失效 meta 残留。

## 11. 已实现能力与验收标准

- 公共 LightFX 场景导出、二进制协议、进程管理、超时、取消和 workspace 清理。
- `scene-bake-light-probes` 与 `scene-clear-light-probes`，包括 SH 回填、Undo、失败恢复和场景保存。
- `scene-bake-lightmap` 与 `scene-clear-lightmap`，包括 PNG 导入、meta/UUID 复用、Mesh/Terrain 独立绑定、Undo、失败恢复和可选资源删除。
- `scene-cancel-lightfx-bake`，用于取消当前 LightFX 任务。

提交验收要求：Light Probe、Mesh Lightmap 和 Terrain Lightmap 的 Bake/Clear 均通过真实场景验证；重复烘焙不改变已有贴图 UUID；重新打开场景后数据与资源引用仍有效；编译、协议测试、API 测试及资产事务测试通过。

## 12. 实现约束与评审重点

- 公共内核不得依赖 Creator 的 `Editor.Message`、Panel 或 Metrics。
- MCP API 不直接操作 LightFX、文件或引擎对象，只调用场景服务。
- 不把 Lightmap 资产导入逻辑放入公共 exporter。
- 不在循环内反复创建 Undo snapshot；一次烘焙只形成一个业务操作。
- 所有外部进程、Socket.IO 服务和临时目录必须有确定的 finally 清理路径。
- 所有最终文件替换必须可回滚，不能先删除旧资产再尝试导入新资产。
- 公共接口变更必须同时验证 Light Probe 与包含 Mesh/Terrain 的 Lightmap 场景。
