# 场景编辑器与预览功能抽离计划

更新时间：2026-09-18
状态：已拆分到独立私有仓库；最新实施状态见文末及差距审计。PinK 宿主接入、剩余职责拆分和联合验收尚未完成。

## 1. 目标与约束

将可视化场景编辑器、浏览器预览和模拟器预览功能抽离成独立包，为后续放入 IDE 私有仓库做准备。CLI 保留独立完成场景操作、烘焙及模拟器编译的能力。

已确认的约束：

1. CLI 不依赖私有包，也不依赖 IDE 提供执行能力。没有安装或启动 IDE，CLI 仍可正常工作。
2. 现有非烘焙 MCP 能力保留，包括场景、Prefab、节点、组件等操作；工具名称、参数、返回结构和错误语义原则上保持兼容。
3. 烘焙功能保留在 CLI，包括光照贴图、光照探针、反射探针及其任务、资源处理和必要渲染能力。
4. 烘焙相关 MCP 工具按误暴露处理，从公开 MCP 清单和调用入口移除；这不意味着删除底层烘焙功能。
5. 私有包承载编辑器交互、浏览器预览和模拟器预览，可以由 IDE 加载。允许私有包使用 CLI 提供的公开能力和模拟器编译产物，依赖方向不能反过来。
6. 本轮不考虑字节码、混淆或其他产物保护措施。
7. 本次按用户后续指令执行代码拆分；不创建远程私有仓库或发布包。
8. CLI 保留模拟器原生程序与运行时的编译、产物查询及打包；模拟器启动、停止、重启、预览资源准备和会话管理迁到私有包。普通项目构建后 `run` 能力继续保留。

计划采用的范围假设：

- 抽离浏览器游戏预览、场景编辑器预览、模拟器预览以及对应页面、入口、交互、资源准备和热重载。
- 模拟器编译与预览运行分开：CLI 产出可执行程序和运行时，私有包负责装配项目预览环境并启动程序；不在 CLI 保留模拟器预览兼容入口。
- 先在本地形成独立包边界，再迁往私有仓库。临时位于本仓库的包目录并不构成源码私有化。
- 保留烘焙的程序化调用能力，不默认新增命令行烘焙命令。现有调用入口的可用性需要在实施前盘点。

## 2. 目标结构

```text
CLI（独立可用）
  ├─ MCP：保留非烘焙工具
  ├─ 场景后端：加载、修改、保存、Prefab、节点、组件
  ├─ 引擎与项目脚本运行环境
  ├─ 烘焙后端：任务、渲染、外部工具、资源写入
  ├─ 资源导入、脚本编译、构建、普通项目运行
  ├─ 模拟器原生程序／运行时编译、产物查询与打包
  └─ 场景后端／烘焙必需的资源服务与公开集成接口
                       ↑
              使用公开接口或通信协议
                       │
私有编辑器包（由 IDE 加载）
  ├─ 可视化场景编辑器与输入交互
  ├─ Gizmo、编辑视口及编辑相机控制
  ├─ 浏览器游戏预览、工具栏、热重载
  ├─ 模拟器预览资源准备、启动／停止／重启、会话管理
  ├─ 浏览器与模拟器的预览服务器
  └─ 页面、Web 启动脚本、专用路由与静态资源
```

CLI 的运行、编译、测试、类型生成和发布均不要求存在私有包。CLI 不增加私有包的普通依赖、可选依赖、开发依赖或自动下载逻辑。

场景 Worker 暂时保留为 CLI 的执行机制；本次不同时重构进程模型。它执行场景后端，不等同于可视化编辑器。没有编辑器窗口，也可以加载引擎、脚本和场景对象。

必要的渲染后端同样不等同于编辑视口。例如反射探针烘焙需要实际渲染场景，不能为了抽走预览页面而删除。是否能在完全无显示设备的机器上执行，应按现有实现与平台条件验证，不作无条件承诺。

## 3. 模块修改范围

### 3.1 场景运行时：按职责拆分，禁止整目录迁移

涉及：

- `src/core/scene/scene-process/`
- `src/core/scene/scene-process/service/index.ts`
- `src/core/scene/scene-process/service/interfaces.ts`
- `src/core/scene/scene-process/service/service-manager.ts`
- `src/core/scene/scene-process/service/core/decorator.ts`

当前服务入口同时导出后端服务、Gizmo、相机、视口、预览和 UI；装饰器会在模块加载时实例化并注册服务。因此仅删除页面或移动文件不足以解除依赖。

修改方向：

