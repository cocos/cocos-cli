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
        return 'TestAbcScene';
    },
    get prefabName() {
        return 'TestAbcPrefab';
    },
    get sceneURL() {
        return `${this.targetDirectoryURL}/${this.sceneName}.scene`;
    },
    get prefabURL() {
        return `${this.targetDirectoryURL}/${this.prefabName}.prefab`;
    },
    get enginePath() {
        return TestGlobalEnv.engineRoot;
    },
    get projectPath() {
        return TestGlobalEnv.projectRoot;
    }
};
