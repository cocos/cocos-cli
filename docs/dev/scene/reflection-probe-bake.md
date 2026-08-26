# Reflection Probe Bake CLI/MCP 设计方案

## 背景与目标

当前 CLI 已可通过 `scene-create-node-by-type` 创建反射探针节点：传入
`nodeType: "Light-Reflection-Probe"` 后，scene-process 会创建真正的
`cc.ReflectionProbe` 组件。

反射探针烘焙不是简单设置组件属性，完整流程包含：

1. 引擎将探针的 6 个方向渲染到 RenderTexture。
2. 将 6 张 RenderTexture 读回 CPU 并保存为临时 PNG。
3. 调用 cmft，将 6 张图片转换为 RGBM latlong PNG。
4. 写入 TextureCube 导入配置并刷新资产数据库。
5. 等待 `erp-texture-cube` importer 生成 `TextureCube` 子资源。
6. 加载 `TextureCube` 并设置到 `ReflectionProbe.cubemap`。
7. 更新 `ReflectionProbeManager`，标记场景变更并保存场景。

目标是在 cocos-cli 中提供一个完整的 MCP 接口：

```text
scene-bake-reflection-probe
```

调用方不需要了解 RenderTexture、cmft、RGBM、资源导入器或引擎刷新细节。

## 可实现性结论

可以实现，可行性较高。

CLI 已具备主要基础设施：

- scene-process 运行在引擎环境中，可以访问 `cc.ReflectionProbe`、RenderTexture、
  `cc.director` 和 `ReflectionProbeManager`。
- main-process 与 scene-process 之间已有 RPC service/proxy 机制。
- `preview/buffer.ts` 和 Creator 的反射探针扩展都提供了 GPU texture readback 参考。
- `sharp` 已经是项目依赖，可以将 RGBA buffer 保存为 PNG。
- CLI 已包含 cmft 下载、定位和执行逻辑；发布配置也包含 cmft。
- CLI 已实现 `erp-texture-cube` importer，能够从 RGBM latlong PNG 生成
  `TextureCube` 和可选的卷积 mipmap。
- `assetManager.refreshAsset`、资源变更通知和 scene-process 资源重载链路已经存在。

Creator 的实际实现位于：

```text
D:/work/cocos-editor/app/modules/editor-extensions/extensions/reflection-probe/
  source/scene/index.ts
  source/utils/graphics.ts
```

CLI 应移植这条实际链路，而不是依赖引擎类型声明中的
`EditorExtends.Asset.saveDataToImage` 或 `EditorExtends.Asset.bakeReflectionProbe`。
Creator 当前实现也没有使用这两个声明接口。

## Creator 实际流程

```text
ReflectionProbe.probe.captureCubemap()
  -> 等待帧结束
  -> 读取 bakedCubeTextures[0..5]
  -> 按图形后端需要翻转图片
  -> 保存 6 张临时 PNG
  -> cmft 生成 reflectionProbe_<probeId>.png（RGBM latlong）
  -> 写入/更新 PNG 的 .meta
  -> asset-db refresh
  -> erp-texture-cube importer 生成 /textureCube 子资源
  -> 加载 TextureCube
  -> ReflectionProbe.cubemap = asset
  -> ReflectionProbeManager 更新
  -> 场景 dirty/保存
```

需要保持的兼容规则：

- 反射探针固定按 HDR 数据处理，cmft 使用 `--rgbm`。
- `fastBake` 决定 TextureCube 的 mip bake 模式：
  - `true`：`mipBakeMode = 1`，自动 mipmap。
  - `false`：`mipBakeMode = 2`，生成卷积贴图。
- 默认资源名为 `reflectionProbe_<probeId>.png`。
- 默认放在当前场景同名目录下，保证重复烘焙覆盖和卷积缓存管理行为一致。

## 总体架构

```text
外部 AI / MCP Client
  -> MCP tool: scene-bake-reflection-probe
  -> src/api/scene/reflection-probe.ts
  -> Scene.ReflectionProbe.bake(options)
  -> src/core/scene/main-process/proxy/reflection-probe-proxy.ts
  -> Rpc.request('ReflectionProbe', 'bake', [options])
  -> src/core/scene/scene-process/service/reflection-probe.ts
  -> cc.ReflectionProbe / cmft / assetManager / ReflectionProbeManager
```

职责划分：

- API 层负责 schema、参数校验、MCP tool 暴露和统一错误包装。
- main-process proxy 只负责 RPC 转发。
- scene-process service 负责定位组件、驱动渲染、读回像素和绑定资源。
- 资产路径查询、刷新和导入状态查询通过反向 RPC 调用 main-process
  `assetManager`。
- cmft 优先复用现有工具定位和 `quickSpawn` 封装，避免重复实现平台判断。

