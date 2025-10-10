import { ChildProcess } from 'child_process';
import { TIpcResponse, TIpcRequest } from '../common';

export class IpcServer {

    constructor(
        private readonly modules: Record<string, any>,
    ) {}

    attach(child: ChildProcess) {
        child.on('message', async (msg: TIpcRequest) => {
            const instance = this.modules.get(msg.channel);
            if (!instance) return;

            try {
                const fn = instance[msg.methodName];
                if (typeof fn !== 'function') throw new Error(`Unknown method: ${msg.methodName}`);

                const result = await fn.apply(instance, ...msg.params);

                if (msg.id) {
                    child.send?.({ id: msg.id, channel: msg.channel, data: result } as TIpcResponse);
                }
            } catch (err: any) {
                if (msg.id) {
                    child.send?.({ id: msg.id, channel: msg.channel, error: err?.message ?? String(err) } as TIpcResponse);
                } else {
                    console.error(err);
                }
            }
        });
    }
}
