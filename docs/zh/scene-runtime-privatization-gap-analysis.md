# 场景 runtime 私有化目标差距审计

审计日期：2026-09-18。

目标：用户提供的 `scene-runtime-privatization-20260917.md`，包含 2026-09-18 补充的 A/B 分工。

检查范围：当前 CLI 工作区、独立 `pink-scene-editor-extension` 仓库的源码、构建配置和文档。尚未取得 PinK/cocos-code 宿主源码路径，因此宿主改造记为“待核实”，不能断言其他仓库无人实现。本文只做差距分析，不修改运行架构，也不回退此前确认的产品范围。

## 2026-09-18 后续实施状态（优先于下方历史审计）

已采用 Webview 唯一编辑场景；私有 host 入口、资源地址分离、必需失败传播和一次性 Webview 的幂等清理已落地。以下原始审计记录保留作为实施依据，不能将其中“缺入口/销毁”等旧描述视作最新状态。

| 工作 | 最新状态 |
| --- | --- |
| Operation 输入 | 实现迁入私有包；CLI 不再注册，保留公共类型 |
| Engine 与视图耦合 | 使用显式视图更新回调，由私有 runtime 注册/释放 |
| 地形无 Gizmo 数据路径 | 新增 TerrainDataSession，Manage/layer/Undo 可在 Worker 执行；浏览器以显式适配器提供笔刷/块选择；真实 GPU 地形笔划待验收 |
| 公共资源路由 | 引擎/脚本/settings 移回公开 runtime/resources，私有包复用；宿主仍需注册或提供等效接口 |
| 内核出口 | 新增 runtime/core、context；host 通配改为 88 个明确出口。旧细粒度依赖继续收敛，不能宣称精简 SDK 已完成 |
| MCP 无视图语义 | 补充相机、参考图、地形行为文档和测试；91 项声明保持；全工具真实项目验收仍待完成 |
| 四类消费者 | 提供 Scene、Asset Preview、Motion、Play inspect 入口及版本描述；PinK 调用点未接线 |
| PinK 扩展/发行 | 没有宿主源码，激活、描述注册、URI/CSP、唯一 provider、池/多窗口与发行仍待 B 实施或核实 |

当前交接契约见 [scene-runtime-contract.md](scene-runtime-contract.md)，私有包见 `docs/zh/runtime-consumers.md`。继续按已确认范围保留 CLI 烘焙和模拟器编译，预览迁出、13 项烘焙 MCP 不恢复。

## 历史审计结论

当前实现完成了主要可视化代码抽离、独立模块构建及部分跨进程场景能力，但还没有达到目标文档所说的“可由 PinK 内置扩展交付、沿用现有 Webview 场景内核和宿主路由的私有 runtime”。

按文档分工，A 的交付仍缺资源地址分离、完整 runtime 启停契约、部分服务边界及行为验证；B 的扩展注册、PinK 入口迁移及发行接入在已检查仓库中未见实现，需要宿主仓库核实。不是只补一个扩展 package.json 就能完成。

## 1. 已有成果与目标的关系

| 项目 | 现状 | 判断 |
| --- | --- | --- |
| CLI 不依赖私有包 | CLI manifest 无私有依赖，源码没有私有包 import；本次边界测试通过 | 已具备 |
| 私有源码独立维护 | Camera、Gizmo、SceneView、Preview、UI、Web 页面及预览代码在独立仓库 | 主要部分完成，Operation 等仍需细拆 |
| 复用公开内核 | 私有 `scene-entry.ts` 导入 CLI core 注册集合，再注册私有服务；没有另复制一套内核源码 | 方向符合；显式上下文和导出边界不完整 |
| CLI 独立 Worker | 保留场景、资源、脚本、烘焙等后端；不需私有 GUI | 已有实现与历史集成测试，不能代替所有视图相关语义验收 |
| 独立模块构建/本地宿主 | 有 package、lock、build、测试、示例；本地调试宿主可提供页面 | 已具备，不等于 PinK 扩展可安装/激活 |
| CLI 项目单实例 | 已有所有权、发现、启动、关闭及恢复机制 | 有价值，但不能替代 PinK 场景实例/runtime 路由 |
| MCP API 基线 | 保留 91 项声明，移除此前确认的 13 项烘焙工具；本次测试通过 | 仅证明声明和包依赖边界，不证明全部运行语义 |

## 2. 首先需要对齐的架构与范围

### 2.1 场景状态由谁持有

目标文档：独立 CLI 用 Worker；PinK 内每个编辑会话沿用 Webview 内核，通过既有 SceneInstance、runtimeId/generation、MCP Broker 和 operation lease 精确路由。

当前新增共享模式：CLI Worker 持有权威场景，Webview 通过共享会话加载显示副本。`scene-replica.ts` 收到快照后重新创建浏览器场景，手势结束提交 dump；不携带 PinK 的 runtimeId/generation/lease。

