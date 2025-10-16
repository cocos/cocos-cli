import { ProcessRPC } from '../process-rpc';
import type { IMainModule } from '../main-process';

export const Rpc: ProcessRPC<IMainModule> = new ProcessRPC<IMainModule>();

export async function startupRpc() {
    Rpc.attach(process);
    const { Service } = await import('./service/decorator');
    Rpc.register(Service);
}
