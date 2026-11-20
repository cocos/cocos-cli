import { join } from 'path';
import { GlobalPaths } from '../../global';

// 监听来自主进程的消息
process.on('message', async (message: any) => {
    if (message && message.type === 'start') {
        try {
            if (typeof message.enginePath !== 'string' || !message.enginePath.trim()) throw new Error('Compile request must provide enginePath');
            const { selectEnginePath } = await import('./selection');
            const enginePath = selectEnginePath(message.enginePath).path;
            const { readManifest } = require('../../../workflow/engine-sdk');
            const manifest = readManifest(enginePath);
            if (manifest?.schemaVersion === 2 && manifest.entries.inputFormat === 'esm-js') {
                if (message.force) throw new Error('[ENGINE_SDK_PREBUILT] Cannot rebuild installed engine profiles; use the engine source development workflow.');
                const { checkEngineCompatibility } = require('../../../workflow/engine-compatibility');
                checkEngineCompatibility(selectEnginePath(enginePath), GlobalPaths.workspace, 'web');
                if (process.send) process.send({ type: 'done' });
                process.exit(0);
            }
            const engineCompilerPath = join(GlobalPaths.workspace, 'packages', 'engine-compiler', 'dist', 'index');
            const { compileEngine } = require(engineCompilerPath);
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
