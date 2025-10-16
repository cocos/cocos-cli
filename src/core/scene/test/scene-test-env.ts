import path from 'path';
import user from '../../../../.user.json';

export const SceneTestEnv = {
    RootName: 'scene-test-directory',
    get CacheDirectory() {
        return path.join(SceneTestEnv.projectPath, 'assets', SceneTestEnv.RootName);
    },
    get projectPath() { return user.project; },
    get enginePath() { return user.engine; },
    get newSceneURL() { return `db://assets/${SceneTestEnv.RootName}/TestScene.scene`; },

}
