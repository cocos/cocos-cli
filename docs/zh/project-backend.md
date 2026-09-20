# CLI 项目后端单实例

> 本文描述独立 CLI / Worker 后端的所有权与兼容共享会话。PinK 已选择 Webview 持有唯一编辑场景，MCP 经已有 Provider/Broker 路由到该场景；不得为该会话再调用 ensure 启动第二份 Worker。资源后端的项目独占仍适用。私有模块接入见其 `docs/zh/host-runtime.md`。

## 责任和边界

CLI 负责保证**本机、同一项目只有一个项目后端所有者**。IDE 调用发现/启动接口，scene-editor 连接返回的场景会话。不同项目可使用不同后端进程；同一个 CLI 进程内的资源、脚本和引擎模块仍是单项目实例。

`Launcher.import/startup/build` 在初始化日志、配置、引擎、脚本和资源库前取得项目所有权。第二个 Launcher/CLI 进程不能初始化同一个项目。低层 SDK 的 `Configuration.init`、`Project.init`、`Scripting.init`、`Assets.init` 和 `Scene.startupWorker` 也复用同一所有权检查。

MCP 和共享场景接口在 CLI 后端进程中提供，场景引擎由该后端的 Worker 执行；scene-editor/IDE 进程不另开项目资源库和 Worker。

## IDE 推荐入口

下面的模块可以在 IDE 管理进程中导入；调用 `ensureProjectBackend` 不会在 IDE 进程内初始化项目，而是发现或启动独立 CLI 后端。

```ts
import {
  ensureProjectBackend,
  discoverProjectBackend,
  stopProjectBackend,
} from 'cocos-cli/host/lib/project/project';
import { connectSceneEditor } from '@cocos/scene-editor/session';

const backend = await ensureProjectBackend(projectPath, {
  startupTimeoutMs: 180_000,
  // 仅新建后端时使用；已有后端的配置不会被连接者隐式改变。
  allowedOrigins: [editorWebViewOrigin],
});

// IDE 把 backend.mcpUrl 提供给 MCP 客户端。
const editor = await connectSceneEditor({
  descriptor: backend.sceneSession!,
  source: 'ide-window-1',
  onSnapshot: updateEditorView,
  onError: reportConnectionError,
});

// 关闭一个窗口只断开它的客户端：
await editor.close();

// 只有明确关闭整个项目后端时才执行，会影响所有连接者：
await stopProjectBackend(backend);
```

浏览器 WebView 也可直接把 `backend.sceneSession` 交给场景 bundle 的 `startup.sharedSession`。引擎、脚本和静态资源仍使用 IDE 的资源宿主 URL，见独立 `pink-scene-editor-extension` 仓库中的 `docs/zh/shared-session.md`（共享场景接入）。多个 WebView 应使用事先允许的稳定 origin，或由 IDE Node 进程连接并通过自身 IPC 转发；`ensure` 复用后端时不会自动扩大 origin 白名单。

### 导出接口

| 接口 | 行为 |
| --- | --- |
| `discoverProjectBackend(project)` | 校验规范项目路径及活后端身份；返回实时描述符或 `null`；占用/身份异常抛错 |
| `startProjectBackend(project, options?)` | 启动独立后端；已有所有者或并发输掉竞争时报 `ALREADY_RUNNING`，不替换它 |
| `ensureProjectBackend(project, options?)` | 有后端则等待就绪并复用；没有才启动；并发竞争失败后连接获胜者 |
| `stopProjectBackend(descriptor)` | 校验 ownerId/token 后请求正常关闭并等待；旧描述符不能关闭替换后的新后端 |
| `Project.close()` | 关闭当前进程持有的项目后端；适用于自行使用低层 SDK 初始化项目的宿主 |

`StartProjectBackendOptions`：`port` 为新后端 MCP HTTP 服务首选端口；`allowedOrigins` 为新后端场景服务白名单；`executable` 可指定 Node 路径；`startupTimeoutMs` 默认 180 秒；`requireMcp` 默认 true。连接一个不提供 MCP 的 SDK 后端时显式设 `requireMcp: false`。

