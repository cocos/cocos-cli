# 脚本打包环节并行化落地方案（P1-1 / P2-1）

> 前置阅读：[build-performance-optimization.md](./build-performance-optimization.md)（总路线）、[build-profile-analysis-asset-operation.md](./build-profile-analysis-asset-operation.md)（数据依据）。
> 目标：消除 `build-task/script`（"Package scripts"）内 polyfills / systemjs / tsc 检查 / 项目脚本编译 / 引擎编译的串行等待，实测样本中该链条占总耗时 **92~95%**。
> 所有改动收敛在 `src/core/builder`，不触碰插件钩子顺序与 task 完成顺序，Pink（lib）与 CLI（api）两条门面路径自动同时受益。

---

## 一、现状机制（代码事实盘点）

### 1.1 当前执行序（`tasks/build-task/script.ts` `handle()`）

```
await buildPolyfills          子进程命令①  ┐
await buildSystemJs           子进程命令②  ├ 全部走同一个名为 'build-script' 的 worker
await bundleManager.buildScript()          │
   ├─ initProjectOptions      主线程（getCCEnvConstants + querySharedSettings）
   ├─ runStaticCompileCheck   exec tsc 独立进程（样本中 ~0.8s 间隙）
   └─ buildBundleScript       子进程命令③ buildScriptCommand
await buildEngineX / buildSplitEngine      子进程 'build-engine'（已独立命名）
   └─ queryEngineImportMap    主线程
拷贝插件脚本 → outputImportMap  主线程（合并点）
```

### 1.2 关键代码事实

| # | 事实 | 位置 | 对方案的影响 |
|---|---|---|---|
| F1 | 三个命令 `buildPolyfillsCommand` / `buildSystemJsCommand` / `buildScriptCommand` 都注册到**同名** worker `'build-script'`，复用同一子进程（首个命令承担 fork + require rollup/babel 的冷启动，后续命令是热进程） | `asset-handler/script/index.ts:172-209` | 并行化必须**拆分为不同名 worker**，否则见 F2 |
| F2 | `WorkerTask.execute()` 直接覆写 `_method/_resolve/_reject/_logDest`，同名 worker 并发调用第二个请求会**覆盖第一个的回调**，响应错乱 | `worker-pools/sub-process-manager.ts:145-165` | 同名并发是未定义行为，方案必须一名一进程 |
| F3 | 子进程执行完 `execute-script` 后**不退出**，等待复用；`buildBundleScript` 结束后显式 `workerManager.kill('build-script')` | `sub-process.ts:15-25`、`index.ts:189` | 拆分后每个 worker 用完即 kill，行为对齐现状 |
| F4 | `createWorkerProcess` 的 `execArgv` 固定取 `WorkerManager.defaultArgv`，`ITask.options`（ForkOptions）里即使传了 `execArgv` 也被忽略 | `sub-process-manager.ts:175-184` | 需小改：`this.options?.execArgv ?? WorkerManager.defaultArgv`，实现每进程独立内存上限 |
| F5 | `runStaticCompileCheck` 是 `exec('tsc ...')` 独立进程，主线程纯等待；当前仅 `buildBundleScript` 一个调用点（CLI 路径无重复执行） | `static-compile-check.ts:88`、`index.ts:152` | 可与 polyfills/systemjs 子进程重叠 |
| F6 | 引擎编译依赖 `ScriptBuilder.projectOptions.ccEnvConstants`（由 `initProjectOptions` 填充的**静态属性**） | `script.ts:76`、`index.ts:98-122` | 引擎子进程最早发起时机 = `initProjectOptions` 完成后 |
| F7 | `buildPolyfills` / `buildSystemJs` / `bundleManager.buildScript` 的调用点只有 `tasks/build-task/script.ts` 与 `asset-handler/bundle/index.ts:774`（`Facet._buildSystemJs` 是预览路径，无关） | grep 全仓 | 改造影响面封闭 |
| F8 | 子进程 stdout/stderr 已带 `[${this.name}]` 前缀；`logDest` 经 `recordChildLog` 以追加方式写同一构建日志 | `sub-process-manager.ts:203-219`、`sub-process.ts:44-57` | 拆名后前缀天然可区分；多进程追加同一日志文件仅行级交错，可接受 |
| F9 | `workerManager.killRunningChilds()` 按 runningPool 全杀，中断语义与进程名无关 | `sub-process-manager.ts:291` | 构建中断行为不变 |

### 1.3 为什么冷启动成本不用担心

