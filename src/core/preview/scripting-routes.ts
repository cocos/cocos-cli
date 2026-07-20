import { Request, Response, NextFunction } from 'express';
import path, { join } from 'path';
import { pathExists, stat, readFile } from 'fs-extra';
import { GlobalPaths } from '../../global';
import { readFileSync } from 'fs';
import {
    deriveGraphicsConfigFromCustomPipeline,
    hasOwnConfigKey,
    mergeGraphicsConfigWithModules,
    normalizeIncludeModulesWithGraphics,
} from '../engine/graphics-config';

function sendQuickPackChunk(res: Response, filePath: string): void {
    // QuickPack may emit chunks under project temp paths used by smoke workspaces.
    // The path is resolved by the loader, not by raw URL-to-file joining.
    res.sendFile(filePath, { dotfiles: 'allow' });
}

function decodePathParam(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/**
 * 动态预览的共享资源路由。
 *
 * 这些路由负责按请求动态托管「引擎 / 脚本(QuickPack) / SystemJS / import-map」等资源，
 * 游戏预览（game-preview.middleware）和场景编辑器预览（scene.scripting.middleware）共用，
 * 不包含各自专属的 `/` 入口路由。
 */
export const scriptingRoutes = [
    {
        url: '/scripting/web-env',
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                const { Engine } = await import('../engine');
                const enginePath = Engine.getInfo().typescript.path;
                const { default: scripting } = await import('../../core/scripting');
                res.json({
                    projectPath: scripting.projectPath.replace(/\\/g, '/'),
                    enginePath: enginePath.replace(/\\/g, '/'),
                });
            } catch (err) {
                next(err);
            }
        },
    },
    {
        // 引擎 external 依赖（如 physics cannon），SystemJS 请求 /external/%2540cocos/...（@ 被双重编码）。
        // 磁盘上目录名是单层编码的 %40cocos，所以这里需要解一层编码：%2540cocos → %40cocos。
        // 注意：Express 5 的 req.path 不会自动解码，必须用 req.originalUrl 手动 decodeURIComponent。
        url: /^\/external\//,
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                const { waitForProgrammingFacet } = await import('../scripting/programming/FacetInstance');
                const facet = await waitForProgrammingFacet();
                const rawPath = req.originalUrl.split('?')[0];
                const relPath = decodeURIComponent(rawPath.substring('/external'.length));
                const resourcePath = join(facet.engineDistRoot, 'external', relPath);
                if (await pathExists(resourcePath) && (await stat(resourcePath)).isFile()) {
                    res.sendFile(resourcePath, { dotfiles: 'allow' });
                } else {
                    next();
                }
            } catch (err) {
                next(err);
            }
        },
    },
    {
        // 引擎信息（含 native / typescript 路径），引擎 wasm 加载器与 editor-stub 依赖。
        // 原本只在场景编辑器预览的 SceneMiddleware 注册，这里移到共享路由，让游戏预览也可用。
        url: '/engine/query-engine-info',
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                const { Engine } = await import('../engine');
                res.status(200).send(Engine.getInfo());
            } catch (err) {
                next(err);
            }
        },
    },
    {
        // 同步/异步读取引擎文件（wasm 等),editor-stub 的 fs mock 通过它读取二进制。
        url: '/engine/read-file-sync',
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                let filePath = req.query.path as string;
                if (!filePath) {
                    return res.status(400).send('Path is required');
                }
                filePath = path.normalize(filePath);
                if (!(await pathExists(filePath)) && filePath.endsWith('.wasm.wasm')) {
                    // 兼容 .wasm.wasm -> .wasm
                    const fallbackPath = filePath.slice(0, -5);
                    if (await pathExists(fallbackPath)) {
                        filePath = fallbackPath;
                    }
                }
                // 目录白名单：只允许读取引擎目录 + 当前项目目录下的文件，拒绝任意系统文件读取。
                // editor-stub 的请求来自两处：引擎 native/typescript 路径（wasm 等），以及场景编辑器
                // 预览的 ScriptService.init 通过 window.require 读取项目编译脚本（<project>/library/**）。
                const { Engine } = await import('../engine');
                const info: any = Engine.getInfo();
                const { default: scripting } = await import('../../core/scripting');
                const allowedRoots = [GlobalPaths.enginePath, info?.native?.path, info?.typescript?.path, scripting.projectPath]
                    .filter((p): p is string => !!p)
                    .map((p) => path.resolve(p));
                const resolved = path.resolve(filePath);
                const allowed = allowedRoots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
                if (!allowed) {
                    return res.status(403).send('Forbidden');
                }
                if (await pathExists(resolved)) {
                    res.status(200).send(await readFile(resolved));
                } else {
                    res.status(404).send('File not found: ' + resolved);
                }
            } catch (err) {
                next(err);
            }
        },
    },
    {
        // 引擎 external 协议资源（wasm 外部依赖）。
        url: '/engine_external/',
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                const url = req.query.url;
                const externalProtocol = 'external:';
                if (typeof url === 'string' && url.startsWith(externalProtocol)) {
                    const { Engine } = await import('../engine');
                    const nativeEnginePath = Engine.getInfo().native.path;
                    const externalFilePath = url.replace(externalProtocol, join(nativeEnginePath, 'external/'));
                    res.status(200).send(await readFile(externalFilePath));
                } else {
                    res.status(404).send(`请求 external 资源失败，请使用 external 协议: ${req.url}`);
                }
            } catch (err) {
                next(err);
            }
        },
    },
    {
        // 资源信息查询（editor-stub 在 CC_EDITOR 模式下解析内置资源用，如物理默认材质）。
        url: /^\/query-asset-info\/(.+)$/,
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                const uuid = decodePathParam(req.params[0]);
                const { assetManager } = await import('../assets');
                const assetInfo = assetManager.queryAssetInfo(uuid);
                if (assetInfo) {
                    res.status(200).json(assetInfo);
                } else {
                    res.status(404).json({ error: 'Asset not found', uuid });
                }
            } catch (err) {
                next(err);
            }
        },
    },
    {
        url: '/query-asset-infos/:cctype',
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                const ccType = req.params.cctype;
                const { assetManager } = await import('../assets');
                const assetInfos = assetManager.queryAssetInfos({ ccType });
                if (assetInfos) {
                    res.status(200).json(assetInfos);
                } else {
                    res.status(404).json({ error: 'Asset not found', ccType });
                }
            } catch (err) {
                next(err);
            }
        },
    },
    {
        url: /^\/query-extname\/(.+)$/,
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                const uuid = decodePathParam(req.params[0]);
                const { assetManager } = await import('../assets');
                const assetInfo = assetManager.queryAssetInfo(uuid);
                if (assetInfo?.library?.['.bin'] && Object.keys(assetInfo.library).length === 1) {
                    res.status(200).send('.cconb');
                } else {
                    res.status(200).send('');
                }
            } catch (err) {
                next(err);
            }
        },
    },
    {
        // 插件脚本（settings.plugins.jsList）。PREVIEW 模式下引擎从 /plugins/<dbUrl> 加载
        // （见引擎 game.ts: `${PREVIEW ? 'plugins' : 'src'}/${jsListFile}`），
        // 这里按资源 url 找到编译后的 library .js 返回，对齐 build 的「拷贝插件脚本」行为。
        url: /^\/plugins\//,
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                let relPath = req.originalUrl.split('?')[0].substring('/plugins/'.length);
                try {
                    relPath = decodeURIComponent(relPath);
                } catch {
                    // 保留原值
                }
                const { assetManager } = await import('../assets');
                const info = assetManager.queryAssetInfo(`db://${relPath}`);
                const file = info?.library?.['.js'];
                if (file && await pathExists(file) && (await stat(file)).isFile()) {
                    res.set('Cache-Control', 'no-store');
                    res.sendFile(file, { dotfiles: 'allow' });
                } else {
                    console.warn(`[Preview Server] Plugin script not found: ${relPath}`);
                    next();
                }
            } catch (err) {
                next(err);
            }
        },
    },
    {
        url: /^\/scripting\/engine-dist/,
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                const { waitForProgrammingFacet } = await import('../scripting/programming/FacetInstance');
                const facet = await waitForProgrammingFacet();
                let relPath = req.path.substring('/scripting/engine-dist'.length);
                relPath = decodeURIComponent(relPath);
                const resourcePath = join(facet.engineDistRoot, relPath);
                if (await pathExists(resourcePath) && (await stat(resourcePath)).isFile()) {
                    res.sendFile(resourcePath, { dotfiles: 'allow' });
                } else {
                    next();
                }
            } catch (err) {
                next(err);
            }
        },
    },
    {
        url: '/scripting/engine/game-config',
        async handler(req: Request, res: Response) {
            const { Engine } = await import('../engine');
            const serverBaseUrl = `${req.protocol}://${req.get('host')}`;
            const config = await Engine.getGameConfig(serverBaseUrl, serverBaseUrl, serverBaseUrl);
            res.json(config);
        },
    },
    {
        // 轻量接口：返回当前工程的设计分辨率，供场景进程在每次打开场景前刷新 cc.view。
        // 直接读磁盘上的 cocos.config.json（配置真相源），绕开主进程配置缓存——
        // configurationManager.reload() 的 load() 不会把新值同步回已注册的配置实例，
        // Engine._config 也只在 configuration:save 时刷新，两者都可能慢一拍（改分辨率后要新建两次才生效的根因）。
        url: '/scripting/engine/design-resolution',
        async handler(req: Request, res: Response) {
            const { Engine } = await import('../engine');
            // 兜底：缓存/默认合并值
            let dr = Engine.getConfig().designResolution as { width?: number; height?: number; fitWidth?: boolean; fitHeight?: boolean };
            try {
                const { configurationManager } = await import('../configuration');
                const fse = await import('fs-extra');
                const configPath = await configurationManager.getConfigPath();
                if (await fse.pathExists(configPath)) {
                    const json = await fse.readJSON(configPath);
                    const disk = json?.engine?.designResolution;
                    if (disk && typeof disk.width === 'number' && typeof disk.height === 'number') {
                        // 以磁盘为准，缺失字段用缓存/默认补齐
                        dr = { ...dr, ...disk };
                    }
                }
            } catch (error) {
                console.debug('[design-resolution] read cocos.config.json failed, fallback to cached:', error);
            }
            res.json(dr);
        },
    },
    {
        url: '/scripting/engine/modules',
        async handler(req: Request, res: Response) {
            const { Engine } = await import('../engine');
            // 兜底：Engine 缓存的 includeModules
            let modules = Engine.getModules();
            // 直接读磁盘上的 cocos.config.json（配置真相源），绕开主进程配置缓存。
            // 原因同 design-resolution 路由：configurationManager.reload() 不会把新值同步回已注册的配置实例，
            // Engine._config 也只在 configuration:save 时刷新，改物理后端（= 改 engine.includeModules）后
            // 不重启就拿不到新值，导致预览 game-boot 按旧模块列表选物理后端、切不过去。
            try {
                const { configurationManager } = await import('../configuration');
                const fse = await import('fs-extra');
                const configPath = await configurationManager.getConfigPath();
                if (await fse.pathExists(configPath)) {
                    const json = await fse.readJSON(configPath);
                    const engineCfg = json?.engine;
                    if (engineCfg) {
                        // 与 Engine.syncConfig 的解析一致：优先 engine.includeModules，
                        // 否则取选中的模块配置 engine.configs[globalConfigKey].includeModules，
                        // 最后把 Graphics 兼容配置规范化为构建/预览实际消费的模块列表。
                        let diskModules = Array.isArray(engineCfg.includeModules)
                            ? engineCfg.includeModules
                            : undefined;
                        if (!diskModules && engineCfg.configs) {
                            const key = engineCfg.globalConfigKey || Object.keys(engineCfg.configs)[0];
                            const selectedModules = engineCfg.configs?.[key]?.includeModules;
                            diskModules = Array.isArray(selectedModules) ? selectedModules : undefined;
                        }
                        const baseModules = diskModules ?? modules;
                        if (hasOwnConfigKey(engineCfg, 'graphics')) {
                            const graphics = mergeGraphicsConfigWithModules(baseModules, engineCfg.graphics);
                            modules = normalizeIncludeModulesWithGraphics(baseModules, graphics);
                        } else if (hasOwnConfigKey(engineCfg, 'customPipeline')) {
                            const graphics = deriveGraphicsConfigFromCustomPipeline(engineCfg.customPipeline, baseModules);
                            modules = normalizeIncludeModulesWithGraphics(baseModules, graphics);
                        } else if (diskModules) {
                            modules = diskModules;
                        }
                    }
                }
            } catch (error) {
                console.debug('[engine/modules] read cocos.config.json failed, fallback to cached:', error);
            }
            res.json(modules);
        },
    },
    {
        url: '/scripting/engine/bin/.editor/:filename',
        async handler(req: Request, res: Response) {
            const { filename } = req.params;
            const { Engine } = await import('../engine');
            const enginePath = Engine.getInfo().typescript.path;
            const engineFilePath = path.join(enginePath, 'bin', '.editor', filename);

            try {
                const content = readFileSync(engineFilePath);
                res.setHeader('Content-Type', 'application/javascript');
                res.status(200).send(content);
            } catch (error) {
                res.status(404).send('File not found');
            }
        },
    },
    {
        url: '/scripting/engine/effect-settings',
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                const { default: scripting } = await import('../../core/scripting');
                const effectBinPath = join(scripting.projectPath, 'temp', 'asset-db', 'effect', 'effect.bin');
                if (await pathExists(effectBinPath) && (await stat(effectBinPath)).isFile()) {
                    res.sendFile(effectBinPath);
                } else {
                    next();
                }
            } catch (err) {
                next(err);
            }
        },
    },
    {
        url: '/scripting/import-map-global',
        async handler(req: Request, res: Response) {
            const { waitForProgrammingFacet } = await import('../scripting/programming/FacetInstance');
            const facet = await waitForProgrammingFacet();
            const importMap = await facet.getGlobalImportMap();
            res.json(importMap);
        },
    },
    {
        url: /^\/scripting\/x/,
        async handler(req: Request, res: Response, next: NextFunction) {
            const { waitForProgrammingFacet } = await import('../scripting/programming/FacetInstance');
            const facet = await waitForProgrammingFacet();

            const url = req.path.substring('/scripting/x'.length).replace(/^\//, '');
            if (url === '' || url === '/') {
                return next();
            }

            // Special handling for pack import-map and resolution-detail-map
            if (url === 'pack-import-map-url') {
                try {
                    const resource = await facet.loadPackResource(facet.packImportMapURL);
                    if (resource.type === 'json') {
                        const importMap = resource.json as any;
                        // 移除 cce:/internal/x/cc 映射和相关 scope：
                        // pack 的 cc chunk 依赖 cce:/internal/x/cc-fu/*（engine feature units），
                        // 浏览器中 System-A 无法解析这些协议。
                        // 让 System-A 使用全局 import map 的 cc → q-bundled:///virtual/cc.js。
                        if (importMap.imports) {
                            const ccChunkUrl = importMap.imports['cce:/internal/x/cc'];
                            delete importMap.imports['cce:/internal/x/cc'];
                            // 移除 cc chunk 的 scope（包含 cc-fu/* 依赖）
                            if (ccChunkUrl && importMap.scopes) {
                                delete importMap.scopes[ccChunkUrl];
                            }
                            // 移除其他 scope 中对 cc chunk 的引用，改用全局 cc
                            if (importMap.scopes) {
                                for (const scope of Object.values(importMap.scopes) as Record<string, string>[]) {
                                    if (scope.cc === ccChunkUrl) {
                                        delete scope.cc;
                                    }
                                }
                            }
                        }
                        return res.json(importMap);
                    }
                    return next(new Error('Unexpected pack resource type'));
                } catch (err) {
                    return next(err);
                }
            }
            if (url === 'resolution-detail-map') {
                try {
                    const resource = await facet.loadPackResource(facet.packResolutionDetailMapURL);
                    if (resource.type === 'json') {
                        return res.json(resource.json);
                    }
                    return next(new Error('Unexpected pack resource type'));
                } catch (err) {
                    return next(err);
                }
            }

            // Forward query string
            const query = Object.keys(req.query).length === 0 ? '' : `?${new URLSearchParams(req.query as any).toString()}`;
            const fullUrl = url + query;

            try {
                const packResource = await facet.loadPackResource(fullUrl);
                if (packResource.type === 'json') {
                    res.json(packResource.json);
                } else if (packResource.type === 'chunk') {
                    sendQuickPackChunk(res, packResource.chunk.path);
                } else {
                    console.warn(`[Preview Server] Unknown pack resource type for ${fullUrl}:`, packResource);
                    next(new Error('Unknown pack resource type'));
                }
            } catch (err) {
                console.error(`[Preview Server] Failed to load pack resource ${fullUrl}:`, err);
                next(err);
            }
        },
    },
    {
        url: /^\/chunks\//,
        async handler(req: Request, res: Response, next: NextFunction) {
            const { waitForProgrammingFacet } = await import('../scripting/programming/FacetInstance');
            const facet = await waitForProgrammingFacet();
            const url = req.path.substring(1);
            try {
                const packResource = await facet.loadPackResource(url);
                if (packResource.type === 'chunk') {
                    sendQuickPackChunk(res, packResource.chunk.path);
                } else if (packResource.type === 'json') {
                    res.json(packResource.json);
                } else {
                    next();
                }
            } catch (err) {
                next(err);
            }
        },
    },
    {
        url: /^\/scripting\/engine/,
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                const { Engine } = await import('../engine');
                const enginePath = Engine.getInfo().typescript.path;
                // Use req.originalUrl because some directories have percent-encoded
                // names on disk (e.g. "external%3Aemscripten"). Express decodes
                // req.path, turning %3A into ':', which breaks lookup.
                // Decode ONE level of percent-encoding: %253A → %3A (files on disk
                // use single-encoded names, but SystemJS deps use double-encoded).
                const rawPath = req.originalUrl.split('?')[0];
                let relPath = rawPath.substring('/scripting/engine'.length);
                relPath = decodeURIComponent(relPath);
                const { default: scripting } = await import('../../core/scripting');
                // Try engine root first — preserve percent-encoded dir names
                let resourcePath = join(enginePath, relPath);

                // If not found, try project temp engine target
                if (!(await pathExists(resourcePath))) {
                    const engineDistBase = '/bin/.cache/dev-cli/web';
                    let projectorRelPath = relPath;
                    if (relPath.startsWith(engineDistBase)) {
                        projectorRelPath = relPath.substring(engineDistBase.length);
                    }
                    resourcePath = join(scripting.projectPath, 'temp', 'programming', 'packer-driver', 'targets', 'preview', projectorRelPath).replace(/\\/g, '/');
                }

                // If it's a directory, try index.json or index.js
                if (await pathExists(resourcePath) && (await stat(resourcePath)).isDirectory()) {
                    const indexJson = join(resourcePath, 'index.json');
                    if (await pathExists(indexJson)) {
                        resourcePath = indexJson;
                    }
                }

                if (!(await pathExists(resourcePath)) && !relPath.endsWith('.js')) {
                    const jsPath = `${resourcePath}.js`;
                    if (await pathExists(jsPath)) {
                        resourcePath = jsPath;
                    }
                }

                if (await pathExists(resourcePath) && (await stat(resourcePath)).isFile()) {
                    res.sendFile(resourcePath, { dotfiles: 'allow' });
                } else {
                    console.warn(`[Preview Server] Engine resource NOT FOUND on disk: ${resourcePath}`);
                    next();
                }
            } catch (err) {
                console.error('[Preview Server] Engine handler error:', err);
                next(err);
            }
        },
    },
    {
        url: /^\/scripting\//,
        async handler(req: Request, res: Response, next: NextFunction) {
            const relPath = req.path.substring('/scripting/'.length);
            // Handle absolute monorepo paths resolved by Rollup
            if (relPath.includes('code/cocos-cli/') || relPath.includes('code\\cocos-cli\\')) {
                const monorepoPath = relPath.split('code/cocos-cli/')[1] || relPath.split('code\\cocos-cli\\')[1];
                let resourcePath = join(GlobalPaths.workspace, monorepoPath);
                if (!(await pathExists(resourcePath))) {
                    resourcePath = `${resourcePath}.js`;
                }
                if (!(await pathExists(resourcePath))) {
                    const jsonPath = `${resourcePath.replace(/\.js$/, '')}.json`;
                    if (await pathExists(jsonPath)) {
                        resourcePath = jsonPath;
                    }
                }
                if (!(await pathExists(resourcePath)) || !(await stat(resourcePath)).isFile()) {
                    // Try index.js if it's a directory or not a file
                    const dirPath = resourcePath.replace(/\.js$/, '');
                    const indexPath = join(dirPath, 'index.js');
                    if (await pathExists(indexPath)) {
                        resourcePath = indexPath;
                    }
                }
                if (await pathExists(resourcePath) && (await stat(resourcePath)).isFile()) {
                    return res.sendFile(resourcePath, { dotfiles: 'allow' });
                }
            }
            next();
        },
    },
    {
        url: /^\/static\/web/,
        async handler(req: Request, res: Response, next: NextFunction) {
            const relPath = req.path.substring('/static/web'.length);
            const resourcePath = join(GlobalPaths.workspace, 'static', 'web', relPath);
            if (await pathExists(resourcePath) && (await stat(resourcePath)).isFile()) {
                res.sendFile(resourcePath);
            } else {
                console.warn(`[Preview Server] Static resource not found: ${resourcePath}`);
                next();
            }
        },
    },
    {
        url: /^\/scripting\/systemjs/,
        async handler(req: Request, res: Response, next: NextFunction) {
            const { waitForProgrammingFacet } = await import('../scripting/programming/FacetInstance');
            const facet = await waitForProgrammingFacet();
            const relPath = req.path.substring('/scripting/systemjs'.length);
            if (relPath.startsWith('/extras/')) {
                const extraPath = join(GlobalPaths.workspace, 'node_modules', '@cocos', 'systemjs', 'dist', relPath);
                if (await pathExists(extraPath) && (await stat(extraPath)).isFile()) {
                    return res.sendFile(extraPath);
                }
            }
            const resourcePath = join(facet.systemJsHomeDir, relPath);
            if (await pathExists(resourcePath) && (await stat(resourcePath)).isFile()) {
                res.sendFile(resourcePath);
            } else {
                console.warn(`[Preview Server] SystemJS resource not found: ${resourcePath}`);
                next();
            }
        },
    },
    {
        url: /^\/scripting\/scene/,
        async handler(req: Request, res: Response, next: NextFunction) {
            let relPath = req.path.substring('/scripting/scene'.length);
            try {
                relPath = decodeURIComponent(relPath);
            } catch {
                // Ignore error
            }
            const resourcePath = join(GlobalPaths.workspace, 'dist', 'core', 'scene', relPath);
            let finalPath = resourcePath;
            if (!(await pathExists(finalPath))) {
                finalPath = `${finalPath}.js`;
            }

            if (await pathExists(finalPath) && (await stat(finalPath)).isFile()) {
                res.sendFile(finalPath, { dotfiles: 'allow' });
            } else {
                next();
            }
        },
    },
];