`ProjectBackendDescriptor` 包含 `project/projectKey/ownerId/pid/url/token/state/sceneSession/mcpUrl`。`url` 是所有权控制端点，`sceneSession.url` 是场景命令端点，`mcpUrl` 是 MCP 地址，三者用途不同。描述符包含访问凭据，不应打印到公共日志或写入版本库。

`state` 为 `initializing/ready/stopping/failed`。初始化超时只表示调用方停止等待，不会杀死正在初始化的所有者；后续可以重新发现。已有后端缺少 MCP 时返回 `CAPABILITY_MISSING`，不会为了补能力再启动第二个项目。

引擎初始化可能短暂阻塞后端的控制端点；`ensure` 在启动期限内重试发现和等待。端点未响应不会被视为“没有所有者”，也不会触发另开实例；明确的项目身份或端口冲突仍直接报错。

## 命令行和生命周期

原来的 `cocos start-mcp-server --project ...` 也会取得项目所有权并提供共享场景服务。重复命令返回明确错误，IDE 要复用时使用 `ensureProjectBackend`。`--scene-session-file` 仍可额外导出场景连接描述符；它不是互斥锁。

普通构建/导入也会持有所有权；同一项目正在被另一个后端使用时，独立构建入口不会同时再开资源库。可以通过已有后端的 MCP 构建接口执行，或先正常关闭后端再做独立构建。

`Launcher.close()` 按顺序关闭场景服务、Worker、HTTP 服务、资源库、脚本服务并保存项目元数据，最后释放所有权。初始化中途失败会清理已经启动的部分。未确认写入者已停止时不会释放所有权，状态变为 `failed`；需要诊断并处理该后端，而不是超时强行接管。

## 所有权机制

1. `realpath` 解析项目路径，Windows 统一大小写，避免相对路径、目录别名和 junction 启动两份后端。
2. 首次在 `temp/.cocos-cli-backend/rendezvous.json` 固定项目的本机控制端口。候选文件完整写入后，通过原子硬链接发布；同时启动者只能采用同一个注册结果。
3. 进程必须独占绑定这个 loopback 端口，才能初始化项目。**操作系统持有的 socket 是互斥依据**；PID、文件时间、描述符文件的存在都不是所有权依据。
4. `owner.json` 只提供本次启动的身份与访问凭据；状态及服务地址通过认证后的 `/status` 实时获取，不依赖文件中的旧状态。发现接口同时校验项目身份、随机 ownerId 和 token。端口被无关程序占用、后端失联或身份不符时拒绝启动，不换一个端口悄悄再开实例。
5. 进程异常退出后，操作系统释放 socket。新进程可沿用注册端口取得所有权并生成新 ownerId/token；旧元信息、旧 PID 或旧连接凭据不妨碍恢复，也不能授权关闭新所有者。

不要在活后端运行时删除或复制这份 rendezvous 注册文件。正常关闭保留它，清除当前 owner 元信息。若注册端口被其他程序占用，需要先释放冲突；只有确认项目没有活后端时，才可重置该项目的注册文件。文件系统必须支持本地原子硬链接；不支持时会明确失败，不降级成有竞争窗口的 PID 文件锁。

这里保障本机 CLI 后端之间的互斥，不是跨机器共享盘锁，也不能约束其他版本编辑器或绕过 CLI 启动接口直接写项目的外部程序。后端崩溃后的未保存场景恢复仍需单独的恢复日志，单实例机制本身不会恢复内存数据。

## 验证

单元/进程测试覆盖首次并发抢占、初始化中拒绝重复启动、路径别名、不同项目、异常退出恢复、旧凭据失效、无关端口占用、关闭期间持锁和初始化失败清理。

真实 CLI 后端测试（需要已构建的 `dist` 和本机引擎依赖）：

```powershell
$env:COCOS_TEST_PROJECT_BACKEND = '1'
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/project-backend-runtime.test.ts
```

测试只使用空闲的集成测试项目；如果该项目已有活后端，会拒绝运行，不会停止它。