- 分离 CLI 后端服务注册入口与可视化服务注册入口，防止 CLI 启动时顺带加载私有服务。
- 保留场景／Prefab 会话、节点组件操作、序列化、脚本加载、资产访问、必要的操作与撤销能力。
- 将事件总线、生命周期、数据结构与可视化监听分开；保存、关闭、重载不能要求视口或 Gizmo 已注册。
- 按实际调用关系拆分 `camera`、`scene-view`、`preview`、`selection`、`ui`、`gizmo`、`terrain`、`animation` 等模块。它们是重点审查对象，不是整目录迁移清单。
- 当前非烘焙 MCP 若使用粒子运行、参考图、地形或其他场景服务，保留其后端语义，仅迁出纯显示和交互部分。
- 避免以空实现掩盖缺失服务；后端操作应有真实可执行路径。

### 3.2 主进程、Worker 与通信

涉及：

- `src/core/scene/main-process/scene-worker.ts`
- `src/core/scene/main-process/index.ts`
- `src/core/scene/main-process/rpc.ts`
- `src/core/scene/main-process/scene-command-provider.ts`
- `src/core/scene/main-process/scene-host-local-executor.ts`
- `src/core/scene/main-process/proxy/`
- `src/core/scene/process-rpc/`

修改方向：

- CLI 保留默认 Worker 和完整后端命令执行链；不改成等待 IDE 安装 Provider。
- 将通信契约和后端代理与可视化集成代码解耦。
- 保留 `ISceneCommandProvider` 的现有集成用途，但它不能成为 CLI 执行场景命令时对 IDE 的强制依赖。
- 审查反向 RPC：资源访问、脚本、配置、烘焙任务等 CLI 后端模块应继续可用；编辑器专属宿主模块由私有包管理。
- 拆分事件订阅与关闭流程，保证 CLI 单独启动、重载和退出不触发私有资源访问。

### 3.3 烘焙功能保留，MCP 暴露移除

后端保留并审查：

- `src/core/scene/scene-process/service/baking/`
- `service/light-probe-bake.ts`、`service/lightmap-bake.ts`、`service/reflection-probe.ts`
- `src/core/scene/main-process/lightfx-bake-host.ts`
- `src/core/scene/main-process/lightfx-bake-renderer.ts`
- `src/core/scene/main-process/reflection-probe-bake-host.ts`
- `src/core/scene/main-process/reflection-probe-renderer.ts`
- `src/core/scene/main-process/lightfx/` 及对应代理、类型与资源事务逻辑

应重点验证烘焙是否依赖浏览器场景连接、编辑相机或视口。若存在依赖，改为 CLI 自己能启动或调用的渲染后端；不能仅保留入口，运行时再要求 IDE 提供渲染器。

MCP 涉及：

- `src/api/scene/lightfx-bake.ts`
- `src/api/scene/reflection-probe.ts`
- 对应 `*-schema.ts`
- `src/api/scene/scene.ts` 中的 API 组合
- `src/api/decorator/decorator.ts`、`src/mcp/mcp.middleware.ts` 的注册路径

本计划明确移除的 13 个 MCP 工具：

| 类别 | 工具名 |
| --- | --- |
| 光照探针 | `scene-query-light-probe-settings` |
| 光照探针 | `scene-bake-light-probes` |
| 光照探针 | `scene-clear-light-probes` |
| 光照贴图 | `scene-bake-lightmap` |
| 光照贴图 | `scene-query-lightmap-bake-info` |
| 光照贴图 | `scene-clear-lightmap` |
| LightFX | `scene-cancel-lightfx-bake` |
| 反射探针 | `scene-start-reflection-probe-bake` |
| 反射探针 | `scene-query-reflection-probe-bake` |
| 反射探针 | `scene-cancel-reflection-probe-bake` |
| 反射探针 | `scene-bake-reflection-probe` |
| 反射探针 | `scene-bake-reflection-probes` |
| 反射探针 | `scene-clear-reflection-probes` |

仅隐藏 `tools/list` 不够，必须解除工具注册，使 `tools/call` 也不可调用。装饰器在导入时注册工具，实施时应移除这些 MCP 装饰或断开所有对应导入注册路径。

烘焙的程序化 API、任务查询、取消和结果清理仍保留在 CLI。Schema 是否继续作为程序化参数校验使用，按调用关系处理，不随 MCP 删除而盲目删除。

普通节点／组件的查询、修改和删除不在此删除范围内；灯光、探针组件的常规属性操作也不受影响。

### 3.4 启动流程与对外接口

涉及：

- `src/core/launcher.ts`
- `src/core/scene/index.ts`
- `src/api/index.ts`
- `src/mcp/start-server.ts`
- `src/lib/mcp/mcp.ts`
- `src/lib/project/project.ts`
- `src/lib/scene/scene.ts`、`src/lib/cli.ts`、`src/lib/index.ts`
- `src/commands/preview.ts`、`src/cli.ts`

修改方向：

