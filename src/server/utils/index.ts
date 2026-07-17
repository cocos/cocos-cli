import net from 'net';
import type { Response } from 'express';


/**
 * 获取当前系统可用端口
 * @param preferredPort 希望使用的起始端口
 */
export async function getAvailablePort(preferredPort: number): Promise<number> {
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

/**
 * 以允许点目录/点文件的方式返回文件。
 * express/send 默认忽略路径中以 `.` 开头的段(dotfiles: 'ignore'),
 * 项目或资源位于点目录(如 ~/.projects/x)下时会被误判 404,统一走此 helper。
 */
export function sendFileAllowingDotfiles(res: Response, filePath: string): void {
    res.sendFile(filePath, { dotfiles: 'allow' });
}