这两种模型不能直接当作同一方案。当前私有包仍有不传 `sharedSession` 的浏览器内核启动分支，可作为目标 PinK 路径的适配基础，不必删除所有现有代码。建议保留独立 CLI 的 Worker/单实例能力；PinK 集成按文档复用既有 Webview 权威会话，不默认使用 `attachSceneReplica`。如果继续选择 Worker 权威模式，则需要另行调整目标及承担地形、复杂 Undo、多场景和快照同步成本。

证据：CLI `src/core/launcher.ts:121`；私有仓库 `src/engine-bootstrap.ts:205`、`src/scene-replica.ts`；CLI `src/core/scene/session/protocol.ts`。

### 2.2 与此前明确要求不同的产品范围

目标文档第一阶段保留普通游戏预览/模拟器预览，并不删除烘焙 MCP；此前本会话明确要求预览迁出、烘焙 MCP 移除、CLI 保留烘焙和模拟器编译。当前实现按此前要求执行。

这两项是范围差异，不应算成“不小心漏做”，也不应在本次排查中自动恢复。可以采用目标文档的 runtime/PinK 架构，同时保留之前确认的产品范围；需要在后续实施计划中写明。

## 3. 按优先级列出的缺口

| 优先级 | 缺口 | 已检查证据及影响 | 修改责任 |
| --- | --- | --- | --- |
| P0 | 尚非 PinK 内置扩展 | 私有 package 的 main 是 `dist/index.js`；没有扩展激活入口、runtime 描述注册或 PinK/VS Code manifest 字段。文件夹名称含 extension 不代表是扩展 | B：扩展包装、激活与发行；A：提供浏览器 runtime 产物 |
| P0 | 缺启动前 runtime 描述契约 | 已检查代码没有 `registerEditorRuntime` 等效注册能力；缺 scene/asset preview/motion/play-inspect 入口描述、唯一 provider、版本配对和资源根约定 | B 主责；需查 PinK 仓库 |
| P0 | 私有资源与后端地址未分离 | boot/engine-loader 仍硬编码 `/static/web/...`、`/scripting/...`；startup 只有 `serverURL`。扩展 boot URI 换成 Webview URI 后，附属脚本仍可能加载到错误 origin | A 改 runtime URL 解析，B 提供 URI/CSP/localResourceRoots |
| P0 | 运行所需公共资源服务被一起搬走 | `scripting-routes.ts`、`scene.scripting.middleware.ts` 中引擎、脚本映射、settings 等路由在私有包；仅启动 CLI MCP/Worker 不会注册这些路由 | A 明确公开数据/资源接口；B 复用已有资源宿主。不能在扩展里再初始化项目来补路由 |
| P0 | 启动失败可能被当作 ready | 私有 bootstrap 对 requiredModules 的加载异常只打印后继续；CLI `ServiceManager.initAllServices()` 捕获 init 失败并警告，boot 也吞掉失败 | A：区分必需/可选能力；必需失败 reject，初始化失败回滚，ready 仅在必需 API 完成后发出 |
| P0 | 缺完整浏览器 runtime 销毁 | `startup()` 不返回统一句柄；建立 socket、window 消息和 ServiceEvents 监听后没有统一反注册出口；root `dispose()` 只释放 Node 预览相关监听 | A：统一 ready/capabilities/dispose 契约及幂等、重复启动规则；B 对接池、升级、关闭 |
| P0 | PinK 多场景/多窗口路由未证明接通 | 当前共享协议是 project + epoch/revision，未对应 PinK runtimeId/generation/operation lease；项目锁也不是场景身份 | B 核对现有 Broker/Provider，A runtime 接受宿主上下文；禁止失败时改投另一 Worker |
| P1 | 输入实现仍在公开 CLI | `service/operation.ts` 和 `operation/operation-manager.ts` 包含鼠标/DPR 分发、指针锁与输入监听；core 总入口仍注册 Operation | A：输入实现迁私有，确有公共消费者的中性契约单独保留 |
| P1 | 地形会话仍依赖 Gizmo | CLI `terrain.ts:260` 的 resolveTarget 必须取得组件 Gizmo，否则 read 为 valid:false；共享副本显式拒绝 sculpt/paint 和闭包 Undo | A：拆数据状态与视图工具。若沿用 Webview 内核，验证私有 Gizmo 的同实例路径；若要求 Worker 编辑地形，需独立可序列化命令 |
| P1 | 视图相关 MCP 语义尚未充分界定 | LOD 无交互 Camera 时使用 BackendView 保存配置/默认相机；参考图 visibility 仍由配置/加载状态计算。这不能自动等同“当前编辑视图” | A 提无视图语义与测试，B 在 PinK 注入实际视图上下文；不能只保持 Schema 就宣称行为一致 |
| P1 | 注册入口和公开依赖面仍较宽 | 私有代码通过 `cocos-cli/host/core/...` 大量 deep import；CLI `./host/*` 为通配导出，注册器 import 时构造服务；Engine 直接按服务名调用 Camera/Gizmo | A：明确公开 core 入口及视图回调/上下文；相同 registry/事件总线/EditorExtends 的打包验证 |
| P1 | 四个 PinK 消费者缺接入证据 | 私有包有场景、资源预览、Motion 和 inspect 实现，但没有面向 PinK 描述的独立加载契约；宿主 Scene/AssetPreview/Motion/Play consumer 未能检查 | B 修改实际调用点；A 提供适配入口及失败/释放行为 |
| P1 | 交付与联合测试不完整 | 当前 build 生成模块和 Web bundle，不是扩展打包/内置安装流水线；已有单测和 Worker 测试不覆盖 PinK GPU、Hierarchy/Inspector、多窗口及升级 | B 扩展交付和产品测试；A CLI 清包、私有 runtime 测试 |

