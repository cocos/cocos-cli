import { join } from 'path';
import { fork } from 'child_process';

/**
 * 在独立的子进程中运行引擎编译
 * 这样可以避免繁重的 babel 转译阻塞主进程事件循环
 */
export function startCompileEngineProcess(force: boolean = false): Promise<void> {
    return new Promise((resolve, reject) => {
        // 根据运行环境决定是使用 ts-node 还是直接执行 js
        const isTsNode = (process as any)[Symbol.for('ts-node.register.instance')] || process.env.TS_NODE_DEV;
        
        let workerPath = join(__dirname, 'compile-worker.ts');
        const execArgv = [...process.execArgv];
        
        // 如果是编译后的环境
        if (!__filename.endsWith('.ts')) {
            workerPath = join(__dirname, 'compile-worker.js');
        } else if (!isTsNode && __filename.endsWith('.ts')) {
            // ts 环境但没有直接注册 ts-node（比如被某些 runner 调用）
            execArgv.push('-r', 'ts-node/register');
        }

        console.log(`🚀 启动引擎编译子进程...`);
        const worker = fork(workerPath, [], {
            stdio: 'inherit',
            execArgv,
        });

        worker.on('message', (message: any) => {
            if (message.type === 'done') {
                resolve();
            } else if (message.type === 'error') {
                reject(new Error(`[Worker Error] ${message.message}\n${message.stack}`));
            }
        });

        worker.on('error', (err) => {
            reject(err);
        });

        worker.on('exit', (code) => {
            if (code !== 0 && code !== null) {
                reject(new Error(`Engine compile worker exited with code ${code}`));
            }
        });

        // 告诉 worker 开始编译
        worker.send({ type: 'start', force });
    });
}