- 将场景后端初始化与浏览器预览／编辑器路由注册分开。CLI 启动 MCP 时保留场景后端，不再自动注册编辑器页面和浏览器游戏预览。
- 移除 `Project.init()` 对浏览器预览的隐式注册。
- 保留 `CocosAPI.scene` 和非烘焙场景 API，不采用“场景模块缺席、整组 MCP 不注册”的旧方案。
- `Launcher` 保留独立场景启动和关闭；浏览器及模拟器预览启动职责迁出。
- 浏览器 `preview` 命令（包含 `--scene-editor` 和构建式预览入口）迁到私有包或 IDE。构建后 `run` 能力继续保留，不把所有带 preview 名称的构建功能一并删除。
- 移除 CLI 的 `simulator` 预览命令注册；`lib.Simulator` 收窄为编译和产物查询接口，预览 API 与会话事件迁到私有包，具体清单见 3.6。
- 对外 `Scene` 门面拆分后端与可视化接口。Motion 展示等接口是否完全属于私有包，需要结合 MCP 和其他消费者盘点；不能按名称直接删除。
- 记录 IDE 消费接口的迁移说明，不在 CLI 中保留指向私有包的兼容转发层。

### 3.5 浏览器预览、路由与静态资源

涉及：

- `src/core/preview/`：游戏预览、热重载、扩展预览宿主、配置与脚本路由
- `src/core/scene/scene.middleware.ts`
- `src/core/scene/scene.scripting.middleware.ts`
- `src/core/scene/preview.debug.middleware.ts`
- `src/core/scene/asset-binary-routes.ts`
- `static/web/`

修改方向：

- 迁出场景编辑器页面、游戏预览页面、启动脚本、输入桥接、预览 UI／CSS、检查面板及浏览器刷新逻辑。
- 浏览器与模拟器的预览服务器一起迁出。CLI 仅保留 Worker、烘焙及其他独立功能确实需要的资源／脚本接口，不再因模拟器预览而保留整套预览服务器。
- 私有预览服务器可使用 CLI 的资源查询、脚本编译和通用构建能力，但预览专用路由、settings 装配及生命周期由私有包拥有。
- 审查 middleware 中混合的引擎、资源、RPC 和页面路由，按消费者拆分，不整体删除或迁移。
- 静态资源按消费者分配；私有包自行解析自己的资源目录，不能继续假定文件位于 CLI 的 `static/web`。
- 私有包的路由注册、事件监听与销毁由其生命周期管理，CLI 后端不触发这些逻辑。

### 3.6 模拟器：CLI 编译，私有包预览

当前 `src/core/simulator/index.ts` 同时负责构建、准备项目资源、预览服务器和进程会话；`ensurePreviewServer()` 会调用 `Launcher.startGamePreview()`。需要先拆职责，再迁移运行部分，不再为保留模拟器预览而在 CLI 新建预览托管入口。

| 模块／能力 | 归属与修改 |
| --- | --- |
| `workflow/build-simulator.js` | CLI 保留：编译原生可执行程序、识别平台及产物路径 |
| `workflow/build-simulator-runtime.js` | CLI 保留：编译引擎运行时及其配套产物 |
| `package.json` 的 `build:simulator:native`、`build:simulator:runtime`、`build:simulator` | CLI 保留：不需要 IDE 或私有预览服务即可执行 |
| `src/core/simulator/index.ts` | 拆出独立构建／产物模块；预览服务器编排、项目资源准备、进程启动与会话管理迁出 |
| `src/core/simulator/internal.ts` | 按职责拆分：构建状态、产物清单等留 CLI；启动参数、预览配置、会话类型等迁出 |
| `src/core/simulator/runtime-writer.ts` | 项目预览 settings、临时场景、配置与资源目录装配迁入私有包；确被纯编译流程共用的工具另行提取 |
| `src/lib/simulator/simulator.ts` | 保留编译与产物查询门面；删除 CLI 对预览运行 API 的导出，不转发到私有包 |
| `src/commands/simulator.ts`、`src/cli.ts` | 预览命令实现迁出，删除 CLI 命令注册；不影响 npm 编译脚本 |
| 模拟器相关测试、类型和 IDE 接口文档 | 构建测试留 CLI；预览资源、启动、会话、日志与退出清理测试随私有包迁移 |

对外接口按职责划分：

- CLI 保留 `build`、`buildNative`、`buildRuntime`、`isBuilt`、`getManifest`、`getExecutablePath` 等编译／产物查询能力及对应构建状态、日志。调用这些接口不能初始化预览管理器。
- `prepareResources`、`launchPreview`、`start`、`stop`、`stopAll`、`getStatus`、`listSessions` 和会话／运行日志订阅迁出。
- `init(projectPath)`、`getResourcesPath`、`getWritablePath` 按用途重新归属：项目会话初始化与运行时可写目录由私有包负责；CLI 只返回编译产物的位置与描述。
- 若构建日志与进程日志当前共用事件，拆成构建事件和运行事件，避免 CLI 为日志订阅加载预览实现。

产物交接：

