import type { IMiddleware } from '../../server/interfaces';
import { Request, Response } from 'express';
import { assetManager } from '../assets';
import path from 'path';

export const SceneMiddleware: IMiddleware = {
    get: [
        {
            url: '/query-extname/:uuid',
            async handler(req: Request, res: Response) {
                const uuid = req.params.uuid;
                const assetInfo = assetManager.queryAssetInfo(uuid);
                if (assetInfo && assetInfo.library['.bin'] && Object.keys(assetInfo.library).length === 1) {
                    res.status(200).send('.cconb');
                } else {
                    res.status(200).send('');
                }
            },
        },
        {
            url: '/:dir/:uuid',
            async handler(req: Request, res: Response) {
                const extname = path.extname(req.params.uuid);
                const uuid = path.basename(req.params.uuid, extname);
                const assetInfo = assetManager.queryAssetInfo(uuid);
                console.log(`接收到请求 ${uuid}`);
                const file = assetInfo && assetInfo.library[extname]
                if (file) {
                    console.log(assetInfo);
                    console.log(`转换路径 ${req.url}: ${req.params.uuid} -> ${file}`);
                    res.status(200).send(file);
                } else {
                }
            },
        }
    ],
    post: [
        {
            url: '/test-post',
            async handler(req: Request, res: Response) {
                console.log('🎯 SceneMiddleware POST handler 被调用!');
                console.log('📝 POST 请求路径:', req.path);
                console.log('📝 POST 请求参数:', req.params);
                console.log('📝 POST 请求体:', req.body);

                const uuid = req.params[0];
                console.log('🔍 POST 查询的 UUID:', uuid);

                res.status(200).json({
                    message: 'POST 请求处理成功',
                    uuid: uuid,
                    body: req.body
                });
            },
        }
    ],
    staticFiles: [],
    socket: {
        connection: (socket: any) => {

        },
        disconnect: (socket: any) => {
        }
    },
}

