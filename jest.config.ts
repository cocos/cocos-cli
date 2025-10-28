import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src/core', '<rootDir>/tests'],
    testMatch: [
        '**/__tests__/**/*.+(ts|tsx|js)',
        '**/*.(test|spec).+(ts|tsx|js)'
    ],
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest'
    },
    collectCoverageFrom: [
        'src/core/**/*.{ts,tsx}',
        '!src/core/**/*.d.ts',
    ],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'd.ts'],
    testTimeout: 100000,
    verbose: true,
    // 失败测试汇总选项
    bail: false, // 不因第一个失败而停止
    maxWorkers: 1, // 单线程运行，便于查看错误
    forceExit: true, // 由于单元测试 @cocos/ccbuild 有 GC 残留没办法自动关闭需要强制关
};

export default config;

