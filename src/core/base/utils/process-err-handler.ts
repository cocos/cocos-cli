import { ChildProcess } from 'child_process';


const GLOBAL_HANDLER_KEY = Symbol.for('bf.test.process.handler');

export function setupProcessHandler(proc: NodeJS.Process | ChildProcess, label: string = 'unknown') {
    // Determine if it's the global process
    const isGlobal = proc === process;

    if (isGlobal) {
        // Prevent duplicate registration on global process
        if ((proc as any)[GLOBAL_HANDLER_KEY]) {
            return;
        }
        (proc as any)[GLOBAL_HANDLER_KEY] = true;
    }

    // 监听所有警告
    proc.on('warning', (warning) => {
        console.warn(`[${label}] 进程警告:`, warning.name, warning.message);
        if (warning.name === 'ExperimentalWarning') {
            // 忽略实验性特性警告
        } else if (warning.name === 'MaxListenersExceededWarning') {
            console.error(`[${label}] 事件监听器过多，可能导致内存泄漏`, { warning });
        }
    });

    if (isGlobal || 'pid' in proc) { // process or the current process
        proc.on('uncaughtException', (error: Error, origin: string) => {
            console.error(`[${label}] 未捕获的异常! Origin:`, origin);
            console.error('错误:', error);
        });

        proc.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
            console.error(`[${label}] 未处理的 Promise 拒绝!`, reason);
        });
    }

    // exit covers both ChildProcess and Process
    proc.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) {
            let pid = 'unknown';
            let argv = '';
            if ('pid' in proc) { pid = String(proc.pid); }
            if ('argv' in proc) { argv = proc.argv.join(' '); }
            
            process.stdout.write(`[${label}] 进程异常退出，退出码: ${code} PID: ${pid} ARGV: ${argv}\n`);
            const error = new Error();
            process.stdout.write(`${error.stack}\n`);
        } else if (signal) {
            process.stdout.write(`[${label}] [${isGlobal ? 'Global' : 'Child'}] 进程收到信号并退出: ${signal}\n`);
        }
    });

    if (isGlobal) {
        const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT', 'SIGABRT'];
        signals.forEach(signal => {
            proc.on(signal, () => {
                process.stdout.write(`[${label}] [Global] 收到${signal}信号\n`);
                // Give a bit of time for logs to flush if needed, but signals usually imply we should stop
            });
        });
    }
}