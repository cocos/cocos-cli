import type { Config } from '@jest/types';
import base from './jest.config';
import parallelTests from './workflow/parallel-tests.json';

// Only reviewed, resource-independent files belong here. New tests default to serial.
const config: Config.InitialOptions = {
    ...base,
    displayName: 'parallel',
    testMatch: parallelTests.map(file => `<rootDir>/${file}`),
    maxWorkers: 2,
    detectOpenHandles: false, // detectOpenHandles implicitly enables runInBand.
    forceExit: false,
    setupFilesAfterEnv: [], // These tests never open a real project.
    globalTeardown: undefined,
};

export default config;
