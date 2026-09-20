# 场景编辑器抽离与调用迁移

CLI 独立保留全部原有场景 MCP（含烘焙）、场景数据操作、脚本/资源管线、构建运行、烘焙后端和模拟器编译。编辑器及预览已迁入独立的 `pink-scene-editor-extension` 仓库（模块名 `@cocos/scene-editor`）；CLI 不依赖该包，也不要求 IDE 在线。

| 职责 | 归属及入口 |
| --- | --- |
| 场景、Prefab、节点、组件、动画数据、地形/粒子后端 | CLI `core/scene`、场景 Worker 和 `lib/scene` |
| 可视化服务注册、Gizmo、视口、相机交互、UI 对齐 | 私有包 `scene-entry` 和 `core/scene/scene-process/service` |
| 浏览器游戏/编辑器预览、脚本 HTTP 路由、页面和静态资源 | 私有包 `core/preview`、`editor-host`、`static/web` |
| 模拟器原生程序/运行时编译、产物与构建事件 | CLI `core/simulator`、`lib/simulator/simulator`、`workflow/build-simulator*` |
| 模拟器项目资源、预览服务器、启停/重启与会话 | 私有包 `core/simulator`、`Simulator`、`static/simulator` |
| 烘焙任务、外部工具、资源事务和必要渲染 | CLI 原有 baking API、host 与 Worker；Node 使用 gl + Canvas 离屏后端 |
| 类型/全局环境、临时节点与资产重载通用逻辑 | CLI `core/base` 和场景后端工具，无私有反向引用 |

## API 变化

CLI Launcher 的三类 preview 方法和 `preview` / `simulator` 预览命令迁到私有包。原生编译脚本保留；普通构建后 `run` 保留。Simulator SDK 只保留构建和产物查询，IDE 将预览/会话调用切换到私有包，参见 [模拟器文档](simulator.md)。

2026-09-20 最终调整：烘焙的程序化 API 和以下全部 13 个 MCP 工具均保留在 CLI，可通过 tools/call 调用；Gizmo 和鼠标交互仍在私有包。

```
scene-query-light-probe-settings
scene-bake-light-probes
scene-clear-light-probes
scene-bake-lightmap
scene-query-lightmap-bake-info
scene-clear-lightmap
scene-cancel-lightfx-bake
scene-start-reflection-probe-bake
scene-query-reflection-probe-bake
scene-cancel-reflection-probe-bake
scene-bake-reflection-probe
scene-bake-reflection-probes
scene-clear-reflection-probes
```

MCP 场景工具基线保持完整的 104 项（91 项非烘焙工具 + 13 项烘焙工具）；基线测试逐项比较全部原始声明、参数、返回类型与装饰器。查询、取消、清理入口一并保留。

## 后端与环境

CLI Worker 自行创建离屏 WebGL 上下文并解码图像/绘制 Canvas，烘焙不等待浏览器连接。没有可用图形驱动或原生绑定时，数据操作仍可用，需要实际渲染的反射探针操作明确报错。图形测试可设置 `COCOS_TEST_OFFSCREEN=1` 运行 `tests/scene-offscreen-rendering.test.ts`，验证六面 cubemap 抓取。

LightFX 和 cmft 等外部烘焙工具仍需随正式发行包提供。本次已使用 `static/tools` 中的工具，在 Windows 上通过光照贴图生成/引用检查、8 个光照探针烘焙/清理，以及反射探针 cmft 烘焙、导入、保存重开与清理验收；六面抓图同时检查实际非零颜色像素。已有任务取消、资源发布、失败回滚与引用一致性由相应测试覆盖。

完整烘焙回归需要原生图形依赖和对应平台的外部工具，可在仓库根目录执行：

```powershell
$env:COCOS_TEST_OFFSCREEN = '1'
$env:COCOS_TEST_BAKE = '1'
$env:COCOS_TEST_LIGHTFX = '1'
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/scene-offscreen-rendering.test.ts
```

CLI 场景 Worker 启用引擎的烘焙能力，同时设置引擎预览行为标志以保持原有组件属性语义；这里的标志不启动浏览器或模拟器预览。

私有包使用 CLI 明确列出的 `cocos-cli/host/...` 出口并要求精确匹配版本，已取消 `host/*` 通配导出。源码已迁入独立仓库，目标 IDE 仍需更新导入入口并做实际预览验收。新的内核和资源接口见 [场景 runtime 契约](scene-runtime-contract.md)。迁仓不移除 CLI 既有 Git 历史中的源码，独立仓库的访问权限需单独管理。

CLI 中立服务接口仍描述宿主可注册的 Camera/Gizmo 等通信契约，便于复用 RPC 和服务容器；CLI 单独启动时不注册这些可视化实现。接口类型的存在不代表服务可直接调用，宿主应先加载私有包的 `scene-entry`。
