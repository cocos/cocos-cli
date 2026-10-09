# CLI 与 Engine 环境配置

## 本机默认引擎

在 CLI 根目录的 `config.local.json` 中保留现有配置并增加 `enginePath`：

```json
{
  "project": "D:/projects/game",
  "enginePath": "packages/engine"
}
```

也可写 `"enginePath": "../custom-engine"`，相对 CLI 根目录解析，不受命令工作目录影响。不配置时默认 `packages/engine`。配置文件已被 Git 忽略，不应提交本机路径；模板见 `config.local.example.json`。配置无效时明确报错，不静默换回默认引擎。修改后重启 CLI 进程。

CLI 的全局引擎路径、源码依赖安装、引擎编译、cc-module 生成、脚本打包和 Engine SDK 打包读取同一本机默认值。开发脚本的显式 `--engine-path`、SDK 打包的 `--source` 可以覆盖它；这些命令不会读取游戏项目配置。

## 运行时选择引擎

CLI 运行时优先级为：命令行 `--engine-path` > 项目 `engineSdk.path` > CLI 根目录 `config.local.json.enginePath` > CLI 下的 `packages/engine`。命令行相对路径按当前工作目录解析；项目路径按项目根目录解析；本机默认路径按 CLI 根目录解析。包含空格的命令行路径使用引号。

```sh
cocos build --project D:/projects/game --engine-path "D:/engines/custom engine" --platform web-desktop
```

在游戏项目的 `settings/cocos.config.json` 中增加独立的 `engineSdk` 节点，保留其他项目设置：

```json
{
  "engineSdk": {
    "path": "../engines/custom-engine",
    "version": "4.0.0-alpha.32",
    "revision": "sha256:<该 SDK 的实际 revision>"
  }
}
```

`version` 和 `revision` 可省略；填写后要求与实际引擎精确匹配，命令行覆盖路径也不能绕过这两个条件。源码引擎可暂时没有 `engine-sdk.json`，此时 revision 未记录，不能满足项目的 revision 锁定条件。存在元信息时，必须具有 schemaVersion: 1、匹配的 engineVersion 和非空 revision。

### 引擎兼容性

CLI 根目录的 `engine-compatibility.json` 声明支持范围，与 CLI SDK 一起打包：

- 稳定版本为 `~4.0.0`，接受稳定 `4.0.x`。
- 当前开发过渡系列为 `4.0.0-alpha.N`，N >= 32。
- 后继开发系列为 `4.1.0-alpha.N`，N >= 0；选择时输出实验性支持提示。
- 其他预发布标识、不同核心版本、缺失或非法版本均拒绝；不会因为版本号更高而自动接受。构建元信息可保留，自定义引擎同样检查。

选择引擎时检查源码与功能配置文件；初始化运行时前检查 loader、适配器及声明文件；Launcher 初始化还要求 Web loader。加载时检查必需模块，随后在引擎启动前检查关键接口。失败信息包含实际版本、路径、支持范围和缺失项。源码准备阶段不要求已经生成运行时产物。

SortingLayers.getBuiltinLayers 属于可选能力：存在时调用，缺失时返回空列表。SDK 声明的 capabilities 不代替实际接口检查。

运行 `npm run test:engine-compatibility` 验证规则边界、必需文件、加载失败和可选能力。当前真实 SDK 加载验证使用 `4.0.0-alpha.32`；稳定及后继系列的真实全版本构建尚待步骤 6，范围声明和模拟测试不代表这些版本已经完成构建验收。

项目配置经 ConfigurationManager 读取，兼容已有配置迁移；`engineSdk` 已纳入项目 schema。显式路径不存在时失败，不切回其他引擎。CLI 创建项目时先选择引擎，再生成项目默认设置；新建项目尚无项目级路径，使用显式或本机默认值。

SDK 的 engine 模块支持 `init(projectPath, { enginePath })`；已有 `initEngine(enginePath, projectPath)` 保留。内部 Launcher 可接收第二个参数 `{ enginePath }`。引擎信息查询返回实际路径、version，以及可用的 revision。

选定引擎后，本进程的场景和编译子进程使用同一路径。一个进程只使用一个引擎，尝试切换到不同路径或身份会报错，需新进程。帮助和 CLI 版本查询不读取本机引擎配置，也不访问引擎文件。

## 安装与构建分离

| 命令 | 行为 |
| --- | --- |
| `npm install` / `npm ci` | 安装 CLI 依赖，不执行 CLI / Engine 构建或工具下载；依赖包自身的原生安装脚本仍正常执行 |
| `npm run setup:cli` | 要求现成 Engine SDK，生成 CLI 的 cc-module、构建 CLI、下载开发工具，不编译引擎 |
| `npm run setup:dev` | 显式编译引擎并准备 CLI；`-- --force` 强制重编，`-- --minimal-tools` 仅下载最小工具集 |
| `npm run init` | 兼容入口，等同 `setup:cli`，不再下载或重置源码 |
| `npm run fetch:engine` | 按 repo.json 下载缺失源码；已有目录及其子仓库保持原样 |
| `npm run update:repos` | 显式更新官方源码；拒绝非 Git 目录、未提交改动和 origin 不匹配的自定义仓库；分支仅允许快进 |
| `npm run install:engine` | 在配置的引擎源码目录安装依赖；拒绝对带 engine-sdk.json 的预装 SDK 重装 |
| `npm run compiler:engine` | 仅强制编译配置的引擎源码 |
| `npm run build` / `npm run compiler` | 构建 CLI，不通过重新安装依赖触发引擎编译 |

