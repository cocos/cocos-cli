# 测试项目管理器使用指南

本指南说明如何使用 E2E 测试项目管理器来统一管理测试项目。

## 🎯 核心特性

- ✅ **统一工作区** - 所有测试项目在 `e2e/.workspace/` 下
- ✅ **共享项目** - 只读测试可以共享同一个项目副本，节省资源
- ✅ **自动清理缓存** - 自动删除 `.gitignore` 忽略的文件和 Cocos 缓存目录
- ✅ **测试隔离** - 每个写入测试使用独立的项目副本
- ✅ **调试友好** - 支持保留工作区用于调试
- ✅ **自动管理** - 测试前初始化，测试后自动清理

---

## 📊 选择合适的方式

| 测试类型 | 推荐方式 | API | 特点 |
|---------|---------|-----|------|
| **只读测试** | 共享项目 ⭐⭐⭐ | `getSharedTestProject()` | 多个测试复用，节省资源 |
| **写入测试** | 独立项目 ⭐⭐ | `createTestProject()` | 完全隔离，可修改内容 |
| **临时测试** | 临时项目 ⭐ | `createTempTestProject()` | 系统临时目录，不占用工作区 |

**示例分类：**

- 🟢 **只读测试（使用共享项目）：** `server.e2e.test.ts`、`project.e2e.test.ts`、`info.e2e.test.ts`
- 🟡 **写入测试（使用独立项目）：** `assets.e2e.test.ts`、`scene.e2e.test.ts`、`builder.e2e.test.ts`、`build.e2e.test.ts`

---

## 📦 自动清理的内容

### 1. Cocos 项目缓存目录

以下目录会在复制项目前自动清理：

```
library/     # 编译缓存
temp/        # 临时文件
local/       # 本地数据
build/       # 构建输出
profiles/    # 旧的配置文件
settings/    # 旧的设置
packages/    # 旧工程支持的插件包
node_modules/  # Node 模块
```

### 2. .gitignore 忽略的文件

项目的 `.gitignore` 中列出的文件和目录也会被清理。

---

## 🚀 使用方式

### 方式 1：共享只读项目（推荐用于只读测试）⭐⭐⭐

**适用场景：** 只查询信息、不修改项目的测试（如 `server.e2e.test.ts`、`project.e2e.test.ts`、`info.e2e.test.ts`）

```typescript
import { getSharedTestProject } from '../helpers/test-utils';
import { resolve } from 'path';

describe('My Read-Only Test Suite', () => {
    let testProject: TestProject;

    beforeAll(async () => {
        const fixtureProject = resolve(__dirname, '../../tests/fixtures/projects/asset-operation');
        
        // 获取共享项目（多个测试套件可以复用同一个项目）
        testProject = await getSharedTestProject(fixtureProject, 'readonly-common');
        
        console.log(`共享项目路径: ${testProject.path}`);
    });

    afterAll(async () => {
        // 共享项目不会立即清理，由测试框架统一清理
        await testProject.cleanup();
    });

    test('should query info', async () => {
        // 只读操作：使用 testProject.path
        // 不要修改项目内容！
    });
});
```

**优点：**

- ✅ 多个测试套件共享同一个项目副本
- ✅ 减少磁盘占用和复制时间
- ✅ 测试启动更快

**注意：**

- ⚠️ 只适用于只读测试
- ⚠️ 不要在测试中修改项目内容

### 方式 2：独立项目（推荐用于写入测试）⭐⭐

**适用场景：** 会创建、修改、删除资源的测试（如 `assets.e2e.test.ts`、`builder.e2e.test.ts`）

```typescript
import { createTestProject } from '../helpers/test-utils';
import { resolve } from 'path';

describe('My Write Test Suite', () => {
    let testProject: TestProject;

    beforeAll(async () => {
        const fixtureProject = resolve(__dirname, '../../tests/fixtures/projects/asset-operation');
        
        // 创建独立测试项目（自动清理缓存）
        testProject = await createTestProject(fixtureProject);
        
        console.log(`测试项目路径: ${testProject.path}`);
    });

    afterAll(async () => {
        // 清理测试项目
        await testProject.cleanup();
    });

    test('should create asset', async () => {
        // 可以修改项目：使用 testProject.path
    });
});
```

**优点：**

