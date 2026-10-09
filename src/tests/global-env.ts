import { join } from 'path';
import { GlobalPaths } from '../global';

const projectRoot = join(__dirname, '../../tests/fixtures/projects/asset-operation');

export const TestGlobalEnv = {
    projectRoot,
    engineRoot: GlobalPaths.enginePath,
    libraryPath: join(projectRoot, 'library'),
    testRootUrl: 'db://assets/__test__',
    testRoot: join(projectRoot, 'assets/__test__'),
};
