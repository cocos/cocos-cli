/**
 * MCP 工具扫描共享工具函数
 * 
 * 用于 check-coverage.ts 和 generate-mcp-types.ts 等脚本
 * 完全基于运行时数据，不读取源码
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
 * 使用 toolRegistry 扫描已注册的工具（包含完整的运行时信息）
 * 参考 mcp.middleware.ts 的实现方式
 */
export async function scanToolsFromRegistry(): Promise<ExtendedToolInfo[]> {
    const tools: ExtendedToolInfo[] = [];

    try {
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
