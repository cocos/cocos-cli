import { join } from 'path';

const projectRoot = join(__dirname, './fixtures/projects/asset-operation');

export const TestGlobalEnv = {
    projectRoot,
    engineRoot: join(__dirname, './../packages/engine'),
    libraryPath: join(projectRoot, 'library'),
    testRootUrl: 'db://assets/__test__',
    testRoot: join(projectRoot, 'assets/__test__'),
};
