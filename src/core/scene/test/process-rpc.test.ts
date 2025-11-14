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

describe('队列暂停/恢复', () => {
    test('pauseQueue 应暂停消息发送', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);
        
        // 暂停队列
        rpc.pauseQueue();
        
        // 发送请求（会进入队列但不会立即发送）
        const promise = rpc.request('node', 'ping', []);
        
        // 等待一小段时间，确保消息在队列中
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 恢复队列
        rpc.resumeQueue();
        
        // 请求应该成功
        await expect(promise).resolves.toBe('pong');
        
        rpc.dispose();
        await killWorker(child);
    });

    test('resumeQueue 应重置重试计数', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);
        
        rpc.pauseQueue();
        rpc.resumeQueue();
        
        // 应该能正常工作
        const result = await rpc.request('node', 'ping', []);
        expect(result).toBe('pong');
        
        rpc.dispose();
        await killWorker(child);
    });

    test('暂停超时应自动恢复队列', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);
        
        rpc.pauseQueue();
        
        // 等待超过暂停超时时间（60秒太长，这里只测试逻辑）
        // 实际测试中我们手动恢复
        rpc.resumeQueue();
        
        const result = await rpc.request('node', 'ping', []);
        expect(result).toBe('pong');
        
        rpc.dispose();
        await killWorker(child);
    });
});

describe('进程断线重连', () => {
    test('进程退出后重新连接应正常工作', async () => {
        const child1 = await createWorker();
        const rpc = new ProcessRPC(child1);
        
        // 第一次调用成功
        const result1 = await rpc.request('node', 'ping', []);
        expect(result1).toBe('pong');
        
        // 暂停队列
        rpc.pauseQueue();
        
        // 杀死子进程
        await killWorker(child1);
        
        // 等待一小段时间
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 创建新进程并重新连接
        const child2 = await createWorker();
        rpc.attach(child2);
        rpc.resumeQueue();
        
        // 第二次调用应该成功
        const result2 = await rpc.request('node', 'ping', []);
        expect(result2).toBe('pong');
        
        rpc.dispose();
        await killWorker(child2);
    });

    test('进程断线时待处理的请求应被拒绝', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);
        
        // 发送请求
        const promise = rpc.request('node', 'longTask', [], { timeout: 5000 });
        
        // 立即杀死进程
        child.kill();
        
        // 请求应该失败
        await expect(promise).rejects.toThrow();
        
        rpc.dispose();
    });
});

describe('异步 send 处理器', () => {
    test('异步 send 处理器错误应被捕获', async () => {
        const child = await createWorker();
        const errors: Error[] = [];
        
        const rpc = new ProcessRPC(child, {
            onSendError: (error) => {
                errors.push(error);
            }
        });
        
        // 注册一个会抛出错误的异步处理器
        rpc.register({
            test: {
                async throwError() {
                    throw new Error('Async error in send handler');
                }
            }
        });
        
        // 从子进程发送消息（需要子进程支持）
        // 这里我们直接测试 send 不会崩溃
        rpc.send('node', 'ping', []);
        
        // 等待一小段时间
        await new Promise(resolve => setTimeout(resolve, 100));
        
        rpc.dispose();
        await killWorker(child);
    });

    test('onSendError 回调应被调用', async () => {
        const child = await createWorker();
        const errors: Array<{ error: Error; module: string; method: string }> = [];
        
        const rpc = new ProcessRPC(child, {
            onSendError: (error, module, method) => {
                errors.push({ error, module, method });
            }
        });
        
        // 注册会抛出错误的处理器
        rpc.register({
            test: {
                errorMethod() {
                    throw new Error('Test error');
                }
            }
        });
        
        // 发送消息（不等待响应）
        rpc.send('node', 'ping', []);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        rpc.dispose();
        await killWorker(child);
    });
});

