/**
 * MCP 工具扫描共享工具函数
 * 
 * 用于 check-coverage.ts 和 generate-mcp-types.ts 等脚本
 */

import * as fs from 'fs';

/**
 * 基础工具信息接口
 */
export interface BaseToolInfo {
    toolName: string;
    methodName: string;
    title?: string;
    description?: string;
    filePath: string;
}

/**
 * 扩展工具信息接口（包含类别）
 */
export interface ExtendedToolInfo extends BaseToolInfo {
    category: string;
}

/**
 * 从 target 推断文件路径
 */
export function inferToolFilePath(target: any): string {
    if (target && target.constructor) {
        const className = target.constructor.name;
        const category = className.replace(/Api$/, '').toLowerCase();
        
        const possiblePaths = [
            `src/api/${category}/${category}.ts`,
            `src/api/${category}/index.ts`,
        ];

        for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
                return possiblePath;
            }
        }

        // 特殊处理: Scene 相关的 API
        if (['Node', 'Component', 'Scene'].includes(className.replace(/Api$/, ''))) {
            const sceneSubModule = className.replace(/Api$/, '').toLowerCase();
            const scenePath = `src/api/scene/${sceneSubModule}.ts`;
            if (fs.existsSync(scenePath)) {
                return scenePath;
            }
        }
    }
    return 'unknown';
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
 * 从 target 推断工具信息（包含类别和文件路径）
 */
export function inferToolInfo(target: any, _meta: any): { category: string; filePath: string } {
    const category = inferToolCategory(target);
    const filePath = inferToolFilePath(target);
    return { category, filePath };
}

/**
 * 使用 toolRegistry 扫描已注册的工具
 * 这是最可靠的方式，因为只扫描实际注册的工具
 */
export async function scanToolsFromRegistry(): Promise<BaseToolInfo[]> {
    const tools: BaseToolInfo[] = [];

    try {
        const { CocosAPI } = await import('../../dist/api/index');
        // 先创建 API 实例，触发所有装饰器的执行
        await CocosAPI.create();

        // 然后导入 toolRegistry (与 mcp.middleware.ts 使用相同的注册表)
        const { toolRegistry } = await import('../../dist/api/decorator/decorator');

        // 遍历 toolRegistry，获取所有已注册的工具
        for (const [toolName, { target, meta }] of toolRegistry.entries()) {
            // toolName 可能是 string 或 symbol，只处理 string 类型
            if (typeof toolName !== 'string') {
                continue;
            }

            // 推断文件路径
            const filePath = inferToolFilePath(target);

            tools.push({
                toolName: toolName,
                methodName: typeof meta.methodName === 'string' ? meta.methodName : meta.methodName.toString(),
                title: meta.title,
                description: meta.description,
                filePath: filePath,
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
 * 扩展工具信息，添加类别字段
 */
export function extendToolInfo(tool: BaseToolInfo): ExtendedToolInfo {
    // 从文件路径推断类别
    let category = 'Unknown';
    if (tool.filePath !== 'unknown') {
        const match = tool.filePath.match(/src\/api\/([^/]+)/);
        if (match) {
            const moduleName = match[1];
            category = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
            if (moduleName === 'scene') {
                const subModuleMatch = tool.filePath.match(/scene\/([^/]+)\.ts$/);
                if (subModuleMatch) {
                    const subModule = subModuleMatch[1];
                    category = subModule.charAt(0).toUpperCase() + subModule.slice(1);
                }
            }
        }
    }
    return {
        ...tool,
        category,
    };
}

