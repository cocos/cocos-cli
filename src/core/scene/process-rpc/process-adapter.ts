import { ChildProcess } from 'child_process';
import { RpcMessage } from './types';

/**
 * 进程适配器
 * 负责进程通信和连接状态管理
 */
export class ProcessAdapter {
    private process?: NodeJS.Process | ChildProcess;
    private disconnectCleanups: Array<() => void> = [];
    private messageListeners: Map<string, Set<(...args: any[]) => void>> = new Map();

    /**
     * 挂载进程
     */
    attach(proc: NodeJS.Process | ChildProcess): void {
        if (this.process === proc) {
            console.warn('[ProcessAdapter] Attaching same process, cleaning up old listeners');
            this.clearAllMessageListeners();
            this.clearDisconnectListeners();
            return;
        }
        this.detach();
        this.process = proc;
    }

    /**
     * 分离进程
     */
    detach(): void {
        this.clearDisconnectListeners();
        this.clearAllMessageListeners();
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
            // Node.js process.send() 返回值：
            // - true: 消息已成功发送
            // - false: 消息未发送（通道已关闭或缓冲区满）
            // - undefined: 在某些 Node.js 版本中可能返回 undefined
            // 只有明确返回 true 才认为发送成功
            return result === true;
        } catch {
            return false;
        }
    }

    /**
     * 监听消息
     */
    on(event: string, handler: (...args: any[]) => void): void {
        if (!this.process) return;
        
        // 记录监听器以便后续清理
        if (!this.messageListeners.has(event)) {
            this.messageListeners.set(event, new Set());
        }
        this.messageListeners.get(event)!.add(handler);
        
        this.process.on(event, handler);
    }

    /**
     * 移除监听
     */
    off(event: string, handler: (...args: any[]) => void): void {
        if (!this.process) return;
        
        try {
            this.process.off(event, handler);
            // 从记录中移除
            const listeners = this.messageListeners.get(event);
            if (listeners) {
                listeners.delete(handler);
                if (listeners.size === 0) {
                    this.messageListeners.delete(event);
                }
            }
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
     * 清理所有消息监听器
     */
    private clearAllMessageListeners(): void {
        if (!this.process) {
            this.messageListeners.clear();
            return;
        }

        // 移除所有记录的监听器
        for (const [event, handlers] of this.messageListeners.entries()) {
            for (const handler of handlers) {
                try {
                    this.process.off(event, handler);
                } catch {
                    // ignore
                }
            }
        }
        this.messageListeners.clear();
    }

    /**
     * 获取当前进程
     */
    getProcess(): NodeJS.Process | ChildProcess | undefined {
        return this.process;
    }
}

