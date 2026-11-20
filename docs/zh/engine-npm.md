# 使用 npm 或源码引擎

npm 包由 engine 仓库的 scripts/npm 生成。生成说明位于 engine 的 docs/npm-packaging.md。CLI 只消费已安装的包，保留 SDK 选择、组件校验、项目工作视图组装和项目构建。

## 在 engine 根目录生成

~~~powershell
npm run test:npm
npm run pack:npm -- --kind web --output ../engine-web-package
npm run pack:npm -- --kind editor --base ../engine-web-package --output ../engine-editor-package
~~~

默认源码是当前 engine。依赖、PAL、声明及 Editor/Web host profile 需事先准备，生成器不依赖 CLI 的 dist。Native npm 包尚未实现。分别在输出目录 npm pack 后，在游戏工程安装匹配的 Web/Editor tarball。

## 项目配置

在游戏工程 settings/cocos.config.json 中设置：

~~~json
{
  "engineSdk": {
    "package": "@cocos/engine-web",
    "editor": { "package": "@cocos/engine-editor" }
  }
}
~~~

源码模式使用 { "engineSdk": { "path": "../custom-engine" } }。相对路径按项目目录解析，path/package 互斥。不配置时沿用原有默认引擎选择。工程脚本继续 import from 'cc'。

包必须先安装；CLI 解析时不联网、不自动 npm install。CLI 校验版本/revision/sdkReleaseId，在项目 temp/engine-sdk 组装输入，不写回 node_modules。

## CLI 构建和消费验证

~~~powershell
node dist/cli.js build --project /path/to/project --platform taobao-mini-game --build-config /path/to/build.json
npm run test:engine-npm
node workflow/test/engine-npm-build.cjs --project /path/to/installed-project --output .publish/npm-engine-build-check
npm run test:engine-npm-browser -- --root <Web构建目录> --engine <项目node_modules/@cocos/engine-web目录> --browser <Chrome或Edge可执行文件> --output <报告目录>
~~~

这些命令在 CLI 仓库执行。平台入口来自注册插件，编译宏及资源由引擎和插件共同提供，最终构建按目标平台和功能裁剪。debug/includeModules 等发布选项通过 --build-config 配置，与引擎来源配置分开；配置接口见 build-configuration-api.md。

浏览器验证包括场景帧更新、图片加载和 Sprite 创建，并输出截图。--engine 额外测试浏览器 ESM 入口，import 前仍需准备 GameCanvas 等 DOM。

SUDV2 平台 ID 是 openpaas，宏是 SUDV2。离线测试使用 isApiBuild: true、测试 appid 和空 nextStages，不申请上下文、不签包、不上传。正式签包上传及引擎分离/WASM 分包需单独验证。
