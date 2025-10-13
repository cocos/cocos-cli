import { globToRegExp } from './utils/glob2rex';
import {
    IMiddleware,
    IMiddlewareGetPost,
    IMiddlewareItem,
    IMiddlewareSocketItem,
    IMiddlewareStaticFile
} from './interfaces';
import { SceneMiddleware } from '../core/server';
import express, { Router } from 'express';

const regexOrGlob = (url: RegExp | string) => (url instanceof RegExp) ? url : globToRegExp(url) as RegExp;
const regexOrGlobForStatic = (url: RegExp | string) => (url instanceof RegExp) ? url : globToRegExp(url + '*') as RegExp;

export class MiddlewareService {
    public router = Router();
    public middlewareStaticFile: IMiddlewareItem[] = [];
    public middlewareSocket: IMiddlewareSocketItem[] = [];

    /** 加载中间件模块 */
    register(name: string, module: IMiddleware) {
        module.get?.forEach((m: IMiddlewareGetPost) => {
            this.router.get(m.url, m.handler);
        });
        module.post?.forEach((m: IMiddlewareGetPost) => {
            this.router.post(m.url, m.handler);
        });
        module.staticFiles?.forEach((m: IMiddlewareStaticFile) => {
            this.middlewareStaticFile.push({
                name: name,
                url: m.url,
                regexp: regexOrGlobForStatic(m.url),
                handler: express.static(m.path)
            });
        });
        if (module.socket) {
            this.middlewareSocket.push({
                name: name,
                socket: module.socket,
            });
        }
    }
}

const middlewareService = new MiddlewareService();
middlewareService.register('Scene', SceneMiddleware);

export { middlewareService };
