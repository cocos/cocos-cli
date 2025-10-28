import type { Config } from '@jest/types';
import { E2E_TIMEOUTS } from './config';

const config: Config.InitialOptions = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: '..',
    roots: ['<rootDir>/e2e'],
    testMatch: [
        '**/e2e/**/*.e2e.test.+(ts|tsx|js)'
    ],
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest'
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    // 测试超时：使用统一配置
    testTimeout: E2E_TIMEOUTS.JEST_GLOBAL,
    verbose: true,
    maxWorkers: 1, // 串行执行，避免端口冲突
    globalSetup: '<rootDir>/e2e/setup.ts',
    globalTeardown: '<rootDir>/e2e/teardown.ts',
    // 确保测试前已经构建
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    setupFilesAfterEnv: ['<rootDir>/e2e/jest.setup.ts'],
};

export default config;

