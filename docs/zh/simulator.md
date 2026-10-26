# 模拟器编译与产物

CLI 只负责模拟器原生程序、引擎运行时的编译和产物查询，不提供模拟器预览服务器或进程会话。普通项目构建后的 run 不受影响。

```bash
npm run build:simulator:native
npm run build:simulator:runtime
npm run build:simulator
```

程序化调用使用 `import { Simulator } from 'cocos-cli/host/lib/index'`：保留 `build`、`buildNative`、`buildRuntime`、`isBuilt`、`getManifest`、`getExecutablePath`、`onLog`、`onDidChangeBuildState`。构建按引擎目录排队，同一步骤的并发请求合并，失败后可重试。`isBuilt` 只检查原生可执行程序；需要完整产物时调用 `build`。

原生程序位于 `<engine>/native/simulator/Release`；运行时位于 `<engine>/bin/simulator`。两者构建成功后写入 `simulator-artifact.json`，记录格式版本、类型、平台、架构、引擎版本与构建时间。查询会拒绝不匹配的元数据；旧产物没有元数据时允许读取，建议重新构建。manifest 返回上述目录和可执行入口，消费者不应写入共享编译目录。

`npm run build` 不自动构建模拟器；release 保留模拟器构建流程。原生编译需要对应平台工具链。

`prepareResources/start/stop/restart/launchPreview`、会话查询和运行事件，以及原 CLI `simulator` 预览命令，已迁往私有编辑器包。IDE 改用该包的 `Simulator` 导出；预览资源默认位于项目临时目录。CLI 不加载该包。参见 [抽离说明](scene-editor-extraction.md)。