- CLI 构建产物包含原生程序、运行时及运行必需的配套文件；按目标平台、架构、引擎版本和产物版本描述兼容性。
- 私有包通过明确的产物查询接口／清单定位文件，不依赖 CLI 内部源码路径，也不自行调用其未公开脚本。
- 私有包负责生成项目相关 settings、场景 JSON、import map 和预览配置，启动自己的预览服务器，再运行编译产物。
- 明确只读编译产物与项目临时运行目录的区别，优先在会话目录装配资源，避免运行时回写共享发行目录或多个项目互相覆盖。
- `workflow/release.js` 的模拟器构建步骤可以保留，但发布清单仅携带编译产物和构建支持，不重新打入已迁出的预览控制代码。
- 更新 `docs/zh/simulator.md` 及 IDE 调用方迁移说明；预览 API 的迁出属于明确的 SDK／命令兼容性变更，不以 CLI 依赖私有包的方式兼容。

### 3.7 公共类型与引擎扩展

涉及：

- `src/core/scene/common/`、`src/core/scene/@types/`
- `src/core/scripting/index.ts`
- `src/core/assets/serialized-data.ts`、`animation-graph-service.ts`、`@types/public.d.ts`
- `src/core/engine/editor-extends/`
- `src/core/assets/asset-handler/assets/scene/`

修改方向：

- `GlobalEnv` 被脚本模块使用，可移到公共基础模块。
- `IProperty` 被资源模块使用，应整理为公共资产／属性契约，避免公共类型继续引用抽离后的私有实现。
- 服务接口、事件与数据类型应区分 CLI 后端契约和编辑器专属契约，避免声明文件重新引入私有依赖。
- `editor-extends` 的序列化、Prefab 工具、几何处理、缺失类型处理等被导入与构建使用，第一阶段保留。仅迁移经验证为纯编辑器用途的部分。
- 场景／Prefab 资源导入器保留，不因目录名含 scene 就迁走。

### 3.8 构建、类型生成、发布与文档

涉及：

- `package.json`、`tsconfig.json`、必要时 `package-lock.json`
- `workflow/build-scene-bundle.js`、`workflow/build-polyfills.js`
- `workflow/build-simulator.js`、`workflow/build-simulator-runtime.js`（保留编译职责）
- `workflow/generate-dts.ts`、`workflow/prepare-dts.js`
- `workflow/release.js`、`.vscodeignore`、`.gitignore`
- `.github/` 中构建与发布流程
- `workflow/parallel-tests.json`、Jest 配置、E2E 工具生成及覆盖率检查
- MCP 文档、CLI 帮助、README 和集成说明

修改方向：

- 拆分 CLI 后端编译和私有 Web bundle 构建；CLI 的 build、compile、postinstall 不构建或下载私有包。
- 按剩余用途决定 Web polyfill、共享引擎辅助 bundle 的归属；保留模拟器运行时编译确实需要的依赖，迁出仅用于预览启动与会话管理的依赖。
- CLI 类型生成保留场景后端与烘焙 API；编辑器专属声明由私有包生成。
- `workflow/generate-dts.ts` 的 simulator 声明入口改为仅导出构建／产物接口；预览和会话声明由私有包生成，`src/lib/index.ts` 不再通过 Simulator 导出预览能力。
- 清理旧 dist、bundle、map、声明等残留后验证发行包，避免源码迁出但旧产物仍被打包。
- 同时检查 npm 文件清单和 release 的文件收集规则，排除本地暂存私有包及其源文件。
- 调整 MCP 文档、类型与测试中的烘焙工具清单；记录浏览器／模拟器预览入口与 IDE 集成接口的迁移。
- 现有未跟踪的 webgame 包和 tgz 文件不属于本次抽离任务，不修改或清理。

## 4. 实施阶段

### 阶段一：建立功能与依赖基线

1. 导出当前 MCP 工具名、输入／输出 Schema，标记上述 13 个允许移除的工具。
2. 建立“API → 代理 → 服务 → 引擎／渲染／宿主”的依赖表，覆盖非烘焙 MCP 和保留的烘焙功能。
3. 盘点场景服务注册副作用、Web 路由、静态资源、类型导出和 IDE 消费接口。
4. 专门检查烘焙对浏览器连接／视口的依赖，以及模拟器构建和预览之间的混合依赖；列出保留的编译 API、迁出的预览 API 与产物交接协议。
5. 在当前环境跑相关基线测试，记录既有失败和外部工具／图形环境要求。

交付：逐模块归属表、MCP 兼容基线、独立烘焙验证入口。没有明确归属的混合模块先拆内部职责，不直接搬目录。

### 阶段二：分离 CLI 后端与可视化注册

1. 分开服务注册入口，解除后端对 Gizmo、视口、交互等服务的直接初始化依赖。
2. 分离后端生命周期事件与可视化订阅，保证场景打开、保存、重载和关闭独立执行。
3. 分离 CLI 后端必需的资源服务与预览服务器；将模拟器编译／产物查询从预览管理器中拆出，确保编译不启动服务或会话。
4. 整理公共工具、属性类型、服务契约和烘焙程序化 API。
5. 将烘焙所需渲染路径改为 CLI 自主可用（若基线发现依赖编辑器连接）。

