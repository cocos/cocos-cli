// process-rpc.ts
import { ChildProcess } from 'child_process';

/**
 * RPC 消息类型
 */
interface RpcRequest {
    id: number;
    type: 'request';
    module: string;
    method: string;
    args: any[];
}

interface RpcResponse {
    id: number;
    type: 'response';
    result?: any;
    error?: string;
}

interface RpcSend {
    type: 'send';
    module: string;
    method: string;
    args: any[];
}

type RpcMessage = RpcRequest | RpcResponse | RpcSend;

/**
 * request 的 options
 */
interface RequestOptions {
    timeout?: number; // 毫秒
}

/**
 * 待处理的消息
 */
interface PendingMessage {
    type: 'request' | 'send';
    data: RpcRequest | RpcSend;
    resolve?: (value: any) => void;
    reject?: (error: any) => void;
    timeout?: NodeJS.Timeout;
}

/**
 * 双向 RPC 类
 */
export class ProcessRPC<TModules extends Record<string, any>> {
    private handlers: Record<string, any> = {};
    private callbacks = new Map<number, (msg: RpcResponse) => void>();
    private msgId = 0;
    private process: NodeJS.Process | ChildProcess | undefined;
    private onMessageBind = this.onMessage.bind(this);

    private pendingMessages: PendingMessage[] = [];
    private connectionListeners: Array<() => void> = [];

    constructor(proc?: NodeJS.Process | ChildProcess) {
        if (proc) this.attach(proc);
    }

    attach(proc: NodeJS.Process | ChildProcess) {
        this.resetListen();
        this.process = proc;
        this.listen();
        if ('connected' in proc) {
            this.setupConnectionListeners(proc);
        }
    }

    register(handler: Record<string, any>) {
        this.handlers = handler;
    }

    private resetListen() {
        this.msgId = 0;
        this.callbacks.clear();
        this.pendingMessages = [];
        this.connectionListeners = [];
        this.process?.off('message', this.onMessageBind);
        this.process = undefined;
    }

    private setupConnectionListeners(proc: NodeJS.Process | ChildProcess) {
        if ('connected' in proc) {
            const onConnect = () => {
                this.flushPendingMessages();
                this.notifyConnectionListeners();
            };

            if (proc.connected) onConnect();
            else proc.once('connect', onConnect);

            const onDisconnect = () => {
                this.pendingMessages.forEach(msg => {
                    if (msg.timeout) clearTimeout(msg.timeout);
                    msg.reject?.(new Error('Process disconnected'));
                });
                this.pendingMessages = [];
            };

            proc.once('disconnect', onDisconnect);
            this.connectionListeners.push(() => proc.off('disconnect', onDisconnect));
        }
    }

    private notifyConnectionListeners() {
        this.connectionListeners.forEach(cleanup => cleanup());
        this.connectionListeners = [];
    }

    private flushPendingMessages() {
        if (!this.process || !this.isConnected()) return;

        const messages = this.pendingMessages;
        this.pendingMessages = [];

        for (const msg of messages) {
            this.process.send?.(msg.data);
        }
    }

    private isConnected(): boolean {
        if (!this.process) return false;
        if ('connected' in this.process) return this.process.connected;
        return true; // NodeJS.Process 默认已连接
    }

    private listen() {
        if (!this.process) throw new Error('未挂载进程');
        this.process.on('message', this.onMessageBind);
    }

    private async onMessage(msg: RpcMessage) {
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'request') {
            const { id, module, method, args } = msg;
            const target = this.handlers[module];
            if (!target || typeof target[method] !== 'function') {
                this.reply({ id, type: 'response', error: `Method not found: ${module}.${method}` });
                return;
            }

            try {
                const result = await target[method](...(args || []));
                this.reply({ id, type: 'response', result });
            } catch (e: any) {
                this.reply({ id, type: 'response', error: e?.message || String(e) });
            }
        }

        if (msg.type === 'response') {
            const callback = this.callbacks.get(msg.id);
            if (callback) {
                callback(msg);
                this.callbacks.delete(msg.id);
            }
        }

        if (msg.type === 'send') {
            const { module, method, args } = msg;
            const target = this.handlers[module];
            if (target && typeof target[method] === 'function') {
                try {
                    target[method](...(args || []));
                } catch (e: any) {
                    console.error(e);
                }
            }
        }
    }

    private reply(msg: RpcResponse) {
        if (!this.process) throw new Error('未挂载进程');
        if (this.isConnected()) this.process.send?.(msg);
    }

    request<K extends keyof TModules, M extends keyof TModules[K]>(
        module: K,
        method: M,
        ...rest: Parameters<TModules[K][M]> extends []
            ? [args?: [], options?: RequestOptions]
            : [args: Parameters<TModules[K][M]>, options?: RequestOptions]
    ): Promise<Awaited<ReturnType<TModules[K][M]>>> {
        const [args, options] = rest;
        return new Promise((resolve, reject) => {
            const id = ++this.msgId;
            const req: RpcRequest = {
                id,
                type: 'request',
                module: module as string,
                method: method as string,
                args: args || [],
            };

            const timer = options?.timeout
                ? setTimeout(() => {
                    this.callbacks.delete(id);
                    const idx = this.pendingMessages.findIndex(
                        msg => msg.type === 'request' && (msg.data as RpcRequest).id === id
                    );
                    if (idx !== -1) this.pendingMessages.splice(idx, 1);
                    reject(new Error(`RPC request timeout: ${String(module)}.${String(method)}`));
                }, options.timeout)
                : null;

            this.callbacks.set(id, (res) => {
                if (timer) clearTimeout(timer);
                if (res.error) reject(new Error(res.error));
                else resolve(res.result);
            });

            if (!this.process) {
                reject(new Error('未挂载进程'));
                return;
            }

            if (!this.isConnected()) {
                this.pendingMessages.push({
                    type: 'request',
                    data: req,
                    resolve,
                    reject,
                    timeout: timer || undefined,
                });
                return;
            }

            this.process.send?.(req);
        });
    }

    send<K extends keyof TModules, M extends keyof TModules[K]>(
        module: K,
        method: M,
        args?: Parameters<TModules[K][M]>
    ) {
        if (!this.process) throw new Error('未挂载进程');

        const msg: RpcSend = {
            type: 'send',
            module: module as string,
            method: method as string,
            args: args || [],
        };

        if (!this.isConnected()) {
            this.pendingMessages.push({ type: 'send', data: msg });
            return;
        }

        this.process.send?.(msg);
    }

    getPendingMessageCount(): number {
        return this.pendingMessages.length;
    }

    clearPendingMessages() {
        this.pendingMessages.forEach(msg => {
            if (msg.timeout) clearTimeout(msg.timeout);
            msg.reject?.(new Error('Pending messages cleared'));
        });
        this.pendingMessages = [];
    }

}
