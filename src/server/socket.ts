import type { Server as HTTPServer } from 'http';
import type { Server as HTTPSServer } from 'https';
import { middlewareService } from './middleware';
import { Server } from 'socket.io';

export class SocketService {
    public io: Server | undefined;

    /**
     * 启动 io 服务器
     * @param server http 服务器
     */
    startup(server: HTTPServer | HTTPSServer) {
        this.io = new Server(server);
        this.io.on('connection', (socket: any) => {
            console.log(`socket ${socket.id} connected`);
            middlewareService.middlewareSocket.forEach((middleware) => {
                middleware.connection(socket);
            });
            socket.on('disconnect', () => {
                middlewareService.middlewareSocket.forEach((middleware) => {
                    middleware.disconnect(socket);
                });
            });
        });
    }

    /**
     * 断开与客户端的连接
     */
    disconnect() {
        this.io?.disconnectSockets();
    }
}

export const socketService = new SocketService();
