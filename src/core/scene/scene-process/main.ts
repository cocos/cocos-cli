import { IScriptEvents, SceneReadyChannel } from '../common';
import { Rpc } from './rpc';
import { parseCommandLineArgs } from './utils';
import { Engine } from '../../engine';
import { join } from 'path';
import { ServiceEvents } from './service/core';

async function startup() {
    // 监听进程退出事件
    process.on('message', (msg) => {
        if (msg === 'scene-process:exit') {
            ServiceEvents.clear();
            process.disconnect?.(); // 关闭 IPC
            process.exit(0);// 退出进程
        }
    });

    console.log('[Scene] startup worker');

    console.log(`[Scene] parse args ${process.argv}`);
    const { enginePath, projectPath, serverURL } = parseCommandLineArgs(process.argv);
    if (!enginePath || !projectPath) {
        throw new Error('enginePath or projectPath is not set');
    }

    await Engine.init(enginePath);
    // 这里 importBase 与 nativeBase 用服务器是为了让服务器转换资源真实存放的路径
    await Engine.initEngine({
        serverURL: serverURL,
        importBase: serverURL ?? join(projectPath, 'library'),
        nativeBase: serverURL ?? join(projectPath, 'library'),
        writablePath: join(projectPath, 'temp'),
    }, async () => {
        // 导入 service，处理装饰器，捕获开发的 api
        await import('./service');
        console.log('[Scene] import service');
        await Rpc.startup();
        console.log('[Scene] startup Rpc');

        const { Service } = await import('./service/core/decorator');
        (globalThis.cce as any) = {
            Script: Service.Script
        };
        // 脚本变动后，需要刷新场景
        ServiceEvents.on<IScriptEvents>('script:execution-finished', () => {
            console.log('[Scene] Script execution-finished');
            Service.Scene.queryCurrentScene().then((scene) => {
                if (scene) {
                    // releaseAsset 资源，为了让 Prefab 资源能够加载到新的脚本，在脚本更新后需要遍历释放所有的 prefab 资源
                    cc.assetManager.assets.forEach((asset: any) => {
                        if (asset instanceof cc.Prefab) {
                            cc.assetManager.releaseAsset(asset);
                        }
                    });
                    console.log('[Scene] Script suspend soft reload');
                    Service.Script.suspend(Promise.resolve(Service.Scene.softReload({})));
                }
            });
        });

    }, async () => {
        await cc.game.run();
    });
    console.log('[Scene] initEngine success');

    // 发送消息给父进程
    process.send?.(SceneReadyChannel);
    console.log(`[Scene] startup worker success, cocos version: ${cc.ENGINE_VERSION}`);
}

void startup();
