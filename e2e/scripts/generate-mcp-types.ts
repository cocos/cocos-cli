#!/usr/bin/env tsx
/**
 * 自动生成 MCP Tools 的 TypeScript 类型定义
 * 
 * 从 src/api 目录中的装饰器提取类型信息，生成强类型的 MCP 工具调用接口
 */

import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

interface ToolInfo {
    toolName: string;
    methodName: string;
    title?: string;
    description?: string;
    params: ParamInfo[];
    returnType?: string;
    filePath: string;
}

interface ParamInfo {
    name: string;
    type: string;
    schemaName: string;
    optional?: boolean;  // 参数是否可选
}

interface SchemaTypeMapping {
    schemaName: string;
    typeName: string;
    sourceFile: string;
}

/**
 * 扫描 schema 文件，自动提取 Schema 到 Type 的映射
 * 使用约定：SchemaXxx -> TXxx
 */
function scanSchemaFiles(): Map<string, SchemaTypeMapping> {
    const mappings = new Map<string, SchemaTypeMapping>();

    // 查找所有 schema 文件
    const schemaFiles = glob.sync('src/api/**/schema.ts', {
        absolute: true,
    });

    console.log(`\n📋 扫描 Schema 文件...\n`);

    for (const schemaFile of schemaFiles) {
        const content = fs.readFileSync(schemaFile, 'utf-8');
        const fileName = path.basename(schemaFile, '.ts');

        // 方法 1: 直接匹配 export type TXxx = z.infer<typeof SchemaXxx>
        const inferPattern = /export\s+type\s+(T\w+)\s*=\s*z\.infer<typeof\s+(Schema\w+)>/g;
        let match;
        let count = 0;

        while ((match = inferPattern.exec(content)) !== null) {
            const typeName = match[1];
            const schemaName = match[2];

            // 计算导入路径（从 e2e/types 到 dist/api/xxx）
            const distPath = schemaFile
                .replace(/\\/g, '/')
                .replace(/^.*\/src\//, 'dist/')
                .replace(/\.ts$/, '');
            const importPath = path.relative(
                path.resolve(process.cwd(), 'e2e/types'),
                path.resolve(process.cwd(), distPath)
            ).replace(/\\/g, '/');

            mappings.set(schemaName, {
                schemaName,
                typeName,
                sourceFile: importPath,
            });
            count++;
        }

        // 方法 2: 兜底 - 匹配所有 export const SchemaXxx 定义，按约定推断类型名
        // 这样即使没有显式的 type 定义，也能自动推断
        const schemaPattern = /export\s+const\s+(Schema\w+)\s*[:=]/g;
        while ((match = schemaPattern.exec(content)) !== null) {
            const schemaName = match[1];

            // 如果已经通过 z.infer 找到了，跳过
            if (mappings.has(schemaName)) continue;

            // 按约定推断类型名：SchemaXxx -> TXxx
            const typeName = 'T' + schemaName.substring(6); // 去掉 "Schema" 前缀

            const distPath = schemaFile
                .replace(/\\/g, '/')
                .replace(/^.*\/src\//, 'dist/')
                .replace(/\.ts$/, '');
            const importPath = path.relative(
                path.resolve(process.cwd(), 'e2e/types'),
                path.resolve(process.cwd(), distPath)
            ).replace(/\\/g, '/');

            mappings.set(schemaName, {
                schemaName,
                typeName,
                sourceFile: importPath,
            });
            count++;
        }

        if (count > 0) {
            const relativePath = path.relative(process.cwd(), schemaFile);
            console.log(`   ✅ ${relativePath}: 发现 ${count} 个 Schema`);
        }
    }

    console.log(`\n📊 共扫描到 ${mappings.size} 个 Schema 映射\n`);

    return mappings;
}

/**
 * 解析装饰器中的 Schema 名称
 */
function extractSchemaName(decoratorText: string): string | null {
    const match = decoratorText.match(/@param\((\w+)\)/);
    return match ? match[1] : null;
}

/**
 * 解析返回类型的 Schema 名称
 */
function extractReturnSchema(decoratorText: string): string | null {
    const match = decoratorText.match(/@result\((\w+)\)/);
    return match ? match[1] : null;
}

/**
 * 从方法签名中提取参数信息（名称和是否可选）
 * 例如: async methodName(@param(Schema) paramName: Type, @param(Schema2) param2?: Type2)
 */
function extractParamInfo(methodBlock: string): Array<{ name: string; optional: boolean }> {
    const params: Array<{ name: string; optional: boolean }> = [];

    // 提取方法签名（包含所有参数）
    // 支持多行方法签名，匹配到返回类型之前
    const methodSigMatch = methodBlock.match(/async\s+\w+\s*\(([\s\S]*?)\)\s*[:{\n]/);
    if (!methodSigMatch) {
        return params;
    }

    const paramsString = methodSigMatch[1];

    // 匹配每个参数：@param(...) paramName: Type 或 @param(...) paramName?: Type 或 @param(...) paramName: Type = defaultValue
    // 捕获组: 1=参数名, 2=可选标记(?), 3=后续内容（用于检测默认值）
    const paramPattern = /@param\([^)]+\)\s+(\w+)\s*(\?)?\s*:\s*[^,)=]+(=\s*[^,)]+)?/g;
    let match;

    while ((match = paramPattern.exec(paramsString)) !== null) {
        const name = match[1];
        const hasQuestionMark = !!match[2];  // 有 ? 标记
        const hasDefaultValue = !!match[3];  // 有默认值

        params.push({
            name,
            optional: hasQuestionMark || hasDefaultValue,
        });
    }

    return params;
}

