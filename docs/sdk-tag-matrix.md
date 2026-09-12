# Git tag 全版本 SDK 验证

引擎历史版本来源为 `https://github.com/cocos/cocos4.git`。SSH 等价地址是 `git@github.com:cocos/cocos4.git`，流水线默认使用 HTTPS。不依赖预先存在的 Engine SDK 下载站。

## 枚举规则

1. 读取待测试 CLI SDK 内的 engine-compatibility.json，列出远端全部 tag。
2. 接受 SemVer tag 或带 v 前缀的 tag，用同一兼容性规则选择全部匹配版本；稳定 ~4.0.0 覆盖全部稳定 4.0.x，预发布系列按独立声明筛选。不只测试最老 / 最新版本。
3. 将 tag 固定到 commit；annotated tag 使用剥离后的 commit。下载后验证 HEAD，验证 package.json.version 与 tag 版本一致。不重写版本号以使测试通过。
4. 当前没有稳定 4.0.0 tag 时，额外测试 refs/heads/v4.0.0，仍固定本轮 commit，并读取实际包版本。出现 4.0.0 / v4.0.0 tag 后自动停止临时分支兜底。分支基线不是正式版。
5. 同版本的多个 tag / revision 均保留来源记录；只有产物版本和内容 revision 完全一致时合并相同的执行组合。分支或 tag 被移动会在下一份 commit 快照中体现。

来源规则在 workflow/engine-source-policy.json。每个历史引擎 checkout 的 native/external-config.json 决定其原生依赖仓库及 ref，另固定依赖 commit；不使用当前 CLI 的 repo.json 去覆盖历史引擎的原生依赖版本。不支持的旧配置结构明确失败，不能默默套用新版本配置。

## 本地运行

先按环境说明准备 CLI，生成独立 CLI SDK。输出目录必须不存在，工具不会删除或覆盖原目录。

```powershell
npm run pack:cli-sdk -- --output .publish/sdk/cli-candidate

# 只列出 tag / 临时基线及 commit，不构建
npm run test:sdk-tags -- --plan-only --output .publish/tag-plan

# 自动下载全部受支持 tag、准备依赖、编译 Engine SDK、执行测试
npm run test:sdk-tags -- --cli .publish/sdk/cli-candidate --output .publish/tag-run

# 框架单元测试
npm run test:sdk-matrix
```

每个 ref 在新目录 checkout，执行 npm ci、编译 editor / web dev-cli、独立打包。npm 生命周期仅在这个明确的源码准备步骤执行。引擎的依赖安装脚本仍可能安装工具自己的依赖；记录产物清单及依赖版本用于审计，跨日期构建的内容可能随依赖来源变化。

任一 ref 下载、安装、编译或打包失败，本轮失败并保留日志；不把成功的子集称为全版本通过。SDK 内容全部经 SHA256 验证，缓存按 kind / 平台 / 架构 / Node ABI / revision 分开，缓存损坏从来源重新获取并复验。

## 隔离执行及报告

每个 CLI / Engine 组合拥有独立 CLI、Engine、项目目录和 Node 进程。使用真实 SDK 文件副本，不用硬链接共享可写引擎缓存。模块加载守卫同时传给 Node 子进程，拒绝解析到开发仓库或其他组合。

复用现有 E2E 的 scene-2d 场景和贴图，作为 e2e/sdk-project 的最小夹具。执行器通过 SDK Launcher 导入资源、初始化引擎并构建 web-desktop，检查版本 / revision、必需接口、图层能力、index.html / assets / src 及项目实际初始化记录。此阶段验证导入和构建，不代替浏览器运行画面或 Native 构建验证。

报告包括：

- source-report.json：tag / 分支、引擎 commit、external commit、SDK 身份、每个源码构建状态。
- git-refs.snapshot.txt：本轮远端 ref 快照。
- catalog.json：本轮由源码生成的 SDK 索引，作为执行器输入，不是另一个人工维护的版本列表。
- matrix/report.json：目录快照摘要、平台 / ABI、逐组合状态、失败原因和结果。
- source-*/build.log、matrix/pair-*/build.log、result.json：源码构建及每组导入 / 构建证据。

单组默认 20 分钟超时，超时终止进程树并判失败；单个源码准备命令也有超时。失败保留产物及日志便于定位。源码准备全部通过和矩阵全部通过后，进程才返回 0。

## 无人值守 CI

.github/workflows/sdk-tag-matrix.yml 在面向 main 的 PR、main 更新、每日定时、手动运行及 engine-tag-published repository_dispatch 时触发。引擎打 tag 不会自然触发另一个仓库的 Actions；每日轮询能发现新增 tag，若要即时触发，需在引擎仓库发布流程中发送 repository_dispatch。

