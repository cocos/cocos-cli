# 场景内核与私有 runtime 交接契约

2026-09-18。独立 CLI 使用 Worker；PinK 使用 Webview 内唯一编辑场景。MCP 由已有 Provider/Broker 路由到该场景。本文描述当前代码，不代表 PinK 已完成接线。

## 公开接口

- `cocos-cli/host/core/scene/runtime/core`：导入并注册公开内核，不注册 Operation、Camera、Gizmo、Preview 等私有服务。
- `cocos-cli/host/core/scene/runtime/context`：共享 Service registry、BaseService、事件总线、视图更新注册与地形会话适配。私有服务必须使用这一份内核，不能另打入一份 registry。
- `cocos-cli/host/core/scene/runtime/resources/index`：公开引擎/脚本/场景数据路由和 settings 缓存失效接口。没有编辑页面和私有 bundle，也不启动项目、Worker 或服务器。

CLI 的 `host/*` 通配出口已替换为明确的出口清单。当前仍有 88 个配对版本 host 出口，包含构建、模拟器及旧内部适配；这不是已完成精简的通用 SDK。新增场景装配优先使用 runtime 入口；后续继续将细粒度旧引用收敛。历史 `dist/*` 仍为兼容保留，不应视作稳定 API。

## 资源宿主

在已有项目初始化和 HTTP 服务上，注册一次 `sceneRuntimeResources`，置于宽泛资产路由前；如果 PinK 已提供等效路由，就复用其实现。不得为注册路由另开项目或场景 Worker。

```ts
import { sceneRuntimeResources, invalidatePreviewSettings } from 'cocos-cli/host/core/scene/runtime/resources/index';
// existingServer 是宿主已启动的 CLI Server。
existingServer.register('SceneRuntimeResources', sceneRuntimeResources);
// 资产、脚本或相关配置变化后，由宿主现有生命周期调用：
invalidatePreviewSettings();
```

主要路径：`/scripting/web-env`、`/scripting/systemjs/*`、`/scripting/engine-dist/*`、引擎 modules/game-config、import maps、项目脚本，以及 `/scene-editor/settings.json`、`/scene-editor/assets/*` 数据。settings 未就绪返回 503。settings 生成仍需已有资源库及 builder 准备完成；注册路由不承诺它们立即就绪。

私有模块继续提供开发页面、预览/模拟器界面和静态资源。其 settings 生成与上述公共数据服务使用同一缓存实现。CLI HTTP 中间件目前不支持路由卸载，项目切换仍应重建对应服务进程。

## 无视图行为

| 能力 | 独立 CLI Worker | PinK Webview |
| --- | --- | --- |
| 场景/节点/组件、保存、撤销 | 公开内核执行 | 同一公开内核实例执行，MCP 经 Provider 进入 |
| Operation 输入、指针锁 | 不注册输入服务；不是独立 CLI 数据 API | 私有模块注册，宿主按需绑定输入 |
| LOD 相对高度 | BackendView 使用场景保存的相机配置；没有配置时使用默认测量相机。不是另一 Webview 的实时视角 | 优先使用本地交互 Camera |
| 参考图 effectiveVisible | 表示当前 runtime 的配置、2D 状态和加载条件允许显示；不是已在可见窗口呈现像素的保证 | 使用本地运行时显示条件；最终可见结果需视口验收 |
| 地形 Manage/layer 数据 | 验证明确目标和选择后，直接从 Terrain 读取、修改、撤销、保存，不依赖 Gizmo | 数据写入仍由 TerrainService 执行，私有适配器提供实际编辑会话 |
| 地形笔刷会话/块选择 | 会话参数可以保存；无交互笔划，无鼠标选中块，readBlock 返回 valid:true、block:null | 私有 Gizmo 提供笔刷执行和所选块 |

地形视图适配器显式注册后，若不能解析请求的目标，返回无效，不回退到 Worker 数据会话。资产加载完成后重新检查目标；关闭场景清除数据会话。Operation 的公开类型为宿主视图契约，存在类型不代表 Worker 提供该服务。

2026-09-20 最终范围：完整保留原有 104 项场景 MCP 声明，包括全部 13 项 Light Probe、Lightmap、Reflection Probe 烘焙及查询/取消/清理工具。CLI 程序化烘焙能力继续保留。上述语义说明并不等于所有工具已做真实项目全量验收。

## 配对交付与验证

私有模块的 `@cocos/scene-editor/runtime` 导出可序列化描述及协议/CLI 精确版本检查。PinK 负责唯一 provider、启动前激活、资源 URI/CSP 和 runtimeId/generation/lease，运行时包不另建一套场景身份。

运行 `node workflow/check-scene-runtime-boundary.cjs` 检查构建后的出口及典型私有残留；发行还需检查 npm/release 清单。单元测试和 CLI Worker 集成测试不替代 PinK GPU、扩展缺失、版本错误、重载、多窗口及失效请求验收。
