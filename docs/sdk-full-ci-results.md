# 完整 unit/E2E 版本矩阵结果

完成时间：2026-09-12T05:22:22.065Z。当前结果为 passed。

候选 CLI 为 0.0.1-alpha.41，覆盖冻结 Git tag 列表中所有符合兼容策略的版本，并额外验证正式版发布前的分支基线。

| 来源 | Commit | Unit | E2E | 结果 |
|---|---|---:|---:|---|
| 4.0.0-alpha.32 | 68552314c08a | 2458/2458 | 178/178 | 通过 |
| v4.0.0 临时分支基线 | f66365f959c6 | 2458/2458 | 178/178 | 通过 |
| 4.0.0-alpha.33 | 0c3f4534b870 | 2458/2458 | 178/178 | 通过 |

每组 unit 测试文件 217 个、E2E 测试文件 15 个；三组 pending 合计 0。每组同时通过精确引擎身份检查、必需接口检查、最小项目导入 / Web 构建和 MCP 类型生成。Unit 和 E2E 均使用原有完整 Jest 配置，未按测试名称筛选；两个测试进程均要求退出码 0 和有效成功 JSON 报告。

## 环境和证据

- 平台：win32 / x64，Node v22.22.0，ABI 127。
- CLI revision：sha256:eefa4b5022134e0e7d24413b1dc084a13092cd3f046fe9c23174e2bf70734093。
- 汇总报告：`.publish/full-ci-matrix-3/report.json`。
- 每组证据：`.publish/full-ci-matrix-3/pair-N/{ci-tests,unit,e2e}.json` 和对应日志。
- Git 来源：`.publish/tag-sdk-matrix-first/source-report.json`、`git-refs.snapshot.txt`、`catalog.json`。
- Engine revisions：
  - 4.0.0-alpha.32: sha256:2f9f22fc61821e6ecf8c9b59580a8861d08ef60255dd1f1f3e668b93cf8f48e0
  - v4.0.0 临时分支基线: sha256:03437a30aa40dac947d878c6659ec16d5f212826f0a6a8524650dadaa81f2d33
  - 4.0.0-alpha.33: sha256:8ef248caa95bb1c6ca9b23e0a1aee20218d118af4039e38315462658e7697bed

## 测试接入与修复

新增 workflow/sdk-ci-tests.js；矩阵为每个引擎准备独立源码、测试、依赖和 fixture，校验候选 dist 摘要。测试副本通过 config.local.json、引擎别名和 cc 声明统一绑定本轮 SDK，包含 CI 配置回归所需 .github 和 .vscodeignore。测试副本关闭 Sentry 遥测。Unit 失败仍继续 E2E 收集证据；任一必需阶段失败、超时或缺少结果，组合及总矩阵均失败。

完整 E2E 发现并修复 Web Mobile 模板路径以及 native-common / iOS 两处 builtin 引擎路径引用，改为实际选中的引擎路径。tsc -b 通过；兼容性、路径选择和矩阵 58 项回归通过；新增 workflow JavaScript ESLint 和 YAML 解析通过。旧构建文件整体 lint 仍有未涉及修改行的已有问题，不能宣称仓库整体 lint 通过。

## 复跑

已有引擎产物可直接复跑完整测试，output 必须为新目录：

```powershell
node workflow/sdk-matrix.js --catalog .publish/tag-sdk-matrix-first/catalog.json --cli .publish/sdk/full-ci-candidate --test-root . --output .publish/full-ci-rerun
```

重新枚举远端并准备所有兼容 tag：

```powershell
npm run test:sdk-tags -- --cli .publish/sdk/full-ci-candidate --test-root . --output .publish/full-ci-tags-rerun
```

## 覆盖边界

当前远端受支持 tag 只有 alpha.32、alpha.33；没有正式 4.0.0 / 历史稳定版或后继 4.1.0 可实际验收。分支基线保留实际预发布版本号。macOS CI 目标已配置，与现有 PR CI 同时覆盖 Windows 2022 / macOS、Node 22.17.0，远端 CI 及 macOS 结果待验证。

新增 tag matrix 工作流必须通过完整矩阵才提供 verified-cli-sdk 产物；旧独立发布链路尚未全部改为依赖此门禁。完整测试证明所覆盖场景通过，不能保证任意用户项目、设备、渲染或性能场景都无回归。