/**
 * 解析单个 API 文件，提取工具信息
 */
function parseApiFile(filePath: string, schemaMap: Map<string, SchemaTypeMapping>): ToolInfo[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const tools: ToolInfo[] = [];

    // 匹配 @tool 装饰器开始的方法
    const toolPattern = /@tool\(['"]([^'"]+)['"]\)([\s\S]*?)(?=@tool\(|export class|$)/g;

    let match;
    while ((match = toolPattern.exec(content)) !== null) {
        const toolName = match[1];
        const methodBlock = match[2];

        // 提取 title
        const titleMatch = methodBlock.match(/@title\(['"]([^'"]+)['"]\)/);
        const title = titleMatch ? titleMatch[1] : undefined;

        // 提取 description
        const descMatch = methodBlock.match(/@description\(['"]([^'"]+)['"]\)/);
        const description = descMatch ? descMatch[1] : undefined;

        // 提取方法签名
        const methodMatch = methodBlock.match(/async\s+(\w+)\s*\(([^)]*)\)/);
        if (!methodMatch) continue;

        const methodName = methodMatch[1];
        const paramsStr = methodMatch[2];

        // 提取参数
        const params: ParamInfo[] = [];
        const paramMatches = [...methodBlock.matchAll(/@param\((\w+)\)/g)];
        const paramInfoList = extractParamInfo(methodBlock);

        paramMatches.forEach((paramMatch, index) => {
            const schemaName = paramMatch[1];
            const paramInfo = paramInfoList[index];
            const paramName = paramInfo?.name || `param${index}`;
            const optional = paramInfo?.optional || false;
            const mapping = schemaMap.get(schemaName);
            const typeName = mapping ? mapping.typeName : 'any';

            params.push({
                name: paramName,
                type: typeName,
                schemaName: schemaName,
                optional: optional,
            });
        });

        // 提取返回类型
        const returnMatch = methodBlock.match(/@result\((\w+)\)/);
        const returnSchemaName = returnMatch ? returnMatch[1] : undefined;
        let returnType: string | undefined;
        if (returnSchemaName) {
            const mapping = schemaMap.get(returnSchemaName);
            returnType = mapping ? mapping.typeName : 'any';
        }

        tools.push({
            toolName,
            methodName,
            title,
            description,
            params,
            returnType,
            filePath: path.relative(process.cwd(), filePath),
        });
    }

    return tools;
}

/**
 * 生成 TypeScript 类型定义
 */