交付：可视化模块不加载时，CLI 仍可完成保留的全部操作。该阶段先验证功能，再迁移文件。

### 阶段三：形成独立编辑器包

1. 迁移已确认的可视化服务、浏览器与模拟器预览、静态资源、专用路由与测试；模拟器改用私有包的预览服务器，不再调用 CLI 的 `startGamePreview()`。
2. 为私有包建立入口、构建配置、资源定位、生命周期和 IDE 集成说明。
3. 将依赖改为 CLI 的明确导出／通信契约，避免私有包通过跨仓库相对路径导入实现。
4. 调整 Launcher、Project 初始化和 CLI 命令，去除可视化自动启动路径及 `preview`／`simulator` 预览命令；更新模拟器 SDK 门面。
5. CLI 不添加私有包依赖；私有包使用匹配版本的 CLI 能力，避免加载第二套资源数据库或场景单例。

交付：可单独迁仓的包目录及独立构建入口；若目标私有仓库尚未指定，仅本地暂存，不宣称已经完成访问权限隔离。

### 阶段四：收紧 MCP 暴露并拆发布流程

1. 移除上述 13 个烘焙工具的注册，保留底层功能及程序化入口。
2. 对比 MCP 基线：除此之外无工具丢失、Schema 漂移或执行后端缺失。
3. 更新 CLI 与私有包各自的构建、类型生成、测试、文档和发行文件清单，明确模拟器编译产物的交付位置与版本兼容规则。
4. 进行干净构建，验证 CLI 不依赖私有目录、私有包或 IDE。

交付：独立 CLI 发行产物、编辑器包产物和迁移说明。

### 阶段五：集成验收

按下节执行功能验收和边界检查。只有关键路径通过，才将抽离标记为完成；不能以 TypeScript 编译通过替代功能验收。

## 5. 验收标准

### CLI 独立性

- 私有包不安装、私有目录不可见、IDE 不启动时，CLI 编译、启动 MCP、导入资源、构建和运行均正常。
- CLI 源码、运行时导入、类型产物和构建脚本中没有私有包依赖。
- CLI 启动不注册浏览器编辑器／游戏预览页面，也不要求浏览器连接后才能完成后端初始化。
- CLI 不再提供 `preview`／`simulator` 预览命令或模拟器会话 API；其模拟器编译与产物查询不启动预览服务器、不创建模拟器进程。
- Worker 的启动、通信、退出及异常清理正常。

### MCP 兼容性

- `tools/list` 相对基线只减少明确列出的 13 个烘焙工具。
- `tools/call` 不能调用这些已移除工具；不只是列表隐藏。
- 其他工具名称、参数和返回结构保持兼容。
- 在没有 IDE 的条件下，验证场景／Prefab 打开与保存、节点增删改查、组件属性修改、脚本重载，以及当前暴露的其他场景工具。
- 结果验证包含重新读取保存内容，而不是仅判断接口返回成功。

### 烘焙保留

- 通过 CLI 提供的程序化入口独立执行光照贴图、光照探针、反射探针的代表性任务。
- 验证任务状态、取消、清理、失败回滚与资源数据库一致性。
- 需要渲染时由 CLI 自行提供后端，不依赖 IDE 或预览页面。
- 检查产物内容及资产引用；外部工具、平台或图形环境不足时明确记录未验证项目，不将跳过视为通过。

### 模拟器编译与私有预览

- 在未安装私有包、未启动 IDE 的条件下，CLI 能通过 `build:simulator` 及编译 API 生成原生程序和运行时，产物查询正确；按支持的平台与工具链验证。
- 私有包在 IDE 中可运行场景编辑器、浏览器游戏预览、交互与热重载。
- 私有包使用 CLI 编译产物准备项目预览资源并运行模拟器，验证场景／脚本加载、停止、重启、会话事件、日志和进程退出清理。
- 预览服务由私有包启动；模拟器预览不依赖已移除的 CLI 预览入口或旧 SDK 会话接口。
- 检查引擎／产物版本不匹配时的明确错误，以及多项目、重启和临时资源目录隔离，避免覆盖共享编译产物。
- CLI 普通项目构建后 `run` 能力保持，抽离浏览器／模拟器预览入口不影响构建平台行为。

### 发行边界

- npm 包与 release 产物均不携带私有源码、专属 Web bundle 或陈旧的编辑器产物。
- CLI 的公开声明文件不引用私有包或已迁走的类型路径。
- CLI 可以包含模拟器编译产物和构建支持，但不包含预览启动、项目预览资源装配与会话控制代码；不存在旧 `dist/core/simulator`／声明残留导致预览 API 被重新发布的情况。
- 私有包拥有可复现的构建与类型生成流程，迁仓后不依赖原仓库内部目录布局。

