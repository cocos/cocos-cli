import { IGetPostConfig, IMiddlewareContribution, ISocketConfig, IStaticFileConfig } from '../interfaces';
import express, { Router } from 'express';

export class MiddlewareManager {
    public router = Router();
    public staticRouter = Router();
    public middlewareStaticFile: IStaticFileConfig[] = [];
    public middlewareSocket: Map<string, ISocketConfig> = new Map();

    /** 加载中间件模块 */
    register(name: string, module: IMiddlewareContribution) {
        module.get?.forEach((m: IGetPostConfig) => {
            this.router.get(m.url, m.handler);
        });
        module.post?.forEach((m: IGetPostConfig) => {
            this.router.post(m.url, m.handler);
        });
        module.staticFiles?.forEach((m: IStaticFileConfig) => {
            this.middlewareStaticFile.push(m);
            this.staticRouter.use(m.url, express.static(m.path));
        });
        if (module.socket) {
            this.middlewareSocket.set(name, {
                disconnect: module.socket.disconnect,
                connection: module.socket.connection,
            });
        }
    }
}

export const middlewareService = new MiddlewareManager();
