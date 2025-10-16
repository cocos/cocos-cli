import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: '..',
    setupFilesAfterEnv: ['<rootDir>/src/mcp/test/mcp-setup.ts'],
    roots: ['<rootDir>/src/api'],
    testMatch: [
        '**/test/**/*.test.+(ts|tsx|js)'
    ],
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest'
    },
    collectCoverageFrom: [
        'src/api/**/*.{ts,tsx}',
        '!src/api/**/*.d.ts',
        '!src/api/**/test/**',
    ],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'd.ts'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1'
    },
    testTimeout: 100000,
    verbose: true,
    // 失败测试汇总选项
    bail: false, // 不因第一个失败而停止
    maxWorkers: 1, // 单线程运行，便于查看错误
    forceExit: true, // 强制退出 Jest 进程
};

export default config;