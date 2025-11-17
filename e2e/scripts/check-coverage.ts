/**
 * 检查 E2E 测试覆盖率
 * 
 * 通过 toolRegistry 扫描所有已注册的 MCP 工具和 E2E 测试文件，检查哪些 API 缺少 E2E 测试。
 * 
 * 用法：
 *   npx tsx e2e/scripts/check-coverage.ts
 */

import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import { scanToolsFromRegistry, extendToolInfo } from './tool-utils';

interface ApiTool {
    name: string;
    category: string;
    filePath?: string;  // 可选，因为运行时数据不包含文件路径
    methodName: string;
    title?: string;
    description?: string;
}

interface TestReference {
    toolName: string;
    testFile: string;
    lineNumber: number;
}

const E2E_TEST_DIRS = ['e2e'];

/**
 * 扫描所有 MCP 工具定义 (通过 toolRegistry)
 * 
 * 这个方法与 mcp.middleware.ts 中的实现保持一致，
 * 确保统计的工具数量与实际注册的 MCP 工具一致。
 */
async function scanApiTools(): Promise<ApiTool[]> {
    // 使用共享的工具扫描函数
    const baseTools = await scanToolsFromRegistry();

    // 转换为 ApiTool 格式，添加类别字段
    return baseTools.map(tool => {
        const extended = extendToolInfo(tool);
        return {
            name: extended.toolName,
            category: extended.category,
            // filePath 不再可用，因为运行时数据不包含文件路径信息
            filePath: undefined,
            methodName: extended.methodName,
            title: extended.title,
            description: extended.description,
        };
    });
}

/**
 * 扫描 E2E 测试中的工具调用
 */
function scanTestReferences(): TestReference[] {
    const references: TestReference[] = [];

    for (const dir of E2E_TEST_DIRS) {
        const files = glob.sync(`${dir}/**/*.e2e.test.ts`);

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8');
            const lines = content.split('\n');

            // 匹配 mcpClient.callTool('tool-name', ...) 或 cliRunner.xxx()
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // MCP 工具调用: callTool('tool-name', ...)
                const mcpMatches = line.matchAll(/callTool\(['"]([^'"]+)['"]/g);
                for (const match of mcpMatches) {
                    references.push({
                        toolName: match[1],
                        testFile: file,
                        lineNumber: i + 1,
                    });
                }
            }
        }
    }

    return references;
}

/**
 * 扫描 API 索引文件，获取所有 API 模块信息
 */
function scanApiModules(): Map<string, { moduleName: string; importPath: string; testFile: string }> {
    const apiIndexPath = 'src/api/index.ts';
    const modules = new Map<string, { moduleName: string; importPath: string; testFile: string }>();

    if (!fs.existsSync(apiIndexPath)) {
        console.warn(`⚠️  API 索引文件不存在: ${apiIndexPath}`);
        return modules;
    }

    const content = fs.readFileSync(apiIndexPath, 'utf-8');

    // 匹配 import 语句: import { XxxApi } from './xxx/xxx';
    const importPattern = /import\s+{\s*(\w+Api)\s*}\s+from\s+['"]\.\/([^'"]+)['"]/g;
    const matches = content.matchAll(importPattern);

    for (const match of matches) {
        const apiClassName = match[1];  // 例如: AssetsApi
        const importPath = match[2];     // 例如: assets/assets

        // 从类名推断类别: AssetsApi -> Assets
        const category = apiClassName.replace(/Api$/, '');

        // 根据导入路径推断测试文件
        const pathParts = importPath.split('/');
        const mainModule = pathParts[0];  // 第一部分: assets, builder, scene 等

        // 特殊处理: scene 下的 node 和 component 都放在 scene 测试文件中
        const testFile = mainModule === 'scene' && (category === 'Node' || category === 'Component')
            ? 'e2e/mcp/api/scene.e2e.test.ts'
            : `e2e/mcp/api/${mainModule}.e2e.test.ts`;

        modules.set(category, {
            moduleName: mainModule,
            importPath: importPath,
            testFile: testFile
        });
    }

    return modules;
}

/**
 * 生成覆盖率报告
 */