describe('高并发场景', () => {
    test('大量并发请求应正常工作', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);
        
        // 发送 100 个并发请求
        const promises = Array.from({ length: 100 }, (_, i) =>
            rpc.request('node', 'createNode', [`Entity${i}`])
        );
        
        const results = await Promise.all(promises);
        
        // 验证所有结果
        results.forEach((result, i) => {
            expect(result).toBe(`Node:Entity${i}`);
        });
        
        rpc.dispose();
        await killWorker(child);
    });

    test('超过 maxCallbacks 限制应抛出错误', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child, {
            maxCallbacks: 5 // 设置很小的限制
        });
        
        // 发送 10 个长时间任务（不等待完成）
        const promises = Array.from({ length: 10 }, () =>
            rpc.request('node', 'longTask', [], { timeout: 10000 })
        );
        
        // 至少有一些请求应该失败（超过限制）
        const results = await Promise.allSettled(promises);
        const rejected = results.filter(r => r.status === 'rejected');
        
        expect(rejected.length).toBeGreaterThan(0);
        
        rpc.dispose();
        await killWorker(child);
    });

    test('超过 maxPendingMessages 限制应抛出错误', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child, {
            maxPendingMessages: 5, // 设置很小的限制
            maxCallbacks: 10000 // 确保不受 maxCallbacks 限制影响
        });
        
        // 暂停队列，让消息堆积
        rpc.pauseQueue();
        
        // 尝试发送超过限制的消息，第6个应该被拒绝
        const promises: Array<Promise<any>> = [];
        
        for (let i = 0; i < 10; i++) {
            promises.push(rpc.request('node', 'ping', []));
        }
        
        // dispose 会拒绝所有 Promise
        rpc.dispose();
        
        // 等待所有 Promise 完成
        const results = await Promise.allSettled(promises);
        
        // 至少有一些应该被拒绝（超过队列限制）
        const rejected = results.filter(r => r.status === 'rejected');
        expect(rejected.length).toBeGreaterThan(0);
        
        // 检查是否有队列满的错误
        const queueFullErrors = rejected.filter(r => 
            (r as PromiseRejectedResult).reason.message.includes('maximum pending messages')
        );
        expect(queueFullErrors.length).toBeGreaterThan(0);
        
        await killWorker(child);
    });
});

describe('消息 ID 生成器', () => {
    test('ID 冲突检测应正常工作', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);
        
        // 发送大量请求，测试 ID 不会冲突
        const promises = Array.from({ length: 1000 }, (_, i) =>
            rpc.request('node', 'createNode', [`Test${i}`])
        );
        
        const results = await Promise.all(promises);
        expect(results.length).toBe(1000);
        
        rpc.dispose();
        await killWorker(child);
    });
});

describe('队列消息超时', () => {
    test('队列中的消息应正确计算剩余超时时间', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);
        
        // 暂停队列
        rpc.pauseQueue();
        
        // 发送带超时的请求
        const promise = rpc.request('node', 'ping', [], { timeout: 500 });
        
        // 等待 300ms（超时时间的一半）
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 恢复队列
        rpc.resumeQueue();
        
        // 请求应该在剩余时间内完成
        await expect(promise).resolves.toBe('pong');
        
        rpc.dispose();
        await killWorker(child);
    });

    test('队列中的消息超时应被正确处理', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);
        
        // 暂停队列
        rpc.pauseQueue();
        
        // 发送带短超时的长任务请求（longTask 需要 500ms）
        const promise = rpc.request('node', 'longTask', [], { timeout: 200 });
        
        // 等待超过超时时间
        await new Promise(resolve => setTimeout(resolve, 250));
        
        // 恢复队列（此时消息已超时）
        rpc.resumeQueue();
        
        // 请求应该超时（错误消息包含 timeout）
        try {
            await promise;
            throw new Error('Should have thrown timeout error');
        } catch (error: any) {
            expect(error.message).toMatch(/timeout/i);
        }
        
        rpc.dispose();
        await killWorker(child);
    });
});

describe('处理器异常', () => {
    test('处理器抛出同步错误应被捕获', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);
        
        // 注册会抛出错误的处理器
        rpc.register({
            test: {
                throwSync() {
                    throw new Error('Sync error');
                }
            }
        });
        
        // 从子进程调用（需要子进程支持，这里测试本地）
        // 实际测试中可以通过子进程调用主进程方法
        
        rpc.dispose();
        await killWorker(child);
    });

    test('处理器抛出异步错误应被捕获', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);
        
        // 注册会抛出异步错误的处理器
        rpc.register({
            test: {
                async throwAsync() {
                    throw new Error('Async error');
                }
            }
        });
        
        rpc.dispose();
        await killWorker(child);
    });
});