`fetch:engine` / `update:repos` 只管理 repo.json 的官方源码地址。当 enginePath 指向别处时会报错，外部或自定义源码由开发者自行管理。更新不使用 reset --hard，不删除目录，失败后不回退到重新克隆。若首次下载中断留下不完整目录，先检查并自行处理该目录再重试。

## 两种首次准备方式

使用已准备好的 Engine SDK：

```sh
npm ci
# 将 SDK 放入 packages/engine，或配置 config.local.json
npm run setup:cli
```

开发官方引擎源码（下载步骤需要访问 GitHub）：

```sh
npm ci
npm run fetch:engine
npm run install:engine
npm run setup:dev
```

自定义引擎源码先配置本机路径，再执行 `install:engine` 和 `setup:dev`。不要在预装 Engine SDK 中重新安装依赖。`setup:cli` 要求引擎已有声明文件和 dev-cli loader；源码缺少产物时使用 `setup:dev`。

## CI 与旧发布入口

共享 CI action 依次执行 `npm ci`、安装与打包脚本回归测试、`npm run update:repos`、`npm run install:engine`、`npm run setup:dev -- --force`，显式准备引擎。CI 使用独立、干净的源码目录；自定义引擎任务应改用自行准备的引擎和本机配置。这些脚本测试属于基础回归，全量受支持 Engine SDK 的无人值守兼容性矩阵另按根目录 step.md 的步骤 6 实施。

旧 `npm run release` 仍是源码全量发布入口，显式执行引擎安装和构建，并在构建完成后扫描产物；它尚未切换到独立 SDK 发布，可能上传文件。只生成本地拆分产物请用 `pack:cli-sdk` / `pack:engine-sdk`。

`FORCE_UPDATE` 不再影响 npm 安装。需要强制构建时使用 `setup:dev -- --force`。`MINIMAL_DOWNLOAD_TOOLS=true` 仍可供 setup 脚本选择最小工具集。

## 诊断与本次引擎记录

```powershell
# 检查本机默认引擎
node dist/cli.js doctor
# 检查项目所选引擎，JSON 可直接供 CI 解析
node dist/cli.js doctor --project D:/projects/game --json
# 显式选择独立 SDK；仍校验项目 engineSdk.version / revision
node dist/cli.js doctor --project D:/projects/game --engine-path D:/engines/custom --json
```

安装 CLI 命令后可用 `cocos doctor`。不指定 --project 时只检查 CLI 本机默认值或显式引擎，不自动采用 config.local.json.project。退出码 0 表示版本、精确身份条件及 Web 所需文件通过；检查失败返回 1，并在 errors 中保留原因。常规命令行语法错误仍由命令行解析器处理。

JSON 包含 schemaVersion、ok、cli、environment（Node / 平台 / 架构 / ABI）、engine（实际路径 / version / revision / source）、compatibility、runtimeInterfaces、lastInitialization、warnings 和 errors。CLI 的 --version 与报告均从 package.json 读取。source 为 explicit、project 或 default；default 由既有本机配置 / 内置目录规则解析。

doctor 只读项目的 settings/cocos.config.json；不存在时读取旧根配置 cocos.config.json。两者同时存在时 settings 优先，与 ConfigurationManager 一致。它不初始化配置管理器、不迁移或保存项目，也不执行引擎代码。版本和文件检查通过并不证明模块接口或项目构建通过，runtimeInterfaces 始终为 not-tested。自定义源码没有 revision 时输出 null 和警告，不编造修订标识。

成功初始化引擎后，CLI 在项目 temp/engine-sdk.json 原子写入实际引擎身份、CLI 版本、时间和 status: initialized，并输出 [Engine SDK] 日志。这是最近一次成功初始化的运行记录，不是版本锁文件，也不代表完整构建成功。初始化失败时保留上一次记录；项目配置的 engineSdk 仍是校验条件，不被记录功能改写。temp 文件应保持不提交。

带 --project 的 doctor 会显示 lastInitialization；当该记录与当前所选引擎不同时给出警告。过期或损坏的运行记录不用于选择引擎，也不替代版本锁定。源码引擎需要精确身份时，应先生成含 revision 的 Engine SDK，再在项目 engineSdk 中设置其 version / revision。

下面是 JSON 报告中的身份字段示例（节选）：

```json
{
  "ok": true,
  "cli": { "version": "0.0.1-alpha.41", "path": "D:/tools/cocos-cli" },
  "engine": {
    "path": "D:/engines/custom",
    "version": "4.0.0",
    "revision": "custom-42",
    "source": "explicit"
  },
  "runtimeInterfaces": "not-tested"
}
```
