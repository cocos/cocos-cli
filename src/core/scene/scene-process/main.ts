import { SceneReadyChannel } from '../common';
import { startupRpc } from './rpc';
import { parseCommandLineArgs } from './utils';
import { initEngine } from '../../engine';

async function startup () {
    // 监听进程退出事件
    process.on('message', (msg) => {
        if (msg === 'scene-process:exit') {
            process.disconnect(); // 关闭 IPC
            process.exit(0);// 退出进程
        }
    });

    console.log('[Scene] startup worker');

    console.log(`[Scene] parse args ${process.argv}`);
    const { enginePath, projectPath, serverURL } = parseCommandLineArgs(process.argv);
    if (!enginePath || !projectPath) {
        throw new Error('enginePath or projectPath is not set');
    }

    await initEngine(enginePath, projectPath, serverURL);
    console.log('[Scene] initEngine success');
    // 导入 service，让他能处理装饰器，捕获开发的 api
    await import('./service');
    console.log('[Scene] import service');
    await startupRpc();
    console.log('[Scene] startup Rpc');

    // 发送消息给父进程
    process.send?.(SceneReadyChannel);
    console.log(`[Scene] startup worker success, cocos version: ${cc.ENGINE_VERSION}`);
}

void startup();