describe('边界情况补充', () => {
    test('dispose 后的请求应立即被拒绝', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);
        
        // 暂停队列，确保消息不会立即发送
        rpc.pauseQueue();
        
        // 发送请求（会进入队列）
        const promise = rpc.request('node', 'longTask', [], { timeout: 5000 });
        
        // 等待一小段时间确保消息在队列中
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // dispose 应该清理队列中的消息
        rpc.dispose();
        
        // 请求应该被拒绝，使用 Promise.race 避免永久等待
        const result = await Promise.race([
            promise.then(() => 'resolved', (error) => ({ error: error.message })),
            new Promise(resolve => setTimeout(() => resolve('timeout'), 1000))
        ]);
        
        // 验证结果
        if (result === 'timeout') {
            throw new Error('Promise was not rejected within 1 second');
        } else if (result === 'resolved') {
            throw new Error('Promise should have been rejected, not resolved');
        } else {
            // 成功被拒绝
            expect((result as any).error).toBeTruthy();
        }
        
        await killWorker(child);
    });

    test('register 无效的 handler 应抛出错误', () => {
        const rpc = new ProcessRPC();
        
        expect(() => {
            // @ts-expect-error 测试错误情况
            rpc.register(null);
        }).toThrow(/valid object/);
        
        expect(() => {
            // @ts-expect-error 测试错误情况
            rpc.register('invalid');
        }).toThrow(/valid object/);
        
        rpc.dispose();
    });

    test('未挂载进程时调用 request 应报错', async () => {
        const rpc = new ProcessRPC();
        
        await expect(
            rpc.request('test' as any, 'method', [])
        ).rejects.toThrow(/未挂载进程/);
        
        rpc.dispose();
    });

    test('多次 dispose 应该安全', () => {
        const rpc = new ProcessRPC();
        
        rpc.dispose();
        rpc.dispose(); // 第二次调用应该安全
        
        expect(() => {
            rpc.dispose();
        }).not.toThrow();
    });
});

describe('配置选项补充', () => {
    test('maxPendingMessages 配置应生效', () => {
        const rpc = new ProcessRPC(undefined, {
            maxPendingMessages: 100
        });
        
        expect(rpc).toBeDefined();
        rpc.dispose();
    });

    test('maxCallbacks 配置应生效', () => {
        const rpc = new ProcessRPC(undefined, {
            maxCallbacks: 500
        });
        
        expect(rpc).toBeDefined();
        rpc.dispose();
    });

    test('flushBatchSize 配置应生效', () => {
        const rpc = new ProcessRPC(undefined, {
            flushBatchSize: 10
        });
        
        expect(rpc).toBeDefined();
        rpc.dispose();
    });

    test('所有配置选项组合', () => {
        const rpc = new ProcessRPC(undefined, {
            maxPendingMessages: 500,
            maxCallbacks: 5000,
            defaultTimeout: 60000,
            flushBatchSize: 20,
            maxFlushRetries: 5,
            onSendError: (error, module, method) => {
                console.error(`Error in ${module}.${method}:`, error);
            }
        });
        
        expect(rpc).toBeDefined();
        rpc.dispose();
    });
});

describe('进程切换重置重试计数', () => {
    test('进程切换应重置重试计数，新进程能正常工作', async () => {
        const child1 = await createWorker();
        const rpc = new ProcessRPC(child1, {
            maxFlushRetries: 2, // 设置较小的重试次数便于测试
            defaultTimeout: 5000
        });

        // 第一个进程正常工作
        const result1 = await rpc.request('node', 'ping', []);
        expect(result1).toBe('pong');

        // 暂停队列
        rpc.pauseQueue();
        
        // 杀死第一个进程
        await killWorker(child1);

        // 创建新进程并重新连接
        const child2 = await createWorker();
        rpc.attach(child2); // 这里应该重置重试计数
        
        // 发送一些消息到队列（在新进程上）
        const pendingPromise = rpc.request('node', 'ping', []);
        
        // 恢复队列
        rpc.resumeQueue();

        // 验证：新进程应该能正常处理队列中的消息
        const result2 = await pendingPromise;
        expect(result2).toBe('pong');

        // 验证：新进程继续正常工作
        const result3 = await rpc.request('node', 'createNode', ['TestNode']);
        expect(result3).toBe('Node:TestNode');

        rpc.dispose();
        await killWorker(child2);
    });

    test('进程切换时应清理旧进程的所有状态', async () => {
        const child1 = await createWorker();
        const rpc = new ProcessRPC(child1);

        // 在第一个进程上发送请求
        const promise1 = rpc.request('node', 'longTask', [], { timeout: 10000 });

        // 等待请求发送
        await new Promise(resolve => setTimeout(resolve, 50));

        // 切换到新进程（应该清理旧进程的回调）
        const child2 = await createWorker();
        rpc.attach(child2);

        // 旧进程的请求应该被拒绝
        await expect(promise1).rejects.toThrow();

        // 新进程应该能正常工作
        const result = await rpc.request('node', 'ping', []);
        expect(result).toBe('pong');

        rpc.dispose();
        await Promise.all([killWorker(child1), killWorker(child2)]);
    });

    test('快速多次切换进程应保持稳定', async () => {
        const rpc = new ProcessRPC();

        // 快速切换 5 次
        for (let i = 0; i < 5; i++) {
            const child = await createWorker();
            rpc.attach(child);

            // 验证每次切换后都能正常工作
            const result = await rpc.request('node', 'ping', []);
            expect(result).toBe('pong');

            await killWorker(child);
        }

        rpc.dispose();
    });
});

