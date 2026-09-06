# Reflection Probe Bake

CLI 通过 MCP 工具 `scene-bake-reflection-probe` 烘焙立方体反射探针。它会从当前可见的 WebGL 场景捕获六面纹理、调用 cmft 生成 RGBM latlong PNG、导入 TextureCube，再把结果热应用回同一个场景编辑器并按需保存场景。

## 使用条件

- CLI HTTP/MCP 服务已启动。
- Pink 或浏览器 `/scene-editor/` 已加载目标场景。
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

不需要先调用 `scene-open`。烘焙直接使用当前 Pink/浏览器场景编辑器中的实时场景，因此尚未保存的探针参数也会参与本次烘焙。`nodePath` 是相对于场景根节点的节点路径，不是资源 URL 或 UUID。Pink 中会在调用瞬间通过 `pink.scene.getActiveScene()` 确认中央编辑区的活动场景，切换到目标场景标签即可，不要求额外点击场景视口。若宿主不提供活动场景查询且同时连接了多个 WebGL 场景编辑器，CLI 会拒绝猜测并明确失败，避免同名节点导致烘焙错场景。

## Pink 场景 Webview

Pink 场景 Webview 中的场景服务运行在本地 WebGL 环境。完整烘焙仍应通过 MCP 工具调用：Sharp、cmft、文件写入和 Asset DB 导入依赖 Node 环境，不能只在 Webview 中完成。

MCP 工具在 Node 主进程执行，并经 Node IPC 进入 scene-process。由于 Node scene-process 使用 EmptyDevice，MCP 路径会请求当前 Pink Webview，通过其本地 `window.cli.Scene.ReflectionProbe.capturePixels()` 完成六面捕获；该方法是内部渲染桥，不是公开的完整烘焙入口。Asset DB、配置和文件系统等 Node 能力继续通过 RPC 调用。

捕获结果会携带场景 URL、组件 UUID 和 renderer ID。资源导入完成后，CLI 只会向原捕获窗口发送热应用请求；如果窗口断开、切换了场景或探针组件已经变化，本次烘焙会失败并回滚输出，不会把结果绑定到其他窗口或同名节点。MCP 只有在热应用、场景重绘以及可选保存全部得到回执后才返回成功。

## 处理链路

```text
MCP scene-bake-reflection-probe
  -> main process: 查询 Pink 活动场景 URL，并选择唯一匹配的 WebGL renderer
  -> Pink/browser scene Webview: 校验实时场景与探针，捕获六面 RGBA
  -> scene process: 写入临时 PNG
  -> cmft: 生成 reflectionProbe_<id>.png
  -> asset-db: 刷新并导入 /textureCube 与卷积 mipmap
  -> 原 Pink/browser Webview: 强制重载 TextureCube
  -> ReflectionProbe.cubemap: 绑定、刷新探针与预览球、重绘场景
  -> saveScene=true: 保存当前 Webview 内存场景
  -> Webview ACK 后 MCP 返回成功
```

主要实现：

- API：`src/api/scene/reflection-probe.ts`
- Pink 活动场景查询与 WebGL 请求桥：`src/core/scene/main-process/reflection-probe-renderer.ts`
- 浏览器监听：`src/core/scene/scene-process/engine-bootstrap.ts`
- 捕获、转换、导入和绑定：`src/core/scene/scene-process/service/reflection-probe.ts`

## 输出与兼容行为

- 输出位置：`assets/<scene-name>/reflectionProbe_<probeId>.png`
- TextureCube 子资源：`db://assets/<scene-name>/reflectionProbe_<probeId>.png/textureCube`
- 捕获六面和 cmft staged 文件只写入项目 `temp/reflection-probe-bake/`，操作结束后清理，不作为 Asset DB 资源导入。
- `fastBake=false` 时生成的 `reflectionProbe_<probeId>_convolution/mipmap_0.png` 至 `mipmap_5.png` 是 TextureCube 的正式卷积数据，需要保留；它们不是临时文件。
- 捕获分辨率、clear flag、背景色、visibility、probe size 和 `fastBake` 均读取 `ReflectionProbe` 组件当前配置；MCP 参数不会覆盖这些值。
- cmft 参数保持 Creator 的 RGBM latlong 行为。
- `fastBake=true` 写入 `mipBakeMode=1`；否则写入 `mipBakeMode=2`。
- 六面 RGBA 会通过同一条 Socket.IO 消息从 WebGL 场景渲染器返回；1024 分辨率约为 24 MiB 原始数据、32 MiB Base64 数据，因此服务端保留 128 MiB 的单消息上限。
- 重复烘焙复用资源身份，并清理旧卷积缓存后重新导入；Webview 会绕过旧 TextureCube 缓存。
- 绑定操作在原场景 Webview 中进入 Undo，成功后刷新探针管理器、预览球和场景画面。

## 验证

```powershell
npm.cmd run compile
npm.cmd test -- --runInBand tests/reflection-probe-bake-api.test.ts tests/reflection-probe-renderer.test.ts src/core/scene/test/reflection-probe-bake-transaction.test.ts
```

端到端验证还应确认：

1. Pink 或 `/scene-editor/` 能看到天空盒和测试模型。
2. 不调用 `scene-open`，直接执行一次 MCP 烘焙。
3. MCP 返回 `code: 200` 和 TextureCube URL 前，当前场景中的探针预览球已经显示新结果。
4. `saveScene=true` 时重启 Pink/Creator 后结果仍然存在；`saveScene=false` 时只更新当前内存场景。
5. 烘焙期间切换场景、修改探针或关闭原场景窗口会失败，且不会覆盖已有有效烘焙资源。若仅热应用 ACK 超时，最终状态无法确定，CLI 会保留已经导入的资源，避免窗口稍后完成保存时产生丢失依赖。
6. 分别验证 `fastBake=true` 与 `fastBake=false`；非 fast 模式应在六面子资源全部导入后才返回成功并刷新场景，`assets` 下不应残留 `.reflection-probe-*.png`。
7. 同时打开两个包含同路径探针的场景，只切换 Pink 场景标签、不点击视口后执行烘焙；结果必须只应用到当前活动场景。活动场景无法唯一识别时必须失败，不能回退到其他场景。
