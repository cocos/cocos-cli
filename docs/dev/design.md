目标概述
为 Cocos 引擎设计一个 CLI，支持：

- 打开 Creator 3.x 或者 cli 自身创建的项目（导入），并等待后续指令
- 项目构建（导出）到多个平台（Web、Native、Android、iOS、微信小游戏等）
- 资源管理与查询（资源状态、依赖、冗余、引用分析）
- 提供游戏预览与场景编辑的辅助功能（如在浏览器/桌面端快速预览、远程预览、场景断点跳转）
- 插件化扩展能力，便于后续加入更多功能（批处理、迁移、自动化测试等）
核心原则
  - 可扩展：插件化与模块化
  - 兼容 Creator  3.x  (至少是 3.8.7 ）项目的导入
  - 支持 CI：可脚本化、可交互执行
  - 跨平台：Windows/macOS/（Linux 支持？）

---
一、功能需求

- 基础功能（MVP）
  - open <project>：打开项目，进入命令的等待状态
  - info <project>：读取并显示项目元信息（版本、引擎版本、项目配置）
  - build <project> [--platform web-mobile|windows]：根据项目的配置信息构建到指定的目标平台
  - 日志与错误友好提示
- 可选 / 高级功能（后续版本）
  - plugin：插件管理（install/uninstall/list）
  - export: 导出资源包
  - batch：批处理脚本（批量导入导出多个项目）
  - watch：监听项目文件并触发任务
  - preview <project> [--platform web|native] ：本地游戏预览（内置小型服务器或代理 Creator 的预览）
  - scene:open <project> <scene> [--editor <path>]：在 Creator 中直接打开指定场景并定位
  - analyze：资源引用图、依赖可视化、体积分析（按类型、包体）
- 交互与 UX
  - 支持交互模式与无交互（CI）模式
  - 明确的输出（彩色、任务进度）
  - 日志文件与调试级别

---
二、技术栈选择（npm 库）

- 命令解析 / 框架
  - oclif：推荐用于需要插件化、子命令丰富、TypeScript 支持良好的 CLI。适合长期维护的大型 CLI。
  - 备选：commander（轻量、灵活）
- 交互提示 @黄燕斌
  - enquirer 或 inquirer：用于交互式引导（选择项目、模板等）。
- 日志系统
  - consola ：开箱即用的精美输出
  - 可能需要结合其他的日志管理工具例如 pino 或者自定义日志文件的切割管理等。
- 终端输出与 UX
  - chalk / colorette：彩色输出（colorette 更小）。
  - ora：spinner 进度提示
  - listr2：任务列表和进度展示（适合导入/导出等步骤化流程）。
- 进程与子进程
  - execa：执行一些第三方可执行文件或系统命令（跨平台更友好）。
- 文件与压缩
  - fs-extra：增强文件操作（复制、移除等）。
  - archiver 或 zip-lib：打包导出为 zip。
- 配置与持久化 @黄燕斌
  - conf 用户的一些全局设置，应用状态比如上次打开的项目列表
  - cosmiconfig：项目特定配置，用于定义该项目的一些自定义资源设置脚本等
- 打包/发布
  - pkg / nexe（如果要打包为可执行文件）
  - npm 发布 + bin 字段（最简单的分发方式）

---
三、命令设计
命令草案，使用子命令风格（类似 git / npm）：

- cli 名称：cocos-cli
- 基础命令：
  - cocos create --path <project-dir> --type <2d|3d>
  - cocos build <project-dir> --platform <web|android|ios> [--release]
  - cocos start-mcp-server --project <project-dir> --port <port>
  - cocos wizard：交互式向导
  - ......
- 全局选项：
  - -v, --version
  - -d, --debug：输出调试信息
  - --no-interactive：强制非交互模式（适用于 CI）

---
四、整体架构与目录结构（可扩展、可测试）

- 目录结构（TypeScript 示例）
暂时无法在飞书文档外展示此内容
- 核心模块职责
  - Launcher: 负责定位启动并传参（execa），处理退出码与 stdout/stderr。
  - Project Manager: 解析 Creator 项目配置（project.json、package.json）、管理项目新建、模板等入口，将来可能支持 git 远端项目
  - Assets：项目资源的导入以及资源本地目录导入与平台构建
  - Migration: 针对不同版本项目做逐步迁移脚本？
- 插件架构（可选）
  - 使用 oclif 的插件体系或自建插件目录（扫描 node_modules 里的 cocos-cli-plugin-*）。
  - 定义 toolbox API（logger、fs、project, editor）供插件调用。

---
五、实现细节与注意点

- Creator 项目兼容
  - 保持对多个 Creator 版本生成项目的兼容策略：默认使用项目中记录的 engine 版本指向对应的 Creator 可执行路径（若在本机存在）。
- 并发与锁：多个 CLI 实例对同一项目操作时可能冲突，考虑文件锁或简单检测。

---
六、测试与 CI

- 单元测试：使用 vitest / jest
- 集成测试：使用 execa 启动 CLI（模拟命令）
- 发布 CI：
  - 使用 GitHub Actions：lint、build、test、publish (npm)
  - 自动发布版本：语义化版本（semantic-release）可结合 changelog

---
七、发布与打包

- 开发期：直接发布 npm 包并通过 npx cocos-cli 或全局安装 npm i -g.
- 如果希望用户无需 Node 环境：使用 pkg 或 nexe 打包为独立可执行文件（注意原生依赖与动态 require 限制）。
- 提供 Homebrew（macOS）或 Scoop（Windows）安装脚本可提升体验（可选）。

---