function generateReport(tools: ApiTool[], references: TestReference[]) {
    // 统计每个工具的测试引用次数
    const testCounts = new Map<string, TestReference[]>();
    for (const ref of references) {
        if (!testCounts.has(ref.toolName)) {
            testCounts.set(ref.toolName, []);
        }
        testCounts.get(ref.toolName)!.push(ref);
    }

    // 分类统计
    const testedTools: ApiTool[] = [];
    const untestedTools: ApiTool[] = [];

    for (const tool of tools) {
        if (testCounts.has(tool.name)) {
            testedTools.push(tool);
        } else {
            untestedTools.push(tool);
        }
    }

    // 按类别分组未测试的工具
    const untestedByCategory = new Map<string, ApiTool[]>();
    for (const tool of untestedTools) {
        if (!untestedByCategory.has(tool.category)) {
            untestedByCategory.set(tool.category, []);
        }
        untestedByCategory.get(tool.category)!.push(tool);
    }

    // 计算覆盖率
    const totalTools = tools.length;
    const testedCount = testedTools.length;
    const coveragePercent = totalTools > 0 ? ((testedCount / totalTools) * 100).toFixed(2) : '0.00';

    console.log('');
    console.log('='.repeat(80));
    console.log('📊 E2E 测试覆盖率报告');
    console.log('='.repeat(80));
    console.log('');

    console.log(`✅ 已测试的 API: ${testedCount} / ${totalTools} (${coveragePercent}%)`);
    console.log(`❌ 未测试的 API: ${untestedTools.length}`);
    console.log('');

    if (untestedTools.length > 0) {
        console.log('='.repeat(80));
        console.log('⚠️  缺失 E2E 测试的 API 接口');
        console.log('='.repeat(80));
        console.log('');

        for (const [category, categoryTools] of Array.from(untestedByCategory.entries()).sort()) {
            console.log(`### ${category} API (${categoryTools.length} 个未测试)`);
            console.log('');

            for (const tool of categoryTools) {
                const relativePath = tool.filePath ? path.relative(process.cwd(), tool.filePath).replace(/\\/g, '/') : 'N/A';
                console.log(`- [ ] \`${tool.name}\``);
                console.log(`      文件: ${relativePath}`);
                console.log(`      方法: ${tool.methodName}()`);
                console.log('');
            }
        }

        console.log('='.repeat(80));
        console.log('💡 建议');
        console.log('='.repeat(80));
        console.log('');
        console.log('请为以上 API 添加 E2E 测试用例。测试文件位置：');
        console.log('');

        // 动态生成测试文件建议
        const apiModules = scanApiModules();
        const testFileStatus = new Map<string, boolean>();

        // 检查测试文件是否存在
        for (const [category] of untestedByCategory.entries()) {
            const moduleInfo = apiModules.get(category);
            if (moduleInfo) {
                const exists = fs.existsSync(moduleInfo.testFile);
                testFileStatus.set(moduleInfo.testFile, exists);
            }
        }

        for (const [category] of Array.from(untestedByCategory.entries()).sort()) {
            const moduleInfo = apiModules.get(category);
            if (moduleInfo) {
                const exists = testFileStatus.get(moduleInfo.testFile);
                const status = exists ? '' : ' (需创建)';
                const suffix = (category === 'Node' || category === 'Component') ? ` (${category} API)` : '';
                console.log(`- ${category} API → ${moduleInfo.testFile}${suffix}${status}`);
            } else {
                // 未找到模块信息，使用默认建议
                console.log(`- ${category} API → e2e/mcp/api/${category.toLowerCase()}.e2e.test.ts (建议创建)`);
            }
        }
        console.log('');

        console.log('示例测试代码：');
        console.log('');
        console.log('```typescript');
        console.log("test('should call api-tool-name', async () => {");
        console.log("    const result = await mcpClient.callTool('api-tool-name', {");
        console.log('        // 参数');
        console.log('    });');
        console.log('    expect(result).toBeDefined();');
        console.log('});');
        console.log('```');
        console.log('');
    } else {
        console.log('🎉 所有 API 都有 E2E 测试覆盖！');
        console.log('');
    }

    // 额外的统计信息
    console.log('='.repeat(80));
    console.log('📈 详细统计');
    console.log('='.repeat(80));
    console.log('');

    const categoryStats = new Map<string, { total: number; tested: number }>();
    for (const tool of tools) {
        if (!categoryStats.has(tool.category)) {
            categoryStats.set(tool.category, { total: 0, tested: 0 });
        }
        const stats = categoryStats.get(tool.category)!;
        stats.total++;
        if (testCounts.has(tool.name)) {
            stats.tested++;
        }
    }

    console.log('按类别统计：');
    console.log('');
    for (const [category, stats] of Array.from(categoryStats.entries()).sort()) {
        const percent = ((stats.tested / stats.total) * 100).toFixed(0);
        const bar = '█'.repeat(Math.floor(stats.tested / stats.total * 20));
        const empty = '░'.repeat(20 - bar.length);
        console.log(`${category.padEnd(15)} ${bar}${empty} ${percent}% (${stats.tested}/${stats.total})`);
    }
    console.log('');

    // ✅ 覆盖率检查仅作为信息展示，不影响流程成功/失败
    // 无论覆盖率是否达到 100%，都返回成功退出码
    return 0;
}

