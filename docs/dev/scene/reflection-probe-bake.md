# Reflection Probe Bake

CLI 通过 MCP 工具 `scene-bake-reflection-probe` 烘焙立方体反射探针。它会捕获六面纹理、调用 cmft 生成 RGBM latlong PNG、导入 TextureCube、绑定组件，并按需保存场景。

## 使用条件

- CLI HTTP/MCP 服务已启动。
- 浏览器已打开 `/scene-editor/`，目标场景显示为 `Loaded`。
- 烘焙期间场景编辑器需要保持可见且可渲染；浏览器后台标签页或最小化窗口可能被节流并导致捕获超时。
- `nodePath` 指向包含 `cc.ReflectionProbe` 的节点。

Node 场景进程使用 EmptyDevice，不能进行有效的 GPU 捕获。因此烘焙会将捕获请求转发给浏览器中的 WebGL 场景渲染器。没有可用渲染器时会明确失败，不会回退生成黑图；六面像素全部为空时也会停止并保留已有资源。

## MCP 调用

工具名：`scene-bake-reflection-probe`

MCP Inspector 切换到 JSON 输入时，调用参数如下：

```json
{
  "options": {
    "nodePath": "Reflection Probe",
    "saveScene": true,
    "timeoutMs": 120000
  }
}
```

参数：

- `nodePath`：探针节点在当前场景中的路径，必填。
- `fastBake` 直接读取场景中 ReflectionProbe 组件的当前配置。
- `saveScene`：绑定后保存场景，默认 `true`。
- `timeoutMs`：完整流程超时，默认 120 秒，最大 600 秒。

成功结果包含探针节点、组件 UUID、probe ID，以及生成的 TextureCube UUID 和 URL。

调用前应先通过 `scene-open` 打开场景，并在 `/scene-editor/` 中加载同一个场景。`nodePath` 是相对于场景根节点的节点路径，不是资源 URL 或 UUID。

## Pink 场景 Webview

Pink 场景 Webview 中的场景服务运行在本地 WebGL 环境。完整烘焙仍应通过 MCP 工具调用：Sharp、cmft、文件写入和 Asset DB 导入依赖 Node 环境，不能只在 Webview 中完成。

MCP 工具在 Node 主进程执行，并经 Node IPC 进入 scene-process。由于 Node scene-process 使用 EmptyDevice，MCP 路径会额外请求已加载同一场景的 Pink Webview，通过其本地 `window.cli.Scene.ReflectionProbe.capturePixels()` 完成六面捕获；该方法是内部渲染桥，不是公开的完整烘焙入口。Asset DB、配置和文件系统等 Node 能力继续通过 RPC 调用。

## 处理链路

```text
MCP scene-bake-reflection-probe
  -> scene process: 校验场景与探针
  -> main process: 请求已连接的 WebGL renderer
  -> browser /scene-editor/: 捕获六面 RGBA
  -> scene process: 写入临时 PNG
  -> cmft: 生成 reflectionProbe_<id>.png
  -> asset-db: 导入 /textureCube 子资源
  -> ReflectionProbe.cubemap: 绑定、刷新预览球、保存场景
```

主要实现：

- API：`src/api/scene/reflection-probe.ts`
- WebGL 请求桥：`src/core/scene/main-process/reflection-probe-renderer.ts`
- 浏览器监听：`src/core/scene/scene-process/engine-bootstrap.ts`
- 捕获、转换、导入和绑定：`src/core/scene/scene-process/service/reflection-probe.ts`

## 输出与兼容行为

- 输出位置：`assets/<scene-name>/reflectionProbe_<probeId>.png`
- TextureCube 子资源：`db://assets/<scene-name>/reflectionProbe_<probeId>.png/textureCube`
- 捕获分辨率、clear flag、背景色、visibility、probe size 和 `fastBake` 均读取 `ReflectionProbe` 组件当前配置；MCP 参数不会覆盖这些值。
- cmft 参数保持 Creator 的 RGBM latlong 行为。
- `fastBake=true` 写入 `mipBakeMode=1`；否则写入 `mipBakeMode=2`。
- 六面 RGBA 会通过同一条 Socket.IO 消息从 WebGL 场景渲染器返回；1024 分辨率约为 24 MiB 原始数据、32 MiB Base64 数据，因此服务端保留 128 MiB 的单消息上限。
- 重复烘焙复用资源身份，并清理旧卷积缓存后重新导入。
- 绑定操作进入 Undo，成功后刷新探针管理器与预览球。

## 验证

```powershell
npm.cmd run compile
npm.cmd test -- --runInBand tests/reflection-probe-bake-api.test.ts tests/reflection-probe-renderer.test.ts
```

端到端验证还应确认：

1. `/scene-editor/` 能看到天空盒和测试模型。
2. MCP 调用返回 `code: 200` 和 TextureCube URL。
3. Creator 重新打开场景后，探针预览球仍显示烘焙结果。
