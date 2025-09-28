import * as net from 'net';
/**
 * 检测端口是否被占用
 * @param port 检查的端口号
 */
export async function portIsOccupied(port: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
        // 创建服务并监听该端口
        const server = net.createServer().listen(port);

        // 执行这块代码说明端口未被占用
        server.on('listening', function() {
            // 关闭服务
            server.close();
            // console.log('The port【' + port + '】 is available.');
            resolve(false);
        });

        server.on('error', function(err: any) {
            // 端口已经被使用
            if (err.code === 'EADDRINUSE') {
                // console.log('The port【' + port + '】 is occupied, please change other port.');
            }
            resolve(true);
        });
    });
}

/**
 * 从某个起始端口号开始获取某个可用的端口号
 * @param port 起始端口号
 * @returns 
 */
export async function getFreePort(port: number = 4000) {
    // 检查端口是否被占用，并递增查找一个可以使用的端口号
    for (; port < 9000; port++){
        if (!await portIsOccupied(port)) {
            break;
        }
    }
    return port;
}
