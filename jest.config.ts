import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    cacheDirectory: '<rootDir>/.cache/jest',
    roots: ['<rootDir>/src/core', '<rootDir>/tests'],
    testMatch: [
        '**/__tests__/**/*.+(ts|tsx|js)',
        '**/*.(test|spec).+(ts|tsx|js)'
    ],
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest'
    },
    // `cc/mods-mgr` 仅由生成的引擎代理文件（packages/cc-module/editor/*.js）在运行时 require，磁盘上不存在。
    // EngineLoader.init 会全局劫持模块解析并在 maxWorkers:1 的串行 worker 中泄漏到后续测试文件，导致某些
    // 用例对引擎代理模块的 jest.mock 失配、真实代理文件被加载，从而 `require('cc/mods-mgr')` 解析失败
    // （报错随测试文件顺序漂移）。此处把 `cc/mods-mgr` 兜底到桩，确保任何顺序下都能解析成功。
    moduleNameMapper: {
        '^cc/mods-mgr$': '<rootDir>/src/core/test/stubs/cc-mods-mgr.js',
    },
    collectCoverageFrom: [
        'src/core/**/*.{ts,tsx}',
        '!src/core/**/*.d.ts',
    ],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    testTimeout: 100000,
    verbose: true,
    // 失败测试汇总选项
    bail: false, // 不因第一个失败而停止
    maxWorkers: 1, // 单线程运行，便于查看错误
    forceExit: true, 
    detectOpenHandles: false,
    globalTeardown: '<rootDir>/src/core/test/global-teardown.ts',
    setupFilesAfterEnv: ['<rootDir>/src/core/test/setup-after-env.ts'],
};

export default config;

