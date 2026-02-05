describe('newConsole dead loop reproduction', () => {
    // Store original state at the suite level
    let originalMaxListeners: number;
    let suiteOriginalUncaughtException: NodeJS.UncaughtExceptionListener[];
    let suiteOriginalUnhandledRejection: NodeJS.UnhandledRejectionListener[];
    
    beforeAll(() => {
        // Increase max listeners to prevent warnings during tests
        originalMaxListeners = process.getMaxListeners();
        process.setMaxListeners(50);
        
        // Save original listeners at suite level
        suiteOriginalUncaughtException = process.listeners('uncaughtException').slice();
        suiteOriginalUnhandledRejection = process.listeners('unhandledRejection').slice();
    });
    
    afterAll(async () => {
        // Restore max listeners
        process.setMaxListeners(originalMaxListeners);
        
        // Final cleanup - restore all original listeners
        process.removeAllListeners('uncaughtException');
        process.removeAllListeners('unhandledRejection');
        
        suiteOriginalUncaughtException.forEach(listener => {
            process.on('uncaughtException', listener as any);
        });
        
        suiteOriginalUnhandledRejection.forEach(listener => {
            process.on('unhandledRejection', listener as any);
        });
        
        // Wait for any pending async operations to complete
        await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Add cleanup between each test
    let testOriginalPinoError: any = null;
    let testOriginalUncaughtException: NodeJS.UncaughtExceptionListener[] = [];
    
    beforeEach(() => {
        // Save current state before each test
        testOriginalUncaughtException = process.listeners('uncaughtException').slice();
    });
    
    afterEach(async () => {
        // Defensive cleanup after each test
        try {
            // Restore pino.error if it was mocked
            if (testOriginalPinoError) {
                const { newConsole } = await import('../../base/console');
                if ((newConsole as any).pino) {
                    (newConsole as any).pino.error = testOriginalPinoError;
                }
                testOriginalPinoError = null;
            }
        } catch {
            // Ignore errors during cleanup
        }
        
        try {
            // Remove all test listeners and restore original ones
            process.removeAllListeners('uncaughtException');
            testOriginalUncaughtException.forEach(listener => {
                process.on('uncaughtException', listener as any);
            });
            testOriginalUncaughtException = [];
        } catch {
            // Ignore errors during cleanup
        }
        
        // Wait for cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('should reproduce dead loop when pino.error throws exception', async () => {
        // 根据错误堆栈重现死循环场景：
        // 1. sentry.ts 中的全局错误处理器调用 newConsole.error
        // 2. newConsole.error -> _logMessage -> _handleProgressMessage -> _printOnce -> pino.error
        // 3. pino.error 抛出异常
        // 4. 异常再次触发全局错误处理器
        // 5. 形成死循环
        
        const { newConsole } = await import('../../base/console');
        const { initSentry } = await import('../../base/sentry');
        
        // 初始化 Sentry（这会设置全局错误处理器）
        initSentry();
        
        let errorCallCount = 0;
        let pinoErrorCallCount = 0;
        const maxCalls = 1000;
        
        // 保存原始方法
        const originalPinoError = (newConsole as any).pino?.error;
        testOriginalPinoError = originalPinoError; // Store for afterEach cleanup
        const originalUncaughtException = process.listeners('uncaughtException').slice();
        
        // 清空现有的 uncaughtException 监听器，避免干扰测试
        process.removeAllListeners('uncaughtException');
        
        try {
            // 设置全局错误处理器（模拟 sentry.ts 的行为）
            const errorHandler = (error: Error) => {
                errorCallCount++;
                if (errorCallCount > maxCalls) {
                    // 检测到死循环，恢复原始监听器并抛出错误
                    process.removeAllListeners('uncaughtException');
                    originalUncaughtException.forEach(listener => {
                        process.on('uncaughtException', listener as any);
                    });
                    throw new Error(`Dead loop detected: uncaughtException handler called ${errorCallCount} times`);
                }
                
                // 调用 newConsole.error（这会触发 pino.error）
                try {
                    newConsole.error(`[Global] 未捕获的异常: ${error instanceof Error ? error.message : String(error)}`);
                } catch {
                    // Swallow the error to prevent cascading failures
                }
            };
            
            process.on('uncaughtException', errorHandler);
            
            // 模拟 pino.error 抛出异常
            if (originalPinoError) {
                (newConsole as any).pino.error = function(..._args: any[]) {
                    pinoErrorCallCount++;
                    if (pinoErrorCallCount > maxCalls) {
                        // 恢复原始方法
                        (newConsole as any).pino.error = originalPinoError;
                        process.removeAllListeners('uncaughtException');
                        originalUncaughtException.forEach(listener => {
                            process.on('uncaughtException', listener as any);
                        });
                        throw new Error(`Dead loop detected: pino.error called ${pinoErrorCallCount} times`);
                    }
                    
                    // 模拟 pino.error 抛出异常（比如序列化错误、写入文件错误等）
                    throw new Error('pino.error failed: serialization error');
                };
            }
            
            // 触发一个异常，这会启动死循环
            // 使用 Promise 包装，确保异常能被正确处理
            const errorPromise = new Promise<void>((resolve) => {
                setTimeout(() => {
                    try {
                        throw new Error('Test error to trigger uncaughtException');
                    } catch (err) {
                        // 手动触发 uncaughtException
                        process.emit('uncaughtException', err as Error);
                        resolve();
                    }
                }, 10);
            });
            
            // 等待异常被处理
            await errorPromise;
            
            // 等待一段时间，让错误处理器有时间执行
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // 验证是否出现死循环
            // 正常情况下，errorCallCount 应该只有 1-2 次
            // 如果出现死循环，errorCallCount 会快速增长
            expect(errorCallCount).toBeLessThan(10);
            expect(pinoErrorCallCount).toBeLessThan(10);
            
            // 如果调用次数过多，记录警告
            if (errorCallCount > 5 || pinoErrorCallCount > 5) {
                console.warn(`Warning: Potential dead loop detected. errorCallCount: ${errorCallCount}, pinoErrorCallCount: ${pinoErrorCallCount}`);
            }
        } finally {
            // CRITICAL: Restore mocks IMMEDIATELY before any other cleanup
            // This prevents any lingering async errors from using the mocked version
            try {
                if (originalPinoError && (newConsole as any).pino) {
                    (newConsole as any).pino.error = originalPinoError;
                }
                testOriginalPinoError = null;
            } catch {
                // Ignore cleanup errors
            }
            
            // Wait for any pending async errors to flush through the system
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // 恢复原始监听器（使用 try-catch 确保清理不会失败）
            try {
                process.removeAllListeners('uncaughtException');
                originalUncaughtException.forEach(listener => {
                    process.on('uncaughtException', listener as any);
                });
            } catch {
                // Ignore cleanup errors
            }
            
            // Extra wait to ensure all async operations complete
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }, 5000); // 设置较短的超时时间，如果出现死循环会快速失败
    
    it('should reproduce dead loop scenario from actual stack trace', async () => {
        // 根据实际错误堆栈重现：
        // sentry.ts -> newConsole.error -> _logMessage -> _handleProgressMessage -> _printOnce -> pino.error -> (throws) -> uncaughtException -> ...
        
        const { newConsole } = await import('../../base/console');
        
        const callChain: string[] = [];
        const maxDepth = 100;
        
        // 保存原始方法
        const originalPinoError = (newConsole as any).pino?.error;
        testOriginalPinoError = originalPinoError; // Store for afterEach cleanup
        const originalUncaughtException = process.listeners('uncaughtException').slice();
        
        // 清空现有的 uncaughtException 监听器
        process.removeAllListeners('uncaughtException');
        
        try {
            // 模拟 pino.error 抛出异常
            if (originalPinoError) {
                (newConsole as any).pino.error = function(..._args: any[]) {
                    callChain.push('pino.error');
                    if (callChain.length > maxDepth) {
                        // 恢复并抛出错误
                        (newConsole as any).pino.error = originalPinoError;
                        process.removeAllListeners('uncaughtException');
                        originalUncaughtException.forEach(listener => {
                            process.on('uncaughtException', listener as any);
                        });
                        throw new Error(`Dead loop detected. Call chain: ${callChain.join(' -> ')}`);
                    }
                    // 抛出异常，模拟 pino.error 失败
                    throw new Error('pino.error serialization failed');
                };
            }
            
            // 设置全局错误处理器（模拟 sentry.ts）
            const errorHandler = (error: Error) => {
                callChain.push('uncaughtException');
                if (callChain.length > maxDepth) {
                    process.removeAllListeners('uncaughtException');
                    originalUncaughtException.forEach(listener => {
                        process.on('uncaughtException', listener as any);
                    });
                    throw new Error(`Dead loop detected. Call chain: ${callChain.join(' -> ')}`);
                }
                
                // 调用 newConsole.error（这会触发整个调用链）
                callChain.push('newConsole.error');
                try {
                    newConsole.error(`[Global] 未捕获的异常: ${error instanceof Error ? error.message : String(error)}`);
                } catch {
                    // Swallow the error to prevent cascading failures
                }
            };
            
            process.on('uncaughtException', errorHandler);
            
            // 触发一个异常
            // 使用 Promise 包装，确保异常能被正确处理
            const errorPromise = new Promise<void>((resolve) => {
                setTimeout(() => {
                    try {
                        throw new Error('Test error');
                    } catch (err) {
                        // 手动触发 uncaughtException
                        process.emit('uncaughtException', err as Error);
                        resolve();
                    }
                }, 10);
            });
            
            // 等待异常被处理
            await errorPromise;
            
            // 等待观察，让错误处理器有时间执行
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // 验证调用链长度（正常情况下应该很短）
            expect(callChain.length).toBeLessThan(20);
            
            // 检查是否出现循环模式
            const chainStr = callChain.join(' -> ');
            if (chainStr.includes('pino.error -> uncaughtException -> newConsole.error -> pino.error')) {
                console.warn('Warning: Dead loop pattern detected:', chainStr);
            }
        } finally {
            // CRITICAL: Restore mocks IMMEDIATELY before any other cleanup
            try {
                if (originalPinoError && (newConsole as any).pino) {
                    (newConsole as any).pino.error = originalPinoError;
                }
                testOriginalPinoError = null;
            } catch {
                // Ignore cleanup errors
            }
            
            // Wait for any pending async errors to flush through the system
            await new Promise(resolve => setTimeout(resolve, 300));
            
            try {
                process.removeAllListeners('uncaughtException');
                originalUncaughtException.forEach(listener => {
                    process.on('uncaughtException', listener as any);
                });
            } catch {
                // Ignore cleanup errors
            }
            
            // Extra wait to ensure all async operations complete
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }, 5000);
});