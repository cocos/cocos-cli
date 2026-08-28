# MCP 场景权威进程设计

## 背景

`cocos-cli` 不作为 PinK 扩展由 `src/index.ts` 加载。IDE 的 cocos-code utility process 按顺序调用 `src/lib` 门面接口，例如 `Project.init()`、`Scene.init()`、`Scene.startupWorker()`、`Server.start()` 和 `Mcp.register()`。

Hierarchy 使用的场景由 IDE Scene WebView 持有；CLI 启动的 Node scene worker 会加载另一份 `cc.Scene`。即使二者打开同一个 `.scene` 文件，也不能共享未保存的内存状态、Undo 栈或编辑器选择状态。因此，reimport、磁盘重载和缓存刷新都不能保证 MCP 与 Hierarchy 一致。

设计原则：**Hierarchy 所属 Scene WebView 的 `SceneInstance` 是 MCP 场景读写的唯一权威。** CLI worker 不能再作为 PinK IDE 中 MCP 场景操作的回退目标。

## 当前实现

```text
MCP scene tool
  -> cocos-cli proxy（Editor / Node / Component / Prefab）
  -> requestSceneService()
  -> PinK authority RPC client
  -> 临时：项目级 named pipe
  -> @pink-hierarchy extension host
  -> 当前 Hierarchy SceneInstance
  -> Scene WebView

Scene WebView i18n / assets / engine bootstrap
  -> cocos-cli Node scene worker RPC
```

`Scene.init()` 仅标记当前生命周期要求 IDE authority；它不会在 utility process 中动态导入 `pink`。

`Scene.startupWorker(projectPath)` 的当前行为如下：

1. 如果 PinK 尚未注入 authority RPC，则创建项目级的临时 named-pipe client；
2. 启动 Node scene worker；
3. MCP proxy 已经绑定 authority，因此场景操作会转发到 Hierarchy，而不会使用 worker 内的 `cc.Scene`。

worker **必须继续启动**。Scene WebView 的 i18n、本地资源和引擎 RPC 初始化依赖 worker 的 `Rpc` 实例；停止 worker 会导致 `Rpc instance is not started`，并使场景编辑器启动失败。

临时 named pipe 的 endpoint 由项目绝对路径计算，避免不同项目串线。每个请求都新建连接，避免 Hierarchy 重启、切换场景或 WebView 重建时保留旧的 `SceneInstance` 引用。

## Authority 路由规则

- `Editor`、`Node`、`Component`、`Prefab` 的 MCP 请求统一使用 `requestSceneService()`。
- 在 PinK 已配置 authority 时，所有请求都发给 authority；不得回退到 Node worker。
- 在 IDE 生命周期已经开始、但 authority 尚未配置时，直接报错，避免写入独立 worker 场景。
- 只有独立 CLI 运行模式才允许直接调用 Node worker。
- authority 优先使用 PinK active scene；当焦点不在场景编辑器但 Hierarchy 仅打开一个场景时，使用该唯一打开场景。
- 没有打开场景时，查询返回空；写操作报错。
- `Editor.save` 是命令型操作。当前 bridge 保存成功后返回 `undefined`，不能伪造 `{ uuid, url, file }` 等不完整 `IAssetInfo`，否则 MCP 的结果 schema 校验会失败。

## 临时实现与正式 PinK 接入

当前 named pipe 是为了验证跨进程 authority 路由而添加的**临时适配层**，位于 CLI 的 `pink-scene-authority-bridge.ts` 和 PinK Hierarchy extension 的临时补丁中。

正式 PinK 接入应以内部 IPC 替换它：

```text
cocos-code utility process
  -> PinK main-process scene authority channel
  -> Hierarchy extension host
  -> SceneInstance
  -> Scene WebView
```

PinK 应提供 project-scoped 的 `request(module, method, args)` authority RPC，并在 utility process 初始化 CLI scene 模块时注入：

```ts
CliScene.bindIdeSceneAuthorityRpc({
  request: (module, method, args) =>
    sceneAuthorityChannel.request(projectId, module, method, args),
});
```

正式接入后：

- 删除临时 named-pipe client/server；
- 继续调用 `Scene.startupWorker(projectPath)`，不能将其改为 no-op；
- authority 仍然只负责 MCP 场景命令，worker 仍只负责 Scene WebView 基础设施；
- main process 必须按项目/窗口路由请求，并校验 SceneInstance 仍处于 open 状态，避免跨项目或陈旧场景引用。

## 不采用的方案

- 不在两个 scene process 之间同步 `cc.Scene`、磁盘文件或操作日志；它们无法共享未保存状态与 Undo。
- 不因为当前没有打开场景而静默回退到 CLI worker。
- 不让 MCP 从 utility process 获得或缓存 `SceneInstance` 对象；跨进程只传递请求和可序列化结果。
- 正式 PinK 方案不长期使用 named pipe；应使用 PinK 的内部 IPC/authority channel。

## 验收

1. Hierarchy 打开 `scene.scene` 后，`mcp_cocos-cli_scene-query-current` 立即返回同一份未保存状态。
2. Agent 新建、删除或修改节点后，Hierarchy 立即显示变化，且 IDE Undo 可撤销。
3. `scene-save` 成功且 MCP 不再报 `Tool result validation failed`。
4. 关闭全部场景后，查询返回未打开；写操作报错而不写入 CLI worker 副本。
5. 完全重启 PinK 后，Scene WebView 能正常加载 i18n；日志显示 scene worker 已启动，同时 MCP 仍走 PinK authority。
6. 多项目或多个 PinK 窗口并存时，请求只能路由到同一项目中的 Hierarchy SceneInstance。
