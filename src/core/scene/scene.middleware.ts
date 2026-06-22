import type { IMiddlewareContribution } from '../../server/interfaces';
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fse from 'fs-extra';

export default {
    get: [
        {
            url: '/engine/read-file-sync',
            async handler(req: Request, res: Response) {
                let filePath = req.query.path as string;
                if (!filePath) {
                    return res.status(400).send('Path is required');
                }

                // Normalize path to fix mixed slashes on Windows
                filePath = path.normalize(filePath);

                if (!(await fse.pathExists(filePath))) {
                    // Fallback for .wasm.wasm -> .wasm if the double extension file is missing
                    if (filePath.endsWith('.wasm.wasm')) {
                        const fallbackPath = filePath.slice(0, -5);
                        if (await fse.pathExists(fallbackPath)) {
                            filePath = fallbackPath;
                        }
                    }
                }

                if (await fse.pathExists(filePath)) {
                    const content = await fse.readFile(filePath);
                    res.status(200).send(content);
                } else {
                    res.status(404).send('File not found: ' + filePath);
                }
            }
        },
        {
            // TODO 这里后续需要改引擎 wasm/wasm-nodejs.ts 的写法，改成向服务器请求数据
            url: '/engine/query-engine-info',
            async handler(req: Request, res: Response) {
                const { Engine } = await import('../engine');
                const engineInfo = Engine.getInfo();
                res.status(200).send(engineInfo);
            },
        },
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
            url: /^\/query-extname\/(.+)$/,
            async handler(req: Request, res: Response) {
                const uuid = req.params[0];
                const { assetManager } = await import('../assets');
                const assetInfo = assetManager.queryAssetInfo(uuid);
                if (assetInfo?.library?.['.bin'] && Object.keys(assetInfo.library).length === 1) {
                    res.status(200).send('.cconb');
                } else {
                    res.status(200).send('');
                }
            },
        },
        {
            url: /^\/query-asset-info\/(.+)$/,
            async handler(req: Request, res: Response) {
                const uuid = req.params[0];
                const { assetManager } = await import('../assets');
                const assetInfo = assetManager.queryAssetInfo(uuid);
                if (assetInfo) {
                    res.status(200).json(assetInfo);
                } else {
                    res.status(404).json({ error: 'Asset not found', uuid });
                }
            },
        },
        {
            url: '/query-asset-infos/:cctype',
            async handler(req: Request, res: Response) {
                const ccType = req.params.cctype;
                const { assetManager } = await import('../assets');
                const assetInfos = assetManager.queryAssetInfos({ ccType });
                if (assetInfos) {
                    res.status(200).json(assetInfos);
                } else {
                    res.status(404).json({ error: 'Asset not found', ccType });
                }
            },
        },
        {
            // Serve library assets by UUID - try asset database first,
            // then fall back to library directories on disk
            url: '/:dir/:uuid/:nativeName.:ext',
            async handler(req: Request, res: Response, next: NextFunction) {
                if (req.params.dir === 'build' || req.params.dir === 'mcp') {
                    return next();
                }
                const { uuid, ext, nativeName } = req.params;
                const { assetManager } = await import('../assets');
                const assetInfo = assetManager.queryAssetInfo(uuid);
                const filePath = assetInfo?.library?.[`${nativeName}.${ext}`];
                if (!filePath) {
                    console.warn(`Asset not found: ${req.url}`);
                    return res.status(404).json({
                        error: 'Asset not found',
                        requested: req.url,
                        uuid,
                        file: `${nativeName}.${ext}`
                    });
                }

                const isBrowser = !!(req.headers['accept']?.includes('text/html') || 
                                   req.headers['sec-ch-ua'] || 
                                   req.query.isBrowser === 'true');

                if (isBrowser) {
                    const content = await fse.readFile(filePath);
                    const extname = path.extname(filePath);
                    const mimeMap: Record<string, string> = { 
                        '.json': 'application/json', 
                        '.bin': 'application/octet-stream', 
                        '.cconb': 'application/octet-stream',
                        '.wasm': 'application/wasm',
                        '.png': 'image/png',
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg'
                    };
                    res.setHeader('Content-Type', mimeMap[extname] || 'application/octet-stream');
                    return res.status(200).send(content);
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
                const filePath = assetInfo?.library?.[`.${ext}`];
                if (!filePath) {
                    console.warn(`Asset not found: ${req.url}`);
                    return res.status(404).json({
                        error: 'Asset not found',
                        requested: req.url,
                        uuid,
                    });
                }

                const isBrowser = !!(req.headers['accept']?.includes('text/html') || 
                                   req.headers['sec-ch-ua'] || 
                                   req.query.isBrowser === 'true');

                if (isBrowser) {
                    const content = await fse.readFile(filePath);
                    const extname = path.extname(filePath);
                    const mimeMap: Record<string, string> = { 
                        '.json': 'application/json', 
                        '.bin': 'application/octet-stream', 
                        '.cconb': 'application/octet-stream',
                        '.wasm': 'application/wasm',
                        '.png': 'image/png',
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg'
                    };
                    res.setHeader('Content-Type', mimeMap[extname] || 'application/octet-stream');
                    return res.status(200).send(content);
                }

                res.status(200).send(filePath || req.url);
            },
        }
    ],
    post: [
        {
            url: '/rpc/:module/:method',
            async handler(req: Request, res: Response) {
                const { module, method } = req.params;
                const args = req.body;
                try {
                    const { Rpc } = await import('./main-process/rpc');
                    const result = await Rpc.getInstance().executeLocal(module as any, method as any, args);
                    console.log(`[Scene Web RPC] ${module}.${method} ->`, typeof result === 'undefined' ? 'undefined' : (result === null ? 'null' : typeof result));
                    res.status(200).json({ type: 'response', result });
                } catch (e: any) {
                    console.error(`[Scene] RPC Error (${module}.${method}):`, e);
                    res.status(200).json({ type: 'response', error: e?.message || String(e) });
                }
            }
        }
    ],
    staticFiles: [],
    socket: {
        connection: (socket: any) => { },
        disconnect: (socket: any) => { }
    },
} as IMiddlewareContribution;