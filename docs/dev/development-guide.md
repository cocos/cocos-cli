# Cocos CLI 开发文档

> 版本：0.0.1-alpha.31 | Node.js 22.17.0 | TypeScript + CommonJS

---

## 目录

1. [项目概览](#1-项目概览)
2. [目录结构](#2-目录结构)
3. [环境搭建](#3-环境搭建)
4. [构建系统](#4-构建系统)
5. [核心架构](#5-核心架构)
6. [命令层（CLI Commands）](#6-命令层cli-commands)
7. [API 层](#7-api-层)
8. [Core 层](#8-core-层)
9. [MCP 服务器](#9-mcp-服务器)
10. [HTTP 服务器](#10-http-服务器)
11. [装饰器系统](#11-装饰器系统)
12. [i18n 国际化](#12-i18n-国际化)
13. [测试体系](#13-测试体系)
14. [VS Code 扩展模式](#14-vs-code-扩展模式)
15. [常见开发任务](#15-常见开发任务)

---

## 1. 项目概览

Cocos CLI 是面向 Cocos Creator 3.x 项目的命令行工具，同时也是一个 VS Code 扩展。核心能力：

| 能力 | 描述 |
|------|------|
| 项目管理 | 创建、打开、导入 Cocos 项目 |
| 多平台构建 | Web / Android / iOS / Windows / macOS / HarmonyOS 等 |
| MCP 服务器 | 基于 Model Context Protocol，供 AI 工具调用 |
| 资源管理 | 增删改查资源、资源数据库操作 |
| 场景编辑 | 场景/节点/组件的读写操作（双进程架构） |
| 预览服务 | 内置 HTTP 服务器提供游戏预览 |

两种运行形态：
- **CLI 模式**：`cocos <command>` 直接执行，入口为 `src/cli.ts`
- **VS Code 扩展模式**：作为插件被激活，入口为 `src/index.ts`

---

## 2. 目录结构

```
cocos-cli/
├── src/                        # TypeScript 源码
│   ├── cli.ts                  # CLI 入口（bin: cocos）
│   ├── index.ts                # VS Code 扩展入口（activate/deactivate）
│   ├── global.ts               # 全局路径与配置常量
│   ├── commands/               # CLI 命令注册层
│   │   ├── base.ts             # BaseCommand 抽象基类
│   │   ├── build.ts            # cocos build
│   │   ├── create.ts           # cocos create
│   │   ├── mcp-server.ts       # cocos start-mcp-server
│   │   ├── make.ts             # cocos make（原生编译）
│   │   ├── run.ts              # cocos run
│   │   ├── upload.ts           # cocos upload
│   │   ├── preview.ts          # cocos preview
│   │   └── index.ts            # CommandRegistry + 统一导出
│   ├── api/                    # 对外暴露的 API（MCP 工具注册源）
│   │   ├── index.ts            # CocosAPI 聚合类（单例工厂）
│   │   ├── schema.ts           # 公共 Zod Schema（ProjectPath / Port / ProjectType）
│   │   ├── decorator/
│   │   │   └── decorator.ts    # @tool @title @description @param @result 装饰器
│   │   ├── base/
│   │   │   └── schema-base.ts  # HTTP 状态码常量、CommonResult 泛型、getCommonErrorStatus
│   │   ├── assets/             # 资源 API（assets.ts + schema.ts）
│   │   ├── builder/            # 构建 API（builder.ts + schema.ts）
│   │   ├── scene/              # 场景 API（scene + node + component + prefab）
│   │   ├── project/            # 项目 API（project.ts + scheme.ts）
│   │   ├── configuration/      # 配置 API
│   │   ├── engine/             # 引擎 API
│   │   └── system/             # 系统/文件 API
│   ├── core/                   # 内部实现（不直接对外）
│   │   ├── launcher.ts         # 启动器：init → import → startup 完整流程
│   │   ├── project-manager.ts  # 项目管理器（创建/打开/关闭）
│   │   ├── assets/             # 资产数据库实现
│   │   ├── builder/            # 构建器实现（多平台插件化）
│   │   ├── scene/              # 场景双进程实现
│   │   ├── engine/             # 引擎编译与加载
│   │   ├── scripting/          # 脚本编译（Babel + Rollup）
│   │   ├── project/            # 项目结构解析
│   │   ├── configuration/      # 项目配置管理
│   │   ├── filesystem/         # 文件系统工具
│   │   └── base/               # 日志、工具函数等公共基础
│   ├── mcp/                    # MCP 协议层
│   │   ├── start-server.ts     # 启动入口（调用 CocosAPI + 注册中间件）
│   │   ├── mcp.middleware.ts   # McpMiddleware（工具自动收集、资源注册）
│   │   ├── resources.ts        # ResourceManager（加载文档资源）
│   │   └── hooks/
│   │       └── builder.hook.ts # 构建事件 Hook
│   ├── server/                 # HTTP/WebSocket 服务器
│   │   ├── server.ts           # ServerService（Express + HTTP/HTTPS）
│   │   ├── socket.ts           # Socket.IO 服务
│   │   ├── console-log.ts      # 日志推送服务
│   │   ├── interfaces.ts       # IMiddlewareContribution 接口
│   │   └── middleware/         # 中间件注册中心
│   ├── display/                # 终端 UI 配置
│   ├── i18n/                   # i18n 初始化
│   └── lib/                    # 第三方库适配
├── static/
│   ├── i18n/                   # 翻译 JSON 文件（zh / en）
│   ├── build-templates/        # 平台构建模板
│   ├── assets/                 # 内置资源
│   └── web/                    # Web 预览相关静态文件
├── packages/
│   ├── cc-module/              # 本地 cc 模块（Node.js 适配）
│   ├── cocos-cli-types/        # 类型声明包
│   └── engine/                 # 引擎源码子树
├── workflow/                   # 构建脚本（Node.js）
├── tests/                      # 单元测试
├── e2e/                        # E2E 测试
├── docs/                       # 文档目录
│   ├── dev/                    # 开发文档
│   ├── en/                     # 英文用户文档
│   └── zh/                     # 中文用户文档
├── tsconfig.json               # TypeScript 配置
├── jest.config.ts              # Jest 单元测试配置
└── package.json                # 项目描述与脚本
```

---

## 3. 环境搭建

### 3.1 必须条件

| 工具 | 版本要求 |
|------|----------|
| Node.js | 22.17.0（精确版本，使用 nvm 管理） |
| npm | 随 Node.js 附带 |
| Git | 任意版本 |
| Visual Studio C++ Build Tools | Windows 下原生模块必须 |
| Xcode | macOS 下原生模块必须 |

### 3.2 首次安装

```bash
# 1. 安装全局编译工具
npm install -g node-gyp

# 2. 运行项目初始化脚本（编译引擎、构建 cc-module、生成 i18n 类型）
npm run init

# 3. 安装依赖（包含 sharp 原生模块）
npm install

# 4. 构建项目
npm run build

# 5. （可选）链接为全局命令
npm link
```

### 3.3 sharp 安装加速（国内环境）

在运行 `npm install` 之前，设置 libvips 镜像源：

```bash
# 临时设置（PowerShell）
$env:npm_config_sharp_libvips_binary_host="https://npmmirror.com/mirrors/sharp-libvips"
$env:npm_config_sharp_binary_host="https://npmmirror.com/mirrors/sharp"

npm install
```

或在 `.npmrc` 中永久设置：

```ini
sharp_binary_host=https://npmmirror.com/mirrors/sharp
sharp_libvips_binary_host=https://npmmirror.com/mirrors/sharp-libvips
```

### 3.4 npm 超时配置（弱网络环境）

```bash
npm config set fetch-timeout 600000
npm config set fetch-retries 5
npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 300000
```

---

## 4. 构建系统

### 4.1 构建脚本汇总

```bash
npm run build          # 完整构建（清理 → DTS → tsc → 静态 web → 生成 schema → 生成 dts）
npm run compile        # 编译构建（不生成 dts 快照）
npm run build:watch    # TypeScript 监听模式
npm run build:clear    # 清理 dist 目录
```

### 4.2 完整 build 流程（顺序执行）

```
build:clear
  └─ workflow/build-clear.js      清理 dist/

workflow/prepare-dts.js           复制 packages/engine DTS 到 dist/

tsc -b                            TypeScript 编译
  └─ src/ → dist/  (CommonJS, ES2022)
  └─ 保留 inline source map

build:static-web
  ├─ workflow/build-scene-bundle.js   构建场景预览 Bundle（Rollup）
  └─ workflow/build-polyfills.js      构建 Web Polyfills

workflow/generate-schema.js       生成 JSON Schema（基于 Zod）

generate:dts
  └─ workflow/generate-dts.ts     生成 cocos-cli-types 的类型快照
  └─ jest --testPathPattern dts-snapshot -u  更新快照
```

### 4.3 TypeScript 编译配置要点

文件：`tsconfig.json`

```json
{
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "target": "es2022",
    "module": "commonjs",
    "experimentalDecorators": true,   // 装饰器语法支持
    "emitDecoratorMetadata": true,    // reflect-metadata 支持
    "resolveJsonModule": true,        // 允许 import *.json
    "strict": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/test/**", "**/*.test.ts", "tests/**", "e2e/**"]
}
```

> **注意**：`emitDecoratorMetadata: true` 是装饰器参数类型推断的必要条件，不可删除。

### 4.4 postinstall 自动构建

`npm install` 完成后自动执行 `workflow/postinstall.js`，依次：

1. 检查是否处于开发环境
2. 询问是否强制更新（3 秒超时默认强制）
3. 运行 `compiler-engine.js` → `build-cc-module.js` → `generate-i18n-types.js` → `build-ts.js` → `download-tools.js`

强制更新：`FORCE_UPDATE=true npm install`

---

## 5. 核心架构

### 5.1 分层模型

```
┌─────────────────────────────────────────────────┐
│              用户 / AI 工具 / VS Code             │
└────────────┬──────────────────────┬──────────────┘
             │ CLI 命令              │ MCP 协议 / HTTP API
             ▼                      ▼
┌────────────────────┐  ┌──────────────────────────┐
│  commands/ 命令层   │  │   mcp/ + server/ 服务层   │
│  (Commander.js)    │  │  (Express + MCP SDK)      │
└──────────┬─────────┘  └────────────┬──────────────┘
           │                         │
           └──────────┬──────────────┘
                      ▼
         ┌────────────────────────┐
         │       api/ API 层      │
         │  CocosAPI 聚合 + 装饰器 │
         └────────────┬───────────┘
                      ▼
         ┌────────────────────────┐
         │      core/ 实现层      │
         │  Launcher / Builder /  │
         │  Assets / Scene / Eng  │
         └────────────────────────┘
```

### 5.2 启动序列（startup）

```
CocosAPI.create()
  └─ Launcher.startup(projectPath, port?)
       ├─ Launcher.import()
       │    ├─ Launcher.init()
       │    │    ├─ configurationManager.initialize()
       │    │    ├─ Project.open()
       │    │    └─ initEngine()
       │    ├─ scripting.initialize()
       │    ├─ createProgrammingFacet()
       │    ├─ initAssetDB()
       │    └─ startAssetDB()
       ├─ server.start(port)          HTTP 服务器
       └─ builder.init()              构建系统初始化
```

### 5.3 GlobalPaths（全局路径常量）

定义于 `src/global.ts`：

| 常量 | 值（相对 dist/） |
|------|-----------------|
| `GlobalPaths.staticDir` | `../static` |
| `GlobalPaths.workspace` | `..` （项目根目录） |
| `GlobalPaths.enginePath` | `../packages/engine` |

---

## 6. 命令层（CLI Commands）

### 6.1 BaseCommand 基类

`src/commands/base.ts`

所有命令继承 `BaseCommand`，必须实现 `register()` 方法。

```typescript
abstract class BaseCommand {
    protected program: Command;  // Commander.js 实例
    abstract register(): void;
    protected validateProjectPath(path: string): string;  // 验证路径存在且含 package.json
}
```

### 6.2 CommandRegistry

`src/commands/index.ts`

```typescript
const registry = new CommandRegistry();
registry.register(new CreateCommand(program));
registry.register(new BuildCommand(program));
// ... 其他命令
registry.registerAll();  // 调用各命令的 register()
```

### 6.3 命令一览

| 命令 | 类 | 必填参数 | 可选参数 |
|------|----|---------|---------|
| `cocos create` | `CreateCommand` | `--project <path>` | `-t, --type 2d\|3d`（默认 3d） |
| `cocos build` | `BuildCommand` | `--project <path>`, `--platform <platform>` | `-c, --build-config`, `--ndkPath`, `--sdkPath` |
| `cocos start-mcp-server` | `McpServerCommand` | `--project <path>` | `-p, --port`（默认 9527） |
| `cocos make` | `MakeCommand` | `--platform <platform>`, `--dest <path>` | — |
| `cocos run` | `RunCommand` | `--platform <platform>`, `--dest <path>` | — |
| `cocos upload` | `UploadCommand` | `--platform`, `--dest <path>` | `--access-token` |
| `cocos preview` | `PreviewCommand` | `--project <path>` | `-p, --port`（默认 9527） |

### 6.4 全局选项

```
--debug              开启 debug 模式
--no-interactive     关闭交互模式（CI 环境使用）
--config <path>      指定配置文件路径
```

### 6.5 支持的构建平台

`src/core/builder/platforms/` 下包含以下平台：

`web-desktop` | `web-mobile` | `android` | `google-play` | `ios` | `mac` | `windows` | `ohos` | `harmonyos-next`

---

## 7. API 层

### 7.1 CocosAPI 聚合类

`src/api/index.ts`

```typescript
const api = await CocosAPI.create();
// 子 API 实例
api.assets        // AssetsApi
api.builder       // BuilderApi
api.scene         // SceneApi
api.project       // ProjectApi
api.configuration // ConfigurationApi
api.engine        // EngineApi
api.system        // SystemApi
```

所有子模块按需动态 `import()`，避免启动时加载全部模块。

### 7.2 静态快捷方法

```typescript
// 创建项目
CocosAPI.createProject(projectPath, type)

// 构建项目（CLI 入口）
CocosAPI.buildProject(projectPath, platform, options)

// 原生编译
CocosAPI.makeProject(platform, dest)

// 运行
CocosAPI.runProject(platform, dest)

// 上传
CocosAPI.uploadProject(platform, dest, accessToken?)
```

### 7.3 CommonResult 标准响应格式

`src/api/base/schema-base.ts`

所有 API 方法返回统一格式：

```typescript
type CommonResultType<T> = {
    code: 200 | 400 | 404 | 500;  // HTTP 语义状态码
    data?: T;                      // 成功时的数据
    reason?: string;               // 失败时的错误描述
}
```

状态码语义：

| code | 含义 |
|------|------|
| `200` | 成功（`COMMON_STATUS.SUCCESS`） |
| `400` | 参数错误（`COMMON_STATUS.BAD_REQUEST`） |
| `404` | 资源不存在（`COMMON_STATUS.NOT_FOUND`） |
| `500` | 服务器内部错误（`COMMON_STATUS.FAIL`） |

### 7.4 子 API 功能速查

#### AssetsApi
- `queryPath(url)` — 路径/URL/UUID 转换
- `queryAssets(options)` — 资源搜索
- `queryAssetInfo(urlOrUUID)` — 获取资源信息
- `createAsset(path, data, options)` — 创建资源
- `saveAsset(path, data)` — 保存资源
- `importAsset(source, target)` — 导入外部资源
- `deleteAsset(urlOrUUID)` — 删除资源
- `moveAsset(options)` — 移动资源
- `renameAsset(options)` — 重命名资源
- `reimportAsset(urlOrUUID)` — 重新导入

#### BuilderApi
- `build(platform, options)` — 构建项目
- `queryDefaultBuildConfig(platform)` — 获取平台默认配置
- `createBuildTemplate(name)` — 创建构建模板
- `make(platform, dest)` — 原生编译
- `run(platform, dest)` — 运行
- `upload(platform, dest, token?)` — 上传

#### SceneApi
- `queryCurrent()` — 获取当前场景信息
- `open(options)` — 打开场景/预制体
- `close()` — 关闭场景
- `create(options)` — 创建场景
- `save()` — 保存场景
- `reload()` — 重载场景
- `scene.node.*` — 节点操作
- `scene.component.*` — 组件操作
- `scene.prefab.*` — 预制体操作

---

## 8. Core 层

### 8.1 Launcher（启动器）

`src/core/launcher.ts`

```typescript
const launcher = new Launcher(projectPath);

// 仅初始化基础模块
await launcher.init();

// 导入资源（包含 init）
await launcher.import();

// 完整启动（包含 import + HTTP 服务器 + 构建系统）
await launcher.startup(port?);

// 仅构建
await launcher.build(platform, options);

// 预览
await launcher.startPreview(port);
```

### 8.2 Builder（构建器）

`src/core/builder/`

- 插件化架构：每个平台是一个独立插件（`platforms/<platform>/`）
- `pluginManager.register(platform)` 动态加载平台插件
- `build(platform, options)` 执行完整构建流程
- `executeBuildStageTask(options)` 执行特定构建阶段

### 8.3 Assets（资产数据库）

`src/core/assets/`

- `assetManager` — 资产内存管理单例
- `assetDBManager` — 资产数据库文件持久化
- `initAssetDB()` / `startAssetDB()` — 生命周期管理

### 8.4 Scene（场景模块）

`src/core/scene/`

双进程架构：

```
主进程 (main-process)
  └─ 提供 Scene API，通过 RPC 转发请求
        ↕  process-rpc
场景进程 (scene-process)
  └─ 独立进程，实际执行场景操作，避免阻塞
```

### 8.5 Engine（引擎模块）

`src/core/engine/`

- 调用 `@cocos/quick-compiler` + `@cocos/ccbuild` 编译引擎
- 产物运行在 Node.js 环境（不依赖浏览器）
- `initEngine(enginePath, projectPath)` — 初始化引擎实例

---

## 9. MCP 服务器

### 9.1 概述

基于 `@modelcontextprotocol/sdk`，提供 AI 工具（如 GitHub Copilot）调用的 HTTP+MCP 端点。

端点：`http://localhost:<port>/mcp`

### 9.2 工具注册流程

1. 在 API 类的方法上添加装饰器（见第 11 节）
2. `mcp.middleware.ts` 启动时调用 `toolRegistry`（全局 Map）
3. 将每个注册的工具暴露为 MCP tool，参数由 Zod Schema 自动验证

```typescript
// 工具注册示例
@tool('assets-query-path')
@title('Query Asset Path')
@description('Convert asset URL/UUID/path to each other')
@result(SchemaPathResult)
async queryPath(@param(SchemaUrlOrUUIDOrPath) input: string) {
    // ...
}
```

### 9.3 MCP 资源

`ResourceManager` 自动将 `docs/en/` 和 `docs/zh/` 下的 Markdown 文件注册为 MCP 资源，URI 格式为：

```
cli://docs/<relative-path>
```

支持多语言自动检测（根据客户端偏好返回对应语言）。

### 9.4 Builder Hook

`src/mcp/hooks/builder.hook.ts`

订阅构建事件，通过 MCP 推送构建进度给客户端。

### 9.5 启动命令

```bash
# CLI 方式
cocos start-mcp-server --project /path/to/project --port 9527

# 调试方式（使用内置测试项目）
npm run start:mcp-debug

# 使用 MCP Inspector UI 调试
npm run start:mcp-inspector
```

---

## 10. HTTP 服务器

`src/server/`

### 10.1 ServerService

基于 Express.js，支持 HTTP 和 HTTPS 两种模式。

```typescript
serverService.start(port?);   // 启动
serverService.stop();         // 停止
serverService.url;            // "http://localhost:<port>"
serverService.port;           // 当前端口号
```

端口自动探测：若指定端口被占用，自动递增查找可用端口。

### 10.2 中间件系统

```typescript
// 注册中间件
register('mcp', middleware.getMiddlewareContribution());

// IMiddlewareContribution 接口
interface IMiddlewareContribution {
    path: string;
    router: Router;
}
```

### 10.3 附加服务

- **Socket.IO** (`socket.ts`) — 双向实时通信
- **ConsoleLog** (`console-log.ts`) — 将 Node.js `console` 输出推送到连接的客户端

---

## 11. 装饰器系统

`src/api/decorator/decorator.ts`

### 11.1 可用装饰器

| 装饰器 | 作用 | 目标 |
|--------|------|------|
| `@tool(name)` | 注册为 MCP 工具，`name` 必须全局唯一 | 方法 |
| `@title(text)` | 工具标题（MCP 显示用） | 方法 |
| `@description(text)` | 工具描述 | 方法 |
| `@param(schema)` | 方法参数的 Zod Schema | 参数 |
| `@result(schema)` | 方法返回值 Zod Schema（自动包装为 CommonResult） | 方法 |

### 11.2 完整示例

```typescript
import { tool, title, description, param, result } from '../decorator/decorator';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { z } from 'zod';

const SchemaInput = z.string().describe('Input text');
const SchemaOutput = z.object({ message: z.string() });

export class MyApi {
    @tool('my-api-hello')
    @title('Say Hello')
    @description('Returns a greeting message')
    @result(SchemaOutput)
    async hello(@param(SchemaInput) input: string): Promise<CommonResultType<{ message: string }>> {
        return {
            code: COMMON_STATUS.SUCCESS,
            data: { message: `Hello, ${input}!` }
        };
    }
}
```

### 11.3 工具名命名约定

格式：`<模块>-<动作>[-<对象>]`

示例：`assets-query-path`、`builder-build`、`scene-open`、`project-close`

### 11.4 toolRegistry

`toolRegistry` 是全局 Map，Key 为工具名，Value 包含方法引用和元数据。`McpMiddleware` 在构造时遍历此 Map 完成 MCP 工具注册。

---

## 12. i18n 国际化

### 12.1 文件结构

```
static/i18n/
├── zh/
│   ├── assets.json
│   ├── builder.json
│   ├── common.json
│   └── importer.json
└── en/
    ├── assets.json
    ├── builder.json
    ├── common.json
    └── importer.json
```

### 12.2 使用

```typescript
import i18n from '../i18n';

const msg = i18n.t('builder.error.check_options_failed');
const asset = i18n.t('assets.saveAsset.fail.asset');
```

### 12.3 Key 命名约定

`<模块>.<功能>.<状态>.<细节>`

例：`builder.error.check_options_failed`、`assets.saveAsset.fail.asset`

### 12.4 添加新翻译

1. 确定 Key 前缀对应的 JSON 文件（如 `new-module.*` → `new-module.json`）
2. 在 `zh/` 和 `en/` 下同步添加
3. 使用嵌套 JSON 对象组织

---

## 13. 测试体系

### 13.1 单元测试

框架：Jest + ts-jest

```bash
npm test                  # 运行所有单元测试
npm run test:watch        # 监听模式
npm run test:coverage     # 生成覆盖率报告
npm run test:quiet        # 静默模式
```

**测试根目录**：`src/core/**` + `tests/`

**配置文件**：`jest.config.ts`

```typescript
{
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src/core', '<rootDir>/tests'],
    maxWorkers: 1,           // 单线程（避免并发问题）
    testTimeout: 100000,     // 100s 超时（引擎初始化慢）
    forceExit: true,
    detectOpenHandles: true,
    globalTeardown: '<rootDir>/src/core/test/global-teardown.ts',
}
```

### 13.2 E2E 测试

```bash
npm run test:e2e               # 标准 E2E
npm run test:e2e:debug         # 保留测试项目（调试用）
npm run test:all               # 单元 + E2E
npm run check:e2e-coverage     # 覆盖率控制台报告
npm run check:e2e-coverage:report  # 覆盖率 HTML 报告
```

E2E 测试位于 `e2e/` 目录，使用真实 CLI 进程调用（`e2e/helpers/cli-runner.ts`）。

测试分类：

| 文件 | 覆盖场景 |
|------|---------|
| `e2e/cli/build.e2e.test.ts` | 各平台构建流程 |
| `e2e/cli/create.e2e.test.ts` | 项目创建 |
| `e2e/mcp/server.e2e.test.ts` | MCP 服务器接口 |

### 13.3 测试夹具

测试项目位于 `tests/fixtures/`，包含预制 Cocos 项目用于集成测试。

---

## 14. VS Code 扩展模式

`src/index.ts`（入口）

### 14.1 激活流程

```
VS Code 工作区打开
  └─ activate(context, port?)
       ├─ 检测当前工作区是否包含 package.json
       ├─ 验证是否为 Cocos 项目（检查引擎版本等）
       ├─ 调用 startServer(folder, port)
       └─ 注册 McpHttpServerDefinition
            └─ URL: http://localhost:<port>/mcp
```

### 14.2 MCP Provider 注册

```typescript
vscode.lm.registerMcpServerDefinitionProvider(PROVIDER_ID, {
    provideMcpServerDefinitions: async () => {
        await startServer(folder, port);
        return [new vscode.McpHttpServerDefinition('Cocos CLI MCP Server', uri)];
    }
});
```

### 14.3 工作区变化监听

当 VS Code 工作区切换时，MCP Provider 会触发 `onDidChangeMcpServerDefinitions` 事件，重新检测并决定是否启动服务器。

---

## 15. 常见开发任务

### 15.1 新增 CLI 命令

1. 在 `src/commands/` 下创建新文件，继承 `BaseCommand`
2. 实现 `register()` 方法，调用 `this.program.command(...).option(...).action(...)`
3. 在 `src/commands/index.ts` 中导出
4. 在 `src/cli.ts` 中实例化并注册

```typescript
// src/commands/my-command.ts
export class MyCommand extends BaseCommand {
    register(): void {
        this.program
            .command('my-cmd')
            .description('My command description')
            .requiredOption('-j, --project <path>', 'Project path')
            .action(async (options) => {
                const resolvedPath = this.validateProjectPath(options.project);
                const { CocosAPI } = await import('../api/index');
                // ...
            });
    }
}
```

### 15.2 新增 MCP 工具

1. 在对应 API 类中添加方法，使用装饰器标注
2. 参数和返回值必须使用 Zod Schema 描述
3. 工具名必须全局唯一（`@tool('module-action')`）
4. 运行 `npm run generate:mcp-types` 更新类型定义

```typescript
@tool('my-module-do-something')
@title('Do Something')
@description('This tool does something useful')
@result(z.object({ result: z.string() }))
async doSomething(@param(z.string().describe('Input')) input: string) {
    return { code: COMMON_STATUS.SUCCESS, data: { result: input.toUpperCase() } };
}
```

### 15.3 新增平台支持

在 `src/core/builder/platforms/` 下创建平台目录，参考 `web-mobile/` 结构，实现平台插件接口。

### 15.4 调试 CLI

```bash
# 构建后调试
npm run build
node --inspect-brk ./dist/cli.js build --project ./tests/fixtures/projects/asset-operation

# 然后在 VS Code 中 Attach to Node.js Process
```

### 15.5 调试 MCP 服务器

```bash
# 启动带测试项目的 MCP 服务器
npm run start:mcp-debug

# 打开 MCP Inspector 调试 UI
npm run start:mcp-inspector
```

### 15.6 更新 i18n 类型

```bash
node workflow/generate-i18n-types.js
```

### 15.7 生成 DTS 快照

```bash
npm run generate:dts
```

---

## 附录：关键依赖说明

| 包 | 用途 |
|----|------|
| `commander` | CLI 参数解析框架 |
| `@modelcontextprotocol/sdk` | MCP 协议实现 |
| `express` | HTTP 服务器 |
| `socket.io` | WebSocket 双向通信 |
| `zod` | Schema 验证与类型推导 |
| `zod-to-json-schema` | Zod → JSON Schema 转换（MCP 工具参数描述） |
| `reflect-metadata` | 装饰器元数据反射 |
| `sharp` | 图像处理（需要原生模块） |
| `@cocos/ccbuild` | Cocos 引擎构建器 |
| `@cocos/quick-compiler` | 引擎快速编译 |
| `@cocos/asset-db` | 资产数据库 |
| `listr2` | 任务列表进度展示 |
| `chalk` / `ora` | 终端彩色输出 / Spinner |
| `pino` | 高性能日志库 |
| `i18next` | 国际化框架 |
| `inquirer` | 交互式命令行提示 |
| `@sentry/node` | 错误监控（生产环境） |
