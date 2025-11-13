import { ChildProcess } from 'child_process';
import { RpcMessage } from './types';

/**
 * 进程适配器
 * 负责进程通信和连接状态管理
 */
export class ProcessAdapter {
    private process?: NodeJS.Process | ChildProcess;
    private disconnectCleanups: Array<() => void> = [];

    /**
     * 挂载进程
     */
    attach(proc: NodeJS.Process | ChildProcess): void {
        if (this.process === proc) return;
        this.detach();
        this.process = proc;
    }

    /**
     * 分离进程
     */
    detach(): void {
        this.clearDisconnectListeners();
        this.process = undefined;
    }

    /**
     * 检查连接状态
     */
    isConnected(): boolean {
        if (!this.process) return false;
        if ('connected' in this.process) return !!this.process.connected;
        return true;
    }

    /**
     * 发送消息
     */
    send(msg: RpcMessage): boolean {
        if (!this.process || !this.process.send) return false;
        
        try {
            const result = this.process.send(msg);
            return result !== false;
        } catch {
            return false;
        }
    }

    /**
     * 监听消息
     */
    on(event: string, handler: (...args: any[]) => void): void {
        this.process?.on(event, handler);
    }

    /**
     * 移除监听
     */
    off(event: string, handler: (...args: any[]) => void): void {
        try {
            this.process?.off(event, handler);
        } catch {
            // ignore
        }
    }

    /**
     * 设置连接监听器
     */
    setupConnectionListeners(
        onConnect: () => void,
        onDisconnect: (reason: string) => void
    ): void {
        if (!this.process || !('connected' in this.process)) return;

        const proc = this.process;
        let connectListener: (() => void) | undefined;
        
        const onDisconnectHandler = () => {
            onDisconnect('Process disconnected');
        };

        const onExitHandler = (code: number | null, signal: NodeJS.Signals | null) => {
            const reason = signal 
                ? `Process exited with signal ${signal}` 
                : `Process exited with code ${code}`;
            onDisconnect(reason);
        };

        if (proc.connected) {
            onConnect();
        } else {
            connectListener = onConnect;
            proc.once('connect', connectListener);
        }

        proc.once('disconnect', onDisconnectHandler);
        proc.once('exit', onExitHandler);
        
        this.disconnectCleanups.push(() => {
            try { proc.off('disconnect', onDisconnectHandler); } catch {}
            try { proc.off('exit', onExitHandler); } catch {}
            if (connectListener) {
                try { proc.off('connect', connectListener); } catch {}
            }
        });
    }

    /**
     * 清理监听器
     */
    private clearDisconnectListeners(): void {
        this.disconnectCleanups.forEach(clean => {
            try { clean(); } catch {}
        });
        this.disconnectCleanups = [];
    }

    /**
     * 获取当前进程
     */
    getProcess(): NodeJS.Process | ChildProcess | undefined {
        return this.process;
    }
}

