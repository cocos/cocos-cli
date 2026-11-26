# 独立 CLI / Engine SDK 本地打包

本入口将 CLI 和 Engine 分别打成可离线使用的目录快照。`pack:cli-sdk` 复制已构建的 CLI；`pack:engine-sdk` 先在所选引擎源码目录准备编译产物，再生成快照。两个命令都要求事先安装好依赖，不更新 Git 仓库或上传产物。现有 `npm run release` 仍是独立的整包发布流程。

## 使用方式

在 CLI 仓库根目录执行：

```powershell
npm run pack:cli-sdk -- --dry-run
npm run pack:engine-sdk -- --dry-run
npm run pack:cli-sdk
npm run pack:engine-sdk
# 只使用已有产物，保留原来的快照行为
npm run pack:engine-sdk -- --skip-build
# 构建 Web 产物，跳过本机模拟器和原生预览的编译
npm run pack:engine-sdk -- --skip-simulator
npm run test:pack-sdk
```

默认输出：

```text
.publish/sdk/cocos-cli-sdk-<CLI版本>-<平台>-<架构>/
.publish/sdk/cocos-engine-sdk-<Engine版本>-<平台>-<架构>/
```

目录已存在时直接失败，不删除或覆盖已有产物。复测请显式使用新的输出目录：

```powershell
npm run pack:cli-sdk -- --output .publish/sdk/cli-check-2
npm run pack:engine-sdk -- --source D:/engines/my-engine --output .publish/sdk/custom-engine-check
```

`--source` 指向对应 SDK 的根目录。Engine 版本读取该目录的 `package.json`，不读取 CLI 版本或 `repo.json` 中的目标 tag。CLI 打包不读取或重编 Engine；更新 CLI 后可只重新打包 CLI。

Engine 源码打包前先安装引擎依赖并准备声明文件和 adapter。默认打包会补编缺失的 editor/Web `dev-cli`，运行引擎自己的 `build:min` 生成 `bin/dev/cc-min`，并在 Windows x64 或 macOS 上调用现有模拟器脚本生成 `bin/simulator`、`bin/native-preview` 和 `native/simulator/Release`。原生部分需要引擎版本匹配的 `native/external` 及本机构建工具（CMake 和 Visual Studio 2022 或 Xcode）。所需编译产物验证通过后才写 SDK 目录。`--skip-simulator` 只跳过这个编译步骤，源目录已有的模拟器产物仍会打包。

`--dry-run` 只预览当前已有文件；它不会执行构建，也不会把尚未编译的文件计入预览。已有预编译产物时可用 `--skip-build` 直接打包。

## 打包内容

- CLI：编译后的 dist、static、cc-module 桥接、engine-compiler 构建工具、平台资源，以及运行依赖。
- Engine：引擎源码、配置、editor 资源、native/external、pal、模板、声明文件、dev-cli loader、adapter、`cc-min`、模拟器产物（如已生成），以及引擎自己的运行依赖。Xcode 辅助库及其运行依赖保持原有目录布局。`ios-xcframework` 随所选版本的 `native/external` 收录；打包流程不会从旧引擎复制或生成 XCFramework。
- 依赖：从实际安装环境追踪 dependencies、optionalDependencies 和 peerDependencies，保留嵌套解析布局。未安装的可选依赖记录在清单；缺少必需依赖时失败。devDependencies 和不被运行依赖引用的安装包不主动纳入。
- workspace 链接物化为目录，使产物不依赖源码位置。指向 SDK 源码根之外的依赖链接或从外部目录解析到的依赖会被拒绝，应先在 SDK 源目录准备正确依赖。
- 产物顶层 package.json 移除开发脚本、devDependencies 和 workspaces，标记 private；这是预安装目录快照，不是用于发布到 npm registry 的包，不应在产物中重新运行 npm install。

CLI SDK 不包含 `packages/engine`。可将独立 Engine SDK 放入 `<CLI SDK>/packages/engine`，或在 CLI 根目录的 `config.local.json` 中配置 `enginePath`。该本机配置不会打包，解压后的 CLI SDK 如需外部引擎地址，应在其根目录另建配置。`pack:engine-sdk` 默认使用配置路径，`--source` 可覆盖它。CLI 运行时还可以用项目的 `engineSdk.path` 或命令行 `--engine-path` 选引擎，详见[环境配置](environment-setup.md)。CLI SDK 包含 engine-compatibility.json 及其检查脚本，加载引擎时执行支持范围、必需文件和接口检查。自动安装及全版本矩阵仍属于后续工作。

## 清单与校验

每份产物包含 `cli-sdk.json` 或 `engine-sdk.json`：

- 元信息格式版本、自身版本、发行标识。
- 平台、CPU 架构和打包时 Node ABI。
- 实际依赖包位置及版本、缺失的可选依赖、声明与安装版本的差异。
- 全部有效载荷文件的相对路径、大小、权限和 SHA-256。
- `revision`：对排序后的文件清单计算 SHA-256，不包含清单文件自身，避免自引用。

打包开始创建 `.sdk-incomplete`，所有文件及清单写完后才移除。失败后保留不完整目录供排查，不能作为有效 SDK 使用；重新执行需选新目录。

## 验证边界

产物带有本机已安装的原生依赖，不能当作跨平台或跨 Node ABI 的通用包。打包成功说明文件快照生成完成，不代表所有平台构建或自定义引擎兼容性均已验证。

依赖版本不一致会显示在命令结果与元信息中；本地快照可用于排查，但发布候选应先解决这些差异并完成构建验收。

隔离冒烟验证（子进程禁止从 SDK 目录外解析模块，CLI 帮助检查关闭遥测初始化）：

```powershell
node workflow/test/sdk-smoke.cjs .publish/sdk/cocos-cli-sdk-<版本>-win32-x64 cli
node workflow/test/sdk-smoke.cjs .publish/sdk/cocos-engine-sdk-<版本>-win32-x64 engine
```

CLI 检查帮助入口，Engine 检查 ccbuild 能读取引擎功能配置。它们不能替代实际项目的端到端构建。

用真实 Engine SDK 验证当前编译后的 CLI 能按项目配置的路径和版本初始化引擎：

```sh
node workflow/test/engine-sdk-load.cjs <CLI根目录> <EngineSDK目录>
```

该检查读取实际版本和 revision，并在选择外部 SDK 时禁止模块加载退回 CLI 仓库的 `packages/engine`。它验证引擎初始化，不替代完整项目构建。

SDK 不记录发行来源。内部测试通过后可将同一份产物发布为官方包，version / revision 保持不变；引擎内容变更时重新打包计算 revision。发行状态由制品库或发布记录管理。
