import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import type { SceneSessionDescriptor, SceneSessionSnapshot, SceneSessionCommand } from '../src/core/scene/session/protocol';

const integration = process.env.COCOS_TEST_SHARED_SCENE === '1' ? describe : describe.skip;
integration('shared scene with real Worker and separate editor process', () => {
    it('shares live edits, remote gesture undo/redo, save and reconnect snapshots', async () => {
        const { globalSetup } = await import('../src/core/test/global-setup');
        await globalSetup();
        const { EditorProxy } = await import('../src/core/scene/main-process/proxy/editor-proxy');
        const { NodeProxy } = await import('../src/core/scene/main-process/proxy/node-proxy');
        const { Rpc } = await import('../src/core/scene/main-process/rpc');
        const { startSessionServer } = await import('../src/lib/scene/scene');
        const { assetManager } = await import('../src/core/assets');
        const { NodeType } = await import('../src/core/scene/common');
        const scene = await EditorProxy.create({ type: 'scene', baseName: `SharedSession_${Date.now()}`, targetDirectory: 'db://assets' });
        const { TestGlobalEnv } = await import('../src/tests/global-env');
        const server = await startSessionServer({ project: TestGlobalEnv.projectRoot });
        let child: ChildProcess | undefined;
        let id = 0;
        const spawn = () => child = fork(resolve(__dirname, 'helpers/scene-session-client.cjs'), [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
        const request = (descriptor: SceneSessionDescriptor, command?: SceneSessionCommand): Promise<any> => new Promise((accept, reject) => {
            const requestId = ++id;
            const timeout = setTimeout(() => { child?.off('message', listener); reject(new Error('Editor client timed out')); }, 30000);
            const listener = (message: any) => {
                if (message.id !== requestId) return;
                clearTimeout(timeout); child?.off('message', listener);
                message.error ? reject(Object.assign(new Error(message.error.message), message.error)) : accept(message.value);
            };
            child!.on('message', listener);
            child!.send({ id: requestId, descriptor, command });
        });
        try {
            await EditorProxy.open({ urlOrUUID: scene.assetUuid });
            const node = await NodeProxy.createByType({ path: 'SharedNode', nodeType: NodeType.EMPTY });
            await EditorProxy.save({});
            spawn();
            const before: SceneSessionSnapshot = await request(server.descriptor);
            const dump: any = await Rpc.getInstance().request('Node', 'query', [{ path: node!.path }]);
            dump.position.value.x = 19;
            const command: SceneSessionCommand = { source: 'editor-child', operationId: 'gesture-1', expected: before.version,
                module: 'Editor', method: 'applyRecordedChanges', args: [[{ uuid: dump.uuid.value, kind: 'node', dump }], 'Move in editor'] };
            await request(server.descriptor, command);
            const x = async () => ((await Rpc.getInstance().request('Node', 'query', [{ path: node!.path }])) as any).position.value.x;
            expect(await x()).toBe(19);
            const edited: SceneSessionSnapshot = await request(server.descriptor);
            expect(edited.dirty).toBe(true);
            expect(edited.serializedScene).toContain('SharedNode');
            await Rpc.getInstance().request('Undo', 'undo', []);
            expect(await x()).toBe(0);
            await Rpc.getInstance().request('Redo', 'redo', []);
            expect(await x()).toBe(19);
            await expect(request(server.descriptor, { ...command, operationId: 'stale-gesture' })).rejects.toMatchObject({ code: 'CONFLICT' });
            await EditorProxy.save({});
            child!.kill();
            spawn();
            const reconnected: SceneSessionSnapshot = await request(server.descriptor);
            expect(reconnected.dirty).toBe(false);
            expect(reconnected.canUndo).toBe(true);
            expect(reconnected.render?.assetUuid).toBe(scene.assetUuid);
        } finally {
            child?.kill();
            await server.close();
            await EditorProxy.close({});
            await assetManager.removeAsset(scene.assetUuid);
            const { sceneWorker } = await import('../src/core/scene/main-process/scene-worker');
            await sceneWorker.stop();
        }
    }, 360000);
});