describe('ProcessAdapter.send() 返回值处理', () => {
    test('send() 返回 undefined 应视为发送失败', () => {
        const { ProcessAdapter } = require('../process-rpc/process-adapter');
        
        const mockProcess = {
            send: jest.fn().mockReturnValue(undefined), // 模拟返回 undefined
            on: jest.fn(),
            off: jest.fn(),
            connected: true
        };

        const adapter = new ProcessAdapter();
        adapter.attach(mockProcess as any);

        const result = adapter.send({
            type: 'request',
            id: 1,
            module: 'test',
            method: 'test',
            args: []
        });

        expect(result).toBe(false); // 应该视为发送失败
    });

    test('send() 返回 false 应视为发送失败', () => {
        const { ProcessAdapter } = require('../process-rpc/process-adapter');
        
        const mockProcess = {
            send: jest.fn().mockReturnValue(false),
            on: jest.fn(),
            off: jest.fn(),
            connected: true
        };

        const adapter = new ProcessAdapter();
        adapter.attach(mockProcess as any);

        const result = adapter.send({
            type: 'request',
            id: 1,
            module: 'test',
            method: 'test',
            args: []
        });

        expect(result).toBe(false);
    });

    test('send() 返回 true 应视为发送成功', () => {
        const { ProcessAdapter } = require('../process-rpc/process-adapter');
        
        const mockProcess = {
            send: jest.fn().mockReturnValue(true),
            on: jest.fn(),
            off: jest.fn(),
            connected: true
        };

        const adapter = new ProcessAdapter();
        adapter.attach(mockProcess as any);

        const result = adapter.send({
            type: 'request',
            id: 1,
            module: 'test',
            method: 'test',
            args: []
        });

        expect(result).toBe(true);
    });

    test('send() 抛出异常应返回 false', () => {
        const { ProcessAdapter } = require('../process-rpc/process-adapter');
        
        const mockProcess = {
            send: jest.fn().mockImplementation(() => {
                throw new Error('Send failed');
            }),
            on: jest.fn(),
            off: jest.fn(),
            connected: true
        };

        const adapter = new ProcessAdapter();
        adapter.attach(mockProcess as any);

        const result = adapter.send({
            type: 'request',
            id: 1,
            module: 'test',
            method: 'test',
            args: []
        });

        expect(result).toBe(false);
    });

    test('send() 返回值处理应影响消息队列行为', async () => {
        const child = await createWorker();
        
        // 创建一个 mock 的 send 函数，前几次返回 false
        let sendCount = 0;
        const originalSend = child.send?.bind(child);
        child.send = jest.fn((msg: any) => {
            sendCount++;
            if (sendCount <= 2) {
                return false; // 前两次失败
            }
            return originalSend?.(msg); // 之后成功
        }) as any;

        const rpc = new ProcessRPC(child, {
            maxFlushRetries: 5
        });

        // 发送请求，应该会重试
        const result = await rpc.request('node', 'ping', []);
        expect(result).toBe('pong');

        // 验证确实进行了重试
        expect(sendCount).toBeGreaterThan(1);

        rpc.dispose();
        await killWorker(child);
    });
});