## 对外 MCP 接口

新增 tool：`scene-bake-reflection-probe`。

### 输入

```ts
interface IReflectionProbeBakeOptions {
    /** 当前场景中的节点路径。 */
    nodePath: string;

    /**
     * 快速烘焙使用自动 mipmap；关闭后生成卷积贴图。
     * 默认读取组件的 fastBake 属性，也允许调用方覆盖。
     */
    fastBake?: boolean;

    /** 烘焙成功后是否保存当前场景，默认 true。 */
    saveScene?: boolean;

    /** 整个烘焙和资源导入流程的超时时间，建议默认 120 秒。 */
    timeoutMs?: number;
}
```

第一版不建议开放任意 `outputDbURL` 和 `assetName`。Creator 使用稳定的场景目录与
`probeId` 命名规则，关联了重复烘焙覆盖、卷积缓存清理和旧资源复用。后续如需开放
输出位置，必须同时定义 `.meta`、卷积目录、重名和重烘焙行为。

### 输出

```ts
interface IReflectionProbeBakeResult {
    nodePath: string;
    componentUuid: string;
    probeId: number;
    cubemapUuid: string;
    cubemapUrl: string;
    fastBake: boolean;
}
```

调用示例：

```json
{
  "options": {
    "nodePath": "Reflection Probe",
    "fastBake": true,
    "saveScene": true,
    "timeoutMs": 120000
  }
}
```

## 文件改动

### Shared 类型

新增 `src/core/scene/common/reflection-probe.ts`：

- `IReflectionProbeBakeOptions`
- `IReflectionProbeBakeResult`
- `IReflectionProbeService`
- `IPublicReflectionProbeService`

修改 `src/core/scene/common/index.ts` 导出类型。

### Scene-process service

新增：

```text
src/core/scene/scene-process/service/reflection-probe.ts
```

通过 `@register('ReflectionProbe')` 注册，并修改：

- `src/core/scene/scene-process/service/interfaces.ts`
- `src/core/scene/scene-process/service/index.ts`

在 `IPublicServiceManager` 和 `IServiceManager` 中加入 `ReflectionProbe`。

### Main-process proxy

新增：

```text
src/core/scene/main-process/proxy/reflection-probe-proxy.ts
```

修改 `src/core/scene/main-process/index.ts`，暴露：

```ts
Scene.ReflectionProbe.bake(options)
```

### MCP API

新增：

```text
src/api/scene/reflection-probe-schema.ts
src/api/scene/reflection-probe.ts
```

修改 `src/api/scene/scene.ts`，挂载 `ReflectionProbeApi`。

### 可复用 helper

建议补充或抽取：

```ts
readRenderTexturePixels(texture): Uint8Array
saveProbeFace(buffer, width, height, path): Promise<void>
resolveCmftExecutable(): string
runReflectionProbeCmft(options): Promise<void>
waitForTextureCubeImport(url, timeoutMs): Promise<AssetInfo>
loadTextureCube(uuid): Promise<TextureCube>
```

cmft 定位逻辑应从现有 `image-mics.ts`、`erp-texture-cube.ts` 中抽取，避免出现第三套
平台路径判断。

## Scene-process 内部流程

### 1. 校验目标组件

通过现有 `NodeMgr.getNodeByPath` 定位节点，然后获取 `cc.ReflectionProbe`。

需要处理：

- 当前没有打开场景，或者当前编辑对象不支持烘焙。
- `nodePath` 不存在。
- 节点没有 `cc.ReflectionProbe`。
- 组件未启用或节点未激活。
- `probeType` 不是 `renderer.scene.ProbeType.CUBE`。
- 同一探针或 service 正在烘焙。

第一版建议同一时刻只允许一个反射探针烘焙，避免 cmft、临时文件和资产刷新冲突。

### 2. 捕获 6 个方向

```ts
component.probe.captureCubemap();
```

Creator 当前等待一次 `Director.EVENT_END_FRAME`。CLI 建议在每次 repaint 后检查
`isFinishedRendering()`，并受统一 timeout 控制：

```ts
while (!component.probe.isFinishedRendering()) {
    Service.Engine.repaintInEditMode();
    await waitForEndFrame();
    assertBeforeDeadline();
}
```

这样可以避免无 UI/offscreen 环境下一帧尚未完成六面渲染。

### 3. 读取 RenderTexture

从 `component.probe.bakedCubeTextures[0..5]` 获取六张纹理，顺序必须保持为：

```text
0: +X
1: -X
2: +Y
3: -Y
4: +Z
5: -Z
```

优先复用 Creator 的 `gfxDevice.copyTextureToBuffers` 方案，不直接假设
`RenderTexture.readPixels()` 在所有后端行为一致。

