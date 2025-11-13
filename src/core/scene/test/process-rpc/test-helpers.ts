import { fork, ChildProcess } from 'child_process';
import * as path from 'path';

/**
 * 测试辅助工具
 * 提供通用的测试辅助函数和类型定义
 */

// 测试用子进程文件路径
export const workerPath = path.resolve(__dirname, './rpc-worker.js');

// 测试服务接口定义
export interface INodeService {
    createNode(name: string): Promise<string>;
    longTask(): Promise<void>;
    ping(): Promise<string>;
}

export interface ISceneService {
    loadScene(id: string): Promise<boolean>;
}

/**
 * 创建并等待子进程启动
 */
export async function createWorker(): Promise<ChildProcess> {
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

/**
 * 安全地杀死子进程并等待退出
 */
export async function killWorker(child: ChildProcess): Promise<void> {
    return new Promise<void>((resolve) => {
        if (child.killed || !child.connected) {
            resolve();
            return;
        }
        child.once('exit', () => resolve());
        child.kill();
    });
}

/**
 * 创建 Mock 进程对象
 */
export function createMockProcess(options: {
    sendReturnValue?: boolean | undefined;
    sendImplementation?: (msg: any) => boolean | undefined;
    connected?: boolean;
} = {}): any {
    const {
        sendReturnValue = true,
        sendImplementation,
        connected = true
    } = options;

    return {
        send: sendImplementation 
            ? jest.fn(sendImplementation)
            : jest.fn().mockReturnValue(sendReturnValue),
        on: jest.fn(),
        off: jest.fn(),
        once: jest.fn(),
        connected
    };
}

/**
 * 等待指定时间
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 创建测试用的错误对象
 */
export function createTestError(message: string): Error {
    const error = new Error(message);
    error.stack = `Error: ${message}\n    at test (test.ts:1:1)`;
    return error;
}

/**
 * 验证 Promise 在指定时间内完成
 */
export async function expectToCompleteWithin<T>(
    promise: Promise<T>,
    maxDuration: number,
    message?: string
): Promise<T> {
    const startTime = Date.now();
    const result = await promise;
    const duration = Date.now() - startTime;
    
    if (duration > maxDuration) {
        throw new Error(
            message || `Expected to complete within ${maxDuration}ms, but took ${duration}ms`
        );
    }
    
    return result;
}

/**
 * 验证 Promise 被拒绝且在指定时间内完成
 */
export async function expectToRejectWithin(
    promise: Promise<any>,
    maxDuration: number,
    errorPattern?: RegExp | string
): Promise<void> {
    const startTime = Date.now();
    
    try {
        await promise;
        throw new Error('Expected promise to be rejected, but it was resolved');
    } catch (error: any) {
        const duration = Date.now() - startTime;
        
        if (duration > maxDuration) {
            throw new Error(`Expected to reject within ${maxDuration}ms, but took ${duration}ms`);
        }
        
        if (errorPattern) {
            const pattern = typeof errorPattern === 'string' 
                ? new RegExp(errorPattern) 
                : errorPattern;
            
            if (!pattern.test(error.message)) {
                throw new Error(
                    `Expected error message to match ${pattern}, but got: ${error.message}`
                );
            }
        }
    }
}

/**
 * 统计 Promise 结果
 */
export function countPromiseResults(results: PromiseSettledResult<any>[]): {
    fulfilled: number;
    rejected: number;
    total: number;
} {
    const fulfilled = results.filter(r => r.status === 'fulfilled').length;
    const rejected = results.filter(r => r.status === 'rejected').length;
    
    return {
        fulfilled,
        rejected,
        total: results.length
    };
}

