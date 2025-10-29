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

