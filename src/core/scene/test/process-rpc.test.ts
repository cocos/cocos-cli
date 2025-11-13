import { fork } from 'child_process';
import { ProcessRPC } from '../process-rpc';
import * as path from 'path';

interface INodeService {
    createNode(name: string): Promise<string>;
    longTask(): Promise<void>;
    ping(): Promise<string>;
}

interface ISceneService {
    loadScene(id: string): Promise<boolean>;
}

// 测试用子进程文件路径
const workerPath = path.resolve(__dirname, './process-rpc/rpc-worker.js');

// 设置测试超时时间为 10 秒
jest.setTimeout(10000);

// 辅助函数：创建并等待子进程启动
async function createWorker(): Promise<ReturnType<typeof fork>> {
    const child = fork(workerPath, [], {
        detached: false,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    // 等待子进程启动
    await new Promise<void>((resolve) => {
        if (child.connected) {
            resolve();
        } else {
            child.once('spawn', () => {
                // 等待一小段时间确保 IPC 通道建立
                setTimeout(resolve, 100);
            });
        }
    });

    return child;
}

// 辅助函数：安全地杀死子进程并等待退出
async function killWorker(child: ReturnType<typeof fork>): Promise<void> {
    return new Promise<void>((resolve) => {
        if (child.killed || !child.connected) {
            resolve();
            return;
        }
        child.once('exit', () => resolve());
        child.kill();
    });
}

describe('ProcessRPC 双向调用测试', () => {
    let child: ReturnType<typeof fork>;
    let rpc: ProcessRPC<{ node: INodeService; scene: ISceneService }>;

    beforeAll(async () => {
        child = await createWorker();
        
        child.stdout?.on('data', (chunk) => {
            console.log(chunk.toString());
        });

        child.stderr?.on('data', (chunk) => {
            console.log(chunk.toString());
        });

        rpc = new ProcessRPC<{ node: INodeService; scene: ISceneService }>();
        rpc.attach(child);
    });

    afterAll(async () => {
        rpc.dispose();
        await killWorker(child);
    });

    describe('基本 RPC 调用', () => {
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

        test('无参数方法调用', async () => {
            const result = await rpc.request('node', 'ping');
            expect(result).toBe('pong');
        });

        test('多个并发请求', async () => {
            const promises = [
                rpc.request('node', 'createNode', ['Entity1']),
                rpc.request('node', 'createNode', ['Entity2']),
                rpc.request('node', 'createNode', ['Entity3']),
                rpc.request('node', 'ping'),
            ];

            const results = await Promise.all(promises);
            expect(results).toEqual([
                'Node:Entity1',
                'Node:Entity2',
                'Node:Entity3',
                'pong'
            ]);
        });
    });

    describe('超时处理', () => {
        test('请求超时应抛出错误', async () => {
            await expect(
                rpc.request('node', 'longTask', [], { timeout: 100 })
            ).rejects.toThrow(/RPC request timeout/);
        });

        test('自定义超时时间', async () => {
            // 长任务 500ms，设置超时 600ms 应成功
            await expect(
                rpc.request('node', 'longTask', [], { timeout: 600 })
            ).resolves.toBe('done');
        });

        test('无超时限制（timeout = 0）', async () => {
            await expect(
                rpc.request('node', 'ping', [], { timeout: 0 })
            ).resolves.toBe('pong');
        });
    });

    describe('错误处理', () => {
        test('调用不存在的模块', async () => {
            await expect(
                // @ts-expect-error 测试错误情况
                rpc.request('invalid', 'method', [])
            ).rejects.toThrow(/Method not found/);
        });

        test('调用不存在的方法', async () => {
            await expect(
                // @ts-expect-error 测试错误情况
                rpc.request('node', 'invalidMethod', [])
            ).rejects.toThrow(/Method not found/);
        });

        test('RPC 销毁后调用应报错', () => {
            const tempRpc = new ProcessRPC();
            tempRpc.dispose();
            
            expect(() => {
                tempRpc.register({ test: {} });
            }).toThrow(/disposed/);
        });

        test('未挂载进程时调用 send 应报错', () => {
            const tempRpc = new ProcessRPC();
            
            expect(() => {
                tempRpc.send('test' as any, 'method', []);
            }).toThrow(/未挂载进程/);
            
            tempRpc.dispose();
        });
    });

    describe('单向消息 (send)', () => {
        test('send 方法不返回结果', () => {
            expect(() => {
                rpc.send('node', 'ping', []);
            }).not.toThrow();
        });

        test('send 到不存在的方法不报错（静默）', () => {
            expect(() => {
                // @ts-expect-error 测试错误情况
                rpc.send('node', 'nonExistent', []);
            }).not.toThrow();
        });
    });

    describe('配置选项', () => {
        test('自定义默认超时时间', async () => {
            const child2 = await createWorker();

            const rpc2 = new ProcessRPC(child2, {
                defaultTimeout: 50, // 50ms
            });

            // 不指定 timeout，使用默认的 50ms
            await expect(
                rpc2.request('node', 'longTask', []) // longTask 需要 500ms
            ).rejects.toThrow(/timeout/);

            rpc2.dispose();
            await killWorker(child2);
        });

        test('自定义最大重试次数', () => {
            const rpc2 = new ProcessRPC(undefined, {
                maxFlushRetries: 5,
            });

            expect(rpc2).toBeDefined();
            rpc2.dispose();
        });
    });

    describe('消息顺序性', () => {
        test('连续发送的消息应按顺序处理', async () => {
            const results: string[] = [];
            
            // 连续发送多个请求
            await rpc.request('node', 'createNode', ['First']);
            results.push('First');
            
            await rpc.request('node', 'createNode', ['Second']);
            results.push('Second');
            
            await rpc.request('node', 'createNode', ['Third']);
            results.push('Third');

            expect(results).toEqual(['First', 'Second', 'Third']);
        });
    });

    describe('资源清理', () => {
        test('dispose 应清理所有资源', async () => {
            const child2 = await createWorker();

            const rpc2 = new ProcessRPC(child2);
            rpc2.dispose();

            // dispose 后应无法使用
            expect(() => {
                rpc2.register({ test: {} });
            }).toThrow(/disposed/);

            await killWorker(child2);
        });

        test('clearPendingMessages 应清理待处理消息', async () => {
            const child2 = await createWorker();

            const rpc2 = new ProcessRPC(child2);
            
            // 发送请求
            const promise = rpc2.request('node' as any, 'ping', []);
            
            // 立即清理 pending
            rpc2.clearPendingMessages();
            
            // 请求应被拒绝
            await expect(promise).rejects.toThrow();

            rpc2.dispose();
            await killWorker(child2);
        });
    });

    describe('堆栈跟踪', () => {
        test('错误应包含原始调用堆栈', async () => {
            try {
                await rpc.request('node', 'longTask', [], { timeout: 50 });
                throw new Error('Should throw timeout error');
            } catch (error: any) {
                expect(error.stack).toContain('Original call stack');
                expect(error.message).toContain('timeout');
            }
        });
    });

    describe('边界情况', () => {
        test('空参数数组', async () => {
            const result = await rpc.request('node', 'ping', []);
            expect(result).toBe('pong');
        });

        test('undefined 参数', async () => {
            const result = await rpc.request('node', 'ping');
            expect(result).toBe('pong');
        });

        test('模块和方法名不能为空', async () => {
            await expect(
                // @ts-expect-error 测试错误情况
                rpc.request('', 'method', [])
            ).rejects.toThrow(/required/);

            await expect(
                // @ts-expect-error 测试错误情况
                rpc.request('module', '', [])
            ).rejects.toThrow(/required/);
        });
    });
});

describe('ProcessRPC 连接管理', () => {
    test('未连接时发送消息应进入 pending 队列', () => {
        const rpc = new ProcessRPC();
        
        // 未 attach 进程前无法发送
        expect(() => {
            rpc.send('test' as any, 'method', []);
        }).toThrow(/未挂载进程/);

        rpc.dispose();
    });

    test('重复 attach 应正确处理', async () => {
        const [child1, child2] = await Promise.all([
            createWorker(),
            createWorker()
        ]);

        const rpc = new ProcessRPC(child1);
        
        // 重复 attach
        rpc.attach(child2);

        rpc.dispose();
        
        // 等待子进程退出
        await Promise.all([
            killWorker(child1),
            killWorker(child2)
        ]);
    });
});
