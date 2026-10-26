import type { Server as HTTPServer } from 'http';
import type { Server as HTTPSServer } from 'https';
import { middlewareService } from './middleware';
import { Server } from 'socket.io';
import { isAllowedOrigin, rejectReason, RequestGuardConfig } from './utils/request-guard';

export const SCENE_RENDERER_ROOM = 'scene-renderer';

export class SocketService {
    public io: Server | undefined;

    /**
     * 启动 io 服务器
     * @param server http 服务器
     * @param getGuardConfig 与 HTTP 路由共用的 Host / Origin 校验配置
     */
    startup(server: HTTPServer | HTTPSServer, getGuardConfig: () => RequestGuardConfig = () => ({})) {
        // 允许跨域连接：PinK 的场景宿主是 vscode-webview://... 与本服务不同源，
        // socket.io 有独立于 express 的 CORS 配置，不开这里 webview 会被浏览器拦截连接。
        // 与 HTTP 路由一致：只放行本机与 webview 来源（见 request-guard），不放行任意网页。
        this.io = new Server(server, {
            cors: {
                origin: (origin, callback) => callback(null, isAllowedOrigin(origin, getGuardConfig())),
                methods: ['GET', 'POST'],
            },
            allowRequest: (req, callback) => callback(null, !rejectReason(req, getGuardConfig())),
            // Reflection-probe capture returns six raw RGBA faces from the WebGL
            // scene client. A 1024px probe is ~24 MiB raw and ~32 MiB as base64.
            maxHttpBufferSize: 128 * 1024 * 1024,
        });
        this.io.on('connection', (socket: any) => {
            console.log(`socket ${socket.id} connected`);
            socket.on('scene-renderer:register', (data?: { sceneUrl?: string; visible?: boolean }) => {
                socket.join(SCENE_RENDERER_ROOM);
                socket.data.sceneRenderer = true;
                socket.data.sceneUrl = data?.sceneUrl || '';
                if (typeof data?.visible === 'boolean') {
                    socket.data.sceneRendererVisible = data.visible;
                }
            });
            socket.on('scene-renderer:scene', (data?: { sceneUrl?: string }) => {
                if (socket.data.sceneRenderer) {
                    socket.data.sceneUrl = data?.sceneUrl || '';
                }
            });
            socket.on('scene-renderer:visibility', (data?: { visible?: boolean }) => {
                if (socket.data.sceneRenderer && typeof data?.visible === 'boolean') {
                    socket.data.sceneRendererVisible = data.visible;
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
