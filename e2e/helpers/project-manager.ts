import { resolve, join } from 'path';
import { remove, copy, pathExists, readFile } from 'fs-extra';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import ignore from 'ignore';

/**
 * E2E 测试项目管理器
 * 
 * 功能：
 * 1. 统一管理测试项目目录
 * 2. 自动清理 .gitignore 忽略的文件
 * 3. 清理缓存目录
 */

/**
 * E2E 测试工作区配置
 */
export interface E2EWorkspaceConfig {
    /**
     * 测试工作区根目录
     * 默认：e2e/.workspace/
     */
    workspaceRoot?: string;

    /**
     * 是否在测试前清理工作区
     * 默认：true
     */
    cleanBeforeTest?: boolean;

    /**
     * 是否在测试后保留工作区（用于调试）
     * 默认：false
     */
    preserveAfterTest?: boolean;
}

/**
 * 测试项目信息
 */
export interface TestProject {
    /**
     * 项目路径
     */
    path: string;

    /**
     * 项目名称
     */
    name: string;

    /**
     * 清理函数
     */
    cleanup: () => Promise<void>;
}

/**
 * E2E 测试项目管理器类
 */
export class E2EProjectManager {
    private workspaceRoot: string;
    private cleanBeforeTest: boolean;
    private preserveAfterTest: boolean;
    private createdProjects: Set<string> = new Set();
    private sharedProjects: Map<string, string> = new Map();

    /**
     * 需要清理的 Cocos 项目缓存目录
     */
    private static readonly COCOS_CACHE_DIRS = [
        'library',    // 编译缓存
        'temp',       // 临时文件
        'local',      // 本地数据
        'build',      // 构建输出
        'profiles',   // 配置文件
        'settings',   // 设置
        'packages',   // 插件包（如果是动态生成的）
    ];

    /**
     * 需要清理的 CLI 引擎特定目录（测试前必须清理）
     */
    private static readonly ENGINE_SPECIFIC_DIRS = [
        'packages/engine/editor/library',
        'packages/engine/temp',
    ];

    constructor(config: E2EWorkspaceConfig = {}) {
        this.workspaceRoot = config.workspaceRoot || resolve(__dirname, '../.workspace');
        this.cleanBeforeTest = config.cleanBeforeTest !== false;
        this.preserveAfterTest = config.preserveAfterTest || false;
    }

    /**
     * 初始化工作区
     * 在测试开始前调用
     */
    async initialize(): Promise<void> {
        if (this.cleanBeforeTest) {
            await this.cleanWorkspace();
        }

        // 确保工作区存在
        const { ensureDir } = await import('fs-extra');
        await ensureDir(this.workspaceRoot);
    }

    /**
     * 清理整个工作区
     */
    async cleanWorkspace(): Promise<void> {
        if (await pathExists(this.workspaceRoot)) {
            await remove(this.workspaceRoot);
        }
    }

    /**
     * 创建测试项目（从源项目复制）
     * 
     * @param sourceProject 源项目路径
     * @param projectName 项目名称（可选，默认自动生成）
     * @returns 测试项目信息
     */
    async createTestProject(
        sourceProject: string,
        projectName?: string
    ): Promise<TestProject> {
        const name = projectName || this.generateProjectName();
        const projectPath = join(this.workspaceRoot, name);

        // 清理源项目的缓存（如果已存在）
        await this.cleanProjectCache(sourceProject);

        // 复制项目
        await copy(sourceProject, projectPath, {
            filter: (src) => this.shouldCopyFile(src, sourceProject),
        });

        // 清理目标项目中的 CLI 引擎特定目录（测试前必须清理）
        await this.cleanEngineSpecificDirs(projectPath);

        // 记录创建的项目
        this.createdProjects.add(projectPath);

        return {
            path: projectPath,
            name,
            cleanup: async () => {
                await this.cleanupProject(projectPath);
            },
        };
    }

