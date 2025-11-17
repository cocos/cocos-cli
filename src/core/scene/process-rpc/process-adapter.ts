import { ChildProcess } from 'child_process';
import { RpcMessage } from './types';

/**
 * 进程适配器
 * 负责进程通信和连接状态管理
 */
export class ProcessAdapter {
    private process?: NodeJS.Process | ChildProcess;
    private cleanupFns: Array<() => void> = [];
    private listeners = new Map<string, Set<(...args: any[]) => void>>();

    attach(proc: NodeJS.Process | ChildProcess): void {
        if (this.process === proc) {
            console.warn('[ProcessAdapter] Attaching same process, cleaning up');
            this.clearListeners();
            return;
        }
        this.detach();
        this.process = proc;
    }

    detach(): void {
        this.clearListeners();
        this.process = undefined;
    }

    isConnected(): boolean {
        if (!this.process) return false;
        return 'connected' in this.process ? !!this.process.connected : true;
    }

    send(msg: RpcMessage): boolean {
        if (!this.process?.send) return false;
        try {
            return this.process.send(msg) === true;
        } catch {
            return false;
        }
    }

    on(event: string, handler: (...args: any[]) => void): void {
        if (!this.process) return;

        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(handler);
        this.process.on(event, handler);
    }

    off(event: string, handler: (...args: any[]) => void): void {
        if (!this.process) return;

        try {
            this.process.off(event, handler);
            const handlers = this.listeners.get(event);
            if (handlers) {
                handlers.delete(handler);
                if (handlers.size === 0) this.listeners.delete(event);
            }
        } catch {}
    }

    setupConnectionListeners(onConnect: () => void, onDisconnect: (reason: string) => void): void {
        if (!this.process || !('connected' in this.process)) return;

        const proc = this.process;
        const onDisconnectHandler = () => onDisconnect('Process disconnected');
        const onExitHandler = (code: number | null, signal: NodeJS.Signals | null) => {
            onDisconnect(signal ? `Process exited with signal ${signal}` : `Process exited with code ${code}`);
        };

        if (proc.connected) {
            onConnect();
        } else {
            proc.once('connect', onConnect);
            this.cleanupFns.push(() => {
                try { proc.off('connect', onConnect); } catch {}
            });
        }

        proc.once('disconnect', onDisconnectHandler);
        proc.once('exit', onExitHandler);

        this.cleanupFns.push(
            () => { try { proc.off('disconnect', onDisconnectHandler); } catch {} },
            () => { try { proc.off('exit', onExitHandler); } catch {} }
        );
    }

    getProcess(): NodeJS.Process | ChildProcess | undefined {
        return this.process;
    }

    private clearListeners(): void {
        this.cleanupFns.forEach(fn => {
            try { fn(); } catch {}
        });
        this.cleanupFns = [];

        if (this.process) {
            this.listeners.forEach((handlers, event) => {
                handlers.forEach(handler => {
                    try { this.process!.off(event, handler); } catch {}
                });
            });
        }
        this.listeners.clear();
    }
}

