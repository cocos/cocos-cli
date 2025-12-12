import type { IMiddlewareContribution } from '../../server/interfaces';
import { Request, Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';

const buildMaps: Record<string, string> = {};
const destMaps: Record<string, string> = {};

export function registerBuildPath(platform: string, name: string, dest: string) {
    const key = `${platform}/${name}`;
    buildMaps[key] = dest;
    destMaps[dest] = key;
}

export function getBuildPath(platform: string, name: string) {
    return buildMaps[`${platform}/${name}`];
}

export function getBuildUrlPath(dest: string) {
    return destMaps[dest];
}

export default {
    get: [
        {
            /**
             * http://localhost:xxxx/build/web-desktop/outputName/index.html
             */
            url: '/build/:platform/:name/*',
            async handler(req: Request, res: Response) {
                const { platform, name } = req.params;
                const dest = getBuildPath(platform, name);
                // @ts-ignore
                const file = req.params[0];
                if (dest && file) {
                    const path = join(dest, file);
                    if (existsSync(path)) {
                        return res.sendFile(path);
                    }
                }
                
                return res.status(404).send(`${req.url} 资源不存在`);
            },
        }
    ]
} as IMiddlewareContribution;