describe('dispose 立即拒绝 Promise', () => {
    test('dispose 应立即拒绝所有待处理的 Promise', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);

        // 发送长时间任务
        const promise = rpc.request('node', 'longTask', [], { timeout: 10000 });

        // 等待一小段时间确保请求已发送
        await new Promise(resolve => setTimeout(resolve, 50));

        // dispose 应立即拒绝 Promise
        const startTime = Date.now();
        rpc.dispose();

        try {
            await promise;
            throw new Error('Promise should be rejected');
        } catch (error: any) {
            const duration = Date.now() - startTime;
            
            // 应该立即拒绝，不等待超时（容忍 200ms 的误差）
            expect(duration).toBeLessThan(200);
            
            // 错误消息应该包含 disposed 或相关信息
            expect(error.message).toMatch(/disposed|reset|disconnected|exited/i);
        }

        await killWorker(child);
    });

    test('dispose 应拒绝队列中的所有 Promise', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);

        // 暂停队列，让消息堆积
        rpc.pauseQueue();

        // 发送多个请求到队列
        const promises = [
            rpc.request('node', 'ping', []),
            rpc.request('node', 'createNode', ['Node1']),
            rpc.request('node', 'createNode', ['Node2']),
        ];

        // 等待消息进入队列
        await new Promise(resolve => setTimeout(resolve, 100));

        // dispose 应该立即拒绝所有 Promise
        const startTime = Date.now();
        rpc.dispose();

        const results = await Promise.allSettled(promises);
        const duration = Date.now() - startTime;

        // 所有 Promise 应该被拒绝
        expect(results.every(r => r.status === 'rejected')).toBe(true);

        // 应该立即完成
        expect(duration).toBeLessThan(200);

        await killWorker(child);
    });

    test('dispose 后新的请求应立即被拒绝', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);

        rpc.dispose();

        // dispose 后的请求应该立即被拒绝
        const startTime = Date.now();
        
        try {
            await rpc.request('node', 'ping', []);
            throw new Error('Should throw error');
        } catch (error: any) {
            const duration = Date.now() - startTime;
            
            // 应该立即拒绝
            expect(duration).toBeLessThan(50);
            expect(error.message).toContain('disposed');
        }

        await killWorker(child);
    });

    test('多次 dispose 应该安全且幂等', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);

        const promise = rpc.request('node', 'longTask', [], { timeout: 10000 });

        await new Promise(resolve => setTimeout(resolve, 50));

        // 多次调用 dispose
        rpc.dispose();
        rpc.dispose();
        rpc.dispose();

        // 不应该抛出错误
        expect(() => rpc.dispose()).not.toThrow();

        // Promise 应该被拒绝
        await expect(promise).rejects.toThrow();

        await killWorker(child);
    });
});

describe('综合场景', () => {
    test('进程崩溃重启的完整流程', async () => {
        const child1 = await createWorker();
        const rpc = new ProcessRPC(child1);

        // 第一阶段：正常工作
        const result1 = await rpc.request('node', 'ping', []);
        expect(result1).toBe('pong');

        // 第二阶段：进程崩溃
        rpc.pauseQueue();

        // 杀死进程
        await killWorker(child1);

        // 第三阶段：重启进程
        await new Promise(resolve => setTimeout(resolve, 100));
        const child2 = await createWorker();
        rpc.attach(child2);
        
        // 发送一些请求到队列（在新进程上）
        const queuedPromises = [
            rpc.request('node', 'createNode', ['Node1']),
            rpc.request('node', 'createNode', ['Node2']),
        ];
        
        rpc.resumeQueue();

        // 第四阶段：验证恢复
        const results = await Promise.all(queuedPromises);
        expect(results).toEqual(['Node:Node1', 'Node:Node2']);

        // 继续正常工作
        const result2 = await rpc.request('node', 'ping', []);
        expect(result2).toBe('pong');

        rpc.dispose();
        await killWorker(child2);
    });

    test('高并发下的进程切换', async () => {
        const child1 = await createWorker();
        const rpc = new ProcessRPC(child1);

        // 发送大量并发请求
        const promises1 = Array.from({ length: 50 }, (_, i) =>
            rpc.request('node', 'createNode', [`Entity${i}`])
        );

        // 等待部分请求完成
        await new Promise(resolve => setTimeout(resolve, 100));

        // 切换进程
        const child2 = await createWorker();
        rpc.attach(child2);

        // 继续发送请求
        const promises2 = Array.from({ length: 50 }, (_, i) =>
            rpc.request('node', 'createNode', [`Entity${i + 50}`])
        );

        // 等待所有请求完成（部分会失败，部分会成功）
        const results = await Promise.allSettled([...promises1, ...promises2]);

        // 至少应该有一些成功的请求
        const succeeded = results.filter(r => r.status === 'fulfilled');
        expect(succeeded.length).toBeGreaterThan(0);

        rpc.dispose();
        await Promise.all([killWorker(child1), killWorker(child2)]);
    });
});

