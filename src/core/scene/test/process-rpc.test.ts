import { fork } from 'child_process';
import { ProcessRPC } from '../process-rpc';
import path from 'path';

interface INodeService {
    createNode(name: string): Promise<string>;
    longTask(): Promise<void>;
}

interface ISceneService {
    loadScene(id: string): Promise<boolean>;
}

// 测试用子进程文件路径
const workerPath = path.resolve(__dirname, './process-rpc/rpc-worker.js');

describe('ProcessRPC 双向调用测试', () => {
    let child: ReturnType<typeof fork>;
    let rpc: ProcessRPC<{ node: INodeService; scene: ISceneService }>;

    beforeAll(() => {
        child = fork(workerPath, [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
        child.stdout?.on('data', (chunk) => {
            console.log(chunk.toString());
        });

        child.stderr?.on('data', (chunk) => {
            console.log(chunk.toString());
        });
        rpc = new ProcessRPC<{ node: INodeService; scene: ISceneService }>();
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
            'scene': {
                loadScene: async (id: string) => {
                    return id === 'Level01';
                },
            }
        });

        const result = await rpc.request('scene', 'loadScene', ['Level01']);
        expect(result).toBe(true);
    });

    test('超时处理', async () => {
        await expect(
            rpc.request('node', 'longTask', [], { timeout: 100 })
        ).rejects.toThrow(/RPC request timeout/);
    });
});
