/**
 * MCP 工具扫描共享工具函数
 * 
 * 用于 check-coverage.ts 和 generate-mcp-types.ts 等脚本
 * 覆盖率检查使用源码扫描，类型生成仍使用运行时注册表
 */


/**
 * 基础工具信息接口
 */
export interface BaseToolInfo {
    toolName: string;
    methodName: string;
    title?: string;
    description?: string;
}

/**
 * 扩展工具信息接口（包含类别和运行时 schema 信息）
 */
export interface ExtendedToolInfo extends BaseToolInfo {
    category: string;
    paramSchemas?: Array<{ index: number; schema: any; name?: string }>;
    returnSchema?: any;
}

/**
 * 从 target 推断工具类别
 */
export function inferToolCategory(target: any): string {
    if (target && target.constructor) {
        const className = target.constructor.name;
        // 例如: AssetsApi -> Assets, BuilderApi -> Builder
        return className.replace(/Api$/, '');
    }
    return 'Unknown';
}

/**
 * 通过源码扫描覆盖率检查所需的工具信息。
 *
 * 覆盖率统计只需要工具名、方法名、标题、描述和分类，不需要启动运行时服务。
 */
export function scanToolsFromSource(apiRoot = 'src/api'): ExtendedToolInfo[] {
    const fs = require('fs') as typeof import('fs');
    const glob = require('glob') as typeof import('glob');
    const normalizedRoot = apiRoot.replace(/\\/g, '/');
    const files = glob.sync(`${normalizedRoot}/**/*.ts`, {
        ignore: [
            `${normalizedRoot}/**/*.d.ts`,
            `${normalizedRoot}/decorator/**`,
        ],
    });
    const tools: ExtendedToolInfo[] = [];

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split(/\r?\n/);
        let currentClass = 'Unknown';
        let pending: Partial<ExtendedToolInfo> = {};

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//')) {
                continue;
            }

            const classMatch = trimmed.match(/(?:export\s+)?class\s+(\w+Api)\b/);
            if (classMatch) {
                currentClass = classMatch[1].replace(/Api$/, '');
                pending = {};
                continue;
            }

            const toolName = matchDecoratorValue(trimmed, 'tool');
            if (toolName) {
                pending = {
                    toolName,
                    category: currentClass,
                };
                continue;
            }

            if (!pending.toolName) {
                continue;
            }

            const title = matchDecoratorValue(trimmed, 'title');
            if (title) {
                pending.title = title;
                continue;
            }

            const description = matchDecoratorValue(trimmed, 'description');
            if (description) {
                pending.description = description;
                continue;
            }

            const methodMatch = trimmed.match(/^(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(\w+)\s*\(/);
            if (methodMatch) {
                tools.push({
                    toolName: pending.toolName,
                    methodName: methodMatch[1],
                    title: pending.title,
                    description: pending.description,
                    category: pending.category || currentClass,
                });
                pending = {};
            }
        }
    }

    return tools.sort((a, b) => a.toolName.localeCompare(b.toolName));
}

function matchDecoratorValue(line: string, decorator: string): string | undefined {
    const match = line.match(new RegExp(`^@${decorator}\\((['"\`])([\\s\\S]*?)\\1\\)`));
    return match?.[2];
}

/**
 * 使用 toolRegistry 扫描已注册的工具（包含完整的运行时信息）
 * 参考 mcp.middleware.ts 的实现方式
 */
export async function scanToolsFromRegistry(): Promise<ExtendedToolInfo[]> {
    const tools: ExtendedToolInfo[] = [];

    try {
        // 清理模块缓存，确保每次运行都是干净的状态
        // 这对于避免概率性失败非常重要
        const moduleCache = require.cache;
        Object.keys(moduleCache).forEach(key => {
            if (key.includes('dist/api') || key.includes('dist/core')) {
                delete moduleCache[key];
            }
        });

        const { CocosAPI } = await import('../../dist/api/index');
        // 先创建 API 实例，触发所有装饰器的执行
        await CocosAPI.create();

        // 然后导入 toolRegistry (与 mcp.middleware.ts 使用相同的注册表)
        const { toolRegistry } = await import('../../dist/api/decorator/decorator');

        // 遍历 toolRegistry，获取所有已注册的工具（参考 mcp.middleware.ts:75）
        for (const [toolName, { target, meta }] of toolRegistry.entries()) {
            // toolName 可能是 string 或 symbol，只处理 string 类型
            if (typeof toolName !== 'string') {
                continue;
            }

            // 推断类别
            const category = inferToolCategory(target);

            tools.push({
                toolName: toolName,
                methodName: typeof meta.methodName === 'string' ? meta.methodName : meta.methodName.toString(),
                title: meta.title,
                description: meta.description,
                category: category,
                // 直接使用运行时 schema 信息（参考 mcp.middleware.ts:79-85）
                paramSchemas: meta.paramSchemas,
                returnSchema: meta.returnSchema,
            });
        }

        // 强制垃圾回收，释放内存
        if (global.gc) {
            global.gc();
        }

        // 清理 toolRegistry，避免内存泄漏
        toolRegistry.clear();
    } catch (error) {
        console.error('❌ 无法加载 toolRegistry:', error);
        console.error('   请确保项目已经构建 (npm run build)');
        console.error('   错误详情:', error);
        throw error;
    }

    return tools.sort((a, b) => a.toolName.localeCompare(b.toolName));
}

/**
 * 扩展工具信息（保持向后兼容）
 */
export function extendToolInfo(tool: BaseToolInfo): ExtendedToolInfo {
    // 如果已经是 ExtendedToolInfo，直接返回
    if ('category' in tool) {
        return tool as ExtendedToolInfo;
    }
    
    // 如果没有类别信息，返回默认值
    return {
        ...tool,
        category: 'Unknown',
    };
}
