import { assetManager } from '../../assets';
import { sceneWorker } from '../main-process/scene-worker';
import { ScriptProxy } from '../main-process/proxy/script-proxy';
import { SceneTestEnv } from './scene-test-env';

import * as utils from './utils';

import type { IEditorEvents } from '../common';
import type { IAssetInfo } from '../../assets/@types/public';
import { EditorProxy } from '../main-process/proxy/editor-proxy';

describe('Script Proxy 测试', () => {
    let assetInfo: IAssetInfo | null = null;

    it('创建脚本会触发场景刷新', async () => {
        const scene = await EditorProxy.queryCurrent();
        if (!scene) {
            await EditorProxy.open({
                urlOrUUID: SceneTestEnv.sceneURL
            });
        }
        const eventSceneReloadPromise = utils.once<IEditorEvents>(sceneWorker, 'editor:reload');
        assetInfo = await assetManager.createAssetByType('typescript', SceneTestEnv.targetDirectoryURL, 'abc1');
        await eventSceneReloadPromise; // 等待事件触发
        expect(true).toBe(true);
    });

    it('创建脚本会触发预制体刷新', async () => {
        const scene = await EditorProxy.queryCurrent();
        if (!scene) {
            await EditorProxy.open({
                urlOrUUID: SceneTestEnv.prefabURL
            });
        }
        const eventSceneReloadPromise = utils.once<IEditorEvents>(sceneWorker, 'editor:reload');
        assetInfo = await assetManager.createAssetByType('typescript', SceneTestEnv.targetDirectoryURL, 'abc2');
        expect(assetInfo).not.toBeNull();
        await eventSceneReloadPromise; // 等待事件触发
        expect(true).toBe(true);
    });

    it('queryScriptName', async () => {
        let scriptName: string | null = null;
        if (assetInfo) {
            scriptName = await ScriptProxy.queryScriptName(assetInfo.uuid);
        }
        expect(scriptName).toBeTruthy();
    });

    it('queryScriptCid', async () => {
        let scriptCid: string | null = null;
        if (assetInfo) {
            scriptCid = await ScriptProxy.queryScriptCid(assetInfo.uuid);
        }
        expect(scriptCid).toBeTruthy();
    });
});