P0 表示阻止目标文档所述 PinK runtime 接入，P1 表示必须在完整验收前补齐。

## 4. 关键问题的直接代码位置

CLI 仓库：

- [Operation 输入与指针锁](../../src/core/scene/scene-process/service/operation.ts)
- [地形对组件 Gizmo 的依赖](../../src/core/scene/scene-process/service/terrain.ts:260)
- [服务初始化吞掉错误](../../src/core/scene/scene-process/service/service-manager.ts:118)
- [导入时注册实例](../../src/core/scene/scene-process/service/core/decorator.ts:33)
- [无视图相机上下文](../../src/core/scene/scene-process/service/core/backend-view.ts:29)
- [MCP 基线仅比较声明](../../tests/editor-extraction-boundary.test.ts:15)

独立 `pink-scene-editor-extension` 仓库：

- `package.json`：模块导出、CLI peer、构建脚本；未形成内置扩展描述。
- `src/scene-entry.ts`：组合公开 core 与私有视图服务。
- `src/engine-bootstrap.ts:41`：现有启动参数；`:92` 记录模块加载失败后继续；`:223` 创建浏览器调用通道。
- `static/web/scene-editor-boot.js:3`、`static/web/engine-loader.js`：根路径加载依赖。
- `src/core/preview/scripting-routes.ts`、`src/core/scene/scene.scripting.middleware.ts`：runtime 当前所需资源与配置服务。
- `src/scene-replica.ts`：全量显示副本、手势同步、地形与自定义 Undo 限制。
- `src/editor-host.ts`：Node 预览注册/释放，不是浏览器 GPU runtime dispose。

## 5. 建议的补齐顺序与验收

1. **共同固定运行模型和范围。** PinK 沿用 Webview 内核；独立 CLI 保留 Worker。明确游戏/模拟器预览与烘焙 MCP 继续遵循哪些既有决定。
2. **A 提供可接入 runtime。** 明确启动参数和返回句柄；分离 runtimeResourceBase/backendBaseUrl；补必需服务失败传播、生命周期和消费者入口；梳理公开资源 API。
3. **B 接通一条真实 PinK 链路。** 启动前激活、注册唯一描述、版本检查、URI/CSP 注入；打开场景、拖动 Gizmo、保存，Hierarchy/Inspector 看到同一对象变化，重开文件验证。
4. **A/B 补齐复杂能力和其他消费者。** 地形、参考图、粒子、资源预览、Motion、Play inspect；逐项验证数据和生命周期，不用“启动返回成功”替代功能验证。
5. **联合发行验收。** 多窗口/隐藏会话/池复用/扩展缺失/版本错配/升级/旧请求拒绝；干净 CLI 构建与包内容检查；匹配版本 PinK 内置扩展安装验收。

最小联合通过条件：不安装私有包的 CLI 能打开/修改/保存；PinK 从扩展 URI 加载实际私有 runtime；画布与 Inspector/Hierarchy 操作同一场景；保存/撤销/脏状态正确；不存在双场景写入者；故障不切换执行实例。

## 6. 本次验证及限制

- 读取目标文档全文，对照当前两份仓库源码和现有文档，未执行架构修改。
- 重新运行 `tests/editor-extraction-boundary.test.ts`：1 套、2 项通过，确认 91 项非烘焙声明基线及 CLI 无私有包依赖。
- 检查当前 dist/static 的典型旧私有产物名称，没有发现旧 scene bundle、input-bridge、preview-inspect；发现的公共 Gizmo 契约和 scene 数据编辑器名称不等于私有实现。Operation 仍在公开源代码中，需按上述职责拆分。
- 本次没有重跑所有历史测试、干净安装/npm/release 完整打包检查或 PinK GUI；既有测试结果不能证明目标方案的多窗口、URI/CSP、扩展激活及 GPU 交互已经完成。
- PinK 源码路径尚未确认。取得后应重点检查目标文档列出的 EditorPane、Webview Pool、MainThreadPinkScene、MCP Runtime Broker、三个 boot 消费者及 Play inspect 消费者，再把“待核实”项转成明确文件和修改清单。