workflow/sdk-maintained-clis.json 声明仍受维护的 CLI ref、Node 和 runner。当前配置 main / Node 22.17.0，覆盖 Windows 2022 和 macOS；正式 CLI SDK 发布后应增加仍受维护的 CLI tag。PR 使用候选合并提交；定时和手动任务按维护列表构建各 CLI ref，再用候选自身的支持声明枚举 Engine tag。不会因某组失败取消其他维护版本的验证。

仅汇总门禁通过后，原始 CLI SDK 候选才以 cli.tar 上传为 verified-cli-sdk 制品，后续正式 SDK 发布必须使用同一份候选及其报告，不能重新构建后沿用旧测试结论。现有 legacy release / FTP / Electron 发布入口尚未改接这个独立 SDK 流程；新增工作流不代表这些旧发布入口已获得全版本发布门禁。

首次远程运行仍需仓库中存在这些修改，以及 runner 具备引擎原生依赖构建环境和 Git / npm 网络访问。Windows 已完成本地验证；macOS 已配置 CI，结果待远端验证。不同平台分别准备 SDK。

## 低层执行器

workflow/sdk-matrix.js 也支持读取本地或 HTTPS 索引来复用已经生成的 SDK。索引包含 schemaVersion、snapshotId、coverage、engines、clis；每个 SDK 描述具有 version、revision、manifestSha256、platform、arch、nodeAbi、location。HTTPS location 指向含元信息及原始文件的目录，拒绝重定向和内嵌凭据。

私有制品访问可用 SDK_CATALOG_TOKEN，只有 URL origin 等于 SDK_CATALOG_AUTH_ORIGIN 时发送 Bearer；令牌不会传入测试进程。它是缓存 / 已有产物复验入口，历史版本的主流程仍以 Git tag 为准。

本地样本索引标注 local；它不能满足 --require-published。含临时分支基线的源码索引也标注 local，以免被误认成正式版本全集。

中断后可对同一 --output 使用 --resume 恢复，要求原始 CLI SDK manifest 一致，并复用已固定的 Git ref 快照；已有 checkout 必须匹配 commit / origin 且无 tracked 改动。重试重新准备依赖并写入新 SDK 目录，不覆盖旧产物。

## 当前开发验证范围与后续 ZIP

开发阶段可指定单个受支持 tag 验证流程：

```powershell
npm run test:sdk-tags -- --validation-tag 4.0.0-alpha.33 --cli .publish/sdk/cli-candidate --output .publish/alpha33-validation
```

该模式要求存在且受支持的精确 tag，不会改版本号或回退到分支；报告记录 validationTag，索引标记为 local，仅用于单版本验证。省略 --validation-tag 时仍自动枚举全部受支持历史 tag。

工具复用规则：同一 CLI SDK 内的编译器和工具链共用；同一 external 仓库 / commit 的 Git 对象可复用下载缓存，各 tag 仍拥有独立工作目录。同一轮默认复用上一份 external checkout，跨轮可用 --external-cache <已下载的 external Git 仓库>。读取缓存前检查 origin 及目标 commit，下载后验证 HEAD；实际使用的命令保留在日志。npm 自身下载缓存可共用，但每个 tag 的 node_modules 仍按它自己的锁文件通过 npm ci 准备，不把另一版本的安装目录直接拿来用。

后续正式历史版本提供完整 ZIP，包含 Engine、工具及 node_modules 后，改为下载原始 ZIP、校验发布摘要、解压隔离并执行同一矩阵，不再安装依赖或编译引擎。仍检查平台 / Node ABI 和精确 revision。ZIP 的索引字段及解压接入在有正式产物格式后补齐；当前已实现本地 / HTTPS 原始 SDK 目录形式，尚不将 ZIP 当作现成支持项。Git tag 流程用于当前验证和缺少历史二进制包时的来源准备。
## 完整 CI 测试门禁

每个选中的 Engine SDK 都必须执行最小导入 / Web 构建、完整根目录 Jest unit 测试、MCP 类型生成和完整 E2E Jest 测试；任一项失败、超时、缺失 Jest 报告或发现零用例，组合及总矩阵均返回失败。Unit 失败后仍运行 E2E 以收集完整证据。沿用 CI 配置自带的平台分支和 skip，用例 pending 数单独记录，不宣称所有用例都在本机执行。

