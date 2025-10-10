import path from 'path';
import { managerMap } from './service/decorator';
import { TIpcResponse, TIpcRequest, SceneReadyChannel } from '../common';

// 导出 service，让他能处理装饰器，捕获开发的 api
export * from './service'

async function initEngine(enginePath: string, projectPath: string) {
    const { default: Engine } = await import('../../../core/engine');
    await Engine.init(enginePath);
    console.log('initEngine', enginePath);
    await Engine.initEngine({
        importBase: path.join(projectPath, 'library'),
        nativeBase: path.join(projectPath, 'library'),
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

    process.on('message', async (msg: TIpcRequest) => {
        const { id, channel, methodName, params } = msg;

        const manager = managerMap.get(channel);
        if (manager && typeof manager[methodName] === 'function') {
            try {
                const result = await manager[methodName](...params);
                if (id) {
                    process.send?.({ id, reply: true, data: result } as TIpcResponse);
                }
            } catch (err: any) {
                if (id) {
                    process.send?.({ id, reply: true, error: err?.message ?? String(err) } as TIpcResponse);
                } else {
                    console.error(`Error in manager method ${channel}.${methodName}:`, err);
                }
            }
        } else if (id) {
            process.send?.({
                id,
                reply: true,
                error: `Unknown manager or method: ${channel}.${methodName}`,
            } as TIpcResponse);
        } else {
            console.warn(`Unknown send event: ${channel}.${methodName}`);
        }
    });

    // 发送消息给父进程
    process.send?.({ channel: SceneReadyChannel });
    console.log('[Scene] startup worker success, cocos creator version:', cc.ENGINE_VERSION);
}

void startup();