/**
 * 生成 Markdown 报告（用于 GitHub Actions）
 */
function generateMarkdownReport(tools: ApiTool[], references: TestReference[]): string {
    const testCounts = new Map<string, TestReference[]>();
    for (const ref of references) {
        if (!testCounts.has(ref.toolName)) {
            testCounts.set(ref.toolName, []);
        }
        testCounts.get(ref.toolName)!.push(ref);
    }

    const testedTools: ApiTool[] = [];
    const untestedTools: ApiTool[] = [];

    for (const tool of tools) {
        if (testCounts.has(tool.name)) {
            testedTools.push(tool);
        } else {
            untestedTools.push(tool);
        }
    }

    const untestedByCategory = new Map<string, ApiTool[]>();
    for (const tool of untestedTools) {
        if (!untestedByCategory.has(tool.category)) {
            untestedByCategory.set(tool.category, []);
        }
        untestedByCategory.get(tool.category)!.push(tool);
    }

    const totalTools = tools.length;
    const testedCount = testedTools.length;
    const coveragePercent = totalTools > 0 ? ((testedCount / totalTools) * 100).toFixed(2) : '0.00';

    let markdown = `## 📊 E2E 测试覆盖率报告\n\n`;
    markdown += `**覆盖率**: ${coveragePercent}% (${testedCount}/${totalTools})\n\n`;

    if (untestedTools.length > 0) {
        markdown += `### ⚠️ 缺失 E2E 测试的 API 接口 (${untestedTools.length} 个)\n\n`;

        for (const [category, categoryTools] of Array.from(untestedByCategory.entries()).sort()) {
            markdown += `#### ${category} API\n\n`;
            for (const tool of categoryTools) {
                const relativePath = tool.filePath ? path.relative(process.cwd(), tool.filePath).replace(/\\/g, '/') : 'N/A';
                markdown += `- [ ] \`${tool.name}\` (\`${relativePath}:${tool.methodName}()\`)\n`;
            }
            markdown += `\n`;
        }

        markdown += `### 💡 建议\n\n`;
        markdown += `请为以上 API 添加 E2E 测试用例。示例：\n\n`;
        markdown += `\`\`\`typescript\n`;
        markdown += `test('should call api-tool-name', async () => {\n`;
        markdown += `    const result = await mcpClient.callTool('api-tool-name', {\n`;
        markdown += `        // 参数\n`;
        markdown += `    });\n`;
        markdown += `    expect(result).toBeDefined();\n`;
        markdown += `});\n`;
        markdown += `\`\`\`\n`;
    } else {
        markdown += `### 🎉 所有 API 都有 E2E 测试覆盖！\n`;
    }

    return markdown;
}

/**
 * 生成 HTML 报告文件
 */
