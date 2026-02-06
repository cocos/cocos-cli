import net from 'net';

/**
 * 获取当前系统可用端口
 * @param preferredPort 希望使用的起始端口
 */
export async function getAvailablePort(preferredPort: number, maxRetries = 100): Promise<number> {
    const isPreferredPortUsed = async (port: number) => {
        return new Promise<boolean>((resolve) => {
            const server = net.createServer();
            server.unref();
            server.on('error', () => resolve(true));
            server.listen(port, () => {
                server.close(() => resolve(false));
            });
        });
    };

    let currentPort = preferredPort;
    let retries = 0;

    while (retries < maxRetries) {
        if (!(await isPreferredPortUsed(currentPort))) {
            return currentPort;
        }
        // Use a small random increment to reduce collision probability in parallel tests
        currentPort += Math.floor(Math.random() * 5) + 1;
        retries++;
    }

    throw new Error(`Could not find an available port after ${maxRetries} retries starting from ${preferredPort}`);
}
