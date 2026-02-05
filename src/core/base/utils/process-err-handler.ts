import { ChildProcess } from 'child_process';





export function setupProcessHandler(process: NodeJS.Process | ChildProcess, label: string = 'unknown') {
    // 监听所有警告
    process.on('warning', (warning) => {
      console.warn(`[${label}] bf test 进程警告:`, warning.name);
      console.warn('消息:', warning.message);
      console.warn('堆栈:', warning.stack);
      
      // 特定警告处理
      if (warning.name === 'DeprecationWarning') {
        console.warn('弃用警告', { warning });
      } else if (warning.name === 'MaxListenersExceededWarning') {
        console.error('事件监听器过多，可能导致内存泄漏', { warning });
      }
    });


    process.on('uncaughtException', (error: Error, origin: string) => {
      console.error(`[${label}] bf test 未捕获的异常!`);
      console.error('错误:', error);
    });

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      console.error(`[${label}] bf test 未处理的 Promise 拒绝!`, reason);
    });

    process.on('moduleResolutionError', (error: Error) => {
      console.error(`[${label}] bf test 模块解析失败!`);
      console.error('错误:', error);
    });

    process.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) {
            let pid = 'unknown';
            let argv = '';
            if ('pid' in process) {
                pid = String(process.pid);
            }
            if ('argv' in process) {
                argv = process.argv.join(' ');
            }
            console.error(`[${label}] bf test 000 进程异常退出，退出码:`, code, 'PID:', pid, 'ARGV:', argv);
            const error = new Error();
            console.error(error.stack);
        } else if (signal) {
            console.log(`[${label}] 进程收到信号并退出:`, signal);
        }
    });

    const signals = ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT', 'SIGABRT'];
    signals.forEach(signal => {
    process.on(signal, () => {
        console.log(`[${label}] 收到${signal}信号`);
        console.trace();
    });
});
}