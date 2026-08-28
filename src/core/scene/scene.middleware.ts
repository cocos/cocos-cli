import type { IMiddlewareContribution } from '../../server/interfaces';
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fse from 'fs-extra';

/**
 * 各资源数据库的 library（已导入数据）目录缓存。
 * library 是扁平的 `<uuid前两位>/<uuid>[/nativeName].<ext>` 结构，一个相对路径在所有
 * library 目录中唯一定位文件（与预览 game-preview.middleware.getLibraryDirs 对齐）。
 */
let libraryDirsCache: string[] | null = null;

/**
 * 「Preview in Editor」当前场景快照缓存（内存中继）。
 * 浏览器场景编辑器点 Play 时把编辑器里的实时场景（含未保存改动）序列化后 POST 到
 * /scene/current；游戏预览 iframe 以 /?scene=__current__ 启动，其 game-boot 通过
 * GET /scene/current.json 读回该快照并 loadWithJson 运行。缓存的是 serialize 输出的
 * JSON 字符串（非对象）。MVP 只保留单个活动预览。
 */
let currentSceneCache: string | null = null;
async function getLibraryDirs(): Promise<string[]> {
    if (libraryDirsCache) {
        return libraryDirsCache;
    }
    const { assetDBManager } = await import('../assets');
    const dirs = Object.values(assetDBManager.assetDBInfo)
        .map((info: any) => info.library)
        .filter((v): v is string => !!v);
    libraryDirsCache = Array.from(new Set(dirs));
    return libraryDirsCache;
}

/**
 * asset-db 未命中时，按扁平相对路径 `<uuid前两位>/<uuid>[/nativeName].<ext>` 直接从各
 * library 磁盘目录定位文件。
 *
 * 内置资源（如 pipeline/cluster-build，uuid=45e7c0c8...，前两位 45）只存在于 library 磁盘，
 * 并不在 asset-db 索引里。引擎在 cc.game.run() 初始化渲染管线时会按 importBase 扁平路径
 * `${serverURL}/45/<uuid>.json` 拉取该 effect；此前本路由只查 asset-db，命中不到就 404，
 * 导致渲染管线建不起来，随后打开任意场景都报
 * "Cannot read properties of null (reading 'pipelineSceneData')"（每次必现）。
 * 预览通过 getLibraryDirs 同样从 library 目录服务，故预览正常而场景编辑器此前失败。
 * 这里补上路由注释早已声明、却未实现的「回退到 library 磁盘」逻辑。
 */
async function resolveFromLibrary(tail: string): Promise<string | undefined> {
    const dirs = await getLibraryDirs();
    for (const d of dirs) {
        const full = path.join(d, tail);
        // 防目录穿越：join 后必须仍位于 library 目录内
        const rel = path.relative(d, full);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
            continue;
        }
        if (await fse.pathExists(full)) {
            return full;
        }
    }
    return undefined;
}

function isBrowserRequest(req: Request): boolean {
    if (req.query.isBrowser === 'true') {
        return true;
    }

    const userAgent = req.headers['user-agent'];
    return !!req.headers['sec-ch-ua']
        || req.headers['accept']?.includes('text/html') === true
        || (typeof userAgent === 'string' && userAgent.includes('Mozilla/') && !userAgent.includes('node.js/'));
}

function decodePathParam(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

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
                const uuid = decodePathParam(req.params[0]);
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
                const uuid = decodePathParam(req.params[0]);
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
            // Preview in Editor：读回「当前编辑场景」快照。
            // 必须注册在下面的通用资源路由 `/:dir/:uuid.:ext` 之前，否则会被其捕获
            // （dir=scene, uuid=current, ext=json），走 asset-db 查询而 404。
            url: '/scene/current.json',
            async handler(req: Request, res: Response) {
                if (currentSceneCache == null) {
                    return res.status(404).json({ error: 'no current scene cached' });
                }
                // iframe reload 时必须实时读回最新快照，禁止缓存。
                res.setHeader('Cache-Control', 'no-store');
                // 缓存的是 serialize 输出的 JSON 字符串，直接以 application/json 原样发出，
                // game-boot 侧 fetch 后 .json() 解析（与 /scene/{uuid}.json 一致）。
                res.type('application/json').send(currentSceneCache);
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
                const { dir, uuid, ext, nativeName } = req.params;
                const { assetManager } = await import('../assets');
                const assetInfo = assetManager.queryAssetInfo(uuid);
                let filePath = assetInfo?.library?.[`${nativeName}.${ext}`];
                if (!filePath) {
                    // asset-db 未命中：回退到 library 磁盘目录（见 resolveFromLibrary 注释）
                    filePath = await resolveFromLibrary(`${dir}/${uuid}/${nativeName}.${ext}`);
                }
                if (!filePath) {
                    console.warn(`Asset not found: ${req.url}`);
                    return res.status(404).json({
                        error: 'Asset not found',
                        requested: req.url,
                        uuid,
                        file: `${nativeName}.${ext}`
                    });
                }

                const isBrowser = isBrowserRequest(req);

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
                const { dir, uuid, ext } = req.params;
                const { assetManager } = await import('../assets');
                const assetInfo = assetManager.queryAssetInfo(uuid);
                let filePath = assetInfo?.library?.[`.${ext}`];
                if (!filePath) {
                    // asset-db 未命中：回退到 library 磁盘目录（见 resolveFromLibrary 注释）。
                    // 修复内置 effect（pipeline/cluster-build 等）经 `${serverURL}/45/<uuid>.json`
                    // 拉取时的 404，进而修复渲染管线为 null 引发的 pipelineSceneData 报错。
                    filePath = await resolveFromLibrary(`${dir}/${uuid}.${ext}`);
                }
                if (!filePath) {
                    console.warn(`Asset not found: ${req.url}`);
                    return res.status(404).json({
                        error: 'Asset not found',
                        requested: req.url,
                        uuid,
                    });
                }

                const isBrowser = isBrowserRequest(req);

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
            // Preview in Editor：写入「当前编辑场景」快照。
            // 约定 body 为 { data: <serialize 输出的 JSON 字符串> }：serialize 交付的是字符串，
            // 若客户端直接把顶层字符串作为 JSON 发送，会被 express.json 的 strict 模式（默认）
            // 以 400 拒绝，故用对象包裹。
            url: '/scene/current',
            async handler(req: Request, res: Response) {
                const data = req.body?.data;
                if (typeof data !== 'string') {
                    return res.status(400).json({ error: 'body.data (serialized scene string) is required' });
                }
                currentSceneCache = data;
                res.status(200).json({ ok: true });
            },
        },
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
