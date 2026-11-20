# 本地生成与验证 Web 引擎 npm 包

当前在本地分支实现，尚未发布到 npm。使用当前 `packages/engine`，不代表历史引擎版本已通过验证。
CLI 发布工具使用 Node 22；不要为生成消费者包执行 CLI 根目录的 npm ci 或替换 PinK 的原生依赖。

## 生成

先准备引擎自己的依赖与类型声明。Web 包生成会预转译模块化 JS，并构建浏览器 ESM；不会把构建工具安装到消费者包中。

```powershell
npm run pack:engine-npm -- --kind web --source packages/engine --output .publish/my-engine-web
```

输出目录必须不存在。目录中包含：

- `runtime/web`：可直接 import 的 ESM。
- `cocos`、`exports`、`pal` 等：供 CLI 二次构建的模块化 JS，保留平台候选实现。
- `cc.config.json`、`module-entries.json`：功能与平台配置。
- 小游戏平台适配器、目标模板、共享启动模板和所需外部运行库。
- `types/index.d.ts` 和支撑类型声明。
- `engine-sdk.json`：引擎身份与明确支持的目标映射。

当前 ccbuild 只扫描 TS 功能入口，因此包中保留少量自动生成的 `.ts` 转发入口。实际引擎实现是模块化 JS，不是原始引擎 TS 源码。这些转发文件不能与实现 JS 同名，否则 TS 解析器可能解析回自身。

打出可安装文件：

```powershell
New-Item -ItemType Directory -Force .publish/npm-artifacts
Push-Location .publish/my-engine-web
npm pack --ignore-scripts --pack-destination ../npm-artifacts
Pop-Location
```

## 直接 import

在消费者项目安装生成的 Web tarball：

```powershell
npm install /path/to/cocos-engine-web-VERSION.tgz
```

```ts
import { game, Node, Sprite } from '@cocos/engine-web';

const node = new Node('Example');
node.addComponent(Sprite);
```

当前引擎的 Web PAL 在模块求值时依赖页面已有画布，HTML 必须在模块脚本之前提供标准容器：

```html
<div id="GameDiv">
  <div id="Cocos3dGameContainer"><canvas id="GameCanvas"></canvas></div>
</div>
```

这个示例验证导入及对象创建，不会启动游戏。完整游戏仍需正常初始化引擎和提供项目资源。
不能将当前版本描述成“任意空白页面可直接 import、完全无 DOM 副作用”；延迟 PAL 初始化需另行改造和验证。
Web 包不包含编辑器实现、场景编辑缓存、原生平台库或安装期编译脚本。
当前直接 import 产物使用清单 `profiles.web.features` 中声明的固定功能集；精确裁剪通过 CLI 发布构建完成。

## 完整 CLI 项目构建

当前 CLI 的资源导入使用编辑器引擎接口，因此完整项目构建需要配套 Editor 包；普通浏览器 import 不需要它。

```powershell
npm run pack:engine-npm -- --kind editor --source packages/engine --base .publish/my-engine-web --output .publish/my-engine-editor
Push-Location .publish/my-engine-editor
npm pack --ignore-scripts --pack-destination ../npm-artifacts
Pop-Location
```

将两个对应的 tarball 同时安装到项目，避免未发布的 Editor 精确依赖被 npm 从远端查找。
统一入口为 `pack:engine-npm --kind web|editor`。不传 kind 时仍按 Web 处理，旧 `pack:engine-editor` 命令保留为 Editor 别名。
可运行 `npm run pack:engine-npm -- --help` 查看参数。Native 路由已预留但尚未实现，使用 `--kind native` 会明确失败且不生成文件，不会误生成 Web 包；后续打包预编译库与编译库继续分开。
项目的 `settings/cocos.config.json` 中选择：

```json
{
  "engineSdk": {
    "package": "@cocos/engine-web",
    "editor": { "package": "@cocos/engine-editor" }
  }
}
```

CLI 在项目 `temp/engine-sdk` 下组装匹配的 Web/Editor 构建视图及已安装的运行依赖，不写回 node_modules。Editor 版本/revision 不匹配时直接报错。
运行依赖需要物化到构建视图，因为当前 ccbuild 的模块解析限制在引擎根目录内，不能依赖项目的 npm hoist 布局。

使用已有的项目构建命令：

```powershell
node dist/cli.js build --project /path/to/project --platform wechatgame --build-config /path/to/build.json
```

