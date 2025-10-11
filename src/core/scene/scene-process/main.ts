import path from 'path';
import { SceneReadyChannel } from '../common';
import { startupRpc } from './rpc';

async function initEngine(enginePath: string, projectPath: string) {
    const { default: Engine } = await import('../../../core/engine');
    await Engine.init(enginePath);
    console.log('initEngine', enginePath);
    await Engine.initEngine({
        importBase: path.join(projectPath, 'library'),
        nativeBase: path.join(projectPath, 'library'),
        writablePath: path.join(projectPath, 'temp'),
    });
    console.log('[Scene] initEngine success');
}

function parseParams() {
    return process.argv.slice(2).reduce((acc, cur) => {
        const [k, v] = cur.replace(/^--/, '').split('=');
        acc[k] = v;
        return acc;
    }, {} as Record<string, string>);
}

async function startup () {
    console.log('[Scene] startup');
    const params = parseParams();

    const enginePath = params.enginePath;
    const projectPath = params.projectPath;
    if (!enginePath || !projectPath) {
        throw new Error('enginePath or projectPath is not set');
    }

    await initEngine(enginePath, projectPath);

    // 导入 service，让他能处理装饰器，捕获开发的 api
    await import('./service');
    await startupRpc();

    // 发送消息给父进程
    process.send?.(SceneReadyChannel);
    console.log('[Scene] startup worker success, cocos creator version:', cc.ENGINE_VERSION);
}

void startup();