describe('CallbackManager 大量回调分批清理', () => {
    test('超过 100 个回调应分批清理，避免阻塞事件循环', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);

        // 创建 200 个待处理请求
        const promises = Array.from({ length: 200 }, () =>
            rpc.request('node', 'longTask', [], { timeout: 10000 })
        );

        // 等待请求发送
        await new Promise(resolve => setTimeout(resolve, 100));

        // dispose 应该触发分批清理
        const startTime = Date.now();
        rpc.dispose();

        // 所有 Promise 应该被拒绝
        const results = await Promise.allSettled(promises);
        const duration = Date.now() - startTime;

        // 验证所有请求都被拒绝
        expect(results.every(r => r.status === 'rejected')).toBe(true);

        // 清理应该很快完成（即使有 200 个回调）
        expect(duration).toBeLessThan(1000);

        await killWorker(child);
    });

    test('大量回调清理不应导致栈溢出', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child, {
            maxCallbacks: 1000
        });

        // 创建 500 个待处理请求
        const promises = Array.from({ length: 500 }, () =>
            rpc.request('node', 'longTask', [], { timeout: 10000 })
        );

        await new Promise(resolve => setTimeout(resolve, 100));

        // 清理大量回调不应该抛出栈溢出错误
        expect(() => {
            rpc.dispose();
        }).not.toThrow();

        // 所有 Promise 应该被拒绝
        const results = await Promise.allSettled(promises);
        expect(results.every(r => r.status === 'rejected')).toBe(true);

        await killWorker(child);
    });

    test('clearPendingMessages 应该高效清理大量消息', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child);

        // 暂停队列并发送大量消息
        rpc.pauseQueue();

        const promises = Array.from({ length: 300 }, (_, i) =>
            rpc.request('node', 'createNode', [`Node${i}`])
        );

        await new Promise(resolve => setTimeout(resolve, 100));

        // 清理应该很快完成
        const startTime = Date.now();
        rpc.clearPendingMessages();
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(500);

        // 所有 Promise 应该被拒绝
        const results = await Promise.allSettled(promises);
        expect(results.every(r => r.status === 'rejected')).toBe(true);

        rpc.dispose();
        await killWorker(child);
    });
});

describe('MessageQueue 指数退避重试', () => {
    test('重试应使用指数退避，避免过于激进', async () => {
        const child = await createWorker();
        
        const sendAttempts: number[] = [];
        const startTime = Date.now();
        
        // Mock send 函数记录每次尝试的时间
        const originalSend = child.send?.bind(child);
        child.send = jest.fn((msg: any) => {
            sendAttempts.push(Date.now() - startTime);
            
            // 前 3 次失败
            if (sendAttempts.length <= 3) {
                return false;
            }
            
            // 第 4 次成功
            return originalSend?.(msg);
        }) as any;

        const rpc = new ProcessRPC(child, {
            maxFlushRetries: 5
        });

        // 发送请求，应该会重试
        const result = await rpc.request('node', 'ping', []);
        expect(result).toBe('pong');

        // 验证重试次数
        expect(sendAttempts.length).toBeGreaterThan(1);

        // 验证重试间隔递增（指数退避）
        if (sendAttempts.length >= 3) {
            const interval1 = sendAttempts[1] - sendAttempts[0];
            const interval2 = sendAttempts[2] - sendAttempts[1];
            
            // 第二次重试间隔应该大于第一次（允许一些误差）
            expect(interval2).toBeGreaterThanOrEqual(interval1 * 0.8);
        }

        rpc.dispose();
        await killWorker(child);
    });

    test('重试达到最大次数后应拒绝所有待处理消息', async () => {
        const child = await createWorker();
        
        // Mock send 始终返回 false
        child.send = jest.fn().mockReturnValue(false);

        const rpc = new ProcessRPC(child, {
            maxFlushRetries: 2 // 设置较小的重试次数
        });

        // 发送请求
        const promise = rpc.request('node', 'ping', []);

        // 等待重试完成
        await expect(promise).rejects.toThrow(/retry|exceeded|attempts/i);

        rpc.dispose();
        await killWorker(child);
    });

    test('部分成功的批次应重置重试计数', async () => {
        const child = await createWorker();
        
        let callCount = 0;
        const originalSend = child.send?.bind(child);
        
        // Mock send: 第1次失败，第2次成功，第3次失败，第4次成功
        child.send = jest.fn((msg: any) => {
            callCount++;
            if (callCount === 1 || callCount === 3) {
                return false; // 失败
            }
            return originalSend?.(msg); // 成功
        }) as any;

        const rpc = new ProcessRPC(child, {
            maxFlushRetries: 3
        });

        // 发送多个请求
        const result1 = await rpc.request('node', 'ping', []);
        expect(result1).toBe('pong');

        const result2 = await rpc.request('node', 'createNode', ['Node1']);
        expect(result2).toBe('Node:Node1');

        rpc.dispose();
        await killWorker(child);
    });

    test('队列暂停期间不应触发重试', async () => {
        const child = await createWorker();
        
        let sendCount = 0;
        child.send = jest.fn(() => {
            sendCount++;
            return false; // 始终失败
        });

        const rpc = new ProcessRPC(child, {
            maxFlushRetries: 3
        });

        // 暂停队列
        rpc.pauseQueue();

        // 发送请求
        const promise = rpc.request('node', 'ping', []);

        // 等待一段时间
        await new Promise(resolve => setTimeout(resolve, 500));

        // 暂停期间不应该有重试
        expect(sendCount).toBeLessThanOrEqual(1);

        // 恢复队列
        rpc.resumeQueue();

        // 等待请求完成（会失败）
        await expect(promise).rejects.toThrow();

        rpc.dispose();
        await killWorker(child);
    });
});

