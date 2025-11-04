import { pathExists, readJSON, writeJSON } from 'fs-extra';
import { join } from 'path';
import { getProjectManager, TestProject } from './project-manager';

/**
 * 测试工具函数集合
 */

// 导出超时配置，方便测试文件使用
export { E2E_TIMEOUTS } from '../config';

/**
 * 创建测试项目（推荐）
 * 
 * 使用统一的工作区管理，自动清理缓存
 * 
 * @param sourceProject 源项目路径
 * @param projectName 项目名称（可选）
 * @returns 测试项目信息
 * 
 * @example
 * ```typescript
 * const project = await createTestProject(fixtureProject);
 * // 使用 project.path
 * // 测试完成后调用 project.cleanup()
 * ```
 */
export async function createTestProject(
    sourceProject: string,
    projectName?: string
): Promise<TestProject> {
    const projectManager = getProjectManager();
    return await projectManager.createTestProject(sourceProject, projectName);
}

/**
 * 创建临时测试项目
 * 
 * 使用系统临时目录，不在工作区保留
 * 
 * @param sourceProject 源项目路径
 * @returns 测试项目信息
 * 
 * @example
 * ```typescript
 * const project = await createTempTestProject(fixtureProject);
 * // 使用 project.path
 * // 测试完成后调用 project.cleanup()
 * ```
 */
export async function createTempTestProject(sourceProject: string): Promise<TestProject> {
    const projectManager = getProjectManager();
    return await projectManager.createTempProject(sourceProject);
}

/**
 * 获取共享的只读测试项目（推荐用于只读测试）
 * 
 * 多个测试套件可以共享同一个项目实例，避免重复复制项目。
 * 适用于只查询信息、不修改项目的测试。
 * 
 * @param sourceProject 源项目路径
 * @param projectName 项目名称（可选，默认使用源项目名称）
 * @returns 测试项目信息
 * 
 * @example
 * ```typescript
 * // 适用场景：server.e2e.test.ts, project.e2e.test.ts, info.e2e.test.ts
 * const project = await getSharedTestProject(fixtureProject, 'readonly-common');
 * // 多个测试文件会复用同一个项目实例
 * // cleanup() 不会立即删除，由测试框架统一清理
 * ```
 */
export async function getSharedTestProject(
    sourceProject: string,
    projectName?: string
): Promise<TestProject> {
    const projectManager = getProjectManager();
    return await projectManager.getSharedProject(sourceProject, projectName);
}

/**
 * 等待一段时间
 */
export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 检查路径是否存在
 */
export async function checkPathExists(path: string): Promise<boolean> {
    return await pathExists(path);
}

/**
 * 读取 JSON 文件
 */
export async function readJsonFile<T = any>(path: string): Promise<T> {
    return await readJSON(path);
}

/**
 * 写入 JSON 文件
 */
export async function writeJsonFile(path: string, data: any): Promise<void> {
    await writeJSON(path, data, { spaces: 2 });
}

/**
 * 验证构建输出目录结构
 */
export async function validateBuildOutput(buildPath: string): Promise<{
    valid: boolean;
    missingFiles: string[];
}> {
    const requiredFiles = [
        'index.html',
        'assets',
        'src',
    ];

    const missingFiles: string[] = [];

    for (const file of requiredFiles) {
        const filePath = join(buildPath, file);
        const exists = await pathExists(filePath);
        if (!exists) {
            missingFiles.push(file);
        }
    }

    return {
        valid: missingFiles.length === 0,
        missingFiles,
    };
}

/**
 * 生成测试用的构建配置
 */
export function generateBuildConfig(overrides: Record<string, any> = {}): any {
    return {
        platform: 'web-desktop',
        debug: true,
        md5Cache: false,
        buildPath: 'project://build',
        ...overrides,
    };
}

/**
 * 等待条件满足
 */
export async function waitFor(
    condition: () => Promise<boolean> | boolean,
    options: {
        timeout?: number;
        interval?: number;
        timeoutMessage?: string;
    } = {}
): Promise<void> {
    const { timeout = 30000, interval = 500, timeoutMessage = 'Timeout waiting for condition' } = options;

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        if (await condition()) {
            return;
        }
        await delay(interval);
    }

    throw new Error(timeoutMessage);
}

/**
 * 生成唯一的测试 ID
 */
export function generateTestId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * 安全地执行异步函数并捕获错误
 */
