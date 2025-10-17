import { serverService } from './server';
import { IMiddlewareContribution } from './interfaces';

/**
 * 启动服务器
 */
export async function startServer(port?: number): Promise<void> {
    try {
        serverService.init();
        await serverService.start(port);
    } catch (error) {
        console.error(error);
    }
}

/**
 * 停止服务器
 */
export async function stopServer(): Promise<void> {
    try {
        await serverService.stop();
    } catch (error) {
        console.error(error);
    }
}

/**
 * 获取当前服务器的地址
 */
export function getServerUrl(): string {
    return serverService.url;
}

export function register(name: string, module: IMiddlewareContribution) {
    serverService.register(name, module);
}
