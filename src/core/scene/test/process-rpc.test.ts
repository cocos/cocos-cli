import { fork } from 'child_process';
import { ProcessRPC } from '../process-rpc';
import * as path from 'path';

interface INodeService {
    createNode(name: string): Promise<string>;
    longTask(): Promise<void>;
}

interface ISceneService {
    loadScene(id: string): Promise<boolean>;
    addReferenceImage(path: string): Promise<{ path: string; dataUrl: string }>;
}

interface IReferenceImageFiles {
    readDataUrl(path: string): Promise<string>;
}

// 测试用子进程文件路径
const workerPath = path.resolve(__dirname, './process-rpc/rpc-worker.js');

describe('ProcessRPC 双向调用测试', () => {
    let child: ReturnType<typeof fork>;
    let rpc: ProcessRPC<{ node: INodeService; scene: ISceneService; referenceImageFiles: IReferenceImageFiles }>;

    beforeAll(() => {
        child = fork(workerPath, [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
        child.stdout?.on('data', (chunk) => {
            console.log(chunk.toString());
        });

        child.stderr?.on('data', (chunk) => {
            console.log(chunk.toString());
        });
        rpc = new ProcessRPC<{ node: INodeService; scene: ISceneService; referenceImageFiles: IReferenceImageFiles }>();
        rpc.attach(child);
    });

    afterAll(() => {
        child.kill();
    });

    test('主进程调用子进程方法', async () => {
        const result = await rpc.request('node', 'createNode', ['Player']);
        expect(result).toBe('Node:Player');
    });

    test('子进程调用主进程方法', async () => {
        // 主进程注册模块供子进程调用
        rpc.register({
            scene: {
                loadScene: async (id: string) => {
                    return id === 'Level01';
                },
            }
        });

        const result = await rpc.request('scene', 'loadScene', ['Level01']);
        expect(result).toBe(true);
    });

    test('Node → Scene → Node nested reference-image RPC completes', async () => {
        rpc.register({
            referenceImageFiles: {
                async readDataUrl(filePath: string) {
                    return `data:image/png;base64,${Buffer.from(filePath).toString('base64')}`;
                },
            },
        });

        await expect(rpc.request('scene', 'addReferenceImage', ['C:\\reference.png'], { timeout: 1000 }))
            .resolves.toEqual({
                path: 'C:\\reference.png',
                dataUrl: `data:image/png;base64,${Buffer.from('C:\\reference.png').toString('base64')}`,
            });
    });

    test('超时处理', async () => {
        await expect(
            rpc.request('node', 'longTask', [], { timeout: 100 })
        ).rejects.toThrow(/RPC request timeout/);
    });
});
