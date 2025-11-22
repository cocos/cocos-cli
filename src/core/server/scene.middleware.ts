import type { IMiddlewareContribution } from '../../server/interfaces';
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fse from 'fs-extra';

export default {
    get: [
        {
            // TODO 这里后续需要改引擎 wasm/wasm-nodejs.ts 的写法，改成向服务器请求数据
            url: '/engine_external/',
            async handler(req: Request, res: Response) {
                const url = req.query.url;
                const externalProtocol = 'external:';
                if (typeof url === 'string' && url.startsWith(externalProtocol)) {
                    const { Engine } = await import('../engine');
                    const nativeEnginePath = Engine.getInfo().native.path;
                    const externalFilePath = url.replace(externalProtocol, path.join(nativeEnginePath, 'external/'));
                    const arrayBuffer = await fse.readFile(externalFilePath);
                    res.status(200).send(arrayBuffer);
                } else {
                    res.status(404).send(`请求 external 资源失败，请使用 external 协议: ${req.url}`);
                }
            },
        },
        {
            url: '/query-extname/:uuid',
            async handler(req: Request, res: Response) {
                const uuid = req.params.uuid;
                const { assetManager } = await import('../assets');
                const assetInfo = assetManager.queryAssetInfo(uuid);
                if (assetInfo && assetInfo.library['.bin'] && Object.keys(assetInfo.library).length === 1) {
                    res.status(200).send('.cconb');
                } else {
                    res.status(200).send('');
                }
            },
        },
        {
            url: '/:dir/:uuid/:nativeName.:ext',
            async handler(req: Request, res: Response, next: NextFunction) {
                if (req.params.dir === 'build' || req.params.dir === 'mcp') {
                    return next();
                }
                const { uuid, ext, nativeName } = req.params;
                const { assetManager } = await import('../assets');
                const assetInfo = assetManager.queryAssetInfo(uuid);
                const filePath = assetInfo && assetInfo.library[`${nativeName}.${ext}`];
                if (!filePath) {
                    console.warn(`Asset not found: ${req.url}`);
                    return res.status(404).json({
                        error: 'Asset not found',
                        requested: req.url,
                        uuid,
                        file: `${nativeName}.${ext}`
                    });
                }
                res.status(200).send(filePath || req.url);
            },
        },
        {
            url: '/:dir/:uuid.:ext',
            async handler(req: Request, res: Response) {
                const { uuid, ext } = req.params;
                const { assetManager } = await import('../assets');
                const assetInfo = assetManager.queryAssetInfo(uuid);
                const filePath = assetInfo && assetInfo.library[`.${ext}`];
                if (!filePath) {
                    console.warn(`Asset not found: ${req.url}`);
                    return res.status(404).json({
                        error: 'Asset not found',
                        requested: req.url,
                        uuid,
                    });
                }
                res.status(200).send(filePath || req.url);
            },
        }
    ],
    post: [],
    staticFiles: [],
    socket: {
        connection: (socket: any) => { },
        disconnect: (socket: any) => { }
    },
} as IMiddlewareContribution;
