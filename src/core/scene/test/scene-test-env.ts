import * as path from 'path';
import { TestGlobalEnv } from '../../../tests/global-env';

export const SceneTestEnv = {
    rootName: 'scene-test-directory',
    get cacheDirectory() {
        return path.join(TestGlobalEnv.projectRoot, 'assets', SceneTestEnv.rootName);
    },
    get targetDirectoryURL() {
        return `db://assets/${SceneTestEnv.rootName}`;
    },
    get sceneName() {
        return 'TestScene';
    },
    get enginePath() {
        return TestGlobalEnv.engineRoot;
    },
    get projectPath() {
        return TestGlobalEnv.projectRoot;
    }
};
