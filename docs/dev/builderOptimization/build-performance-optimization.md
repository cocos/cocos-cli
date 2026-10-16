# 构建性能优化方案（可落地版）

> 目标：在不破坏插件钩子语义与构建产物一致性的前提下，系统性降低 `cocos build` 端到端耗时。
> 适用范围：CLI（api 路径）与 Pink 编辑器（lib 路径）共享的 `src/core/builder` 构建管线。
> 文档基线：2026-09，分支 `fix/builder-hidden-schema-options`。

---

## 一、现状与瓶颈分析

### 1.1 当前进程/线程模型（事实盘点）

| 环节 | 执行位置 | 并行度 | 关键代码 |
|---|---|---|---|
| 管线编排（data → build → setting → postprocess → md5 → stages） | 主进程 JS 主线程，**顺序 await** | 单线程 | `core/builder/worker/builder/index.ts` `run()` |
| 工程脚本编译（build-script 子进程） | fork 子进程 | 与引擎编译**串行** | `asset-handler/script/index.ts:171-208` |
| 引擎编译（build-engine 子进程，@cocos/ccbuild） | fork 子进程 | 与脚本编译**串行** | `asset-handler/script/engine.ts:199-228`、`tasks/build-task/script.ts` |
| Bundle 序列化/落盘 | 主线程，`Promise.all` 异步 I/O 并发 | I/O 并发，CPU 密集段阻塞主线程 | `asset-handler/bundle/index.ts` |
| 纹理压缩 | spawn 外部原生工具（astcenc/pvr/etc2/webp…） | **真并行**，上限 = CPU 核数 | `asset-handler/texture-compress/index.ts:456` |
| AssetDB | 主进程内库调用，冷导入可达约 1 分钟 | 单线程为主 | `core/assets/manager/asset-db.ts` |
| 场景进程 | fork（仅编辑器/预览，构建不参与） | — | `core/scene/main-process/scene-worker.ts` |

结论：**多核利用只发生在纹理压缩的外部工具上**；`build-script` / `build-engine` 两个子进程串行等待；data/setting/postprocess 等 CPU 密集 JS 全部压在主线程。

### 1.2 已有缓存设施（避免重复造轮子）

- `useCacheConfig`（`@types/public/options.ts:72`）：`serializeData` / `engine` / `textureCompress` / `autoAtlas` 四个开关，默认值在 `share/builder-config.ts:302`。
- 引擎编译缓存：`useCache` 默认开（`worker/builder/index.ts:707`），ccbuild 侧另有 `useCacheForce`、`signatureProvider`（参数签名复用）。
- 纹理压缩缓存：`storedCompressInfo` 持久化于 temp（`texture-compress/index.ts`）。
- 资源序列化缓存：temp/asset-db 下 `build{BUILD_ASSET_CACHE_VERSION}` 目录（`core/builder/cache.ts`），配套 `clearCache(scope)` API。
- `options.useCache`：true 时跳过 `emptyDirSync(dest)`（`run()` 内），是增量输出的基础。
- 计时埋点已存在：`newConsole.trackTimeStart/End`，标签包括 `builder:build-project-total`、`builder:build-engine`、`builder:build-project-script`、`builder:compress-texture`、`builder:pack-auto-atlas-image`、`assets:start-database` 等；每次构建日志落盘 `temp/builder/log/{platform}-{action}-{timestamp}.log`（`core/builder/index.ts` `ensureBuildLogSink`）。

### 1.3 主要瓶颈（按预期收益排序）

1. **串行子进程**：脚本编译与引擎编译先后 await，两者各需数十秒级；多核机器上白白浪费一半时间。
2. **主线程 CPU 密集**：Bundle 序列化、settings 生成、md5、依赖遍历均在主线程，无法利用多核，且阻塞进度心跳与日志。
3. **冷启动开销**：CLI 每次构建都要完整走 `Launcher.import()`（Project/Engine/Scripting/AssetDB），AssetDB 冷导入约 1 分钟；CI 上无常驻进程可复用。
4. **缓存命中面窄**：`serializeData` 等缓存 key 未覆盖全部影响因素时会被保守失效；`useCache=false` 时直接清空输出目录，增量能力未充分利用。
5. **纹理压缩并发上限固定**：`childProcess > numCPUs` 硬编码，高核数 CI 机器与低配开发机无法分别调优。

---

## 二、总体路线