拆分后 polyfills/systemjs/build-script 三个进程各自承担一次 `require('./build-script')`（rollup+babel 加载，秒级）。但三者是**并行支付**这份成本，墙钟 ≈ max(单进程冷启动+任务) 而非现在的"一次冷启动 + 三段串行任务"。样本中 polyfills 冷启动全程 8.2s，并行后它仍是关键路径，systemjs/build-script 的冷启动被完全隐藏。

---

## 二、依赖 DAG（目标执行序）

```
时间 →
A  polyfills 子进程        ████████████████┐
B  systemjs 子进程         ██████┐         │
C1 initProjectOptions(主)  ██┐   │         │
C2 tsc 静态检查(exec)        ████┤         ├→ 合并点 M
C3 build-script 子进程          ████████┐  │
D  build-engine 子进程          ███████████████┤（skip 时无此单元）
                                M: importMap 合并 / 插件拷贝 / outputImportMap
```

- A、B 无任何前置依赖，`handle()` 一进来就发起；
- C2 依赖 C1 之外无依赖（tsconfig 路径固定），但为保持"检查不过则不编译"的语义，C3 需等 C1+C2；
- D 仅依赖 C1（F6），与 C3 并行；
- M 等 A/B/C3/D 全部完成：`result.importMap` 需要 C3 的 `importMappings` 与 D 的 `importMaps` 两路合并，`result.paths.polyfillsJs` 取决于 A 的返回值，`result.scriptPackages` 来自 C3。

墙钟从 `A+B+C1+C2+C3+D` 变为 `max(A, B, C1+C2+C3, C1+D)`。
样本估算：`max(8.2, ~2, 0.8+0.4, —) ≈ 8.2s` vs 现状 11.05s，**该任务 -26%**；真实工程（C3/D 为分钟级）收益 ≈ 整个 A+B+C2 时长被隐藏。

---

## 三、改造点清单（文件级）

### 3.1 `worker-pools/sub-process-manager.ts`（~10 行）

1. `createWorkerProcess`：`execArgv: this.options?.execArgv ?? (WorkerManager.defaultArgv || [])`（F4）。
2. `WorkerTask.execute` 开头加防御断言：`if (this._method) throw new Error(\`worker ${this._name} is busy with ${this._method}\`)`——把 F2 的未定义行为变成显式错误，防止未来有人再对同名 worker 并发调用。

### 3.2 `asset-handler/script/index.ts`（~30 行）

1. `buildPolyfills`：注册名改为 `'build-polyfills'`，`runTask` 后 `workerManager.kill('build-polyfills')`（对齐 F3 现状语义）。
2. `buildSystemJs`：注册名改为 `'build-systemjs'`，同上 kill。
3. `buildBundleScript` 拆出前置：
   ```ts
   /** C1：主线程前置（填充 ScriptBuilder.projectOptions 静态属性） */
   async prepareProjectOptions(options) { await this.initProjectOptions(options); }
   /** C2：静态编译检查（独立方法，便于编排层与 C3 之间插桩/复用） */
   async runCompileCheck() { /* 原 buildBundleScript 内 runStaticCompileCheck 段 */ }
   /** C3：仅子进程编译（原 buildBundleScript 去掉 C1/C2 段） */
   async buildBundleScript(bundles) { /* 保留原签名与返回值 */ }
   ```
   `buildBundleScript` 对外行为不变（内部依次调 C2+C3，C1 由 `BundleManager.buildScript` 已先行完成），确保其他潜在调用方兼容。
4. profile 插桩名不变（`subprocess:build-polyfills` / `subprocess:build-systemjs` / `subprocess:build-script`），报告口径前后可对比。

### 3.3 `asset-handler/bundle/index.ts`（~10 行）

`BundleManager.buildScript()` 拆为两段（保留原方法作为串行入口，供开关降级用）：

```ts
async prepareScriptBuild() {          // C1
    if (this.options.buildScriptParam && !this.options.buildScriptParam.commonDir) {
        this.options.buildScriptParam.commonDir = join(this.destDir, 'src', 'chunks');
    }
    await this.scriptBuilder.initProjectOptions(this.options);
}
async buildScriptCompiled() {         // C2 + C3，需在 prepareScriptBuild 之后调用
    await this.scriptBuilder.runCompileCheck();
    return await this.scriptBuilder.buildBundleScript(this.bundles);
}
```

### 3.4 `tasks/build-task/script.ts`（核心重排，~80 行）

