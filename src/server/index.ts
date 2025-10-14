import { serverService } from './server';

/**
 * 启动服务器
 */
export async function startServer(): Promise<void> {
    try {
        serverService.init();
        await serverService.start();
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
export function getServerUrl (): string {
    return serverService.url;
}