    /**
     * 获取共享的只读测试项目
     * 多个测试套件可以共享同一个项目实例，适用于只读测试
     * 
     * @param sourceProject 源项目路径
     * @param projectName 项目名称（可选，默认使用源项目名称）
     * @returns 测试项目信息
     * 
     * @example
     * ```typescript
     * // server.e2e.test.ts 和 project.e2e.test.ts 都可以共享同一个项目
     * const testProject = await getSharedTestProject(fixtureProject, 'readonly-common');
     * ```
     */
    async getSharedProject(
        sourceProject: string,
        projectName?: string
    ): Promise<TestProject> {
        const name = projectName || `shared-${this.getSourceProjectName(sourceProject)}`;

        // 如果已经创建过，直接返回
        if (this.sharedProjects.has(name)) {
            const projectPath = this.sharedProjects.get(name)!;
            return {
                path: projectPath,
                name,
                cleanup: async () => {
                    // 共享项目不会立即清理，由 cleanupAll 统一清理
                    // 这样可以在多个测试套件中复用
                },
            };
        }

        // 创建新的共享项目
        const projectPath = join(this.workspaceRoot, 'shared', name);

        // 清理缓存
        await this.cleanProjectCache(sourceProject);

        // 复制项目
        await copy(sourceProject, projectPath, {
            filter: (src) => this.shouldCopyFile(src, sourceProject),
        });

        // 清理目标项目中的 CLI 引擎特定目录（测试前必须清理）
        await this.cleanEngineSpecificDirs(projectPath);

        // 记录共享项目
        this.sharedProjects.set(name, projectPath);
        this.createdProjects.add(projectPath);

        return {
            path: projectPath,
            name,
            cleanup: async () => {
                // 共享项目不会立即清理
            },
        };
    }

    /**
     * 创建临时测试项目（使用系统临时目录）
     * 适用于不需要在工作区保留的测试
     * 
     * @param sourceProject 源项目路径
     * @returns 测试项目信息
     */
    async createTempProject(sourceProject: string): Promise<TestProject> {
        // 清理源项目缓存
        await this.cleanProjectCache(sourceProject);

        // 在系统临时目录创建
        const tempDir = await mkdtemp(join(tmpdir(), 'cocos-e2e-'));

        // 复制项目
        await copy(sourceProject, tempDir, {
            filter: (src) => this.shouldCopyFile(src, sourceProject),
        });

        // 清理目标项目中的 CLI 引擎特定目录（测试前必须清理）
        await this.cleanEngineSpecificDirs(tempDir);

        return {
            path: tempDir,
            name: tempDir.split(/[/\\]/).pop() || 'temp',
            cleanup: async () => {
                await remove(tempDir);
            },
        };
    }

    /**
     * 清理项目缓存目录
     * 清理 .gitignore 忽略的目录和 Cocos 缓存目录
     * 
     * @param projectPath 项目路径
     */
    async cleanProjectCache(projectPath: string): Promise<void> {
        if (!await pathExists(projectPath)) {
            return;
        }

        // 1. 清理 Cocos 缓存目录
        for (const cacheDir of E2EProjectManager.COCOS_CACHE_DIRS) {
            const cachePath = join(projectPath, cacheDir);
            if (await pathExists(cachePath)) {
                await remove(cachePath);
            }
        }

        // 2. 清理 CLI 引擎特定目录（测试前必须清理）
        for (const engineDir of E2EProjectManager.ENGINE_SPECIFIC_DIRS) {
            const enginePath = join(projectPath, engineDir);
            if (await pathExists(enginePath)) {
                await remove(enginePath);
            }
        }

        // 3. 清理 .gitignore 忽略的文件
        await this.cleanGitIgnoredFiles(projectPath);
    }

    /**
     * 清理 CLI 引擎特定目录（测试前必须清理）
     * 
     * @param projectPath 项目路径
     */
    private async cleanEngineSpecificDirs(projectPath: string): Promise<void> {
        if (!await pathExists(projectPath)) {
            return;
        }

        for (const engineDir of E2EProjectManager.ENGINE_SPECIFIC_DIRS) {
            const enginePath = join(projectPath, engineDir);
            if (await pathExists(enginePath)) {
                await remove(enginePath);
            }
        }
    }

    /**
     * 清理 .gitignore 忽略的文件
     * 
     * @param projectPath 项目路径
     */
    private async cleanGitIgnoredFiles(projectPath: string): Promise<void> {
        const gitignorePath = join(projectPath, '.gitignore');

        if (!await pathExists(gitignorePath)) {
            return;
        }

        try {
            // 读取 .gitignore
            const gitignoreContent = await readFile(gitignorePath, 'utf-8');
            const ig = ignore().add(gitignoreContent);

            // 获取项目下的所有文件和目录
            const { readdir } = await import('fs-extra');
            const items = await readdir(projectPath);

            // 清理被忽略的项
            for (const item of items) {
                // 跳过 .gitignore 本身和 .git 目录
                if (item === '.gitignore' || item === '.git') {
                    continue;
                }

                if (ig.ignores(item)) {
                    const itemPath = join(projectPath, item);
                    await remove(itemPath);
                }
            }
        } catch (error) {
            console.warn(`清理 .gitignore 文件失败: ${projectPath}`, error);
        }
    }

