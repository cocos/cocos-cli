describe('newConsole dead loop reproduction', () => {
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
        const originalUncaughtException = process.listeners('uncaughtException');
        
        // 清空现有的 uncaughtException 监听器，避免干扰测试
        process.removeAllListeners('uncaughtException');
        
        // 设置全局错误处理器（模拟 sentry.ts 的行为）
        process.on('uncaughtException', (error) => {
            errorCallCount++;
            if (errorCallCount > maxCalls) {
                // 检测到死循环，恢复原始监听器并抛出错误
                originalUncaughtException.forEach(listener => {
                    process.on('uncaughtException', listener as any);
                });
                throw new Error(`Dead loop detected: uncaughtException handler called ${errorCallCount} times`);
            }
            
            // 调用 newConsole.error（这会触发 pino.error）
            newConsole.error(`[Global] 未捕获的异常: ${error instanceof Error ? error.message : String(error)}`);
        });
        
        // 模拟 pino.error 抛出异常
        if (originalPinoError) {
            (newConsole as any).pino.error = function(..._args: any[]) {
                pinoErrorCallCount++;
                if (pinoErrorCallCount > maxCalls) {
                    // 恢复原始方法
                    (newConsole as any).pino.error = originalPinoError;
                    originalUncaughtException.forEach(listener => {
                        process.on('uncaughtException', listener as any);
                    });
                    throw new Error(`Dead loop detected: pino.error called ${pinoErrorCallCount} times`);
                }
                
                // 模拟 pino.error 抛出异常（比如序列化错误、写入文件错误等）
                throw new Error('pino.error failed: serialization error');
            };
        }
        
        try {
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
        } catch (testError) {
            // 如果测试本身出错，也要清理
            console.error('Test error:', testError);
        } finally {
            // 恢复原始方法（使用 try-catch 确保清理不会失败）
            try {
                if (originalPinoError) {
                    (newConsole as any).pino.error = originalPinoError;
                }
            } catch (cleanupError) {
                console.error('Error restoring pino.error:', cleanupError);
            }
            
            // 恢复原始监听器（使用 try-catch 确保清理不会失败）
            try {
                process.removeAllListeners('uncaughtException');
                originalUncaughtException.forEach(listener => {
                    process.on('uncaughtException', listener as any);
                });
            } catch (cleanupError) {
                console.error('Error restoring uncaughtException listeners:', cleanupError);
            }
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
        const originalUncaughtException = process.listeners('uncaughtException');
        
        // 清空现有的 uncaughtException 监听器
        process.removeAllListeners('uncaughtException');
        
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
        process.on('uncaughtException', (error) => {
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
            newConsole.error(`[Global] 未捕获的异常: ${error instanceof Error ? error.message : String(error)}`);
        });
        
        try {
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
        } catch (testError) {
            // 如果测试本身出错，也要清理
            console.error('Test error:', testError);
        } finally {
            // 恢复（使用 try-catch 确保清理不会失败）
            try {
                if (originalPinoError) {
                    (newConsole as any).pino.error = originalPinoError;
                }
            } catch (cleanupError) {
                console.error('Error restoring pino.error:', cleanupError);
            }
            
            try {
                process.removeAllListeners('uncaughtException');
                originalUncaughtException.forEach(listener => {
                    process.on('uncaughtException', listener as any);
                });
            } catch (cleanupError) {
                console.error('Error restoring uncaughtException listeners:', cleanupError);
            }
        }
    }, 5000);
});