/**
 * E2E 测试全局配置
 * 
 * 统一管理所有超时时间、端口号等配置
 */

/**
 * E2E 测试超时配置（毫秒）
 */
export const E2E_TIMEOUTS = {
    /** Jest 全局测试超时：10 分钟 */
    JEST_GLOBAL: 10 * 60 * 1000,

    /** 服务器启动超时：2 分钟 */
    SERVER_START: 2 * 60 * 1000,

    /** 构建/创建项目/导入操作超时：10 分钟 */
    BUILD_OPERATION: 10 * 60 * 1000,

    /** MCP 请求超时：5 分钟（用于 callTool） */
    MCP_REQUEST: 5 * 60 * 1000,

    /** MCP 列表操作超时：2 分钟（用于 listTools） */
    MCP_LIST: 2 * 60 * 1000,

    /** 进程强制终止超时：5 秒 */
    FORCE_KILL: 5 * 1000,
} as const;

/**
 * 测试端口配置
 */
export const E2E_PORTS = {
    /** 自动分配端口 */
    AUTO: 0,

    /** 测试用的非常规端口 */
    TEST_PORT: 58234,
} as const;

/**
 * 测试项目配置
 */
export const E2E_PROJECT = {
    /** 测试工作区目录 */
    WORKSPACE_DIR: '.workspace',

    /** 共享项目目录 */
    SHARED_DIR: 'shared',
} as const;

