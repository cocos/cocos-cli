# Builder 原子接口与兼容编排

构建任务的队列、取消、历史记录、PinK 插件钩子和联合平台调度属于 PinK。本次抽离的构建与通用阶段原子接口执行单个平台或单个阶段，不根据 nextStages/subTaskPlatforms 隐式执行额外步骤。原有 make/run/upload/publish 快捷接口保留兼容行为。

| 库入口 | 行为 |
| --- | --- |
| build / createBuildTask | 标准化独立参数快照，执行一次平台构建 |
| resolveBuildOptions | 在宿主前置钩子之前标准化参数；返回独立快照 |
| createResolvedBuildTask | 接收最终配置，不再标准化或补回钩子删除的字段 |
| readBuildStageOptions | 读取最新产物配置；仅在阶段声明 requiredBuildOptions=false 且文件不存在时提供最小配置 |
| createBuildStageTask（传入最终配置） | 使用传入的最终完整配置，不重读产物、不混入历史 packages |
| executeBuildStageTask | 独立阶段操作，不调度联合子平台 |
| getBuildStageTargets | 只查询父子产物目标，不执行任务 |
| make / run / upload / publish | 原有兼容入口，继续委托 Launcher，保留初始化、服务启动和联合阶段行为 |

单次构建句柄通过 getSubBuildOptions 派生子平台请求，宿主执行后通过 recordSubBuild 更新父产物清单。getCompileConfigOptions 提供 CLI 当前生成的配置供宿主保存；单步骤构建会输出 compile config，后续 stage 使用最新文件。

CLI 自身 onBeforeBuild/onAfterBuild 等生命周期属于单次构建内部实现，保持不变。单步骤执行方式由专用方法决定，平台 hook 即使写入 nextStages 或 subTaskPlatforms，也不能触发额外执行。

对外命令与 MCP 显式通过 core 的 buildWorkflow / executeBuildStageWorkflow 复合入口运行，保留已有 nextStages、联合子平台、阶段返回值和结果汇总。MCP schema、支持的平台与阶段范围不扩大。兼容路径不是 PinK 的任务管理入口。

PinK 的每个实际步骤使用“标准化 → PinK pre hook → 最终配置工厂 → CLI 单步骤 → PinK post hook”。stage 使用“最新产物 → 明确覆盖 → pre hook → 最终配置工厂”，避免在钩子之后补回过期参数。

原有 lib 函数名和参数保持可用，不新增重复的 Unit 接口。createBuildStageTask 的可选第四参数接收宿主钩子处理后的最终配置；省略时读取最新产物。BuildTask.run 只执行当前平台，复合任务 BuildWorkflowTask 不从 lib 导出。make/run/upload/publish 不是本次原子化的范围，继续保持改造前的 Launcher 调用路径、参数、返回值及异常行为；需要单阶段执行时使用 executeBuildStageTask/createBuildStageTask。
