import { Request, Response, RequestHandler } from 'express';

export interface IMiddlewareGetPost {
    url: string;
    handler: (req: Request, res: Response) => Promise<void>;
}

export interface IMiddlewareStaticFile {
    url: string;
    path: string;
}

export interface IMiddlewareSocket {
    connection: (socket: any) => void;
    disconnect: (socket: any) => void;
}

export interface IMiddleware {
    get: IMiddlewareGetPost[];
    post: IMiddlewareGetPost[];
    staticFiles: IMiddlewareStaticFile[];
    socket: IMiddlewareSocket;
}

export interface IMiddlewareItem {
    name: string;
    url: string;
    regexp: any;
    handler: RequestHandler | ((req: Request, res: Response) => Promise<void>);
}

export interface IMiddlewareSocketItem {
    name: string;
    socket: IMiddlewareSocket;
}