import { join } from 'path';
import { engine as EnginPath } from '../../../.user.json';

const projectRoot = join(__dirname, '../../../tests/fixtures/projects/asset-operation');

export const TestGlobalEnv = {
    projectRoot,
    engineRoot: EnginPath,
    libraryPath: join(projectRoot, 'library'),
    testRootUrl: 'db://assets/__test__',
    testRoot: join(projectRoot, 'assets/__test__'),
};