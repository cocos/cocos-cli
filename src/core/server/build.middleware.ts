import type { IMiddlewareContribution } from '../../server/interfaces';
import { Request, Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';

export default {
    get: [
        {
            /**
             * http://localhost:xxxx/build/web-desktop/index.html
             */
            url: '/build{/*path}',
            async handler(req: Request, res: Response) {
                const { default: Project } = await import('../project');
                const path = join(Project.path, req.url);
                if (existsSync(path)) {
                    res.sendFile(path);
                } else {
                    return res.status(404).send(`${req.url} 资源不存在`);
                }
            },
        }
    ]
} as IMiddlewareContribution;