```
Phase 0  度量基线（1 周内）        —— 没有 profile 就不动手改
Phase 1  低风险速赢（1-2 周）       —— 并行子进程 / 缓存默认化 / 并发上限可配
Phase 2  管线级并行（2-4 周）       —— 阶段重排 + worker_threads 池
Phase 3  增量与远程缓存（4-8 周）   —— 内容寻址增量 + CI 缓存复用
Phase 4  远期（评估后再立项）       —— Bundle 级分布式构建
```

每个 Phase 独立可发布、可回滚，验收标准见第五节。

---

## 三、分阶段实施细节

### Phase 0：度量基线（前置条件，必须先做）

**P0-1 构建 Profile 报告 ✅（已实现）**
- 用法：`cocos build -j <project> -p <platform> --profile`，或设置环境变量 `COCOS_BUILD_PROFILE=1`（对 make/run/upload/publish/bundle 构建同样生效，Pink/MCP 路径也可用环境变量开启）。
- 实现：`src/core/builder/profile.ts`（`buildProfiler` 单例 + `profiled()` 包裹函数），构建结束（无论成败）在构建日志同目录生成 `profile-{taskId}.json`。
- 插桩点：
  - 任务级：`runBuildTask` 中每个 data/build/setting/postprocess/md5 task（`worker/builder/index.ts`）；
  - 阶段级：`run()` 中 init / initBundleManager / dataTasks / buildTasks / settingTasks / postprocessTasks / copyBuildTemplate / md5Tasks / postBuild / subTaskBuilds / nextStages 各作用域；
  - 插件钩子级：`task-base.ts` `runPluginTask` 每个 `hook:{pkgName}:{funcName}`；
  - 子进程级：build-script / build-engine / polyfills / systemjs 的墙钟时间（`asset-handler/script/*.ts`）；
  - stage 任务：make/run/upload/publish（`executeBuildStageTask`、`handleBuildStageTask`）。
- 报告结构：`meta`（taskId/platform/总耗时/成败/退出码/机器环境 CPU 核数与内存）、`entries[]`（name、stage 作用域路径、startOffsetMs、durationMs、heapUsed/rss 起止 MB、error）、`summary`（按 stage 聚合 + Top10 耗时榜）。
- 保障：未开启时全部 API 早退近零开销；报告写盘失败只 debug 日志，绝不影响构建结果；构建中途异常时未闭合任务会被强制闭合并标记。
- 单测：`src/core/builder/test/build-profile.spec.ts`（5 用例，模块级）+ `build-profile-pipeline.spec.ts`（2 用例，用 mock 管线驱动真实 `BuildTask.run()`，验证阶段/任务/stage 三级插桩与失败构建的错误记录）。
- 端到端验证：`asset-operation` fixture 工程 web-mobile 真实构建（11.7s，26 条 entry）。首份报告即印证 P1-1：`Package scripts` 占总耗时 95%，其中 `subprocess:build-polyfills` 8.2s / `build-systemjs` 1.3s / `build-script` 0.4s **串行**执行。详细分析见 [build-profile-analysis-asset-operation.md](./build-profile-analysis-asset-operation.md)。

**P0-2 基准工程与基准脚本**
- 在 `tests/fixtures/projects/` 选取/构造 3 档基准工程：小（<100 资源）、中（千级资源 + 多 Bundle）、大（含大量纹理压缩）。
- 新增 `npm run bench:build`（放 `workflow/`），对每档工程跑冷构建/热构建各 3 次，输出耗时矩阵，结果 JSON 存 `temp/bench/`。
- CI 上加夜间任务，跟踪 `builder:build-project-total` 趋势，性能回退 >10% 报警。

**产出**：拿到"当前耗时都花在哪"的真实数据，后续每项优化用同一基准验收。

---

### Phase 1：低风险速赢

**P1-1 脚本编译与引擎编译并行（预期收益最大的单项）**
- 📄 详细落地方案已成文：[build-script-parallelization-plan.md](./build-script-parallelization-plan.md)（含代码事实盘点、依赖 DAG、文件级改造清单、S1/S2/S3 分阶段实施与验收标准）。
- 现状：`tasks/build-task/script.ts` 中先 `await this.bundleManager.buildScript()`（build-script 子进程），再 `await buildEngineX(...)`（build-engine 子进程），最后 `queryEngineImportMap(metaFile, ...)`。
- 改造：两个 `runTask` 已经是**不同名子进程**（`build-script` / `build-engine`），进程池天然支持并存。将两者改为 `Promise.all` 并行发起，`queryEngineImportMap` 等引擎结果就绪后再执行（它只依赖引擎的 `metaFile`，不依赖项目脚本产物——**落地前需用 P0 profile + 产物 diff 验证该依赖假设**）。
- 风险与对策：
  - 内存：两个 rollup 级进程同时跑，峰值内存约翻倍。子进程 `execArgv` 已支持独立配置（`WorkerManager.defaultArgv`），给 build-engine 子进程单独限 `--max-old-space-size`；低内存机器（<16G）通过 `useCacheConfig` 同级新增 `parallelScriptEngine: boolean` 开关降级为串行。
  - 日志交错：两个子进程 stdout 已带 `[name]` 前缀（`sub-process-manager.ts` createWorkerProcess），且各自有 `logDest` 分文件，可接受。
  - 中断语义：`workerManager.killRunningChilds()` 已按 runningPool 全杀，行为不变。

