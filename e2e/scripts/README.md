# E2E 测试脚本

本目录包含 E2E 测试相关的辅助脚本。

## 📋 脚本说明

### check-coverage.ts

检查 E2E 测试覆盖率，扫描所有 MCP API 工具和 E2E 测试文件，识别哪些 API 缺少 E2E 测试。

## 🚀 使用方法

### 快捷命令（推荐）

```bash
# 1. 控制台查看（快速检查）
npm run check:e2e-coverage

# 2. 生成 HTML 报告（推荐，可视化效果好）⭐
npm run check:e2e-coverage:report
```

### 1. 基本用法（控制台输出）

```bash
# 使用 tsx 直接运行
npx tsx e2e/scripts/check-coverage.ts

# 或者使用 ts-node
npx ts-node e2e/scripts/check-coverage.ts
```

**输出示例：**

```
🔍 扫描 MCP API 工具定义...

✅ 找到 45 个 MCP 工具

🔍 扫描 E2E 测试文件...

✅ 找到 38 个测试引用

================================================================================
📊 E2E 测试覆盖率报告
================================================================================

✅ 已测试的 API: 38 / 45 (84.44%)
❌ 未测试的 API: 7

================================================================================
⚠️  缺失 E2E 测试的 API 接口
================================================================================

### Assets API (3 个未测试)

- [ ] `assets.import`
      文件: src/api/assets/assets.ts
      方法: importAssets()

- [ ] `assets.delete`
      文件: src/api/assets/assets.ts
      方法: deleteAsset()

...
```

### 2. 生成 Markdown 报告

```bash
# 生成 Markdown 格式的报告（用于 GitHub Actions 或文档）
npx tsx e2e/scripts/check-coverage.ts --markdown
```

**输出示例：**

```markdown
## 📊 E2E 测试覆盖率报告

**覆盖率**: 84.44% (38/45)

### ⚠️ 缺失 E2E 测试的 API 接口 (7 个)

#### Assets API

- [ ] `assets.import` (`src/api/assets/assets.ts:importAssets()`)
- [ ] `assets.delete` (`src/api/assets/assets.ts:**deleteAsset**()`)
```

### 3. 保存报告到文件

```bash
# 保存为文本文件
npx tsx e2e/scripts/check-coverage.ts > coverage-report.txt

# 保存 Markdown 报告
npx tsx e2e/scripts/check-coverage.ts --markdown > coverage-report.md
```

### 4. 生成 HTML 报告文件 ✨

```bash
# 生成 HTML 报告（推荐）
npm run check:e2e-coverage:report

# 或使用完整命令
npx tsx e2e/scripts/check-coverage.ts --save
npx tsx e2e/scripts/check-coverage.ts --html
npx tsx e2e/scripts/check-coverage.ts --report
```

**生成的文件：**

```
e2e/server/reports/
└── coverage-report-2025-10-28T15-30-45.html  # 漂亮的 HTML 报告
```

**打开 HTML 报告：**

```bash
# Windows
start e2e/server/reports/coverage-report-*.html

# macOS
open e2e/server/reports/coverage-report-*.html

# Linux
xdg-open e2e/server/reports/coverage-report-*.html
```

## 📊 报告内容

覆盖率检查报告包含以下信息：

### 1. 总体统计

- 已测试的 API 数量
- 未测试的 API 数量
- 覆盖率百分比

### 2. 未测试的 API 列表

按类别分组，显示：

- API 工具名称
- 源文件路径
- 方法名称

### 3. 建议

- 推荐的测试文件位置
- 示例测试代码

### 4. 详细统计

按类别显示覆盖率进度条：

```
按类别统计：

Assets          ████████████████░░░░ 80% (16/20)
Builder         ██████████████████░░ 90% (9/10)
Scene           ███████████████░░░░░ 75% (12/16)
Project         ████████████████████ 100% (5/5)
```

## 🔍 工作原理

### 扫描 API 工具

脚本会扫描 `src/api/` 目录下的所有 TypeScript 文件，查找使用 `@tool` 装饰器定义的 MCP 工具：

```typescript
@tool('api-tool-name')
async methodName(params: any) {
  // ...
}
```

### 扫描测试引用

脚本会扫描 `e2e/` 目录下的所有测试文件（`*.e2e.test.ts`），查找 `callTool` 调用：

```typescript
await mcpClient.callTool('api-tool-name', {
  // 参数
});
```

### 匹配分析

将扫描到的 API 工具和测试引用进行匹配，识别哪些 API 缺少测试覆盖。

## 🎯 退出码

- `0`: 所有 API 都有测试覆盖
- `1`: 存在未测试的 API

这使得脚本可以在 CI/CD 流程中使用，当有未测试的 API 时可以触发警告或失败。

## 📊 HTML 报告预览

生成的 HTML 报告包含：

- 📈 **漂亮的统计卡片** - 总数、已测试、未测试
- 📊 **可视化进度条** - 直观显示覆盖率
- 📋 **分类统计图表** - 各类别的覆盖情况
- 📝 **详细 API 列表** - 未测试的 API 及其位置
- 🎨 **现代化设计** - 响应式布局，美观易读