- ✅ 每个测试套件有独立的项目副本
- ✅ 测试之间完全隔离
- ✅ 可以随意修改项目内容

### 方式 3：直接使用项目管理器

```typescript
import { getProjectManager } from '../helpers/project-manager';
import { resolve } from 'path';

describe('My Test Suite', () => {
    let projectPath: string;

    beforeAll(async () => {
        const projectManager = getProjectManager();
        const fixtureProject = resolve(__dirname, '../../tests/fixtures/projects/asset-operation');
        
        const testProject = await projectManager.createTestProject(fixtureProject, 'my-test');
        projectPath = testProject.path;
    });

    test('should work', async () => {
        // 使用 projectPath
    });
});
```

### 方式 4：临时项目（不保留在工作区）

```typescript
import { createTempTestProject } from '../helpers/test-utils';

describe('Temporary Test', () => {
    let testProject: TestProject;

    beforeAll(async () => {
        // 创建临时测试项目（使用系统临时目录）
        testProject = await createTempTestProject(fixtureProject);
    });

    afterAll(async () => {
        await testProject.cleanup();
    });

    test('should work', async () => {
        // 使用 testProject.path
    });
});
```

---

## 🔧 工作区配置

### 默认配置

```typescript
{
    workspaceRoot: 'e2e/.workspace/',  // 工作区根目录
    cleanBeforeTest: true,              // 测试前清理工作区
    preserveAfterTest: false,           // 测试后删除工作区
}
```

### 调试模式

保留测试工作区用于调试：

```bash
# 设置环境变量
E2E_PRESERVE_WORKSPACE=true npm run test:e2e

# 或使用专用脚本
npm run test:e2e:debug
```

调试完成后手动删除工作区：

```bash
rm -rf e2e/.workspace
```

---

## 📂 工作区目录结构

```
e2e/
├── .workspace/                       # 测试工作区（.gitignore 已忽略）
│   ├── test-project-1234567890-abc/  # 自动生成的项目目录
│   │   ├── assets/
│   │   ├── cocos.config.json
│   │   └── ...                       # 源文件（已清理缓存）
│   └── test-project-1234567891-xyz/
│       └── ...
├── helpers/
│   └── project-manager.ts            # 项目管理器
└── ...
```

---

## 🎨 实际使用示例

### 示例 1：MCP API 测试

```typescript
import { MCPTestClient } from '../helpers/mcp-client';
import { createTestProject, getAvailablePort } from '../helpers/test-utils';
import { resolve } from 'path';

describe('MCP Assets API', () => {
    let testProject: TestProject;
    let mcpClient: MCPTestClient;
    let serverPort: number;

    beforeAll(async () => {
        // 复制测试项目（自动清理缓存）
        const fixtureProject = resolve(__dirname, '../../tests/fixtures/projects/asset-operation');
        testProject = await createTestProject(fixtureProject);

        // 获取可用端口
        serverPort = await getAvailablePort(9529);

        // 创建并启动 MCP 客户端
        mcpClient = new MCPTestClient({
            projectPath: testProject.path,  // 使用测试项目路径
            port: serverPort,
        });

        await mcpClient.start();
    });

    afterAll(async () => {
        // 关闭客户端
        if (mcpClient) {
            await mcpClient.close();
        }

        // 清理测试项目
        await testProject.cleanup();
    });

    test('should create asset', async () => {
        const result = await mcpClient.callTool('asset-create', {
            url: 'db://assets/test-asset',
            type: 'folder',
        });

        expect(result.code).toBe(200);
    });
});
```

### 示例 2：CLI 构建测试

```typescript
import { cliRunner } from '../helpers/cli-runner';
import { createTestProject } from '../helpers/test-utils';

describe('cocos build', () => {
    let testProject: TestProject;

    beforeAll(async () => {
        const fixtureProject = resolve(__dirname, '../../tests/fixtures/projects/build-test');
        testProject = await createTestProject(fixtureProject);
    });

    afterAll(async () => {
        await testProject.cleanup();
    });

    test('should build web-desktop project', async () => {
        const result = await cliRunner.build({
            project: testProject.path,
            platform: 'web-desktop',
            debug: true,
        });

        expect(result.exitCode).toBe(0);
    });
});
```

---

## ⚠️ 最佳实践

### ✅ 推荐做法

