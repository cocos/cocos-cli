import { SceneReadyChannel } from '../common';
import { startupRpc } from './rpc';
import { parseCommandLineArgs } from './utils';
import { Engine } from '../../engine';
import { join } from 'path';

async function startup () {
    // 监听进程退出事件
    process.on('message', (msg) => {
        if (msg === 'scene-process:exit') {
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
        await startupRpc();
        console.log('[Scene] startup Rpc');

        // TODO hack 后续可能要思考一下如何正确的初始化引擎
        const { Service } = await import('./service/decorator');
        (globalThis.cce as any) = {
            Script: Service.Script
        };
    }, async () => {
        await cc.game.run();
    });
    console.log('[Scene] initEngine success');

    // 发送消息给父进程
    process.send?.(SceneReadyChannel);
    console.log(`[Scene] startup worker success, cocos version: ${cc.ENGINE_VERSION}`);
}

void startup();
