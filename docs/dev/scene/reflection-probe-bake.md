# Reflection Probe Bake

CLI 通过 MCP 工具 `scene-bake-reflection-probe` 烘焙立方体反射探针。它会捕获六面纹理、调用 cmft 生成 RGBM latlong PNG、导入 TextureCube、绑定组件，并按需保存场景。

## 使用条件

- CLI HTTP/MCP 服务已启动。
- 浏览器已打开 `/scene-editor/`，目标场景显示为 `Loaded`。
- `nodePath` 指向包含 `cc.ReflectionProbe` 的节点。

Node 场景进程使用 EmptyDevice，不能进行有效的 GPU 捕获。因此烘焙会将捕获请求转发给浏览器中的 WebGL 场景渲染器。没有可用渲染器时会明确失败，不会回退生成黑图；六面像素全部为空时也会停止并保留已有资源。

## 调用

```json
{
  "nodePath": "Reflection Probe",
  "saveScene": true,
  "timeoutMs": 120000
}
```

参数：

- `nodePath`：探针节点在当前场景中的路径，必填。
- `fastBake` 直接读取场景中 ReflectionProbe 组件的当前配置。
- `saveScene`：绑定后保存场景，默认 `true`。
- `timeoutMs`：完整流程超时，默认 120 秒，最大 600 秒。

成功结果包含探针节点、组件 UUID、probe ID，以及生成的 TextureCube UUID 和 URL。

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
- cmft 参数保持 Creator 的 RGBM latlong 行为。
- `fastBake=true` 写入 `mipBakeMode=1`；否则写入 `mipBakeMode=2`。
- 重复烘焙复用资源身份，并清理旧卷积缓存后重新导入。
- 绑定操作进入 Undo，成功后刷新探针管理器与预览球。

## 验证

```powershell
npm.cmd run compile
npm.cmd test -- --runInBand tests/reflection-probe-bake-api.test.ts
```

端到端验证还应确认：

1. `/scene-editor/` 能看到天空盒和测试模型。
2. MCP 调用返回 `code: 200` 和 TextureCube URL。
3. Creator 重新打开场景后，探针预览球仍显示烘焙结果。