## 6. 风险与实施原则

- 服务注册依赖模块导入副作用，且存在全局单例：必须验证真实初始化链，不能只搜索静态 import。
- 相机、视口、预览与烘焙可能共享渲染对象：按实际用途分层，不能按“渲染”关键字统一迁移。
- 纯交互代码与地形、粒子、动画等数据操作可能混合：以保留现有 MCP 行为为约束划分。
- 当前模拟器将构建与预览运行混在同一管理器，并复用了游戏预览入口：先拆编译边界，再将预览服务器、资源准备与进程会话一起迁出；不要为了模拟器另留一套 CLI 预览服务。
- 模拟器 SDK 已有 IDE 消费者：需同步迁移调用入口与事件订阅。构建状态和运行日志不能因共用管理器而留下反向依赖。
- MCP 工具移除是本计划唯一明确允许的工具兼容性变更；任何额外工具变化都需要重新说明范围。
- 本地拆包不改变已有 Git 历史，也不会自动撤回曾公开的代码；真正迁入私有仓库属于后续仓库管理工作。
- 实施按阶段提交，优先让 CLI 独立后端成立，再迁移编辑器文件，最后调整发布。避免一次整目录迁移后同时修复启动、类型、路由和烘焙。

## 7. 本次执行记录（2026-09-17 至 2026-09-18）

### 已落实的改动

- [x] 建立 104 个 MCP 工具基线，只移除约定的 13 个烘焙工具注册，其余 91 个保留；烘焙程序化 API 和任务生命周期仍在 CLI。
- [x] 分离后端与可视化服务注册；场景 Worker、资源/脚本、数据编辑、序列化及必要引擎能力保留。后端使用独立的测量相机/临时节点辅助，不要求 Gizmo 或视口存在。
- [x] 编辑器、Gizmo/交互相机、浏览器预览、模拟器资源装配与预览会话迁入独立的 `pink-scene-editor-extension` 仓库。私有包拥有页面、模板、Web bundle、构建及测试入口。
- [x] CLI 移除预览命令、Launcher 预览方法及模拟器会话 SDK。模拟器编译、产物查询/版本检查、构建事件和普通项目 run 保留；预览资源隔离到项目临时目录。
- [x] CLI 烘焙不再要求浏览器 renderer 在线。补齐 Node 离屏 WebGL、图片像素解码与实际 Canvas 绘制；修复渲染异常后无法重新刷新的问题。
- [x] 私有包依赖匹配版本 CLI 的 `host/*` 集成导出，CLI 无反向依赖。共享 property/global-env 移至中立模块。
- [x] CLI 保留供宿主注册使用的中立服务接口类型（包括可选可视化服务的通信契约），不注册其实现。私有包的页面、交互实现和预览/会话 API 声明随私有包构建；这些接口类型不表示 CLI 自带可视化服务。
- [x] 分离构建、类型生成和发行清单，迁移模拟器文档并补充私有包 IDE 接入说明。

### 验证结果

- CLI 干净 TypeScript 构建、配置 Schema、SDK 声明生成通过。引擎 Node/Web 编译通过，缓存版本升级以保留 Node WebGL 模块。
- SDK 的 10 个套件、71 项测试和 12 份声明快照通过；快照已同步预览/Motion API 迁出、模拟器编译接口及引擎配置变化。
- 临时移走整个私有包目录后，CLI 类型检查与命令启动仍通过；命令清单无 preview/simulator 预览入口。
- CLI 全量测试及修复后的定向复验覆盖 223 个套件：221 通过、2 因环境失败；合计 2569 项通过、3 项失败。全量发现的组件查询测试替身已补齐；随后场景/粒子/烘焙等 5 个套件的 436 项复验全部通过。剩余 3 项均为 LightFX 资产安全测试创建符号链接时报 Windows EPERM，沙箱外重试仍缺少系统权限，未将其跳过或标记为通过。
- 真实场景 Worker 的 403 项回归通过，涵盖场景/Prefab、节点组件、脚本重载、保存与进程重启。无 IDE/浏览器连接的六面反射探针离屏抓图检查实际非零颜色像素；Canvas 测试验证图片像素和文字测量。
- 使用 `static/tools` 下的真实工具，通过 LightFX 光照贴图生成与资产引用检查、8 个光照探针烘焙/清理，以及 cmft 反射探针烘焙、导入、保存重开和清理。粒子属性修改、撤销、重载及 Reset 回归通过；修复禁用粒子恢复 Trail 时误挂载渲染模型的问题，复验无相应渲染异常。
- 编辑器包 TypeScript 与 Web bundle 构建通过；44 个测试套件、588 项测试通过，覆盖编辑器、预览与模拟器。
- Windows 模拟器原生程序与 runtime 编译通过。模拟器构建队列、失败恢复、产物兼容性、项目临时资源隔离有测试覆盖。
- MCP 基线比较与 CLI 依赖/命令边界测试通过；npm dry-run 的 45,427 个文件及 release 文件清单均排除私有目录和旧预览产物，release 另排除可能含旧私有实现的 Jest 缓存、本地测试日志和执行计划。

