import type { Config } from '@jest/types';
import base from './jest.config';
import parallelTests from './workflow/parallel-tests.json';

const config: Config.InitialOptions = {
    ...base,
    displayName: 'serial',
    // The complement of the parallel allowlist, including all newly added tests.
    testMatch: [...base.testMatch!, ...parallelTests.map(file => `!**/${file}`)],
};

export default config;