CLI 宿主自己的 gl/sharp 等原生依赖仍须与运行 CLI 的 Node/Electron 匹配。这些属于 CLI 环境，不进入 Web npm 包。

## 回归验证

```powershell
npm run test:engine-npm
node workflow/test/engine-npm-build.cjs --project /path/to/installed-project --output .publish/npm-engine-build-check
```

第二条命令使用真实 Builder 引擎编译入口，从安装的包构建 Web、微信、淘宝和 SUDV2 四组精简 2D 引擎，并检查：

- 输出非空，保留 Node 等真实引擎代码。
- 不包含未解析的源码仓库别名。
- 不包含未启用的 Spine/物理和非目标 Native PAL 实现。
- Web 与小游戏选择各自 PAL 实现。
- 共享 Mesh 数据/工具仍允许保留，不以 `3d` 目录名判断整个模块是否可删除。

输出 `verification.json` 记录实际 SDK 身份及产物大小。此检查验证引擎构建；完整小游戏工程还必须单独执行前面的 `cocos build`，并在相应平台工具中验证运行。
当前只声明已验证的测试范围，不把其他目标出现在清单中视为真机运行验证。
SDK 清单中的目标表示引擎编译能力；完整工程发布还需要对应 CLI 平台插件。
验证覆盖 Web 浏览器运行、淘宝和 SUDV2 的 release 工程构建；不包含 SUDV2 签包上传、引擎分离或 WASM 分包。新环境需先安装并编译对应平台插件，不能仅安装引擎 npm 包就假定插件可用。

## 平台能力与构建入口

新生成的包使用显式 platformResolution: plugin 能力声明，platformConstants 从引擎的 HTML5、MINIGAME、RUNTIME_BASED 宏配置提取，包含 SUD/SUDV2。targets 保留已知别名，不作为新插件 ID 的唯一来源。旧清单没有该声明时仍按原协议处理。
CLI 可构建入口以已注册的 Builder 插件为准；引擎编译时检查插件传入的宏是否由该包提供。单独使用 resolveTargetComponent 解析新插件时，应传入 requirements.platform（来自插件注册配置的 platformType），可同时提供所需资源文件列表；不能用目录名称猜测宏。包内有平台资源，不代表已安装插件、可签包或已通过设备运行验证。

Web 包复制源码中已有的非 Native 模板及小游戏/Runtime 适配器，不依赖打包机器上已注册的插件列表。Native 公共模板、Google Play/Gradle、CMake 和 XR 模板不进入 Web 包。插件自带的模板和适配器仍由插件提供，例如 openpaas 使用自身的 runtime-adapter。

## 生成前检查

先安装并同步引擎 PAL，再编译 Editor/Web profile，最后生成 Web 和匹配的 Editor 包。打包器检查 PAL worker 实现、已安装 PAL 与同步版本，并检查 profile 的功能入口/PAL 映射是否有 bundle 实现。缺失时明确失败，不自动修改源码或重编引擎。该检查不能代替对所有源码变动的完整构建与运行验证。

## 浏览器运行验证

先用已安装的 Web/Editor npm 包生成 web-mobile 构建产物，再运行：

~~~powershell
npm run test:engine-npm-browser -- --root <Web构建目录> --engine <项目node_modules/@cocos/engine-web目录> --browser <Chrome或Edge可执行文件> --output <验证输出目录>
~~~

测试使用本地 HTTP 服务和独立 headless 浏览器 profile，验证场景加载、帧持续更新、图片加载、Texture2D/SpriteFrame/Sprite 创建，并保存截图及 JSON 报告。--engine 同时验证浏览器 ESM 入口的直接 import。直接 import 测试会先准备 GameCanvas 等 DOM，暂不承诺空白页面无 DOM 副作用。

SUDV2 插件的构建平台 ID 是 openpaas，宏是 SUDV2。离线构建验证使用 isApiBuild: true、非空测试 appid、空 nextStages，仅生成工程产物，不请求创建游戏、签包上下文或上传。正式 .sp 签包和上传需要平台凭据，不能把离线构建通过当作这些阶段也已验证。

## 使用引擎源码

在项目 settings/cocos.config.json 中使用源码目录，替代 package/editor 配置：

~~~json
{
  "engineSdk": { "path": "../custom-engine" }
}
~~~

相对路径按项目目录解析。path 与 package 互斥；源码目录需先准备依赖、PAL 和编译产物。源码和 npm 模式沿用相同的构建选项与平台插件。引擎来源配置与 --build-config 指定的发布选项文件是两类配置。