**P1-2 缓存默认化与命中率修复**
- 审计 `useCacheConfig` 四项在 CLI 路径的实际默认值（`share/builder-config.ts:302,489`），确保 CLI 与 Pink 一致默认开启；`cocos build` 文档（`docs/zh|en/commands.md`）明示各缓存开关与 `clearCache` 的关系。
- 引擎缓存：核对 ccbuild `signatureProvider` 的签名 key 是否覆盖 `includeModules/flags/targets/debug` 全部影响项（`worker/builder/index.ts:695-710` 的 `md5Map` 目前为空数组，需确认是否有遗漏导致缓存失效或错误命中）。
- 纹理压缩缓存：确认 `storedCompressInfo` 的失效 key 包含工具版本与压缩参数 hash，避免"参数改了仍命中旧图"。

**P1-3 纹理压缩并发上限可配置**
- `texture-compress/index.ts:12,456` 的 `numCPUs` 上限改为 `min(numCPUs, options.textureCompressConcurrency ?? Infinity)`，暴露到构建选项（同时进 `getPlatformBuildSchema`，注意 hidden 键处理规则与当前分支保持一致）。
- CI 高核机器可直接调大；`parallelism: false` 的格式仍受串行约束，不改语义。

**P1-4 CLI 热构建路径（增量输出）**
- `run()` 中 `!options.useCache` 即 `emptyDirSync(dest)`。为 CLI 增加 `--incremental`（映射 `useCache: true`），并在文档标注适用场景（同工程反复出包/CI 缓存卷）。
- 前提：确认各 task 对残留产物的覆盖写是完备的（setting/postprocess/template copy 均全量覆盖；md5 任务需重点验证），P0 基准里加"增量 vs 全量产物 diff"用例。

**验收**：中档基准工程热构建端到端耗时下降 ≥25%（P1-1 贡献主体），产物二进制 diff 为空（md5 清单一致）。

---

### Phase 2：管线级并行

**P2-1 阶段重排：脚本编译提前与 dataTasks 重叠**
- 依赖分析：`data-task/asset`（Bundle 资源数据整理）与 `build-task/script`（项目脚本编译）之间，脚本编译只依赖 AssetDB 的资源信息（`init()` 已全量查询），不依赖 dataTasks 产物。
- 改造：`run()` 中在 `init()` 完成后即**发起**（不 await）脚本编译子进程 Promise，dataTasks 结束后再汇合；buildTasks 内 script 任务改为等待该 Promise。
- 约束：`TaskManager.tasks.buildTasks` 注释明确"注意先后顺序，不可随意调整"——重排只允许发生在**子进程任务的发起时机**，task 的完成顺序与插件钩子（onBeforeBuildAssets 等）触发点保持不变，确保插件兼容。

**P2-2 CPU 密集 JS 迁入 worker_threads 池**
- 候选（用 P0 profile 数据确认后再选 2-3 个）：
  - Bundle 序列化（`bundle/index.ts` 各 `Promise.all` 内的 pack/serialize 段）；
  - `settingTasks` 的 settings.json 生成与压缩（`postprocessTasks` 的 gzip/brotli）；
  - md5 任务（`postprocess-task/suffix`）的批量文件 hash。
- 实现：新增 `worker/worker-pools/thread-pool.ts`（与现有 `sub-process-manager.ts` 并列，命名对齐），固定大小 = `min(cpus-1, 4)`，任务以"纯函数 + 可结构化克隆参数"为约束；主线程只保留编排。
- 不做：不把 BuildTask 整体搬进线程（状态、EventEmitter、pluginManager 单例耦合太重，收益/风险比差）。

