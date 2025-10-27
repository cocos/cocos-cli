import { assetManager } from '../../assets';
import { sceneWorker } from '../main-process/scene-worker';
import { ScriptProxy } from '../main-process/proxy/script-proxy';
import { SceneTestEnv } from './scene-test-env';

import type { ISceneEvents } from '../common';
import type { IAssetInfo } from '../../assets/@types/public';

// 单个测试文件生效
jest.setTimeout(30 * 60 * 1000); // 半小时（30 分钟）

function once<TEvents extends Record<string, any>>(
    emitter: {
        on<TKey extends keyof TEvents>(event: TKey, handler: (data: TEvents[TKey]) => void): void;
        off<TKey extends keyof TEvents>(event: TKey, handler: (data: TEvents[TKey]) => void): void;
    },
    event: keyof TEvents,
    timeout = 3000
): Promise<TEvents[keyof TEvents]> {
    return new Promise((resolve, reject) => {
        const handler = (data: any) => {
            clearTimeout(timer);
            emitter.off(event, handler);
            resolve(data);
        };
        const timer = setTimeout(() => {
            emitter.off(event, handler);
            reject(new Error(`Timeout waiting for event "${String(event)}"`));
        }, timeout);
        emitter.on(event, handler);
    });
}

describe('Script Proxy 测试', () => {
    let assetInfo: IAssetInfo | null = null;
    it('创建脚本会触发场景刷新', async () => {
        const eventSceneReloadPromise = once<ISceneEvents>(sceneWorker, 'scene:soft-reload');
        assetInfo = await assetManager.createAssetByType('typescript', SceneTestEnv.targetDirectoryURL, 'abc');
        await eventSceneReloadPromise; // 等待事件触发
        expect(true).toBe(true);
    }, 10000);

    it('queryScriptName', async () => {
        if (assetInfo) {
            const scriptName = await ScriptProxy.queryScriptName(assetInfo.uuid);
            expect(scriptName).toBeTruthy();
        }
    });

    it('queryScriptCid', async () => {
        if (assetInfo) {
            const scriptCid = await ScriptProxy.queryScriptCid(assetInfo.uuid);
            expect(scriptCid).toBeTruthy();
        }
    });
});
