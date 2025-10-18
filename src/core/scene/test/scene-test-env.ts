import path from 'path';
import { TestGlobalEnv } from '../../../tests/global-env';

export const SceneTestEnv = {
    RootName: 'scene-test-directory',
    get CacheDirectory() {
        return path.join(TestGlobalEnv.projectRoot, 'assets', SceneTestEnv.RootName);
    },
    get targetDirectoryURL() {
        return `db://assets/${SceneTestEnv.RootName}`;
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
