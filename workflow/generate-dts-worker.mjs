// Keep the extraction worker's native stack and V8 limits aligned. The calling
// process supervises this process so native crashes cannot bypass recovery.
import { Worker, isMainThread } from 'node:worker_threads';

if (isMainThread) {
    const worker = new Worker(new URL(import.meta.url), {
        resourceLimits: {
            stackSizeMb: 64,
            maxOldGenerationSizeMb: 4096,
        },
    });
    worker.on('error', error => {
        console.error(error);
        process.exitCode = 1;
    });
    worker.on('exit', code => {
        process.exitCode = code || process.exitCode || 0;
    });
} else {
    const { register } = await import('tsx/esm/api');
    register();
    await import('./generate-dts.ts');
}
