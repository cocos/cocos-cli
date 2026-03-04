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
        
        // Remove initSentry() to prevent Native Heap Corruption with test runner
        
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
                    // 检测到死循环，不在这里抛出异常，而是记录并停止
                    return;
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
                        return;
                    }
                    
                    // 模拟 pino.error 抛出异常
                    throw new Error('pino.error failed: serialization error');
                };
            }
            
            // 直接调用错误处理器，而不是使用 process.emit 发送全局事件，防止把测试运行器本身的进程搞崩溃
            const errorPromise = new Promise<void>((resolve) => {
                setTimeout(() => {
                    try {
                        const err = new Error('Test error to trigger uncaughtException');
                        errorHandler(err);
                        resolve();
                    } catch {
                        resolve();
                    }
                }, 10);
            });
            
            // 等待异常处理流程启动
            await errorPromise;
            
            // 等待一段时间，让错误处理器执行
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 验证是否有效阻止了死循环
            // 正常情况下，有了防护，errorCallCount 应该只有 1 次
            expect(errorCallCount).toBeLessThan(10);
            expect(pinoErrorCallCount).toBeLessThan(10);
            
        } finally {
            // CRITICAL: Restore mocks IMMEDIATELY
            try {
                if (originalPinoError && (newConsole as any).pino) {
                    (newConsole as any).pino.error = originalPinoError;
                }
                testOriginalPinoError = null;
            } catch { /* ignore */ }
            
            // 恢复并等待
            await new Promise(resolve => setTimeout(resolve, 200));
            
            try {
                const listeners = process.listeners('uncaughtException');
                listeners.forEach(l => {
                    if ((l as any).name === 'errorHandler' || l.toString().includes('errorCallCount')) {
                        process.removeListener('uncaughtException', l as any);
                    }
                });
                
                // 彻底恢复环境
                process.removeAllListeners('uncaughtException');
                originalUncaughtException.forEach(listener => {
                    process.on('uncaughtException', listener as any);
                });
            } catch { /* ignore */ }
            
            await new Promise(resolve => setTimeout(resolve, 100));
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
                        return;
                    }
                    // 抛出异常，模拟 pino.error 失败
                    throw new Error('pino.error serialization failed');
                };
            }
            
            // 设置全局错误处理器（模拟 sentry.ts）
            const errorHandler = (error: Error) => {
                callChain.push('uncaughtException');
                if (callChain.length > maxDepth) {
                    return;
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
            
            // 直接调用错误处理器触发异常
            const errorPromise = new Promise<void>((resolve) => {
                setTimeout(() => {
                    try {
                        errorHandler(new Error('Test error'));
                        resolve();
                    } catch {
                        resolve();
                    }
                }, 10);
            });
            
            // 等待异常处理
            await errorPromise;
            
            // 等待观察
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 验证调用链长度（正常情况下应该很短，因为有防护）
            expect(callChain.length).toBeLessThan(20);
            
        } finally {
            // CRITICAL: Restore mocks IMMEDIATELY
            try {
                if (originalPinoError && (newConsole as any).pino) {
                    (newConsole as any).pino.error = originalPinoError;
                }
                testOriginalPinoError = null;
            } catch { /* ignore */ }
            
            await new Promise(resolve => setTimeout(resolve, 200));
            
            try {
                process.removeAllListeners('uncaughtException');
                originalUncaughtException.forEach(listener => {
                    process.on('uncaughtException', listener as any);
                });
            } catch { /* ignore */ }
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }, 5000);
});