import { MCPTestClient } from './mcp-client';
import { getSharedTestProject } from './test-utils';
import { TestProject } from './project-manager';
import { resolve, join } from 'path';
import { E2E_DEBUG } from '../config';

/**
 * 全局共享的 MCP 服务器管理器
 * 所有测试共享同一个服务器实例，避免重复启动
 */
class SharedMCPServerManager {
    private static instance: SharedMCPServerManager | null = null;
    private mcpClient: MCPTestClient | null = null;
    private testProject: TestProject | null = null;
    private isInitialized = false;
    private initializationPromise: Promise<void> | null = null;
    private fixtureProject: string | null = null;
    private projectName: string | null = null;

    private constructor() {
        // 私有构造函数，确保单例
    }

    /**
     * 获取单例实例
     */
    static getInstance(): SharedMCPServerManager {
        if (!SharedMCPServerManager.instance) {
            SharedMCPServerManager.instance = new SharedMCPServerManager();
        }
        return SharedMCPServerManager.instance;
    }

    /**
     * 初始化共享的 MCP 服务器
     * 使用共享的测试项目，所有测试复用同一个项目实例
     * 
     * @param fixtureProject 测试项目 fixture 路径（可选，默认使用 asset-operation）
     * @param projectName 共享项目名称（可选，默认使用 'mcp-e2e-shared'）
     */
    async initialize(fixtureProject?: string, projectName?: string): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        // 如果正在初始化，等待初始化完成
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        // 保存配置
        this.fixtureProject = fixtureProject || resolve(__dirname, '../../tests/fixtures/projects/asset-operation');
        this.projectName = projectName || 'mcp-e2e-shared';

        this.initializationPromise = this._doInitialize();
        return this.initializationPromise;
    }

    private async _doInitialize(): Promise<void> {
        if (E2E_DEBUG) {
            console.log('🔧 初始化全局共享 MCP 服务器...');
        }

        try {
            // 使用共享项目（所有测试复用同一个项目实例）
            this.testProject = await getSharedTestProject(this.fixtureProject!, this.projectName!);

            // 创建并启动 MCP 客户端（端口自动分配）
            this.mcpClient = new MCPTestClient({
                projectPath: this.testProject.path,
            });

            await this.mcpClient.start();

            if (E2E_DEBUG) {
                console.log(`✅ 全局共享 MCP 服务器已启动，端口: ${this.mcpClient.getPort()}`);
            }

            this.isInitialized = true;
        } catch (error) {
            if (E2E_DEBUG) {
                console.error('❌ 初始化全局共享 MCP 服务器失败:', error);
            }
            throw error;
        }
    }

    /**
     * 获取共享的 MCP 客户端实例
     */
    getClient(): MCPTestClient {
        if (!this.mcpClient) {
            throw new Error('Shared MCP server not initialized. Call initialize() first.');
        }
        return this.mcpClient;
    }

    /**
     * 获取共享的测试项目
     */
    getTestProject(): TestProject {
        if (!this.testProject) {
            throw new Error('Shared test project not initialized. Call initialize() first.');
        }
        return this.testProject;
    }

    /**
     * 获取测试根路径配置（用于 assets 测试）
     */
    getAssetsTestRootConfig(): { testRootUrl: string; testRootPath: string } {
        const testProject = this.getTestProject();
        const testRootPath = join(testProject.path, 'assets', 'e2e-test');
        const testRootUrl = 'db://assets/e2e-test';
        return { testRootUrl, testRootPath };
    }

    /**
     * 确保 assets 测试根目录存在
     */
    async ensureAssetsTestRoot(): Promise<void> {
        const client = this.getClient();
        const { testRootUrl } = this.getAssetsTestRootConfig();

        try {
            // 尝试创建测试根目录（如果不存在）
            await client.callTool('assets-create-asset', {
                options: {
                    target: testRootUrl,
                },
            });
        } catch {
            // 如果已存在，忽略错误
            if (E2E_DEBUG) {
                console.log('测试根目录已存在或创建失败（忽略）');
            }
        }
    }

    /**
     * 清理资源（在所有测试完成后调用）
     */
    async cleanup(): Promise<void> {
        if (!this.isInitialized) {
            return;
        }

        if (E2E_DEBUG) {
            console.log('🧹 清理全局共享 MCP 服务器...');
        }

        // 清理测试资源（如果有 assets 测试根目录）
        if (this.mcpClient) {
            try {
                const { testRootUrl } = this.getAssetsTestRootConfig();
                await this.mcpClient.callTool('assets-delete-asset', {
                    dbPath: testRootUrl,
                });
            } catch {
                // 忽略清理失败的错误
                if (E2E_DEBUG) {
                    console.warn('清理测试资源失败（忽略）');
                }
            }

            // 关闭客户端和服务器
            await this.mcpClient.close();
            this.mcpClient = null;
        }

        // 清理测试项目（共享项目由测试框架统一清理）
        if (this.testProject) {
            await this.testProject.cleanup();
            this.testProject = null;
        }

        this.isInitialized = false;
        this.initializationPromise = null;
        this.fixtureProject = null;
        this.projectName = null;

        if (E2E_DEBUG) {
            console.log('✅ 全局共享 MCP 服务器已清理');
        }
    }

    /**
     * 检查是否已初始化
     */
    isReady(): boolean {
        return this.isInitialized;
    }
}

/**
 * 获取全局共享的 MCP 服务器管理器实例
 */
export function getSharedMCPServer(): SharedMCPServerManager {
    return SharedMCPServerManager.getInstance();
}