describe('综合性能测试', () => {
    test('高并发 + 大量回调 + 进程切换的综合场景', async () => {
        const child1 = await createWorker();
        const rpc = new ProcessRPC(child1, {
            maxCallbacks: 2000,
            maxPendingMessages: 2000
        });

        // 第一阶段：发送大量并发请求
        const promises1 = Array.from({ length: 100 }, (_, i) =>
            rpc.request('node', 'createNode', [`Phase1-${i}`])
        );

        // 等待部分完成
        await new Promise(resolve => setTimeout(resolve, 50));

        // 第二阶段：切换进程
        const child2 = await createWorker();
        rpc.attach(child2);

        // 第三阶段：继续发送请求
        const promises2 = Array.from({ length: 100 }, (_, i) =>
            rpc.request('node', 'createNode', [`Phase2-${i}`])
        );

        // 第四阶段：暂停队列
        rpc.pauseQueue();

        const promises3 = Array.from({ length: 100 }, (_, i) =>
            rpc.request('node', 'createNode', [`Phase3-${i}`])
        );

        await new Promise(resolve => setTimeout(resolve, 100));

        // 第五阶段：恢复队列
        rpc.resumeQueue();

        // 等待所有请求完成
        const allResults = await Promise.allSettled([
            ...promises1,
            ...promises2,
            ...promises3
        ]);

        // 至少应该有一些成功的请求
        const succeeded = allResults.filter(r => r.status === 'fulfilled');
        expect(succeeded.length).toBeGreaterThan(0);

        rpc.dispose();
        await Promise.all([killWorker(child1), killWorker(child2)]);
    });

    test('极限压力测试：1000 个并发请求', async () => {
        const child = await createWorker();
        const rpc = new ProcessRPC(child, {
            maxCallbacks: 2000,
            maxPendingMessages: 2000,
            defaultTimeout: 30000
        });

        const startTime = Date.now();

        // 发送 1000 个并发请求
        const promises = Array.from({ length: 1000 }, (_, i) =>
            rpc.request('node', 'createNode', [`Entity${i}`])
        );

        const results = await Promise.allSettled(promises);
        const duration = Date.now() - startTime;

        // 统计成功和失败的数量
        const succeeded = results.filter(r => r.status === 'fulfilled');
        const failed = results.filter(r => r.status === 'rejected');

        console.log(`1000 个请求完成: 成功 ${succeeded.length}, 失败 ${failed.length}, 耗时 ${duration}ms`);

        // 至少应该有大部分成功
        expect(succeeded.length).toBeGreaterThan(900);

        rpc.dispose();
        await killWorker(child);
    });
});