**P2-3 AssetDB 冷导入加速（CLI 场景）**
- 现状：`Launcher.import()` 每次全量走 `initAssetDB/startAssetDB`，冷导入约 1 分钟（`lib/project/project.ts` 注释）。
- 方案 A（低风险）：确认 `serializeData` 缓存目录（temp/asset-db `build{version}`）在 CI 上被正确复用，提供 `cocos build --warm-cache <dir>` 指定共享缓存卷。
- 方案 B（中风险）：为 CI 提供 `cocos daemon` 常驻模式（复用 `GlobalConfig.mode='hold'` 与 `start-mcp-server` 的存活机制），多次构建共享 AssetDB/Scripting 初始化；配 `--idle-timeout` 自动退出。此项与 Pink 的 lib 编排共用 Launcher，改造点集中。

**验收**：中档工程热构建再降 ≥20%；主线程最长单次阻塞（profile 中 `cpuTime` 单任务）< 2s。

---

### Phase 3：增量与远程缓存

**P3-1 内容寻址的资产级增量**
- 以"资源内容 hash + 导入器版本 + 目标平台参数签名"为 key，将序列化产物存入可寻址缓存（先本地 `temp/`，格式预留远程后端接口）。
- 命中时 dataTasks/buildTasks 的资源处理直接拷贝产物，未命中才走导入管线。`BuilderAssetCache`（`manager/asset.ts`）已持有全量资源信息，是天然的挂载点。
- 参考现有 `BUILD_ASSET_CACHE_VERSION` 机制，把版本号并入 key，升级导入器时自动整体失效。

**P3-2 CI 远程缓存**
- 引擎编译缓存优先上远程（体积可控、命中率高、key 已有 `signatureProvider` 基础）：后端可先用共享盘/OSS + 文件锁，接口收敛到 `cache.ts` 的 `BuildCacheScope` 上扩展 `remote`。
- 纹理压缩缓存其次（单文件小、数量多，需打包上传）。
- 安全：远程缓存只存产物与 key，不存源码；key 碰撞用内容 hash 兜底校验。

**P3-3 nextStages 阶段任务并行评估**
- `handleBuildStageTask` 对多平台（`stagePlatforms.length > 1`）目前逐个 `runStageForPlatform`；对互不依赖的平台（如 web-desktop + web-mobile 子任务）可并行。先用 profile 确认多平台构建占比再决定是否投入。

**验收**：CI 场景（干净 workspace + 远程缓存卷）中档工程构建耗时逼近本地热构建（±15%）。

---

### Phase 4：远期方向（仅立项评估，不在本期实施）

- Bundle 级分布式构建：多机各构建部分 Bundle，主节点合并 settings 与产物；前提是 P3-1 的内容寻址缓存先落地。
- 引擎预编译产物分发：常用 `includeModules` 组合的官方预编译缓存（配合 `build:cc-module` 现有产物）。

---

## 四、兼容性与风险清单

| 风险 | 影响 | 对策 |
|---|---|---|
| 插件钩子顺序变化 | 第三方构建插件行为异常 | 所有并行化只改"发起时机"，钩子触发顺序与 task 完成顺序不变；每项改造跑全量 e2e（`npm run test:e2e`） |
| 并行子进程内存峰值 | 低配机 OOM | 提供降级开关（串行模式）；子进程独立 `--max-old-space-size` |
| 缓存错误命中 | 产物错误（最严重） | key 覆盖全部影响参数并加导入器/工具版本号；增量与全量产物 diff 纳入基准用例 |
| Pink 与 CLI 行为分叉 | IDE 构建结果与 CI 不一致 | 改造全部落在 `core/builder`，lib/api 门面不动；两路径共享同一基准工程验收 |
| `--incremental` 残留产物 | 脏输出 | md5/setting 任务重点验证；文档标注清理方式（`clearCache`） |

---

## 五、验收指标与执行排期

**核心指标**（以 P0 基准矩阵为准）：
1. 冷构建端到端耗时（三档工程 × web-mobile / android）；
2. 热构建端到端耗时；
3. CI 构建耗时（干净 workspace + 缓存卷）；
4. 产物一致性：增量/并行/缓存开关任意组合下，产物 md5 清单与全量基线一致；
5. 峰值内存不超过基线 × 1.8（并行子进程上限）。

**排期建议**：

| 阶段 | 工作量 | 依赖 |
|---|---|---|
| P0 度量基线 | 3-5 人日 | 无 |
| P1 速赢（4 项） | 5-8 人日 | P0 |
| P2 管线并行（3 项） | 10-15 人日 | P0/P1 数据 |
| P3 增量与远程缓存 | 15-25 人日 | P2-2、P3-1 先行 |
| P4 分布式 | 另行立项 | P3 |

**落地顺序强约束**：P0 未完成前，禁止合入任何以"提速"为名的管线改动（无数据不优化）。
