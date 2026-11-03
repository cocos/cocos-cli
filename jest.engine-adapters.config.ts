import type { Config } from '@jest/types';
import base from './jest.config';
const config: Config.InitialOptions = {
    ...base,
    runtime: '<rootDir>/workflow/jest-adapter-runtime.cjs',
    cacheDirectory: '<rootDir>/.cache/jest-engine-adapters',
    testMatch: [...base.testMatch!, '**/*.engine-test.ts'],
    setupFiles: ['<rootDir>/src/core/test/adapter-selection.ts', ...(base.setupFiles ?? [])],
};
export default config;
