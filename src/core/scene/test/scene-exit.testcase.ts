import { Scene } from '../main-process';

describe('场景进程测试', () => {
    it('场景进程崩溃后，通讯时自动重启', async () => {
        // 1. 确保当前是运行状态
        expect(Scene.worker.process).toBeDefined();
        const oldPid = Scene.worker.process!.pid;

        // 2. 模拟崩溃
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        Scene.worker.process!.kill('SIGKILL');
        
        // 等待状态变为非运行 (ProcessManager 的 exit 事件处理需要时间)
        await new Promise<void>(resolve => {
            const check = () => {
                const proc = Scene.worker.process;
                // 如果 process 不存在了或者被标记为 killed
                if (!proc || proc.killed) {
                    resolve();
                    return;
                }
                
                try {
                    // 双重检查：发送信号0检测进程是否存在
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    process.kill(proc.pid!, 0); 
                } catch(e) {
                    // 进程不存在了
                    resolve();
                    return;
                }
                setTimeout(check, 100);
            };
            check();
        });

        // 3. 发起一次通讯 (Lazy Start)
        // 任何一个 RPC 调用都会触发重启逻辑
        await Scene.repaintInEditMode();
        
        // 4. 验证结果
        // 验证进程已经是一个新的 PID
        expect(Scene.worker.process).toBeDefined();
        expect(Scene.worker.process!.pid).not.toBe(oldPid);
    }, 1000 * 60 * 2);

    it('关闭场景进程', async () => {
        // 启动场景进程
        let killed = false;
        try {
            killed = await Scene.worker.stop();
        } catch (error) {
            console.error(error);
        }
        expect(killed).toBe(true);
    });
});