1. **使用 `createTestProject`** - 让项目管理器自动处理缓存清理

   ```typescript
   const testProject = await createTestProject(fixtureProject);
   ```

2. **始终调用 `cleanup()`** - 在 `afterAll` 中清理

   ```typescript
   afterAll(async () => {
       await testProject.cleanup();
   });
   ```

3. **使用 `beforeAll`** - 在所有测试前创建一次项目

   ```typescript
   beforeAll(async () => {
       testProject = await createTestProject(fixtureProject);
   });
   ```

4. **调试时保留工作区** - 使用环境变量

   ```bash
   E2E_PRESERVE_WORKSPACE=true npm run test:e2e
   ```

### ❌ 避免做法

1. **不要手动复制项目** - 会跳过缓存清理

   ```typescript
   // ❌ 不推荐
   await copy(source, dest);
   
   // ✅ 推荐
   const testProject = await createTestProject(source);
   ```

2. **不要在 `beforeEach` 中创建项目** - 太慢且浪费资源

   ```typescript
   // ❌ 不推荐
   beforeEach(async () => {
       testProject = await createTestProject(fixtureProject);
   });
   
   // ✅ 推荐
   beforeAll(async () => {
       testProject = await createTestProject(fixtureProject);
   });
   ```

3. **不要忘记清理** - 会积累临时文件

   ```typescript
   // ❌ 不推荐
   afterAll(async () => {
       // 忘记清理
   });
   
   // ✅ 推荐
   afterAll(async () => {
       await testProject.cleanup();
   });
   ```

---

## 🐛 故障排查

### 问题 1：测试后工作区未清理

**原因：** 测试失败或中断

**解决：**

```bash
# 手动清理
rm -rf e2e/.workspace

# 或运行清理脚本
npm run clean:e2e:workspace
```

### 问题 2：缓存目录仍然存在

**原因：** 使用了旧的 `copyTestProject` 函数

**解决：** 改用新的 `createTestProject`

```typescript
// 旧代码
const projectPath = await copyTestProject(fixtureProject);

// 新代码
const testProject = await createTestProject(fixtureProject);
const projectPath = testProject.path;
```

### 问题 3：需要查看测试项目内容

**原因：** 调试需要

**解决：** 使用调试模式

```bash
E2E_PRESERVE_WORKSPACE=true npm run test:e2e

# 测试完成后查看
ls -la e2e/.workspace/
```

---

## 📊 迁移指南

### 从旧 API 迁移到新 API

```typescript
// ===== 旧代码 =====
import { copyTestProject, cleanupTempDir } from '../helpers/test-utils';

let testProjectPath: string;

beforeAll(async () => {
    testProjectPath = await copyTestProject(fixtureProject);
});

afterAll(async () => {
    await cleanupTempDir(testProjectPath);
});

// ===== 新代码 =====
import { createTestProject } from '../helpers/test-utils';
import { TestProject } from '../helpers/project-manager';

let testProject: TestProject;

beforeAll(async () => {
    testProject = await createTestProject(fixtureProject);
});

afterAll(async () => {
    await testProject.cleanup();
});

// 使用时将 testProjectPath 改为 testProject.path
```

---

## 📚 API 参考

### createTestProject

创建测试项目（使用工作区）

```typescript
function createTestProject(
    sourceProject: string,
    projectName?: string
): Promise<TestProject>
```

### createTempTestProject

创建临时测试项目（使用系统临时目录）

```typescript
function createTempTestProject(
    sourceProject: string
): Promise<TestProject>
```

### TestProject

```typescript
interface TestProject {
    path: string;        // 项目路径
    name: string;        // 项目名称
    cleanup: () => Promise<void>;  // 清理函数
}
```

### E2EProjectManager

```typescript
class E2EProjectManager {
    initialize(): Promise<void>;
    createTestProject(source: string, name?: string): Promise<TestProject>;
    createTempProject(source: string): Promise<TestProject>;
    cleanProjectCache(projectPath: string): Promise<void>;
    cleanupAll(): Promise<void>;
    getWorkspaceRoot(): string;
}
```

---

## 🔗 相关文档

- [E2E 测试主文档](../README.md)
- [CLI 路径配置指南](./CLI-PATH-GUIDE.md)
- [E2E 测试使用指南](./USAGE.md)

---

**需要帮助？** 请查看 [E2E 测试主文档](../README.md) 或提交 Issue。
