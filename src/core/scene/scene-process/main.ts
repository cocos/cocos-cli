import { SceneReadyChannel, SceneExitChannel } from '../common';
import { Rpc } from './rpc';
import { parseCommandLineArgs } from './utils';
import { Engine } from '../../engine';
import { join } from 'path';
import { serviceManager } from './service/service-manager';

async function startup() {
    // 0. Initialize RPC first (Attach process), prevent early message loss
    // Even if Service is not ready, take over Message listening
    Rpc.init();

    // Listen for process exit event
    process.on('message', (msg) => {
        if (msg === SceneExitChannel) {
            Rpc.dispose();
            process.disconnect?.(); // Close IPC
            process.exit(0);// Exit process
        }
    });

    console.log(`[Scene] startup worker pid: ${process.pid}`);

    console.log(`[Scene] parse args ${process.argv}`);
    const { enginePath, projectPath, serverURL } = parseCommandLineArgs(process.argv);
    if (!enginePath || !projectPath) {
        throw new Error('enginePath or projectPath is not set');
    }

    // Initialize service-manager
    serviceManager.initialize();

    await Engine.init(enginePath);
    // Use server for importBase and nativeBase to let server transform real resource availability
    await Engine.initEngine({
        serverURL: serverURL,
        importBase: serverURL ?? join(projectPath, 'library'),
        nativeBase: serverURL ?? join(projectPath, 'library'),
        writablePath: join(projectPath, 'temp'),
    }, async () => {
        // Import service, handle decorators, capture developed api
        await import('./service');
        console.log('[Scene] import service');
        
        // Register Service to RPC
        const { Service } = await import('./service/core/decorator');
        Rpc.register(Service);
        console.log('[Scene] startup Rpc');

        (globalThis.cce as any) = {
            Script: Service.Script
        };
    }, async () => {
        await cc.game.run();
        
        // Initialize engine service
        const { Service } = await import('./service/core/decorator');
        await Service.Engine.init();
    });

    console.log('[Scene] initEngine success');
    
    // Send message to parent process
    process.send?.(SceneReadyChannel);
    
    console.log(`[Scene] startup worker success, cocos version: ${cc.ENGINE_VERSION}`);
}

void startup();
