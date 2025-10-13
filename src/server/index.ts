import { serverService } from './server';

/**
 * 启动服务器
 */
export async function startupServer() {
    serverService.init();
    try {
        await serverService.start();
    } catch (error) {
        console.error(error);
    }
}

/**
 * 获取当前服务器的地址
 */
export function getServerUrl () {
    return serverService.url || 'http://localhost:9999';
}