    /**
     * 判断文件是否应该被复制
     * 
     * @param src 源文件路径
     * @param sourceRoot 源项目根目录
     * @returns 是否复制
     */
    private shouldCopyFile(src: string, sourceRoot: string): boolean {
        const relativePath = src.replace(sourceRoot, '').replace(/^[/\\]/, '');

        // 跳过空路径（根目录）
        if (!relativePath) {
            return true;
        }

        // 不复制 Cocos 缓存目录
        for (const cacheDir of E2EProjectManager.COCOS_CACHE_DIRS) {
            if (relativePath.startsWith(cacheDir + '/') ||
                relativePath.startsWith(cacheDir + '\\') ||
                relativePath === cacheDir) {
                return false;
            }
        }

        // 不复制 node_modules
        if (relativePath.includes('node_modules')) {
            return false;
        }

        return true;
    }

    /**
     * 清理单个项目
     * 
     * @param projectPath 项目路径
     */
    private async cleanupProject(projectPath: string): Promise<void> {
        if (!this.preserveAfterTest && await pathExists(projectPath)) {
            try {
                await this.removeWithRetry(projectPath);
                this.createdProjects.delete(projectPath);
            } catch (error: any) {
                // 如果删除失败，记录警告但不中断清理流程
                console.warn(`⚠️  无法删除项目目录 ${projectPath}: ${error.message}`);
                // 仍然从记录中移除，避免重复尝试
                this.createdProjects.delete(projectPath);
            }
        }
    }

    /**
     * 清理所有创建的项目
     * 在全局 teardown 中调用
     */
    async cleanupAll(): Promise<void> {
        if (this.preserveAfterTest) {
            console.log(`🔍 调试模式：测试项目保留在 ${this.workspaceRoot}`);
            return;
        }

        // 清理所有创建的项目
        for (const projectPath of this.createdProjects) {
            await this.cleanupProject(projectPath);
        }

        this.createdProjects.clear();

        // 清理整个工作区
        if (await pathExists(this.workspaceRoot)) {
            try {
                await this.removeWithRetry(this.workspaceRoot);
            } catch (error: any) {
                // 如果删除失败，记录警告但不中断清理流程
                console.warn(`⚠️  无法删除工作区目录 ${this.workspaceRoot}: ${error.message}`);
            }
        }
    }

    /**
     * 带重试的删除方法
     * 处理 Windows 上文件被锁定或目录非空的情况
     * 
     * @param path 要删除的路径
     * @param maxRetries 最大重试次数
     * @param retryDelay 重试延迟（毫秒）
     */
    private async removeWithRetry(
        path: string,
        maxRetries: number = 3,
        retryDelay: number = 500
    ): Promise<void> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await remove(path);
                return; // 成功删除，退出
            } catch (error: any) {
                const isLastAttempt = attempt === maxRetries;
                const isRetryableError = 
                    error.code === 'ENOTEMPTY' ||
                    error.code === 'EBUSY' ||
                    error.code === 'EPERM' ||
                    error.message?.includes('directory not empty');

                if (isLastAttempt || !isRetryableError) {
                    // 最后一次尝试或非可重试错误，抛出异常
                    throw error;
                }

                // 等待后重试
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
                }
            }
        }
    }

    /**
     * 生成唯一的项目名称
     */
    private generateProjectName(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        return `test-project-${timestamp}-${random}`;
    }

    /**
     * 从源项目路径中提取项目名称
     */
    private getSourceProjectName(sourceProject: string): string {
        const { basename } = require('path');
        return basename(sourceProject);
    }

    /**
     * 获取工作区路径
     */
    getWorkspaceRoot(): string {
        return this.workspaceRoot;
    }

    /**
     * 获取所有创建的项目列表
     */
    getCreatedProjects(): string[] {
        return Array.from(this.createdProjects);
    }
}

/**
 * 全局项目管理器实例
 */
let globalProjectManager: E2EProjectManager | null = null;

/**
 * 获取全局项目管理器
 * 
 * @param config 配置（首次调用时设置）
 * @returns 项目管理器实例
 */
export function getProjectManager(config?: E2EWorkspaceConfig): E2EProjectManager {
    if (!globalProjectManager) {
        globalProjectManager = new E2EProjectManager(config);
    }
    return globalProjectManager;
}

/**
 * 重置全局项目管理器
 * 主要用于测试
 */
export function resetProjectManager(): void {
    globalProjectManager = null;
}