function generateHtmlReport(tools: ApiTool[], references: TestReference[]): string {
    const testCounts = new Map<string, TestReference[]>();
    for (const ref of references) {
        if (!testCounts.has(ref.toolName)) {
            testCounts.set(ref.toolName, []);
        }
        testCounts.get(ref.toolName)!.push(ref);
    }

    const testedTools: ApiTool[] = [];
    const untestedTools: ApiTool[] = [];

    for (const tool of tools) {
        if (testCounts.has(tool.name)) {
            testedTools.push(tool);
        } else {
            untestedTools.push(tool);
        }
    }

    const untestedByCategory = new Map<string, ApiTool[]>();
    for (const tool of untestedTools) {
        if (!untestedByCategory.has(tool.category)) {
            untestedByCategory.set(tool.category, []);
        }
        untestedByCategory.get(tool.category)!.push(tool);
    }

    const totalTools = tools.length;
    const testedCount = testedTools.length;
    const coveragePercent = totalTools > 0 ? ((testedCount / totalTools) * 100).toFixed(2) : '0.00';

    // 生成日期
    const now = new Date();
    const dateStr = now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>E2E 测试覆盖率报告 - ${dateStr}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #24292e;
            background: #f6f8fa;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        h1 { color: #0366d6; margin-bottom: 10px; font-size: 32px; }
        h2 { color: #24292e; margin: 30px 0 15px; font-size: 24px; border-bottom: 1px solid #e1e4e8; padding-bottom: 8px; }
        h3 { color: #24292e; margin: 20px 0 10px; font-size: 18px; }
        .meta { color: #586069; font-size: 14px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 30px 0; }
        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .stat-card.success { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
        .stat-card.warning { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
        .stat-label { font-size: 14px; opacity: 0.9; }
        .stat-value { font-size: 36px; font-weight: bold; margin: 10px 0; }
        .progress-bar {
            width: 100%;
            height: 30px;
            background: #e1e4e8;
            border-radius: 15px;
            overflow: hidden;
            margin: 20px 0;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #11998e 0%, #38ef7d 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            transition: width 0.3s ease;
        }
        .category-section { margin: 20px 0; }
        .api-list { list-style: none; }
        .api-item {
            background: #f6f8fa;
            margin: 10px 0;
            padding: 15px;
            border-radius: 6px;
            border-left: 3px solid #f5576c;
        }
        .api-name { font-family: 'Consolas', 'Monaco', monospace; font-weight: bold; color: #d73a49; }
        .api-meta { font-size: 13px; color: #586069; margin-top: 5px; }
        code { 
            background: #f6f8fa; 
            padding: 2px 6px; 
            border-radius: 3px; 
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 85%;
        }
        .category-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .category-card {
            background: white;
            border: 1px solid #e1e4e8;
            padding: 15px;
            border-radius: 6px;
        }
        .category-name { font-weight: bold; margin-bottom: 10px; }
        .category-bar {
            width: 100%;
            height: 20px;
            background: #e1e4e8;
            border-radius: 10px;
            overflow: hidden;
        }
        .category-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        }
        .category-percent { font-size: 14px; color: #586069; margin-top: 5px; }
        .success-message {
            background: #d4edda;
            color: #155724;
            padding: 20px;
            border-radius: 6px;
            border-left: 4px solid #28a745;
            margin: 20px 0;
        }
        .footer { margin-top: 40px; padding-top: 20npx tsx e2e/scripts/check-coverage.tspx; border-top: 1px solid #e1e4e8; text-align: center; color: #586069; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 E2E 测试覆盖率报告</h1>
        <div class="meta">生成时间: ${dateStr}</div>

        <div class="summary">
            <div class="stat-card">
                <div class="stat-label">总 API 数量</div>
                <div class="stat-value">${totalTools}</div>
            </div>
            <div class="stat-card success">
                <div class="stat-label">已测试</div>
                <div class="stat-value">${testedCount}</div>
            </div>
            <div class="stat-card warning">
                <div class="stat-label">未测试</div>
                <div class="stat-value">${untestedTools.length}</div>
            </div>
        </div>

        <div class="progress-bar">
            <div class="progress-fill" style="width: ${coveragePercent}%">
                ${coveragePercent}%
            </div>
        </div>
`;

    if (untestedTools.length > 0) {
        html += `
        <h2>⚠️ 缺失 E2E 测试的 API 接口 (${untestedTools.length} 个)</h2>
`;

        for (const [category, categoryTools] of Array.from(untestedByCategory.entries()).sort()) {
            html += `
        <div class="category-section">
            <h3>${category} API (${categoryTools.length} 个未测试)</h3>
            <ul class="api-list">
`;
            for (const tool of categoryTools) {
                const relativePath = tool.filePath ? path.relative(process.cwd(), tool.filePath).replace(/\\/g, '/') : 'N/A';
                html += `
                <li class="api-item">
                    <div class="api-name">${tool.name}</div>
                    ${tool.filePath ? `<div class="api-meta">📁 文件: ${relativePath}</div>` : ''}
                    <div class="api-meta">🔧 方法: ${tool.methodName}()</div>
                </li>
`;
            }
            html += `
            </ul>
        </div>
`;
        }
    } else {
        html += `
        <div class="success-message">
            <h2>🎉 所有 API 都有 E2E 测试覆盖！</h2>
            <p>恭喜！项目的所有 API 都已经有对应的 E2E 测试。</p>
        </div>
`;
    }

    // 按类别统计
    const categoryStats = new Map<string, { total: number; tested: number }>();
    for (const tool of tools) {
        if (!categoryStats.has(tool.category)) {
            categoryStats.set(tool.category, { total: 0, tested: 0 });
        }
        const stats = categoryStats.get(tool.category)!;
        stats.total++;
        if (testCounts.has(tool.name)) {
            stats.tested++;
        }
    }

    html += `
        <h2>📈 按类别统计</h2>
        <div class="category-stats">
`;

    for (const [category, stats] of Array.from(categoryStats.entries()).sort()) {
        const percent = ((stats.tested / stats.total) * 100).toFixed(0);
        html += `
            <div class="category-card">
                <div class="category-name">${category}</div>
                <div class="category-bar">
                    <div class="category-bar-fill" style="width: ${percent}%"></div>
                </div>
                <div class="category-percent">${percent}% (${stats.tested}/${stats.total})</div>
            </div>
`;
    }

    html += `
        </div>

        <div class="footer">
            <p>🤖 由 E2E 覆盖率检查工具自动生成</p>
            <p>运行命令: <code>npm run check:e2e-coverage:report</code></p>
        </div>
    </div>
</body>
</html>
`;

    return html;
}

/**
 * 保存 HTML 报告到文件
 */
function saveHtmlReport(content: string): string {
    const reportsDir = path.resolve(process.cwd(), 'e2e/server/reports');

    // 确保目录存在
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }

    // 生成文件名（带时间戳）
    const now = new Date();
    // 替换所有可能导致路径问题的字符：/, :, 空格
    const timestamp = now.toLocaleString().replace(/[/:.\s]/g, '-');
    const filename = `coverage-report-${timestamp}.html`;
    const filepath = path.join(reportsDir, filename);

    // 写入文件
    fs.writeFileSync(filepath, content, 'utf-8');

    return filepath;
}

/**
 * 生成 JSON 输出（用于自动化工具）
 */
function generateJsonOutput(tools: ApiTool[], references: TestReference[], htmlReportPath?: string): string {
    const testCounts = new Map<string, TestReference[]>();
    for (const ref of references) {
        if (!testCounts.has(ref.toolName)) {
            testCounts.set(ref.toolName, []);
        }
        testCounts.get(ref.toolName)!.push(ref);
    }

    const testedTools: ApiTool[] = [];
    const untestedTools: ApiTool[] = [];

    for (const tool of tools) {
        if (testCounts.has(tool.name)) {
            testedTools.push(tool);
        } else {
            untestedTools.push(tool);
        }
    }

    const untestedByCategory = new Map<string, ApiTool[]>();
    for (const tool of untestedTools) {
        if (!untestedByCategory.has(tool.category)) {
            untestedByCategory.set(tool.category, []);
        }
        untestedByCategory.get(tool.category)!.push(tool);
    }

    const totalTools = tools.length;
    const testedCount = testedTools.length;
    const coveragePercent = totalTools > 0 ? ((testedCount / totalTools) * 100).toFixed(2) : '0.00';

    const output = {
        summary: {
            totalTools,
            testedCount,
            untestedCount: untestedTools.length,
            coveragePercent: parseFloat(coveragePercent),
        },
        untestedTools: Array.from(untestedByCategory.entries()).map(([category, tools]) => ({
            category,
            tools: tools.map(tool => ({
                name: tool.name,
                filePath: tool.filePath ? path.relative(process.cwd(), tool.filePath).replace(/\\/g, '/') : 'N/A',
                methodName: tool.methodName,
            })),
        })),
        htmlReportPath: htmlReportPath || null,
        markdownReport: generateMarkdownReport(tools, references),
    };

    return JSON.stringify(output, null, 2);
}

/**
 * 主函数
 */
async function main() {
    const args = process.argv.slice(2);
    const outputMarkdown = args.includes('--markdown');
    const outputJson = args.includes('--json');
    const shouldSaveReport = args.includes('--save') || args.includes('--report') || args.includes('--html');

    console.log('🔍 扫描 MCP API 工具定义 (通过 toolRegistry)...\n');
    const tools = await scanApiTools();
    console.log(`✅ 找到 ${tools.length} 个 MCP 工具\n`);

    console.log('🔍 扫描 E2E 测试文件...\n');
    const references = scanTestReferences();
    console.log(`✅ 找到 ${references.length} 个测试引用\n`);

    // 保存报告路径，用于最后打印
    let savedReportPath: string | null = null;
    let relativeReportPath: string | null = null;

    // 生成并保存 HTML 报告文件
    if (shouldSaveReport) {
        const htmlContent = generateHtmlReport(tools, references);
        const htmlPath = saveHtmlReport(htmlContent);
        savedReportPath = htmlPath;
        relativeReportPath = path.relative(process.cwd(), htmlPath).replace(/\\/g, '/');

        console.log('\n✅ HTML 报告已保存:\n');
        console.log(`   📄 ${htmlPath}\n`);

        // 提供快速打开提示
        if (process.platform === 'win32') {
            console.log(`💡 快速打开: start ${htmlPath}\n`);
        } else if (process.platform === 'darwin') {
            console.log(`💡 快速打开: open ${htmlPath}\n`);
        } else {
            console.log(`💡 快速打开: xdg-open ${htmlPath}\n`);
        }
    }

    // JSON 输出（用于 CI/CD）
    if (outputJson) {
        const json = generateJsonOutput(tools, references, savedReportPath || undefined);
        console.log('\n--- JSON_OUTPUT_START ---');
        console.log(json);
        console.log('--- JSON_OUTPUT_END ---\n');
    }

    // Markdown 输出（用于 GitHub Actions 评论）
    let markdownReport = '';
    if (outputMarkdown) {
        markdownReport = generateMarkdownReport(tools, references);
        console.log('\n--- MARKDOWN_REPORT_START ---');
        console.log(markdownReport);
        console.log('--- MARKDOWN_REPORT_END ---\n');
    }

    const exitCode = generateReport(tools, references);

    // 计算覆盖率统计
    const testCounts = new Map<string, TestReference[]>();
    for (const ref of references) {
        if (!testCounts.has(ref.toolName)) {
            testCounts.set(ref.toolName, []);
        }
        testCounts.get(ref.toolName)!.push(ref);
    }

    const testedCount = Array.from(testCounts.keys()).length;
    const totalTools = tools.length;
    const coveragePercent = totalTools > 0 ? ((testedCount / totalTools) * 100).toFixed(2) : '0.00';

    // 在最后一行打印报告地址
    if (savedReportPath) {
        console.log(`\n📊 报告地址: ${savedReportPath}`);
    }

    // 如果是 GitHub Actions 环境，输出到 GITHUB_OUTPUT
    if (process.env.GITHUB_OUTPUT) {
        const outputs: string[] = [];

        if (relativeReportPath) {
            outputs.push(`report_path=${relativeReportPath}`);
        }

        // 输出覆盖率统计信息
        outputs.push(`coverage_percent=${coveragePercent}`);
        outputs.push(`tested_count=${testedCount}`);
        outputs.push(`total_count=${totalTools}`);

        if (markdownReport) {
            // 使用 heredoc 格式输出多行 Markdown 内容
            outputs.push(`markdown<<EOF\n${markdownReport}\nEOF`);
        }

        if (outputs.length > 0) {
            fs.appendFileSync(process.env.GITHUB_OUTPUT, outputs.join('\n') + '\n', 'utf-8');
            console.log(`\n✅ GitHub Actions Output 已设置: ${outputs.map(o => o.split('=')[0]).join(', ')}`);
        }
    }

    process.exit(exitCode);
}

// 运行
try {
    main();
} catch (error) {
    console.error('❌ 执行失败:', error);
    process.exit(1);
}