### 待外部环境完成

- [ ] 在具备 Windows 符号链接权限的环境重跑上述 3 项安全测试。
- [ ] 在目标 IDE 中接入私有包，验收真实场景交互、浏览器热重载及模拟器启动/停止/重启。单元测试和原生编译不能替代宿主预览验收。
- [x] 模块已迁入独立的 `pink-scene-editor-extension` 仓库，CLI 原暂存目录已删除；独立依赖锁文件已补齐。
- [ ] 在独立仓库建立 CI 并配置源码访问权限。本次未创建远程仓库、发布包或 Git 提交；迁仓不移除 CLI 既有 Git 历史中的源码。

迁移细节见 `docs/zh/scene-editor-extraction.md`、`docs/zh/simulator.md` 和 独立 `pink-scene-editor-extension` 仓库中的 `README.md`。本地验证日志位于忽略目录 `.test-analysis/`，不进入发行产物。

### 独立 module 构建补充验收

- 已确认需求为“能独立编译通过”。独立 scene-editor 仓库有自己的 package、锁文件、构建和类型输出；CLI 不依赖该模块。
- 移除 TypeScript 配置中的 `../../dist` 假设；从显式 CLI 宿主或安装的 peer 定位声明及 `cc` 模块，校验宿主版本和构建前置条件。
- HTTP/Socket 接口类型从 CLI 宿主契约推导，补齐路由返回类型声明，解决独立安装 Express/Socket.IO 后的类型冲突及不可迁移的声明推导。
- 仓库外临时副本单独安装本模块的 600 个依赖包，以目录链接提供已构建的 CLI peer，未设置 `COCOS_CLI_ROOT`，`npm run build` 成功生成 JavaScript、声明及三个 Web bundle。
- 根入口和全部 Simulator/Motion 导出接口已记录于 独立 `pink-scene-editor-extension` 仓库中的 `docs/zh/api.md`；构建日志见 `.test-analysis/module-standalone-build.log`。

### 跨进程共享场景改造（2026-09-18）

- [x] CLI 增加共享会话协调器和 loopback HTTP 入口，复用既有 Scene Worker RPC。CLI 不导入、不依赖私有模块。
- [x] 开启共享会话后，MCP/SDK 场景 RPC 和远程编辑命令进入统一队列；携带 epoch/revision/source/operationId，执行前检查版本并提供有限窗口去重。
- [x] 转发场景事件的顺序化失效通知；事件缺口、Worker 替换和重新连接通过全量快照重同步。快照包含未保存场景、dirty、Undo/Redo 状态。
- [x] MCP 启动命令增加可选 `--scene-session-file` / `--scene-session-origin`，保持原 MCP 工具及独立烘焙入口。程序化宿主可以调用 `Scene.startSessionServer()`。
- [x] 私有包新增轻量 session 子入口及浏览器显示副本适配器；共享模式不安装旧浏览器权威调用通道。普通 Gizmo 属性手势提交到后端，后端生成统一 Undo recording。
- [x] 真实 Worker + 独立 editor 子进程验证未保存修改、属性手势提交、CLI 读取、全局撤销/重做、冲突、保存及客户端重启重连。
- [ ] 地形二进制笔刷和其他自定义闭包 Undo 需要独立后端补丁协议；当前共享模式在操作前明确拒绝，独立编辑器模式保留。
- [ ] 目标 IDE 提供资源宿主 URL、传递会话描述符、连接 WebView 并验收真实渲染。会话端点不是预览资源服务器；editor 进程不得为提供资源而再次初始化同一项目。
- [ ] 未实现未保存场景的后端崩溃恢复日志；后端退出后需读取新连接描述符，不自动重放未确认写操作。

导出接口、部署示例和边界见 独立 `pink-scene-editor-extension` 仓库中的 `docs/zh/shared-session.md`。这轮完成共享状态基础链路，不将全部复杂编辑工具及外部 IDE 集成标记为已验收。

本轮验证：CLI TypeScript 编译通过；私有包 TypeScript/Web bundle 构建及仓库外独立副本构建通过；私有包 46 套/591 项测试通过。共享协议、RPC、Undo 与 MCP 边界回归通过；真实 Worker + 独立 editor 子进程用例通过。SDK 声明已生成并更新 2 份快照（13 项声明测试通过）。补充修复既有 ProcessRPC 在断开时丢弃 pending Promise 的问题，避免 Worker 更换后共享命令队列永久阻塞。

### 项目后端单实例与 IDE 生命周期（2026-09-18）

