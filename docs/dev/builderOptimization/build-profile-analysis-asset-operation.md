# 首份构建 Profile 报告分析（asset-operation / web-mobile）

> 数据来源：`--profile` 功能（见 [build-performance-optimization.md](./build-performance-optimization.md) P0-1）落地后的首次真实端到端构建。
> 报告原文件：[profile-1789549685183.json](./profile-1789549685183.json)（同目录存档，原始输出位置 `tests/fixtures/projects/asset-operation/temp/builder/log/`）
> 采集日期：2026-09-16，分支 `fix/builder-hidden-schema-options`。

---

## 一、测量环境与命令

| 项 | 值 |
|---|---|
| 命令 | `node dist/cli.js build -j tests/fixtures/projects/asset-operation -p web-mobile --profile --no-interactive` |
| Node | v22.23.1（原生模块已 `npm run rebuild:node-gyp` 切至 Node ABI 127） |
| 机器 | Intel Core i9-14900HX，32 核，32 GB 内存，win32 x64 |
| 构建结果 | 成功（code 0），总耗时 **11 673 ms** |
| Entry 数量 | 26 条（阶段级 / 任务级 / 插件钩子级 / 子进程级全覆盖） |

⚠️ 注意样本局限：这是**小型 fixture 工程**（几十个资源）+ **冷缓存**首跑，绝对数值不能代表真实游戏工程；但耗时**结构**（占比分布）对优化方向有直接参考价值。

---

## 二、耗时结构总览

### 2.1 时间线（按 startOffsetMs 排序的关键节点）

```
offset(ms)  时长(ms)  条目
────────────────────────────────────────────────────────────
      7         1     init
     19        77     dataTasks（asset_bundle 75ms）
     97     11054     Package scripts（build-task/script）★ 占总耗时 94.7%
     98      8210       ├─ subprocess:build-polyfills   ★★ 单项占总耗时 70.3%
   8308      1303       ├─ subprocess:build-systemjs       占 11.2%
   9611→10442 (~831)    ├─ （间隙：主线程引擎 importMap 等处理）
  10442       424       └─ subprocess:build-script         占 3.6%
  11151       330     Build Assets（bundle 序列化/纹理输出）
  11482         3     settingTasks
  11486       133     postprocessTasks（template）
  11645        25     md5Tasks（suffix）
  11671         1     postBuild
```

### 2.2 按阶段聚合（summary.byStage）

| 阶段 | entry 数 | 合计耗时 | 占比 | 说明 |
|---|---|---|---|---|
| buildTasks | 5 | 11 385 ms | **97.5%** | 含嵌套子进程，全部集中在脚本打包 |
| postprocessTasks | 1 | 133 ms | 1.1% | 静态模板整理 |
| dataTasks | 2 | 77 ms | 0.7% | asset_bundle 序列化 |
| md5Tasks | 1 | 25 ms | 0.2% | 资源加 md5 后缀 |
| settingTasks | 3 | 3 ms | ~0% | settings.json 生成 |
| 插件钩子（root） | 6 | ~27 ms | ~0.2% | onAfterInit / onBeforeCompressSettings / onBeforeCopyBuildTemplate / onAfterBuild 等 |

---

## 三、核心发现

### 发现 1：三个子进程严格串行，是压倒性瓶颈（印证 P1-1 / P2-1）

`build-polyfills → build-systemjs → build-script` 三个 fork 子进程**首尾相接**（98 + 8210 = 8308，正好是 systemjs 的开始偏移），中间没有任何重叠。整个链条 9 937 ms + 间隙 831 ms，占端到端 92%。

- 这 32 核机器上，子进程运行期间主进程**完全空闲**（内存数据佐证：polyfills 运行的 8.2s 内父进程 heap 从 862 MB 被 GC 回收到 274 MB、rss 从 1 081 MB 降到 431 MB——典型的"等待中无事可做"曲线）。
- 若三者并行（P1-1）或与 dataTasks 重叠发起（P2-1），理论下限 = max(8210, 1303, 424) ≈ 8.2s，**该项即可省约 1.7s（-15%）**；若 polyfills 缓存命中则收益更大。

### 发现 2：build-polyfills 单项 8.2s，可疑地慢（指向 P1-2 缓存审计）

polyfills 是**引擎侧静态产物**，与项目代码无关，理论上应该有极高的缓存命中率。冷缓存首跑 8.2s 可以理解，但如果热构建仍这么慢，说明缓存 key 或复用逻辑有问题。

**待办**：对同一工程连跑第二次（热构建），对比 `subprocess:build-polyfills` / `build-systemjs` 的耗时变化；若热构建无显著下降，优先审计 `useCacheConfig.engine` 与 ccbuild `signatureProvider` 的 key 覆盖（P1-2）。

### 发现 3：主线程阶段（data/setting/postprocess/md5）在此工程上完全不是瓶颈

合计 < 250 ms。P2-2（worker_threads 池）对本类工程无收益，**必须等真实中大型工程的 profile 数据再决策**——这正是"无数据不优化"原则的体现。