```ts
export async function handle(this: IBuilder, options, result, cache) {
    newConsole.trackTimeStart('builder:build-script-total');
    const parallel = canParallelScriptBuild(options);   // 见 3.5

    // 无依赖单元立即发起
    const polyfillsPromise = ScriptBuilder.buildPolyfills(polyfills, result.paths.polyfillsJs!);
    const systemJsPromise = ScriptBuilder.buildSystemJs({ ... });

    // C1 完成后 D（引擎）即可发起，与 C2/C3 并行
    const preparePromise = this.bundleManager.prepareScriptBuild();
    const scriptPromise = (async () => {
        await preparePromise;
        return await this.bundleManager.buildScriptCompiled();
    })();
    const enginePromise = (async () => {
        if (options.buildEngineParam.skip) return undefined;
        await preparePromise;                 // F6：等 ccEnvConstants
        return await buildEngineUnit(...);    // 原 buildEngineX/buildSplitEngine + queryEngineImportMap 段
    })();

    if (!parallel) { /* 降级：按原顺序 await（保留旧路径，见 3.5） */ }

    // 合并点 M：fail-fast + 清场
    let results;
    try {
        results = await Promise.all([polyfillsPromise, systemJsPromise, scriptPromise, enginePromise]);
    } catch (error) {
        killScriptWorkers();                  // 'build-polyfills'/'build-systemjs'/'build-script'/'build-engine'
        throw error;                          // 保留 STATIC_COMPILE_ERROR 等错误码语义
    }
    // …原有合并逻辑不变：scriptPackages / importMappings / engineMeta / importMaps /
    //   hasPolyFill→paths.polyfillsJs / 插件拷贝 / outputImportMap
}
```

要点：
- **合并逻辑一行不动**（importMap 两路合并、polyfillsJs 删除分支、插件拷贝），只是数据到达方式从"顺序 await"变为"Promise.all 解构"；
- `updateProcess` 改为在各单元发起/完成时发送（`[parallel] polyfills done` 等），进度条不再严格线性，但心跳机制（task-base）不受影响；
- 错误路径：任一单元抛错 → kill 全部四个 worker → 抛出**第一个**错误。兄弟 Promise 的 rejection 用 `.catch(() => {})` 挂空处理，避免 unhandledRejection。

### 3.5 开关与降级（`@types` + schema，~20 行）

```ts
// IInternalBuildOptions 顶层
parallelScriptBuild?: boolean;   // 默认 undefined → 自动判定
```

自动判定 `canParallelScriptBuild(options)`：
1. `options.parallelScriptBuild === false` → 串行；
2. `os.totalmem() < 8GB` 或 `os.cpus().length < 4` → 串行（四个 node 进程 + rollup 各自数百 MB RSS，低配机保守）；
3. 其余 → 并行。

schema 暴露：进 `getPlatformBuildSchema` 时按当前分支 `fix/builder-hidden-schema-options` 的 hidden 键处理规则（hidden 的 key 同步删 `item.default`），避免平台面板出现半成品选项。环境变量 `COCOS_BUILD_SERIAL_SCRIPT=1` 作为 CI 应急逃生门（优先级高于选项）。

### 3.6 内存策略

- `build-polyfills` / `build-systemjs` 注册时传 `options: { execArgv: [...WorkerManager.defaultArgv, '--max-old-space-size=4096'] }`（依赖 3.1-1）；
- `build-script` / `build-engine` 维持现状（不新增上限，避免大工程 OOM 回归）；
- 并行模式下监控点：样本显示父进程等待期 heap 会被 GC 到 ~280MB，父进程本身不是内存压力源。

---

## 四、分阶段实施（每阶段独立可发布、可回滚）

| 阶段 | 内容 | 改动面 | 预期收益（样本/真实工程） |
|---|---|---|---|
| **S1** | A∥B∥C（polyfills/systemjs/build-script 三路并行，引擎保持原位串行） | 3.1 + 3.2(1,2) + 3.4(去掉 enginePromise) + 3.5 | 样本 Package scripts 11.05s → ~9s；真实工程隐藏 A+B 全程 |
| **S2** | C1 提前 + D∥C3（引擎并行，完成 DAG 全量） | 3.2(3) + 3.3 + 3.4 完整 + 3.6 | 真实工程再隐藏 min(引擎, 脚本) 的一路——通常数十秒~分钟级，**这是 P1-1 的主收益** |
| **S3**（可选加分） | tsc 静态检查结果缓存：以 `tsconfig + 脚本内容 hash` 为 key 存 temp，热构建跳过 C2 | static-compile-check.ts | 热构建 -0.8s（样本）；大工程 tsc 检查秒级~十秒级 |

