import { join } from 'path';
import { GlobalPaths } from '../../global';

// 监听来自主进程的消息
process.on('message', async (message: any) => {
    if (message && message.type === 'start') {
        try {
            const engineCompilerPath = join(GlobalPaths.workspace, 'packages', 'engine-compiler', 'dist', 'index');
            const { compileEngine } = require(engineCompilerPath);

            if (typeof message.enginePath !== 'string' || !message.enginePath.trim()) throw new Error('Compile request must provide enginePath');
            const { selectEnginePath } = await import('./selection');
            const enginePath = selectEnginePath(message.enginePath).path;
            //compile for editor
            await compileEngine(enginePath);
            //compile for web
            await compileEngine(enginePath, true);

            // 编译成功后给主进程发送完成消息
            if (process.send) {
                process.send({ type: 'done' });
            }
            process.exit(0);
        } catch (error: any) {
            console.error('Engine compile worker failed:', error);
            if (process.send) {
                process.send({
                    type: 'error',
                    message: error.message,
                    stack: error.stack
                });
            }
            process.exit(1);
        }
    }
});