### 发现 4：插件钩子开销可忽略

6 个钩子合计 ~27 ms（最大单项 onBeforeCopyBuildTemplate 24 ms）。`runPluginTask` 插桩不会引入可感知误差，profile 自身开销也可忽略（26 条 entry 的采样成本 < 1 ms）。

### 发现 5：子进程间存在 ~831 ms 主线程间隙

systemjs 结束（9611ms）到 build-script 发起（10442ms）之间约 0.8s 在主线程处理（引擎 importMap 查询等）。P2-1 阶段重排时应把这段也纳入重叠范围。

---

## 四、对优化路线的修正输入

| 优化项 | 本次数据的结论 |
|---|---|
| **P1-1 脚本/引擎并行** | ✅ 优先级确认最高：串行链条占 92%+，并行理论收益 -15% 起（本工程），引擎编译占比高的真实工程收益更大 |
| **P1-2 缓存审计** | ⬆ 升级紧迫性：polyfills 8.2s 异常，需热构建对比数据；若缓存失效，修复比并行化收益更直接 |
| **P2-1 发起时机提前** | ✅ 可行：dataTasks 仅 77ms 且与脚本编译无依赖冲突，间隙 831ms 也可重叠 |
| **P2-2 worker_threads** | ⏸ 暂缓：主线程阶段合计 <250ms（小工程），等中大型工程数据 |
| **P0-2 基准工程** | ⬆ 下一步必做：本 fixture 太小，需要"中档（千级资源+多 Bundle）"和"含大量纹理压缩"两档工程重跑 profile 才能定 P2/P3 优先级 |

---

## 五、附录：完整 entry 明细

格式：`offset(ms) | 时长(ms) | stage | name | heap 起→止 | rss 起→止`

```
     7 |      1 | (root)            | init                                        | 856.1→856.4  | 1070.9→1070.9
     8 |      1 | (root)            | hook:web-mobile:onAfterInit                 | 856.4→856.4  | 1070.9→1071.0
     9 |     10 | (root)            | initBundleManager                           | 856.5→858.0  | 1071.0→1071.5
    18 |      0 | initBundleManager | hook:web-mobile:onAfterBundleInit           | 857.8→857.9  | 1071.5→1071.5
    19 |     77 | (root)            | dataTasks                                   | 858.0→861.9  | 1071.5→1080.8
    20 |     75 | dataTasks         | data-task/asset_bundle                      | 858.0→861.4  | 1071.5→1080.7
    95 |      1 | dataTasks         | data-task/asset_script                      | 861.6→861.8  | 1080.8→1080.8
    97 |  11054 | buildTasks        | Package scripts                             | 862.0→275.0  | 1080.8→433.0
    97 |  11385 | (root)            | buildTasks                                  | 861.9→289.4  | 1080.8→453.3
    98 |   8210 | buildTasks        | subprocess:build-polyfills                  | 862.0→273.6  | 1080.8→430.7
  8308 |   1303 | buildTasks        | subprocess:build-systemjs                   | 273.6→273.7  | 430.7→429.3
 10442 |    424 | buildTasks        | subprocess:build-script                     | 274.2→274.2  | 431.7→431.8
 11151 |    330 | buildTasks        | Build Assets                                | 275.1→289.3  | 433.0→453.3
 11482 |      3 | (root)            | settingTasks                                | 289.4→289.9  | 453.3→454.6
 11483 |      0 | settingTasks      | Organize some build option data to settings | 289.4→289.5  | 453.4→453.4
 11483 |      0 | settingTasks      | Fill script data to settings.json           | 289.5→289.5  | 453.5→453.5
 11484 |      1 | settingTasks      | Organize some build option data to settings | 289.6→289.8  | 453.7→454.5
 11485 |      0 | (root)            | hook:web-mobile:onBeforeCompressSettings    | 289.9→289.9  | 454.6→454.7
 11486 |    133 | (root)            | postprocessTasks                            | 290.0→286.0  | 454.8→461.0
 11486 |    133 | postprocessTasks  | build-task/template                         | 290.0→286.0  | 455.0→461.0
 11619 |     24 | (root)            | hook:web-mobile:onBeforeCopyBuildTemplate   | 286.0→290.3  | 461.0→461.1
 11644 |      0 | (root)            | copyBuildTemplate                           | 290.4→290.4  | 461.1→461.1
 11645 |     25 | (root)            | md5Tasks                                    | 290.4→288.0  | 461.1→463.4
 11645 |     25 | md5Tasks          | build-task/suffix                           | 290.4→288.0  | 461.1→463.4
 11670 |      1 | (root)            | hook:web-mobile:onAfterBuild                | 288.0→288.2  | 463.4→463.6
 11671 |      1 | (root)            | postBuild                                   | 288.3→288.3  | 463.6→463.6
```

（内存单位 MB。`Package scripts` 的 heap 862→275MB 大幅下降是子进程等待期间父进程 GC 所致，非任务本身释放。）
