# Cocos CLI Simulator

Simulator 模块让 Cocos CLI 能够构建 native simulator 可执行程序、准备它所需的运行时资源，并启动一个把项目场景跑在独立 native 窗口里的预览会话。它覆盖整条链路：构建 → 准备资源 → 启动预览服务器 → spawn simulator 进程。

## 1. 构建

simulator 有两个可构建部分：**native 可执行程序**和 **runtime TypeScript 产物**，可以分开构建，也可以一起构建：

```bash
npm run build:simulator:native   # native 可执行程序（workflow/build-simulator.js）
npm run build:simulator:runtime  # 引擎 runtime TS 产物（workflow/build-simulator-runtime.js）
npm run build:simulator          # 两者，依次执行
```

`npm run build` **不带** simulator 构建。release 流水线（`workflow/release.js`）会在打包前自动构建，所以一次普通 release 已经包含可用的 simulator。

runtime 产物（`packages/engine/bin/simulator/{import-map.json,system.bundle.js,polyfills.bundle.js}` 和 `packages/engine/bin/**`）已加进 `.gitignore` —— 新克隆的仓库必须先跑 `npm run build:simulator:runtime`，否则单测和启动器都跑不起来。

## 2. 实现

| 文件 | 职责 |
| :--- | :--- |
| `src/core/simulator/index.ts` | 编排：preview server、build、`prepareResources`、进程启停 |
| `src/core/simulator/internal.ts` | 纯逻辑：平台产物表、路径推导、CLI 参数、`config.json`、preload 资源裁剪 |
| `src/core/simulator/runtime-writer.ts` | 往 runtime 目录写产物：settings / bundle 索引 / `cc/env` / 模板渲染 / 产物校验 |
| `static/simulator/main.ejs` | simulator bootstrap |
| `workflow/build-simulator-runtime.js` | 引擎 runtime 产物 + `packages/engine/bin/simulator/import-map.json` |
| `workflow/build-simulator.js` | native 可执行程序 |
| `src/lib/simulator/simulator.ts` | 对外命令层（facade） |

`internal.ts` 和 `runtime-writer.ts` 是从 `index.ts` 拆出来的，这样可以在单测里对着临时目录跑，不依赖 builder / asset-db / preview server。

## 3. 对外接口

facade `src/lib/simulator/simulator.ts` 导出 19 个函数。每一个导出都是公开协议的一部分 —— 接入后删除或改名就是 breaking change。

| 分类 | 签名 | 说明 |
| :--- | :--- | :--- |
| 生命周期 | `init(projectPath): Promise<void>` | 记下工程路径，作为后续调用的默认值 |
| 构建 | `build(enginePath?): Promise<void>` | native + runtime；并发调用会合并成一次 |
| | `buildNative(enginePath?): Promise<void>` | 仅 native 可执行程序 |
| | `buildRuntime(enginePath?): Promise<void>` | 仅 runtime TS 产物 |
| | `isBuilt(enginePath?): Promise<boolean>` | native 可执行程序是否已构建且匹配当前宿主平台 |
| 路径 | `getManifest(enginePath?)` | 宿主平台产物信息（`bundle` / `entry` / `builtAt`）；平台不支持时 `null` |
| | `getExecutablePath(enginePath?)` | native 可执行文件绝对路径；未构建时 `null` |
| | `getResourcesPath(enginePath?)` | runtime 产物默认落点（macOS `Contents/Resources`，Windows `Release/`） |
| | `getWritablePath(enginePath?)` | native `-writable-path`（Windows `%LOCALAPPDATA%/SimulatorApp-Win32/debugruntime`） |
| 运行 | `prepareResources(options?)` | 写 settings / bundle 索引 / 引擎产物 / `config.json`；同一输出目录的并发调用会去重 |
| | `launchPreview(options?)` | preview server → `prepareResources` → spawn。**先停后起**，所以它同时也是重启入口 |
| | `start(options)` | 底层启动：不碰 preview server、不准备资源，不停已有会话（可多实例） |
| | `stop(id): Promise<boolean>` | 用 `treeKill` 停指定会话；不存在或已停返回 `false` |
| | `stopAll(): Promise<number>` | 停掉所有还在跑的会话；关工程 / 切工程时应当调用 |
| | `getStatus(id)` | 查会话状态；不存在返回 `null` |
| | `listSessions()` | 列出全部会话（含已停止的） |
| 事件 | `onDidChangeSession(listener)` | 会话状态变化 |
| | `onLog(listener)` | 逐行 stdout/stderr |
| | `onDidChangeBuildState(listener)` | 构建阶段状态 |

每个 `onXxx(listener)` 都返回一个反订阅函数。

### 3.1 事件

```typescript
/** 在 spawn、首行 stdout（readyAt）、exit、启动失败、被 stop 各触发一次。 */
export function onDidChangeSession(
    listener: (session: ISimulatorSessionInfo) => void,
): () => void;

/** simulator 进程或构建脚本的一行输出。 */
export function onLog(
    listener: (entry: ISimulatorLogEntry) => void,
): () => void;

/** 构建阶段状态：start / success / failed（不带百分比）。 */
export function onDidChangeBuildState(
    listener: (state: ISimulatorBuildState) => void,
): () => void;
```

