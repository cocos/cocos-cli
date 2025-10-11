import { IIpcReply, type IIpcUseModuleResponse, isIpcUseModuleResponse } from '../common';
import { ChildProcess } from 'child_process';

export class IpcServer {
    constructor(
        private readonly port: number,
        private readonly process: NodeJS.Process | ChildProcess,
        private readonly modules: Record<string, any>) {
        this.setupMessageListener();
    }

    private replyMessage(id: string, result: any, error?: string) {
        this.process.send?.({ id, result, error, reply: true } as IIpcReply);
    }

    setupMessageListener() {
        this.process.on('message', async (msg: IIpcUseModuleResponse) => {
            if (msg.port !== this.port) return;
            if (!isIpcUseModuleResponse(msg)) return;

            try {
                const instance = this.modules[msg.channel];
                if (!instance) {
                    throw new Error(`Unknown module: ${msg.channel}`);
                }
                const method = instance[msg.method];
                if (!method) {
                    throw new Error(`Unknown method: ${msg.channel}.${msg.method}`);
                }

                const result = await method.call(instance, ...msg.params);
                if (msg.reply) {
                    this.replyMessage(msg.id, result);
                }
            } catch (error: any) {
                this.replyMessage(msg.id, error?.message ?? String(error));
            }
        });
    }
}