function generateTypeDefinitions(tools: ToolInfo[], schemaMap: Map<string, SchemaTypeMapping>): string {
    const lines: string[] = [];

    // 文件头部
    lines.push('/**');
    lines.push(' * MCP Tools Type Definitions');
    lines.push(' * ');
    lines.push(' * 🤖 This file is auto-generated by e2e/scripts/generate-mcp-types.ts');
    lines.push(' * DO NOT EDIT MANUALLY');
    lines.push(' * ');
    lines.push(' * To regenerate: npm run generate:mcp-types');
    lines.push(' */');
    lines.push('');

    // 收集所有实际使用的类型
    const usedTypes = new Set<string>();
    tools.forEach(tool => {
        tool.params.forEach(param => {
            if (param.type !== 'any') {
                usedTypes.add(param.type);
            }
        });
        if (tool.returnType && tool.returnType !== 'any') {
            usedTypes.add(tool.returnType);
        }
    });

    // 按源文件分组
    const importsByFile = new Map<string, Set<string>>();
    for (const typeName of usedTypes) {
        // 在 schemaMap 中查找对应的源文件
        const mapping = Array.from(schemaMap.values()).find(m => m.typeName === typeName);
        if (mapping) {
            if (!importsByFile.has(mapping.sourceFile)) {
                importsByFile.set(mapping.sourceFile, new Set());
            }
            importsByFile.get(mapping.sourceFile)!.add(typeName);
        }
    }

    // 生成导入语句
    if (importsByFile.size > 0) {
        lines.push('// Import types from dist (auto-generated from schema files)');
        for (const [sourceFile, types] of importsByFile.entries()) {
            const typeList = Array.from(types).sort();
            if (typeList.length === 1) {
                lines.push(`import type { ${typeList[0]} } from '${sourceFile}';`);
            } else {
                lines.push(`import type {`);
                typeList.forEach(type => {
                    lines.push(`    ${type},`);
                });
                lines.push(`} from '${sourceFile}';`);
            }
        }
        lines.push('');
    }

    // MCP Response 类型
    lines.push('// MCP Response wrapper');
    lines.push('export interface MCPResponse<T = any> {');
    lines.push('    code: number;');
    lines.push('    data: T;');
    lines.push('    reason?: string;');
    lines.push('}');
    lines.push('');

    // 生成每个工具的参数类型
    lines.push('// Tool parameter types');
    tools.forEach(tool => {
        if (tool.params.length > 0) {
            lines.push(`export interface ${toPascalCase(tool.toolName)}Params {`);
            tool.params.forEach(param => {
                const comment = param.schemaName ? `  // Schema: ${param.schemaName}` : '';
                const optional = param.optional ? '?' : '';
                lines.push(`    ${param.name}${optional}: ${param.type};${comment}`);
            });
            lines.push('}');
            lines.push('');
        }
    });

    // 生成工具映射表
    lines.push('/**');
    lines.push(' * MCP Tools 类型映射表');
    lines.push(' * ');
    lines.push(' * 使用方式：');
    lines.push(' * ```typescript');
    lines.push(' * const result = await mcpClient.callTool(\'assets-create-asset\', {');
    lines.push(' *   options: { target: \'db://assets/test.txt\' }');
    lines.push(' * });');
    lines.push(' * // result 的类型会自动推断为 MCPResponse<IAssetInfo | null>');
    lines.push(' * ```');
    lines.push(' */');
    lines.push('export interface MCPToolsMap {');

    tools.forEach(tool => {
        if (tool.title || tool.description) {
            lines.push('');
            lines.push('    /**');
            if (tool.title) {
                lines.push(`     * ${tool.title}`);
            }
            if (tool.description) {
                lines.push(`     * ${tool.description}`);
            }
            lines.push(`     * @source ${tool.filePath}`);
            lines.push('     */');
        }

        const paramType = tool.params.length > 0
            ? `${toPascalCase(tool.toolName)}Params`
            : 'Record<string, never>';
        const returnType = tool.returnType || 'any';

        lines.push(`    '${tool.toolName}': {`);
        lines.push(`        params: ${paramType};`);
        lines.push(`        result: ${returnType};`);
        lines.push('    };');
    });

    lines.push('}');
    lines.push('');

    // 工具名称联合类型
    lines.push('// Tool name union type');
    lines.push('export type MCPToolName = keyof MCPToolsMap;');
    lines.push('');

    // 导出工具列表（方便运行时使用）
    lines.push('// Available tools list');
    lines.push('export const MCP_TOOLS: MCPToolName[] = [');
    tools.forEach(tool => {
        lines.push(`    '${tool.toolName}',`);
    });
    lines.push('];');
    lines.push('');

    // 统计信息
    lines.push('/**');
    lines.push(' * 生成统计:');
    lines.push(` * - 总工具数: ${tools.length}`);
    lines.push(` * - 总参数数: ${tools.reduce((sum, t) => sum + t.params.length, 0)}`);
    lines.push(` * - 生成时间: ${new Date().toISOString()}`);
    lines.push(' */');

    return lines.join('\n');
}

/**
 * 将 kebab-case 转换为 PascalCase
 */
function toPascalCase(str: string): string {
    return str
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
}

/**
 * 主函数
 */
async function main() {
    console.log('🤖 开始生成 MCP Tools 类型定义...\n');

    // 步骤 1: 扫描所有 schema 文件，建立映射
    const schemaMap = scanSchemaFiles();

    // 步骤 2: 查找所有 API 文件
    const apiFiles = glob.sync('src/api/**/*.ts', {
        ignore: ['**/*.d.ts', '**/schema.ts', '**/decorator.ts', '**/index.ts'],
        absolute: true,
    });

    console.log(`📁 发现 ${apiFiles.length} 个 API 文件:\n`);
    apiFiles.forEach(file => {
        console.log(`   - ${path.relative(process.cwd(), file)}`);
    });
    console.log('');

    // 步骤 3: 解析所有工具
    const allTools: ToolInfo[] = [];
    for (const file of apiFiles) {
        const tools = parseApiFile(file, schemaMap);
        allTools.push(...tools);
        if (tools.length > 0) {
            console.log(`✅ ${path.basename(file)}: 发现 ${tools.length} 个工具`);
        }
    }

    console.log(`\n📊 总计发现 ${allTools.length} 个 MCP 工具\n`);

    // 步骤 4: 生成类型定义
    const typeDefinitions = generateTypeDefinitions(allTools, schemaMap);

    // 步骤 5: 写入文件
    const outputPath = path.resolve(process.cwd(), 'e2e/types/mcp-tools.generated.ts');
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, typeDefinitions, 'utf-8');

    console.log(`✨ 类型定义已生成: ${path.relative(process.cwd(), outputPath)}`);
    console.log(`\n📝 包含:`);
    console.log(`   - ${allTools.length} 个工具定义`);
    console.log(`   - ${allTools.filter(t => t.params.length > 0).length} 个参数类型`);
    console.log(`   - 1 个 MCPToolsMap 接口`);
    console.log(`   - ${schemaMap.size} 个自动导入的 Schema 类型`);
    console.log(`\n🎉 完成！\n`);
}

// 运行脚本
main().catch(error => {
    console.error('❌ 生成失败:', error);
    process.exit(1);
});

