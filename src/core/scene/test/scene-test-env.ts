import path from 'path';
import { TestGlobalEnv } from '../../../../tests/global-env';

export const SceneTestEnv = {
    RootName: 'scene-test-directory',
    get CacheDirectory() {
        return path.join(TestGlobalEnv.projectRoot, 'assets', SceneTestEnv.RootName);
    },
    get newSceneURL() {
        return `db://assets/${SceneTestEnv.RootName}/TestScene.scene`;
    },
    get enginePath() {
        return TestGlobalEnv.engineRoot;
    },
    get projectPath() {
        return TestGlobalEnv.projectRoot;
    }
};