`onDidChangeSession` 刻意做成单事件而不是拆成 `onDidStart` / `onDidExit` —— `status` / `readyAt` / `exitCode` / `signal` 几个字段已经够区分 running、ready、正常退出和崩溃。

### 3.2 关键类型

| 类型 | 字段 |
| :--- | :--- |
| `ISimulatorSessionInfo` | `id` / `pid` / `status` / `startedAt` / `readyAt` / `exitedAt` / `exitCode` / `signal` / `runtimeRoot` / `enginePath` / `executablePath` / `args` |
| `ISimulatorLogEntry` | `source`（`'simulator'` \| `'build'`）/ `level`（`'log'` \| `'error'`）/ `message` / `sessionId?` |
| `ISimulatorBuildState` | `step`（`'native'` \| `'runtime'`）/ `state`（`'start'` \| `'success'` \| `'failed'`）/ `error?` |

所有 payload 都是纯 JSON 值。

## 4. 运行时目录

`prepareResources` / `launchPreview` 接受两个可选覆盖入参。不传时默认行为完全不变：

| 入参 | 不传时 | 传了之后 |
| :--- | :--- | :--- |
| `runtimeRoot` | simulator 自己的资源目录（macOS `Contents/Resources`，Windows `Release/`） | 只往这个目录写，不碰 app bundle |
| `writablePath` | 平台真实 writable path（已设 `runtimeRoot` 则跟随它） | `config.json` 的第二个写入目录（对应 native `-writable-path`）；相对路径按 `runtimeRoot` 解析 |

`writablePath` 跟随 `runtimeRoot` 是刻意的：覆盖 `runtimeRoot` 的意图就是别碰真实产物目录，否则 Windows 上 `config.json` 还是会写进 `%LOCALAPPDATA%`。native 可执行文件始终从 `enginePath` 下的 Release 目录取，不受这两个入参影响。

## 5. 进程管理

- **先停后起**：`launchPreview` 在 spawn 新会话前会先停掉所有还在跑的会话，所以带新分辨率 / 屏幕方向再调一次就是重启。
- **`treeKill`**：`stop` / `stopAll` 杀整个进程树，覆盖 simulator 可能拉起的子进程。
- **停止与取消**：`stopAll()` 取消正在准备和排队的启动，并终止构建子进程。停止先发送 SIGTERM，3 秒未退出则尝试 SIGKILL，再等待 3 秒；仍不能确认退出时抛错，不会伪报 stopped。
- **退出兜底**：`process.on('exit')` 仅在正常退出时尽力清理；SIGKILL 或宿主强制终止可能不执行回调。宿主关闭工程前应显式调用 `stopAll()`。
- **资源目录**：按单模拟器使用，允许共享目录被后续操作覆盖，不提供多实例隔离或跨进程锁。准备资源会清理旧引擎脚本和旧 effect.bin；准备中途失败后需要重新准备。
- **状态与历史**：`start()` 等待进程创建成功，失败时 reject；`readyAt` 仍表示首次 stdout，不代表场景加载成功。进程关闭后释放 child 引用，保留会话历史。

## 6. 测试

```bash
npx jest tests/simulator-
```

3 个测试文件（按关注点分 6 组）。新克隆的仓库必须先跑 `npm run build:simulator:runtime`。测试允许依赖 runtime 产物；native 可执行程序、进程创建及 jsb 调用使用 mock，不要求构建或启动 native 模拟器。

| 关注点分组 | 所在文件 | 覆盖 |
| :--- | :--- | :--- |
| `simulator-internal` | `simulator-manager.test.ts` | 平台产物表、路径推导、win32 分支、`config.json` 双写、preload 资源裁剪 |
| `simulator-build-artifacts` | `simulator-runtime.test.ts` | 与 `workflow/build-simulator.js` 的产物表逐字段一致、`import-map.json` 往返一致、`main.ejs` bootstrap 约定 |
| `simulator-runtime-writer` | `simulator-runtime.test.ts` | settings / bundle 索引 / `cc/env` 产物、模板渲染、报错信息 |
| `simulator-prepare-resources` | `simulator-runtime.test.ts` | `prepareResources()` 端到端：产物落点、`builtinAssets` 裁剪、bundle 清理、幂等性 |
| `simulator-manager` | `simulator-manager.test.ts` | 进程编排：stdio pipe 与逐行 `onLog`、会话事件、`treeKill`、构建事件广播、`launchPreview` 先停后起 |
| `simulator-facade` | `simulator-facade.test.ts` | facade 导出签名：19 个函数、`onXxx` 返回反订阅、不存在的辅助函数 |

`prepareResources` 的端到端用例用 `runtimeRoot` 入参把产物写进临时目录。项目 / preview server 依赖和 native 可执行文件探测使用 mock，runtime 产物使用真实文件。