图片方向与 Creator 保持一致：当
`director.root.device.capabilities.clipSpaceMinZ === -1` 时进行 Y 翻转。Metal 的
BGRA/RGBA 转换需要结合实际 readback 结果验证，不能直接照搬 preview window 的判断。

### 4. 保存临时 face PNG

使用 `sharp` 保存六张 RGBA PNG。临时文件建议包含 probeId：

```text
.reflection-probe-<probeId>-px.png
.reflection-probe-<probeId>-nx.png
.reflection-probe-<probeId>-py.png
.reflection-probe-<probeId>-ny.png
.reflection-probe-<probeId>-pz.png
.reflection-probe-<probeId>-nz.png
```

cmft 成功后删除临时文件。失败时可保留并在错误日志中给出目录，便于排查；最终策略应
保持一致并有测试覆盖。

### 5. cmft 生成 RGBM latlong PNG

输出：

```text
db://assets/<sceneName>/reflectionProbe_<probeId>.png
```

核心参数与 Creator 一致：

```text
--rgbm
--bypassoutputtype
--output0params png,rgbm,latlong
--inputFacePosX <face0>
--inputFaceNegX <face1>
--inputFacePosY <face2>
--inputFaceNegY <face3>
--inputFacePosZ <face4>
--inputFaceNegZ <face5>
--output0 <output-without-extension>
```

调用前检查工具存在。子进程非零退出、被终止或没有产生目标文件都视为失败；超时时需要
终止 cmft 子进程。

### 6. 写入 TextureCube 导入配置

目标 PNG 的 meta 需要包含：

```json
{
  "ver": "0.0.0",
  "importer": "*",
  "userData": {
    "type": "texture cube",
    "isRGBE": true
  },
  "subMetas": {
    "b47c0": {
      "userData": {
        "mipBakeMode": 1
      }
    }
  }
}
```

`mipBakeMode` 根据 `fastBake` 设置为 1 或 2。已有 meta 时只更新必要字段，不覆盖
asset-db 维护的 UUID 和其他元数据。

每次重烘焙（包括切换 `fastBake` 模式）都应清理：

```text
reflectionProbe_<probeId>_convolution/mipmap_0.png ... mipmap_5.png
```

否则 importer 可能复用上一次的卷积缓存。

### 7. 刷新资产并等待导入完成

通过反向 RPC 调用：

```ts
assetManager.refreshAsset(targetUrlOrPath)
```

`refreshAsset` 返回不能直接视为 TextureCube 已经可用，需要等待并确认：

1. 主资源 `reflectionProbe_<probeId>.png` 可以查询。
2. `/textureCube` 子资源已经生成。
3. 相关子资源导入完成。
4. `assetManager.loadAny(textureCubeUuid)` 成功返回 `TextureCube`。

可以结合资产变更通知和轮询查询实现，但必须：

- 先注册监听，再触发 refresh，避免丢失快速事件。
- 每次收到事件后重新查询目标 URL，不依赖固定事件数量。
- 成功、失败和超时时都移除监听。
- 整个等待受 `timeoutMs` 限制。

这是实现中最需要重点验证的异步边界。

### 8. 绑定 TextureCube 并刷新探针

```ts
component.cubemap = textureCube;
ReflectionProbeManager.probeManager.updateBakedCubemap(component.probe);
ReflectionProbeManager.probeManager.updatePreviewSphere(component.probe);
Service.Engine.repaintInEditMode();
```

`ReflectionProbe.cubemap` setter 已负责部分 probe/model 更新。以 Creator 当前使用的两个
显式刷新方法为基线；如果 CLI 实测发现模型数据未刷新，再补 `updateProbeData()` 或
`updateProbeOfModels()`。

### 9. Dirty、Undo 与保存

Creator 使用 `SceneFacadeManager.beginRecording/endRecording` 包裹 cubemap 赋值，以触发
场景 dirty 和 undo 记录。

CLI 应复用现有 Operation/Undo 机制记录组件变化。如果当前机制不能覆盖运行时资源赋值，
至少显式标记场景 dirty，确保 `Scene.Editor.save({})` 将 cubemap UUID 序列化到场景。

`saveScene !== false` 时保存场景。保存失败应使整个接口返回失败，否则资源虽已生成，但
场景引用没有可靠落盘。

## 状态、并发与超时

第一版建议在 service 内实现互斥锁：

- 同一时间只运行一个 bake。
- 重复请求同一探针时返回 `already baking`。
- 其他探针请求直接返回 busy；暂不实现 Creator UI 的队列和取消操作。

统一 deadline 覆盖：

- 等待引擎渲染。
- PNG 输出。
- cmft 执行。
- asset refresh/import。
- TextureCube 加载。
- 场景保存。

默认 10 秒不足以覆盖非 fast bake 的卷积过程，建议默认 120 秒，并允许调用方调整。

