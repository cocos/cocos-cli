import net from 'net';
import os from 'os';
import type { AddressInfo } from 'net';
import type { Server as HTTPServer } from 'http';
import type { Server as HTTPSServer } from 'https';

/**
 * 获取当前系统可用端口
 * @param preferredPort 希望使用的起始端口（默认从 7456 开始）
 */
export async function getAvailablePort(preferredPort = 7456): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.unref(); // 不阻止 Node 进程退出

        server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                // 端口被占用 -> 递归尝试下一个端口
                resolve(getAvailablePort(preferredPort + 1));
            } else {
                reject(err);
            }
        });

        server.listen(preferredPort, () => {
            const { port } = server.address() as net.AddressInfo;
            server.close(() => resolve(port));
        });
    });
}
