# 场景抽离同步 main 的记录

基线：CLI PR #954 原头 d3c55fb6196f4d86cc6998a5a6cff3ef2bcf1bc4；私有 PR #1 原头 e7044bfdb890a5c10f16ffcb6a0e43599e6b3810。同步 main：0dc962a33822bf0dacfdb3cbdf0f2d3d4b1002f2。共同祖先以来 main 增加 29 个提交。

本轮范围已经用户确认：依 plan.md 按职责抽离场景视图、浏览器和模拟器预览，继续保留 104 项场景 MCP 声明与 CLI 独立 Worker、烘焙、模拟器编译。保留现有 Webview 本地场景架构，历史参考图/UI/地形分层及 PinK 宿主接线不在本轮扩展范围内。

| main 的改动 | 同步结果 |
| --- | --- |
| #961 Preview in Editor | PreviewPlay 服务/测试、gameView 引擎适配及输入坐标迁私有；删除旧 inspect agent 和专用路由；Editor 的运行场景登记和公共接口留 CLI |
| #966 拖拽创建节点 | 拖拽管理器、屏幕落点和测试迁私有；NodeService 经显式惰性工厂调用，节点创建/Canvas/Prefab/撤销事务留 CLI；无视图返回 NOT_EDITABLE |
| #955/#958 探针预览、交互与线框优化 | Gizmo 与线框缓存实现及测试迁私有；探针数据快照、撤销和查询裁剪留 CLI |
| #969/#982/#971 网格、平移/缩放、相机模式同步 | 相机、网格及回归测试迁私有；场景个人配置与 initialModes 记录留 CLI |
| #967 隐藏 Canvas 渲染 | Gizmo/视口更新迁私有，保留现有公开内核视图回调 |
| #962 粒子刷新 | Engine 保留针对真实选择集的仿真刷新行为，不依赖私有视图实现 |
| #963/#964/#976/#974 | Prefab 撤销重做、资源创建和动画刷新实现与测试保留 main 的改动 |

CLI 将 main 合入既有 PR 历史，不重写已有提交。删除/修改冲突按文件消费者重新分配；同时检查新增文件，避免自动合并再次带入私有实现。新依赖通过明确的 host 出口提供，不新增私有包依赖或通配出口。

私有 runtime 与 CLI 精确配对为 0.0.1-alpha.44。描述协议为 2，Play 入口为 play-runtime.js，返回本地 Service/events/PreviewPlay；加载引擎前设置 isPreviewProcess，在场景服务内设置 GAME_VIEW。宿主预先提供预览 settings，通过 PreviewPlay 管理运行/暂停/单步，并负责运行视图保存策略。

验证包含 CLI 干净输出编译、公开声明生成与快照、MCP/私有产物边界、场景后端回归、真实 Worker 操作，以及私有包完整测试和浏览器 bundle 构建。具体执行结果以配对提交的 PR 更新说明为准。

本轮不包含 PinK consumer 接线、扩展安装/激活、URI/CSP、多窗口或真实 GPU 交互验收，构建/单测不代表产品验收完成。
