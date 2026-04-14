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
                if (assetInfo && assetInfo.library['.bin'] && Object.keys(assetInfo.library).length === 1) {
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
                if (req.params.dir === 'build' || req.params.dir === 'mcp' || req.params.dir === 'static' || req.params.dir === 'scripting') {
                    return next();
                }
                try {
                    const { uuid, ext, nativeName } = req.params;
                    const { assetManager } = await import('../assets');
                    const assetInfo = assetManager.queryAssetInfo(uuid);
                    const filePath = assetInfo && assetInfo.library[`${nativeName}.${ext}`];
                    if (!filePath || !(await fse.pathExists(filePath))) {
                        return next();
                    }
                    const content = await fse.readFile(filePath);
                    const mimeMap: Record<string, string> = { '.json': 'application/json', '.bin': 'application/octet-stream', '.cconb': 'application/octet-stream' };
                    res.setHeader('Content-Type', mimeMap[`.${ext}`] || 'application/octet-stream');
                    res.status(200).send(content);
                } catch (err) {
                    console.error(`[Scene] Error serving asset ${req.url}:`, err);
                    next(err);
                }
            },
        },
        {
            // Serve library assets by UUID
            url: '/:dir/:uuid.:ext',
            async handler(req: Request, res: Response, next: NextFunction) {
                const { uuid, ext } = req.params;
                if (req.params.dir === 'build' || req.params.dir === 'mcp' || req.params.dir === 'static' || req.params.dir === 'scripting') {
                    return next();
                }
                try {
                    const { assetManager } = await import('../assets');
                    const assetInfo = assetManager.queryAssetInfo(uuid);
                    const filePath = assetInfo && assetInfo.library[`.${ext}`];
                    if (!filePath || !(await fse.pathExists(filePath))) {
                        return next();
                    }
                    const content = await fse.readFile(filePath);
                    const mimeMap: Record<string, string> = { '.json': 'application/json', '.bin': 'application/octet-stream', '.cconb': 'application/octet-stream' };
                    res.setHeader('Content-Type', mimeMap[`.${ext}`] || 'application/octet-stream');
                    res.status(200).send(content);
                } catch (err) {
                    console.error(`[Scene] Error serving asset ${req.url}:`, err);
                    next(err);
                }
            },
        },
        {
            // Fallback: serve library files directly from disk.
            // Checks project library (library/cli/) and engine internal
            // library (engine/editor/library/) for UUID-based asset paths.
            url: /^\/(?:remote\/\w+\/)?([0-9a-f]{2})\/([0-9a-f-]+(?:@[0-9a-f]+)?)\.(json|bin|cconb)$/,
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const relPath = req.path.replace(/^\/remote\/\w+\//, '/');
                    const { default: scripting } = await import('../../core/scripting');
                    const projectPath = scripting.projectPath;

                    // Try project library first
                    const projectLibPath = path.join(projectPath, 'library', 'cli', relPath);
                    if (await fse.pathExists(projectLibPath)) {
                        const content = await fse.readFile(projectLibPath);
                        const ext = path.extname(relPath);
                        const mimeMap: Record<string, string> = { '.json': 'application/json', '.bin': 'application/octet-stream', '.cconb': 'application/octet-stream' };
                        res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
                        return res.status(200).send(content);
                    }

                    // Try engine internal library
                    const { Engine } = await import('../engine');
                    const enginePath = Engine.getInfo().typescript.path;
                    const engineLibPath = path.join(enginePath, 'editor', 'library', relPath);
                    if (await fse.pathExists(engineLibPath)) {
                        const content = await fse.readFile(engineLibPath);
                        const ext = path.extname(relPath);
                        const mimeMap: Record<string, string> = { '.json': 'application/json', '.bin': 'application/octet-stream', '.cconb': 'application/octet-stream' };
                        res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
                        return res.status(200).send(content);
                    }

                    next();
                } catch (err) {
                    console.error(`[Scene] Error serving library asset ${req.url}:`, err);
                    next(err);
                }
            },
        },
    ],
    post: [],
    staticFiles: [],
    socket: {
        connection: (socket: any) => { },
        disconnect: (socket: any) => { }
    },
} as IMiddlewareContribution;
