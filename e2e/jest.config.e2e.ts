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
    forceExit: true, // 强制退出，确保所有异步操作完成后退出
    globalSetup: '<rootDir>/e2e/setup.ts',
    globalTeardown: '<rootDir>/e2e/teardown.ts',
    // 确保测试前已经构建
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    setupFilesAfterEnv: ['<rootDir>/e2e/jest.setup.ts'],

    // 测试报告配置
    reporters: [
        'default', // 保留默认的控制台输出
        [
            'jest-html-reporter',
            {
                pageTitle: 'Cocos CLI E2E Test Report',
                // 使用本地时间生成唯一的报告文件名（精确到分钟）
                // 格式：test-report-2024-01-15-10-30.html
                outputPath: (() => {
                    const now = new Date();
                    // 使用本地时间，格式化为 YYYY-MM-DD-HH-mm
                    const timestamp = now.toLocaleString().replace(/\//g, '-').replace(/\s/g, '-').replace(/:/g, '-');
                    return `e2e/reports/test-report-${timestamp}.html`;
                })(),
                includeFailureMsg: true,
                includeConsoleLog: true,
                sort: 'status', // 按状态排序（失败的在前）
                executionTimeWarningThreshold: 5, // 执行时间警告阈值（秒）
                dateFormat: 'yyyy-mm-dd HH:MM:ss',
                theme: 'darkTheme', // 或 'lightTheme' / 'darkTheme'
                logo: '../../static/image.png', // 可选：添加 logo
            },
        ],
        // 自定义 reporter：打印测试报告路径
        '<rootDir>/e2e/helpers/report-printer.js',
    ],
};

export default config;