S1 与 S2 的验收独立；若 S2 在真实工程暴露内存问题，可只回滚 S2（`enginePromise` 改回顺序 await），S1 不受影响。

---

## 五、测试与验收

### 5.1 单元测试（新增 `src/core/builder/test/`）

1. **WorkerManager 并发**：注册两个不同名 task（mock `child_process.fork`），并发 `runTask`，断言各自回调不串扰；同名并发调用触发 3.1-2 的 busy 断言。
2. **script.ts 编排（mock 层）**：仿 `build-task-next-stages.spec.ts` harness，mock `ScriptBuilder.buildPolyfills/buildSystemJs`、`bundleManager.prepareScriptBuild/buildScriptCompiled`、`buildEngineX`，断言：
   - 并行模式下 A/B/C1 的发起顺序（调用时 C1 尚未完成，A/B 已被调用）；
   - 合并点数据正确（importMappings 两路合并、polyfillsJs 删除分支、scriptPackages）；
   - 任一单元抛错 → 其余 worker 被 kill、抛出首个错误、无 unhandledRejection；
   - `parallelScriptBuild: false` / 低内存 mock 下走串行路径（调用顺序与现状一致）。
3. **profile 口径**：并行模式下 `subprocess:*` 三条 entry 的 `startOffsetMs` 应重叠（用真实 buildProfiler 断言 offset 区间相交），保证后续报告可验证并行生效。

### 5.2 端到端验收（每阶段合入前必跑）

```bash
# 基线（串行）与并行各跑 3 次，对比：
COCOS_BUILD_SERIAL_SCRIPT=1 node dist/cli.js build -j tests/fixtures/projects/asset-operation -p web-mobile --profile --no-interactive
node dist/cli.js build -j tests/fixtures/projects/asset-operation -p web-mobile --profile --no-interactive
```

1. **产物一致性（最高优先级）**：两次构建产物 md5 清单 diff 为空（`build/web-mobile-test` 全量文件 hash 对比脚本，落到 `workflow/` 备复用）；
2. **耗时**：`--profile` 报告中 `Package scripts` durationMs 下降、三个 `subprocess:*` offset 重叠；
3. **内存**：任务管理器/`process.memoryUsage` 采样，峰值 < 基线 × 1.8；
4. **进程清理**：构建结束与构建中断（Ctrl+C / `killRunningChilds`）后无残留 node 子进程；
5. **全量回归**：`npx jest src/core/builder`（现存 27 套件）+ `npm run test:e2e`。

### 5.3 真实工程验证（S2 合入门槛）

选一个含引擎编译的中型工程跑 `--profile`，确认：`subprocess:build-engine` 与 `subprocess:build-script` offset 重叠、总耗时下降 ≥ min(两者) 的 80%、无 OOM。

---

## 六、风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 同名 worker 并发回调串扰（F2） | 结果错乱（最严重） | 拆名（3.2）+ busy 断言（3.1-2）双保险 |
| 四进程并发内存峰值 | 低配机 OOM | 8GB/4 核自动降级（3.5）+ polyfills/systemjs 限 4G（3.6）+ 串行逃生门 |
| 多进程写同一日志文件 | 日志行交错 | 追加写 + `[name]` 前缀（F8），仅影响可读性；如不可接受，S2 后评估 per-worker logDest |
| 失败清场不彻底 | 残留子进程占内存 | 合并点 catch 统一 kill 四名 + 5.2-4 验收项 |
| 进度条非线性 | 用户体验变化 | updateProcess 消息带单元名；进度权重按单元重新分配（polyfills 0.1 / systemjs 0.05 / script 0.45 / engine 0.4） |
| 引擎与脚本并行改变 `result.importMap` 合并顺序 | importMap 键序不同 → 产物字节差异 | 合并仍按"先 script 后 engine"的固定顺序执行（Promise.all 结果数组序），与现状一致；5.2-1 的 md5 diff 兜底 |
| Pink 路径行为分叉 | IDE 与 CLI 不一致 | 改动全在 core/builder 共用层，lib 门面零改动；Pink 侧用环境变量同开关验证 |

---

## 七、工作量估算

| 项 | 人日 |
|---|---|
| S1（含单测 1/2 部分 + e2e 脚本） | 2 |
| S2（含 BundleManager 拆分、引擎并行、单测补全） | 2-3 |
| S3（tsc 检查缓存，可选） | 1 |
| 真实工程验证 + 基准对比报告 | 1 |
| **合计** | **5-7 人日** |

落地顺序强约束不变：S1 合入前先跑 5.2 基线采集，S2 合入前必须有 5.3 真实工程数据。