export async function safeExecute<T>(
    fn: () => Promise<T>,
    errorMessage = 'Execution failed'
): Promise<{ success: boolean; data?: T; error?: Error }> {
    try {
        const data = await fn();
        return { success: true, data };
    } catch (error) {
        console.error(errorMessage, error);
        return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
}

/**
 * 重试执行函数
 */
export async function retry<T>(
    fn: () => Promise<T>,
    options: {
        maxAttempts?: number;
        delay?: number;
        onRetry?: (attempt: number, error: Error) => void;
    } = {}
): Promise<T> {
    const { maxAttempts = 3, delay: retryDelay = 1000, onRetry } = options;

    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (onRetry) {
                onRetry(attempt, lastError);
            }

            if (attempt < maxAttempts) {
                await delay(retryDelay);
            }
        }
    }

    throw lastError!;
}

// ==================== MCP 测试相关工具函数 ====================

import { MCPTestClient } from './mcp-client';
import { getSharedMCPServer } from './shared-mcp-server';
import { resolve as resolvePath } from 'path';

/**
 * MCP 测试上下文接口
 */
export interface MCPTestContext {
    testProject: TestProject;
    mcpClient: MCPTestClient;
}

/**
 * Assets 测试上下文接口（扩展 MCPTestContext）
 */
export interface AssetsTestContext extends MCPTestContext {
    testRootUrl: string;
    testRootPath: string;
}

/**
 * 设置 MCP 测试环境（使用共享服务器）
 * 所有测试共享同一个 MCP 服务器实例
 * 
 * @param fixtureProject 测试项目 fixture 路径（可选，默认使用 asset-operation）
 * @param projectName 共享项目名称（可选）
 * @returns MCP 测试上下文
 * 
 * @example
 * ```typescript
 * const context = await setupMCPTestEnvironment();
 * // 使用 context.mcpClient 和 context.testProject
 * ```
 */
export async function setupMCPTestEnvironment(
    fixtureProject?: string,
    projectName?: string
): Promise<MCPTestContext> {
    // 获取全局共享的 MCP 服务器管理器
    const sharedServer = getSharedMCPServer();

    // 初始化共享服务器（如果还没有初始化）
    if (!fixtureProject) {
        // 默认使用 asset-operation fixture
        fixtureProject = resolvePath(__dirname, '../../tests/fixtures/projects/asset-operation');
    }
    await sharedServer.initialize(fixtureProject, projectName);

    // 获取共享的客户端和项目
    const mcpClient = sharedServer.getClient();
    const testProject = sharedServer.getTestProject();

    return {
        testProject,
        mcpClient,
    };
}

/**
 * 设置 Assets 测试环境（使用共享服务器）
 * 扩展 MCPTestContext，添加 assets 特定的测试根路径配置
 * 
 * @param fixtureProject 测试项目 fixture 路径（可选）
 * @param projectName 共享项目名称（可选）
 * @returns Assets 测试上下文
 * 
 * @example
 * ```typescript
 * const context = await setupAssetsTestEnvironment();
 * // 使用 context.mcpClient, context.testProject, context.testRootUrl, context.testRootPath
 * ```
 */
export async function setupAssetsTestEnvironment(
    fixtureProject?: string,
    projectName?: string
): Promise<AssetsTestContext> {
    // 获取全局共享的 MCP 服务器管理器
    const sharedServer = getSharedMCPServer();

    // 初始化共享服务器（如果还没有初始化）
    if (!fixtureProject) {
        fixtureProject = resolvePath(__dirname, '../../tests/fixtures/projects/asset-operation');
    }
    await sharedServer.initialize(fixtureProject, projectName);

    // 获取共享的客户端和项目
    const mcpClient = sharedServer.getClient();
    const testProject = sharedServer.getTestProject();

    // 获取测试根路径配置
    const { testRootUrl, testRootPath } = sharedServer.getAssetsTestRootConfig();

    // 确保测试根目录存在
    await sharedServer.ensureAssetsTestRoot();

    return {
        testProject,
        mcpClient,
        testRootUrl,
        testRootPath,
    };
}

/**
 * 清理 MCP 测试环境
 * 注意：不清理共享的 MCP 服务器，由全局 teardown 统一清理
 * 
 * @param context 测试上下文
 */
export async function teardownMCPTestEnvironment(_context: MCPTestContext): Promise<void> {
    // 注意：不关闭客户端和服务器，因为其他测试可能还在使用
    // 服务器会在全局 teardown 时统一清理
    // 如果需要清理特定资源，可以在这里添加
}

/**
 * 清理 Assets 测试环境
 * 清理测试根目录，但不关闭服务器
 * 
 * @param context Assets 测试上下文
 */
export async function teardownAssetsTestEnvironment(context: AssetsTestContext): Promise<void> {
    // 清理测试资源（但不关闭服务器）
    try {
        await context.mcpClient.callTool('assets-delete-asset', {
            dbPath: context.testRootUrl,
        });
    } catch {
        // 忽略清理失败的错误
    }

    // 注意：不关闭客户端和服务器，因为其他测试可能还在使用
    // 服务器会在全局 teardown 时统一清理
}

