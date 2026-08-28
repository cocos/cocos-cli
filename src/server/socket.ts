import type { Server as HTTPServer } from 'http';
import type { Server as HTTPSServer } from 'https';
import { middlewareService } from './middleware';
import { Server } from 'socket.io';

export const SCENE_RENDERER_ROOM = 'scene-renderer';

export class SocketService {
    public io: Server | undefined;

    /**
     * 启动 io 服务器
     * @param server http 服务器
     */
    startup(server: HTTPServer | HTTPSServer) {
        // 允许跨域连接：PinK 的场景宿主是 vscode-webview://... 与本服务不同源，
        // socket.io 有独立于 express 的 CORS 配置，不开这里 webview 会被浏览器拦截连接。
        // 与 HTTP 路由的 CORS（server.ts 的 app.use(cors)，Access-Control-Allow-Origin: *）保持一致。
        this.io = new Server(server, {
            cors: { origin: '*', methods: ['GET', 'POST'] },
            // Reflection-probe capture returns six raw RGBA faces from the WebGL
            // scene client. A 1024px probe is ~24 MiB raw and ~32 MiB as base64.
            maxHttpBufferSize: 128 * 1024 * 1024,
        });
        this.io.on('connection', (socket: any) => {
            console.log(`socket ${socket.id} connected`);
            socket.on('scene-renderer:register', (data?: { sceneUrl?: string }) => {
                socket.join(SCENE_RENDERER_ROOM);
                socket.data.sceneRenderer = true;
                socket.data.sceneUrl = data?.sceneUrl || '';
            });
            socket.on('scene-renderer:scene', (data?: { sceneUrl?: string }) => {
                if (socket.data.sceneRenderer) {
                    socket.data.sceneUrl = data?.sceneUrl || '';
                }
            });
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