## 错误处理

MCP tool 返回统一 `CommonResultType`。错误信息应包含失败阶段和目标探针，例如：

```json
{
  "code": 1,
  "reason": "Reflection probe bake failed during asset import: db://assets/Main/reflectionProbe_0.png/textureCube was not available before timeout"
}
```

至少覆盖：

- 未打开场景。
- 节点不存在或没有 ReflectionProbe。
- probe 不是 cube 类型，或者组件不可用。
- 已有烘焙任务。
- RenderTexture 渲染超时或数量不是 6。
- texture readback 失败。
- sharp 写 PNG 失败。
- cmft 缺失、退出失败或输出文件缺失。
- meta 读写失败。
- asset refresh/import 失败或超时。
- TextureCube 加载或类型校验失败。
- cubemap 绑定、dirty 标记或场景保存失败。

如果最终绑定失败，生成的资产可以保留以便重试；临时六面 PNG 按统一策略处理。

## 平台支持

- Windows：已有 `cmftRelease64.exe`，作为第一阶段完整支持和验证平台。
- macOS：下载及发布配置已有 cmft 路径，但需要真实机器验证可执行权限和输出一致性。
- Linux：当前工具下载配置和 Creator 参考实现没有形成完整的受支持链路，第一版应标记为
  未支持或实验性，不能宣称完整跨平台支持。

## 验证方案

### 类型和单元测试

```bash
npx tsc -b --pretty false
npx jest --runInBand
```

单元测试应覆盖：

- API schema 默认值和非法参数。
- face 顺序、cmft 参数和 fastBake/mipBakeMode 映射。
- meta 新建与保留 UUID 的更新行为。
- cmft 非零退出、超时和目标文件缺失。
- asset import 事件先后顺序、超时和监听清理。
- service 并发锁释放。

### Windows 真实链路测试

1. 启动 MCP server 并打开一个 3D 场景。
2. 创建 `Light-Reflection-Probe` 节点。
3. 调用：

   ```json
   {
     "options": {
       "nodePath": "Reflection Probe",
       "fastBake": true,
       "saveScene": true
     }
   }
   ```

4. 确认生成：

   ```text
   assets/<sceneName>/reflectionProbe_<probeId>.png
   assets/<sceneName>/reflectionProbe_<probeId>.png.meta
   ```

5. 查询组件，确认 cubemap 指向 `/textureCube` 子资源。
6. 保存并重开场景，确认引用仍然存在。
7. 检查场景视图、预览球和受影响模型。
8. 使用 `fastBake: false` 重烘焙，确认卷积目录重新生成。
9. 修改场景环境后再次烘焙，确认没有复用旧卷积结果。

## 分阶段实现建议

### 第一阶段：捕获与临时图片

- 新增 common、service、proxy、API 和 MCP tool。
- 完成节点/组件校验、捕获、等待渲染、readback 和六张 PNG 输出。
- 验证 face 顺序、图片方向和无 UI 场景下的渲染完成条件。

### 第二阶段：cmft 与 TextureCube 导入

- 抽取并复用 cmft 工具定位。
- 生成 RGBM latlong PNG。
- 新建/更新 meta，处理 fastBake 和卷积缓存。
- refresh asset，并可靠等待 `/textureCube` 子资源完成导入。

### 第三阶段：绑定、保存与错误恢复

- 加载 TextureCube 并绑定组件。
- 更新 ReflectionProbeManager。
- 接入 dirty/undo，保存场景。
- 完成互斥、timeout、临时文件清理和失败恢复。

### 第四阶段：跨平台和高级能力

- macOS 验证。
- 评估 Linux cmft 分发。
- 根据需要增加批量烘焙、取消、进度事件和自定义输出目录。

## 工作量预估

- 主链路、API、类型和 schema：约 2 个开发日。
- 资产导入等待、超时、重复烘焙与错误恢复：约 1～2 个开发日。
- Windows 真实场景联调和自动化测试：约 1～2 个开发日。
- macOS/Linux 验证另计。

Windows 第一版预计约 4～6 个开发日。

## 结论

该能力适合在 CLI 中实现为单一的 scene MCP tool：

```text
scene-bake-reflection-probe({ options: { nodePath, fastBake?, saveScene?, timeoutMs? } })
```

实现应复用 Creator 已验证的资产结构：

```text
引擎捕获 6 RT
  -> PNG
  -> cmft RGBM latlong PNG
  -> texture cube meta
  -> erp-texture-cube importer
  -> TextureCube 子资源
  -> 绑定 ReflectionProbe
  -> manager 刷新
  -> dirty/保存
```

最关键的工程问题不是 cmft 本身，而是可靠等待 TextureCube 子资源完成导入，并在成功、
失败和超时情况下正确清理监听、锁与临时文件。