- [x] CLI 新增 `src/core/project-backend`，以规范项目路径和独占本机端口保证同一项目一个后端。首次注册通过原子硬链接发布，进程退出由操作系统释放占用；不通过超时或旧 PID 强行接管。
- [x] Launcher 以及 Project/Configuration/Assets/Scripting/Scene SDK 初始化入口先取得所有权，避免多进程同时启动资源库和场景 Worker；不同项目可使用不同进程。
- [x] 导出 `discoverProjectBackend/startProjectBackend/ensureProjectBackend/stopProjectBackend`。IDE 使用 ensure 发现、等待或启动独立 CLI 进程，将 MCP 地址与场景描述符交给客户端；scene-editor 不承担后端所有权。
- [x] 就绪状态通过认证控制端点实时查询；启动凭据只写一次。共享场景端点统一复用，重复启动明确拒绝，旧描述符不能关闭新的所有者。
- [x] 正常关闭先停止写入者，再释放所有权；部分初始化失败清理已启动资源。Worker 发出终止信号后必须确认退出；清理失败保留所有权并标记 failed。
- [x] 后台脚本通知加入可失效队列，处理关闭期间 RPC 拒绝，避免未处理 Promise；补齐场景保存测试的共享场景依赖替身。
- [x] 增加多进程竞争、目录别名、不同项目、崩溃重启、过期凭据、无关端口占用、关闭失败及 Launcher 并发初始化测试。真实后端测试覆盖 IDE 并发 ensure、MCP/场景能力、正常关闭和再次启动。

接入接口、示例、生命周期和故障处理见 [CLI 项目后端单实例](docs/zh/project-backend.md)。CLI 仍不依赖私有包。此机制只约束本机使用这些入口的后端；要求文件系统支持原子硬链接，运行中不能删除项目的注册目录。未保存场景的崩溃恢复与目标 IDE 的资源宿主接入仍按上节待办处理。

本轮验证：CLI TypeScript 编译通过；SDK 声明生成及 13 项声明测试通过；scene-editor 46 套/591 项测试及仓库内、仓库外独立构建通过。所有权/Launcher/Worker 定向测试 15 项通过，最终真实后端与所有权复验 8 项通过，真实 Worker + editor 子进程共享场景测试通过。CLI 全量运行发现的脚本通知关闭错误及保存测试替身缺失已修复，相关 3 套/56 项复验通过；剩余失败为既有 LightFX 测试的 3 项 Windows 符号链接 EPERM，未标记为通过。引擎初始化繁忙导致控制端点短时超时的问题已修复为期限内等待，并通过真实并发启动复验。


## 2026-09-18：采用 Webview 唯一编辑场景

- PinK 的编辑状态、未保存修改和撤销由 Webview 本地 Service 维护；现有 Provider/Broker 将 MCP 路由到同一场景。独立 CLI 保留 Worker 与烘焙能力，不依赖私有模块。
- scene-editor 新增浏览器 editor-runtime.js 入口，默认 host，不安装旧反向调试 socket，不连接 Worker 显示副本。standalone 调试和 replica 兼容模式显式选择。
- 分离扩展静态资源 URI 与后端 URL；提供类型导出、严格初始化失败、幂等清理与一次性 Webview 生命周期。
- CLI ServiceManager 增加可选严格初始化和事件转发清理；默认 CLI 初始化行为保留。
- 宿主接入文档位于独立仓库 docs/zh/host-runtime.md。没有 PinK 源码，本次不包含 Provider/Broker、扩展激活和 Webview 池接线；实际 GPU、MCP 双向编辑/撤销/保存及失效请求仍需宿主验收。其他私有化审计缺口仍按审计文档跟进。


## 2026-09-18：按差距顺序实施

- [x] Operation 输入实现迁私有；公开内核不再注册输入，Engine 改为显式视图更新回调。
- [x] 地形新增无 Gizmo 数据会话；浏览器显式注册视图会话适配，目标失效不切换所有者。
- [x] 明确 LOD、参考图、地形在 Worker/Webview 下的语义，并补针对性测试。
- [x] 公共引擎、脚本、settings 路由回归 CLI；私有页面与静态资源保留私有。
- [x] 新增 core/context/resource 出口；host 通配替换为明确清单。
- [x] 四类浏览器入口、轻量描述、协议/CLI 版本校验和交接文档。
- [ ] 继续收敛 88 个细粒度 host 配对版本接口；不将现有清单称为已完成的通用 SDK。
- [ ] PinK 描述注册/扩展激活、四个消费者接线、URI/CSP、池/多窗口/旧请求失效及内置扩展发行：没有宿主源码，待联合实施。
- [ ] 完整真实 GPU 交互与全 MCP 行为验收；已有单测和 Worker 集成结果不能替代。

交接入口：docs/zh/scene-runtime-contract.md；私有包 docs/zh/runtime-consumers.md。