**文件位置：**

```
e2e/server/reports/coverage-report-2025-10-28T15-30-45.html
```

**文件名格式：**

- `coverage-report-[时间戳].html`
- 时间戳格式：`YYYY-MM-DDTHH-mm-ss`（ISO 格式）
- 每次生成都会创建新文件，不会覆盖历史记录
- 报告会自动提示快速打开命令

## 💡 使用场景

### 1. 本地开发

在添加新 API 后，运行检查确认是否需要添加测试：

```bash
# 1. 添加新的 API
# 2. 快速检查
npm run check:e2e-coverage

# 3. 生成详细的 HTML 报告
npm run check:e2e-coverage:report

# 4. 根据提示打开报告
start e2e/server/reports/coverage-report-*.html  # Windows

# 5. 如果有未测试的 API，添加测试
# 6. 再次检查
npm run check:e2e-coverage:report
```

### 2. Git 提交前

使用 Git hooks 在提交前自动检查：

```bash
# .husky/pre-commit
npx tsx e2e/scripts/check-coverage.ts || echo "⚠️ 部分 API 缺少 E2E 测试"
```

### 3. CI/CD 流程

在 GitHub Actions 中自动检查并生成报告：

```yaml
- name: Check E2E coverage
  run: npx tsx e2e/scripts/check-coverage.ts --markdown
```

### 4. 生成文档

定期生成覆盖率报告作为项目文档：

```bash
# 生成 HTML 报告到 e2e/server/reports 目录
npm run check:e2e-coverage:report
```

### 5. 定期检查

设置定时任务，自动生成覆盖率报告：

```bash
# 每周一早上 9:00 生成 HTML 报告
# crontab -e
0 9 * * 1 cd /path/to/project && npm run check:e2e-coverage:report
```

## 🔧 配置

脚本的扫描目录在代码中定义：

```typescript
const API_DIRS = ['src/api'];        // API 源码目录
const E2E_TEST_DIRS = ['e2e'];       // E2E 测试目录
```

如需修改扫描范围，可以编辑 `check-coverage.ts` 文件。

## 🐛 常见问题

### Q: tsx 命令未找到

**A:** 安装 tsx：

```bash
npm install -D tsx
```

或使用 npx 自动下载：

```bash
npx tsx e2e/scripts/check-coverage.ts
```

### Q: 报告显示 API 未测试，但实际已有测试

**A:** 确保测试文件中使用正确的调用方式：

```typescript
// ✅ 正确 - 会被识别
await mcpClient.callTool('api-tool-name', params);

// ❌ 错误 - 不会被识别（变量名）
const toolName = 'api-tool-name';
await mcpClient.callTool(toolName, params);
```

### Q: 添加了新的 API 模块，如何让脚本识别？

**A:** 只需在 `src/api/index.ts` 中添加导入即可，脚本会自动识别：

```typescript
// 1. 在 src/api/index.ts 中添加
import { MyNewApi } from './my-new/my-new';

// 2. 在 CocosAPI 类中声明
public myNew: MyNewApi;

// 3. 在构造函数中初始化
this.myNew = new MyNewApi();
```

脚本会自动：

- 识别 `MyNew` 模块
- 推荐测试文件：`e2e/mcp/api/my-new.e2e.test.ts`
- 检查测试文件是否存在

### Q: 想要排除某些 API 不检查

**A:** 目前脚本会检查所有使用 `@tool` 装饰器的 API。如需排除，可以在脚本中添加过滤逻辑：

```typescript
// 在 scanApiTools() 函数中添加
const EXCLUDED_TOOLS = ['internal-tool', 'debug-tool'];

for (const match of matches) {
    const toolName = match[1];
    if (EXCLUDED_TOOLS.includes(toolName)) {
        continue;  // 跳过排除的工具
    }
    // ...
}
```

## 📈 持续改进

建议定期（如每周/每月）检查并提升覆盖率：

1. **设置目标**: 例如达到 90% 覆盖率
2. **优先级排序**: 先为核心 API 添加测试
3. **跟踪进度**: 记录覆盖率变化趋势
4. **团队规范**: 新增 API 必须包含 E2E 测试

## 🔗 相关文档

- [E2E 测试指南](../README.md)
- [E2E 覆盖率检查文档](../docs/E2E-COVERAGE-CHECK.md)
- [GitHub Workflows 本地测试](../../.github/workflows/README.md)

## 📂 生成的报告文件

所有报告文件保存在 `e2e/server/reports/` 目录：

```
e2e/server/reports/
├── test-report-2025-10-28-15-27-48.html       # E2E 测试报告
└── coverage-report-2025-10-28T15-30-45.html   # 覆盖率 HTML 报告
```

**清理旧报告：**

由于 setup.ts 会自动清理超过 10 个的测试报告，覆盖率报告也建议定期清理：

```bash
# 手动清理旧的覆盖率报告（保留最新 5 个）
ls -t e2e/server/reports/coverage-report-*.html | tail -n +6 | xargs rm -f
```

---

**快速开始**:

```bash
# 控制台查看
npm run check:e2e-coverage

# 生成 HTML 报告
npm run check:e2e-coverage:report
```