`--test-root` 指定对应 CLI 候选的已准备源码目录，默认当前 CLI 仓库。先比对候选版本及全部 dist 文件摘要，再复制源码、测试、依赖与测试资源到每组独立目录。Unit 测试源码，E2E 通过 `E2E_CLI_PATH` 运行该组 CLI SDK。测试副本的 `config.local.json`、历史用例所需 `packages/engine` 别名和 cc 声明统一指向该组 Engine SDK；开发仓库引擎不会被复制进测试目录。测试副本关闭 Sentry 遥测，不修改源仓库的遥测代码。

```powershell
npm run test:sdk-tags -- --cli .publish/sdk/full-ci-candidate --test-root . --output .publish/full-ci-tags
```

每组新增 `ci-tests.json`、`unit.json`、`unit.log`、`mcp-types.log`、`e2e.json` 和 `e2e.log`。汇总报告中的 `smokeStatus` 只代表最小构建；最终 `status` 同时包含完整 CI 测试结果。完整测试结果见 [版本矩阵验证结果](sdk-full-ci-results.md)。

新增的 tag matrix 工作流只有全矩阵通过才上传 `verified-cli-sdk`；既有独立 release 工作流尚未统一改为依赖此任务，不能宣称所有发布渠道已强制受此门禁控制。已完成的本地验证覆盖 Windows x64 / Node ABI 127，其他平台须在相应 CI runner 执行。

通过矩阵表示所执行用例覆盖的场景通过，不保证任意用户项目不会崩溃。实际项目运行、渲染、设备和性能回归需要另外加入代表性项目及目标设备测试。


## CI 并发与依赖复用

工作流按以下阶段执行：

1. `targets` 确定维护中的 CLI ref；PR 使用候选合并提交。
2. `build` 为每个 CLI / 平台准备一次候选源码和 CLI SDK，枚举全部支持的引擎 ref，并执行 `--prepare-only` 生成 Engine SDK。准备成功仅表示产物可供测试。
3. 每个 CLI / 平台独立调用 `sdk-target-tests.yml`，其 `plan` 只等待自己的 `build`，准备完成即可生成本平台的引擎测试组合，不等待其他平台。
4. `verify` 将各组合分发到独立 runner，每组执行原有完整 unit / E2E 和最小构建。
5. `gate` 要求所有前置任务成功，并检查每组结果、候选身份和覆盖数量。失败、取消、重复结果或缺少结果均不能通过。
6. `verified` 只在总门禁通过后提供原始 CLI SDK 的 `cli.tar`，无需重新构建。

父工作流 `jobs.test.strategy.max-parallel` 最多同时运行 2 个 CLI / 平台；子工作流 `sdk-target-tests.yml` 的 `jobs.verify.strategy.max-parallel` 每个目标最多运行 2 组测试，总计最多 4 组。`fail-fast: false` 保留其他组合的测试结果。同一 PR 的新提交取消尚未完成的旧提交任务。实际并发数仍受仓库 runner 配额限制。

引擎源码准备在各 CLI / 平台内部顺序执行，完整测试按引擎并发。这样编译器和 CLI 工具链只准备一次，相同 external 仓库 / commit 可从该任务已有 checkout 复用 Git 对象；首次也尝试复用开发引擎的 external。每个历史引擎仍有独立 checkout 和按自身锁文件安装的 node_modules。Actions 的 npm 缓存跨任务复用下载内容，不共享可写安装目录。

准备任务把 CLI SDK、各 Engine SDK 和已编译测试源码封装为 tar，通过本轮 artifact 分发。tar 保留隐藏文件和执行权限，测试源码的 workspace 链接展开为文件副本；不包含开发引擎及本机 config.local.json。每组先验证归档 SHA256，再核对 SDK manifest，并由矩阵执行器逐文件验证 SDK 内容。原生工具随各平台产物传递，平台、架构或 Node ABI 不符时拒绝使用。

当前每组下载所属 CLI / 平台的完整输入包，只解压该组引擎；输入包保留 3 天。因此并发缩短测试等待时间，但仍有 artifact 传输开销。完整 Engine SDK 暂不跨工作流轮次缓存，也不在不同 CLI 工具链之间直接复用。后续可在固定历史 ZIP 格式后按引擎单独下载；接入跨轮缓存时还需纳入引擎 / external commit、工具链身份和平台条件。

上述归档用于 CI 内部任务传递，不代表已经支持官方历史版本 ZIP 下载。现有本地 `test:sdk-tags` 默认仍串行执行完整流程；`--prepare-only` 只准备产物，不能作为兼容性通过结果。
候选 SDK 在测试前打包，完整 unit / E2E 使用这些候选及其身份清单。打包成功不等于发布批准；全部目标通过总门禁后，仅提升同一份 CLI 候选为 verified 制品，不在测试后重新构建。历史 Engine SDK 是测试输入，本流程不重新发布历史引擎，也不自动发布当前 Engine SDK。
